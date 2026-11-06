/**
 * Phase 2 — Progress & rewards (genuine data only).
 *
 * Reward rules:
 * - Session stars (on complete, once): accuracy ≥90 → 3★, ≥70 → 2★, ≥40 → 1★, else 0.
 * - Points: sum of QuestionAttempt.pointsAwarded for the session (duplicate correct
 *   word+round submissions return the prior attempt and award 0 again).
 * - Achievements: unique per (childId, code); awarded only after real session complete
 *   when thresholds are met. Never invent locked→unlocked on the client alone.
 */

import { prisma } from "../lib/prisma.js";
import { AppError } from "../lib/errors.js";

/** Calendar day bounds in Asia/Kolkata (IST). Kept local to avoid circular imports. */
function kolkataDayBounds(now = new Date()) {
  const date = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  const start = new Date(`${date}T00:00:00+05:30`);
  const end = new Date(`${date}T23:59:59.999+05:30`);
  return { date, start, end, timezone: "Asia/Kolkata" as const };
}

/**
 * Prefer all activity rounds when the DB enum includes them (local Phase 1).
 * Base rounds always exist on production until VocabRound migration is approved.
 */
const ACTIVITY_ROUNDS = [
  "LISTEN",
  "SPELL",
  "LETTER",
  "MATCHING",
  "QUIZ",
  "REVISION",
] as const;

const BASE_ROUNDS = ["LISTEN", "SPELL", "LETTER"] as const;

/** Round filter that never references unmigrated enum values on production. */
function attemptRoundFilter(includeExtended: boolean) {
  return {
    in: includeExtended ? [...ACTIVITY_ROUNDS] : [...BASE_ROUNDS],
  };
}

let extendedRoundsAvailable: boolean | null = null;

async function canUseExtendedRounds() {
  if (extendedRoundsAvailable !== null) return extendedRoundsAvailable;
  try {
    await prisma.$queryRaw`SELECT 'MATCHING'::"VocabRound"`;
    extendedRoundsAvailable = true;
  } catch {
    extendedRoundsAvailable = false;
  }
  return extendedRoundsAvailable;
}

export const ACHIEVEMENT_CATALOG = [
  {
    code: "first_activity",
    title: "First Steps",
    description: "Complete your first learning activity",
    emoji: "👣",
  },
  {
    code: "words_10",
    title: "Word Explorer",
    description: "Answer 10 different words correctly",
    emoji: "🔟",
  },
  {
    code: "words_50",
    title: "Word Builder",
    description: "Answer 50 different words correctly",
    emoji: "📚",
  },
  {
    code: "words_100",
    title: "Vocabulary Champion",
    description: "Answer 100 different words correctly",
    emoji: "🏆",
  },
  {
    code: "daily_goal",
    title: "Daily Goal Star",
    description: "Hit today’s daily word goal (IST)",
    emoji: "🌟",
  },
] as const;

async function assertChildOwned(
  parentId: string,
  childId: string,
  role?: string
) {
  if (role === "ADMIN" || role === "SUPER_ADMIN") {
    const elevated = await prisma.child.findFirst({
      where: { id: childId, isActive: true },
      select: { id: true, displayName: true },
    });
    if (!elevated) throw new AppError("Child not found", 404);
    return elevated;
  }
  if (role === "TEACHER" || role === "SCHOOL_ADMIN") {
    const { assertTeacherCanViewChild } = await import(
      "../schools/school.access.js"
    );
    return assertTeacherCanViewChild(
      { id: parentId, role: role as "TEACHER" | "SCHOOL_ADMIN" },
      childId
    );
  }
  const child = await prisma.child.findFirst({
    where: { id: childId, parentId, isActive: true },
    select: { id: true, displayName: true },
  });
  if (!child) throw new AppError("Child not found", 404);
  return child;
}

function inferActivityType(
  rounds: string[]
): "LISTEN" | "SPELL" | "MATCHING" | "QUIZ" | "REVISION" | "LISTEN_SPELL" {
  const set = new Set(rounds);
  if (set.has("MATCHING") && !set.has("LISTEN") && !set.has("SPELL")) {
    return "MATCHING";
  }
  if (set.has("QUIZ") && !set.has("LISTEN") && !set.has("SPELL")) return "QUIZ";
  if (set.has("REVISION")) return "REVISION";
  if (set.has("LISTEN") || set.has("SPELL") || set.has("LETTER")) {
    return "LISTEN_SPELL";
  }
  if (set.has("MATCHING")) return "MATCHING";
  if (set.has("QUIZ")) return "QUIZ";
  return "LISTEN_SPELL";
}

export async function countDistinctCorrectWords(childId: string) {
  const extended = await canUseExtendedRounds();
  const rows = await prisma.questionAttempt.groupBy({
    by: ["wordId"],
    where: {
      isCorrect: true,
      round: attemptRoundFilter(extended),
      session: { childId },
    },
  });
  return rows.length;
}

/** Words with at least one incorrect attempt and no later correct attempt. */
export async function listWeakWords(
  parentId: string,
  childId: string,
  opts: { categoryId?: string; limit?: number },
  role?: string
) {
  await assertChildOwned(parentId, childId, role);
  const limit = Math.min(Math.max(opts.limit ?? 20, 1), 50);

  const extended = await canUseExtendedRounds();
  const attempts = await prisma.questionAttempt.findMany({
    where: {
      session: {
        childId,
        ...(opts.categoryId ? { categoryId: opts.categoryId } : {}),
      },
      round: attemptRoundFilter(extended),
    },
    select: {
      wordId: true,
      isCorrect: true,
      createdAt: true,
      word: {
        select: {
          id: true,
          text: true,
          meaning: true,
          emoji: true,
          category: { select: { id: true, label: true, emoji: true } },
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  const latestByWord = new Map<
    string,
    { hadIncorrect: boolean; hadCorrect: boolean; word: (typeof attempts)[0]["word"] }
  >();

  for (const a of attempts) {
    const cur = latestByWord.get(a.wordId) ?? {
      hadIncorrect: false,
      hadCorrect: false,
      word: a.word,
    };
    if (a.isCorrect) cur.hadCorrect = true;
    else cur.hadIncorrect = true;
    latestByWord.set(a.wordId, cur);
  }

  const weak = [...latestByWord.values()]
    .filter((w) => w.hadIncorrect && !w.hadCorrect)
    .slice(0, limit)
    .map((w) => ({
      wordId: w.word.id,
      text: w.word.text,
      meaning: w.word.meaning,
      emoji: w.word.emoji,
      categoryId: w.word.category.id,
      categoryLabel: w.word.category.label,
      categoryEmoji: w.word.category.emoji,
      status: "needs_practice" as const,
    }));

  return { weakWords: weak, count: weak.length };
}

/**
 * Award milestone achievements after a completed session (idempotent upserts).
 * Call inside or after the complete transaction.
 */
export async function awardMilestoneAchievements(childId: string) {
  const [sessionCount, distinctCorrect, day] = await Promise.all([
    prisma.learningSession.count({
      where: { childId, status: "COMPLETED" },
    }),
    countDistinctCorrectWords(childId),
    Promise.resolve(kolkataDayBounds()),
  ]);

  const extended = await canUseExtendedRounds();
  const dailyCorrect = await prisma.questionAttempt.groupBy({
    by: ["wordId"],
    where: {
      isCorrect: true,
      round: attemptRoundFilter(extended),
      createdAt: { gte: day.start, lte: day.end },
      session: { childId },
    },
  });

  const toAward: Array<{ code: string; title: string; description: string }> =
    [];

  if (sessionCount >= 1) {
    toAward.push({
      code: "first_activity",
      title: "First Steps",
      description: "Complete your first learning activity",
    });
  }
  if (distinctCorrect >= 10) {
    toAward.push({
      code: "words_10",
      title: "Word Explorer",
      description: "Answer 10 different words correctly",
    });
  }
  if (distinctCorrect >= 50) {
    toAward.push({
      code: "words_50",
      title: "Word Builder",
      description: "Answer 50 different words correctly",
    });
  }
  if (distinctCorrect >= 100) {
    toAward.push({
      code: "words_100",
      title: "Vocabulary Champion",
      description: "Answer 100 different words correctly",
    });
  }
  if (dailyCorrect.length >= 5) {
    toAward.push({
      code: "daily_goal",
      title: "Daily Goal Star",
      description: "Hit today’s daily word goal (IST)",
    });
  }

  for (const a of toAward) {
    await prisma.achievement.upsert({
      where: { childId_code: { childId, code: a.code } },
      create: {
        childId,
        code: a.code,
        title: a.title,
        description: a.description,
      },
      update: {},
    });
  }

  // Persist global words learned + weak list snapshot for parent/kids dashboards.
  const weak = await listWeakWordsInternal(childId, 30);
  await prisma.learningProgress.upsert({
    where: { childId },
    create: {
      childId,
      wordsLearned: distinctCorrect,
      weakWordsJson: JSON.stringify(weak.map((w) => w.wordId)),
    },
    update: {
      wordsLearned: distinctCorrect,
      weakWordsJson: JSON.stringify(weak.map((w) => w.wordId)),
    },
  });

  return { distinctCorrect, awardedCodes: toAward.map((a) => a.code) };
}

async function listWeakWordsInternal(childId: string, limit: number) {
  const extended = await canUseExtendedRounds();
  const attempts = await prisma.questionAttempt.findMany({
    where: {
      session: { childId },
      round: attemptRoundFilter(extended),
    },
    select: { wordId: true, isCorrect: true },
    orderBy: { createdAt: "desc" },
  });
  const state = new Map<string, { incorrect: boolean; correct: boolean }>();
  for (const a of attempts) {
    const cur = state.get(a.wordId) ?? { incorrect: false, correct: false };
    if (a.isCorrect) cur.correct = true;
    else cur.incorrect = true;
    state.set(a.wordId, cur);
  }
  return [...state.entries()]
    .filter(([, s]) => s.incorrect && !s.correct)
    .slice(0, limit)
    .map(([wordId]) => ({ wordId }));
}

export async function getChildLearningHistory(
  parentId: string,
  childId: string,
  opts: { limit?: number; offset?: number },
  role?: string
) {
  await assertChildOwned(parentId, childId, role);
  const limit = Math.min(Math.max(opts.limit ?? 20, 1), 50);
  const offset = Math.max(opts.offset ?? 0, 0);

  const [total, sessions] = await Promise.all([
    prisma.learningSession.count({ where: { childId } }),
    prisma.learningSession.findMany({
      where: { childId },
      include: {
        category: { select: { id: true, label: true, emoji: true, code: true } },
        attempts: {
          select: {
            wordId: true,
            round: true,
            isCorrect: true,
            word: { select: { text: true } },
          },
        },
      },
      orderBy: { startedAt: "desc" },
      take: limit,
      skip: offset,
    }),
  ]);

  const items = sessions.map((s) => {
    const rounds = s.attempts.map((a) => a.round);
    const correct = s.attempts.filter((a) => a.isCorrect).length;
    const incorrect = s.attempts.filter((a) => !a.isCorrect).length;
    const attempted = s.attempts.length;
    const accuracy =
      attempted > 0 ? Math.round((correct / attempted) * 100) : 0;
    const wordsPracticed = [
      ...new Set(s.attempts.map((a) => a.word.text)),
    ].slice(0, 12);

    return {
      sessionId: s.id,
      status: s.status,
      activityType: inferActivityType(rounds),
      category: {
        id: s.category.id,
        label: s.category.label,
        emoji: s.category.emoji,
        code: s.category.code,
      },
      startedAt: s.startedAt,
      completedAt: s.completedAt,
      durationSec: s.durationSec,
      points: s.points,
      stars: s.stars,
      questionsAttempted: attempted,
      correctAnswers: correct,
      incorrectAnswers: incorrect,
      accuracy,
      wordsPracticed,
    };
  });

  return {
    total,
    limit,
    offset,
    hasMore: offset + items.length < total,
    items,
  };
}

export async function getChildProgressDashboard(
  parentId: string,
  childId: string,
  role?: string
) {
  const child = await assertChildOwned(parentId, childId, role);
  const day = kolkataDayBounds();
  const weekStart = new Date(day.start);
  weekStart.setDate(weekStart.getDate() - 6);

  const [
    progressRows,
    achievements,
    learningProgress,
    dailyWordGroups,
    weekWordGroups,
    allAttemptAgg,
    correctWordGroups,
    completedSessions,
    allSessionsCount,
    levels,
    weakPayload,
  ] = await Promise.all([
    prisma.childCategoryProgress.findMany({
      where: { childId },
      include: {
        category: {
          select: {
            id: true,
            label: true,
            emoji: true,
            code: true,
            group: {
              select: {
                label: true,
                code: true,
                level: { select: { code: true, label: true } },
              },
            },
            _count: { select: { words: { where: { isActive: true } } } },
          },
        },
      },
      orderBy: { lastPlayedAt: "desc" },
    }),
    prisma.achievement.findMany({
      where: { childId },
      orderBy: { earnedAt: "desc" },
    }),
    prisma.learningProgress.findUnique({ where: { childId } }),
    (async () => {
      const extended = await canUseExtendedRounds();
      return prisma.questionAttempt.groupBy({
        by: ["wordId"],
        where: {
          isCorrect: true,
          round: attemptRoundFilter(extended),
          createdAt: { gte: day.start, lte: day.end },
          session: { childId },
        },
      });
    })(),
    (async () => {
      const extended = await canUseExtendedRounds();
      return prisma.questionAttempt.groupBy({
        by: ["wordId"],
        where: {
          isCorrect: true,
          round: attemptRoundFilter(extended),
          createdAt: { gte: weekStart, lte: day.end },
          session: { childId },
        },
      });
    })(),
    (async () => {
      const extended = await canUseExtendedRounds();
      return prisma.questionAttempt.groupBy({
        by: ["wordId"],
        where: {
          round: attemptRoundFilter(extended),
          session: { childId },
        },
        _count: { _all: true },
      });
    })(),
    (async () => {
      const extended = await canUseExtendedRounds();
      return prisma.questionAttempt.groupBy({
        by: ["wordId"],
        where: {
          isCorrect: true,
          round: attemptRoundFilter(extended),
          session: { childId },
        },
      });
    })(),
    prisma.learningSession.count({
      where: { childId, status: "COMPLETED" },
    }),
    prisma.learningSession.count({ where: { childId } }),
    prisma.learningLevel.findMany({
      orderBy: { sortOrder: "asc" },
      select: { code: true, label: true },
    }),
    listWeakWords(parentId, childId, { limit: 15 }, role),
  ]);

  const wordsAttempted = allAttemptAgg.length;
  const wordsCorrect = correctWordGroups.length;
  const wordsNeedingPractice = weakPayload.count;
  const extended = await canUseExtendedRounds();
  const totalAttempts = await prisma.questionAttempt.count({
    where: {
      round: attemptRoundFilter(extended),
      session: { childId },
    },
  });
  const totalCorrectAttempts = await prisma.questionAttempt.count({
    where: {
      isCorrect: true,
      round: attemptRoundFilter(extended),
      session: { childId },
    },
  });
  const accuracy =
    totalAttempts > 0
      ? Math.round((totalCorrectAttempts / totalAttempts) * 100)
      : 0;

  const points = progressRows.reduce((s, p) => s + p.points, 0);
  const stars = progressRows.reduce((s, p) => s + p.stars, 0);
  const dailyTarget = 5;
  const wordsLearnedToday = dailyWordGroups.length;

  const earnedByCode = new Map(achievements.map((a) => [a.code, a]));
  const achievementBoard = ACHIEVEMENT_CATALOG.map((def) => {
    const earned = earnedByCode.get(def.code);
    return {
      code: def.code,
      title: def.title,
      description: def.description,
      emoji: def.emoji,
      unlocked: Boolean(earned),
      earnedAt: earned?.earnedAt ?? null,
    };
  });

  // Category-completion achievements also appear on the board.
  const categoryAchievements = achievements
    .filter((a) => a.code.startsWith("cat_"))
    .map((a) => ({
      code: a.code,
      title: a.title,
      description: a.description,
      emoji: "🏅",
      unlocked: true,
      earnedAt: a.earnedAt,
    }));

  const levelMap = new Map<
    string,
    {
      code: string;
      label: string;
      wordsLearned: number;
      categoriesCompleted: number;
      categoriesTouched: number;
      points: number;
      stars: number;
    }
  >();
  for (const lvl of levels) {
    levelMap.set(lvl.code, {
      code: lvl.code,
      label: lvl.label,
      wordsLearned: 0,
      categoriesCompleted: 0,
      categoriesTouched: 0,
      points: 0,
      stars: 0,
    });
  }
  for (const p of progressRows) {
    const code = p.category.group.level.code;
    const mutable = levelMap.get(code) ?? {
      code,
      label: p.category.group.level.label,
      wordsLearned: 0,
      categoriesCompleted: 0,
      categoriesTouched: 0,
      points: 0,
      stars: 0,
    };
    mutable.wordsLearned += p.wordsLearned;
    mutable.categoriesTouched += 1;
    if (p.completed) mutable.categoriesCompleted += 1;
    mutable.points += p.points;
    mutable.stars += p.stars;
    levelMap.set(code, mutable);
  }

  const recentHistory = await getChildLearningHistory(
    parentId,
    childId,
    { limit: 8, offset: 0 },
    role
  );

  return {
    child: { id: child.id, displayName: child.displayName },
    summary: {
      wordsAttempted,
      wordsCorrect,
      wordsNeedingPractice,
      accuracy,
      activitiesCompleted: completedSessions,
      sessionsStarted: allSessionsCount,
      categoriesCompleted: progressRows.filter((p) => p.completed).length,
      wordsLearned: wordsCorrect,
      points,
      stars,
      minutesLearned:
        progressRows.reduce((s, p) => s + p.minutesLearned, 0) ||
        learningProgress?.minutesLearned ||
        0,
      listenAccuracy: (() => {
        const attempts = progressRows.reduce((s, p) => s + p.listenAttempts, 0);
        const correct = progressRows.reduce((s, p) => s + p.listenCorrect, 0);
        return attempts ? Math.round((correct / attempts) * 100) : 0;
      })(),
      spellAccuracy: (() => {
        const attempts = progressRows.reduce((s, p) => s + p.spellAttempts, 0);
        const correct = progressRows.reduce((s, p) => s + p.spellCorrect, 0);
        return attempts ? Math.round((correct / attempts) * 100) : 0;
      })(),
      daily: {
        wordsLearnedToday,
        target: dailyTarget,
        date: day.date,
        timezone: day.timezone,
        completed: wordsLearnedToday >= dailyTarget,
      },
      weekly: {
        wordsLearned: weekWordGroups.length,
        fromDate: weekStart.toISOString(),
        toDate: day.end.toISOString(),
        timezone: day.timezone,
      },
    },
    levels: [...levelMap.values()],
    categories: progressRows.map((p) => ({
      categoryId: p.category.id,
      label: p.category.label,
      emoji: p.category.emoji,
      group: p.category.group.label,
      level: p.category.group.level.label,
      levelCode: p.category.group.level.code,
      wordCount: p.category._count.words,
      wordsLearned: p.wordsLearned,
      points: p.points,
      stars: p.stars,
      completed: p.completed,
      listenCorrect: p.listenCorrect,
      listenAttempts: p.listenAttempts,
      spellCorrect: p.spellCorrect,
      spellAttempts: p.spellAttempts,
      minutesLearned: p.minutesLearned,
      lastPlayedAt: p.lastPlayedAt,
      progressPct: Math.round(
        (p.wordsLearned / Math.max(p.category._count.words, 1)) * 100
      ),
    })),
    weakWords: weakPayload.weakWords,
    history: recentHistory.items,
    historyMeta: {
      total: recentHistory.total,
      hasMore: recentHistory.hasMore,
    },
    achievements: [...achievementBoard, ...categoryAchievements],
    earnedAchievements: achievements,
  };
}
