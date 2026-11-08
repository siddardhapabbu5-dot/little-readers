import type {
  CompleteLearningSessionInput,
  StartLearningSessionInput,
  SubmitQuestionAttemptInput,
} from "@little-readers/validation";
import { AppError } from "../lib/errors.js";
import { prisma } from "../lib/prisma.js";
import { resolveAlphabetEmoji } from "../vocab-import/alphabet-emoji.js";
import { assertStudentDeviceAllowed } from "../devices/device.service.js";
import {
  assertChildHasLearningSeat,
  assertParentSubscriptionEligible,
} from "../subscriptions/subscription.service.js";
import {
  awardMilestoneAchievements,
  getChildProgressDashboard,
} from "./progress-rewards.js";
import { assertActivityModeEnabled } from "./activity-settings.js";
import { issueCertificateIfMastered } from "./certificates.js";
import { awardSessionPoints } from "../challenges/challenges.service.js";
import { MIX_MODES, type MixMode } from "@little-readers/shared";

function isMixMode(mode: string | null | undefined): mode is MixMode {
  return Boolean(mode) && (MIX_MODES as readonly string[]).includes(mode!);
}

function liveEmoji(word: string, emoji: string | null | undefined) {
  return resolveAlphabetEmoji({
    symbol: emoji,
    word,
    capitalLetter: word.charAt(0),
    fallback: "🔤",
  });
}

/** Distinct vocabulary words this child got correct in a category (any session, incl. mixed). */
async function countDistinctWordsLearned(childId: string, categoryId: string) {
  const rows = await prisma.questionAttempt.findMany({
    where: {
      isCorrect: true,
      session: { childId },
      word: { categoryId },
    },
    select: { wordId: true },
    distinct: ["wordId"],
  });
  return rows.length;
}

async function learnedWordIdSet(childId: string, categoryId: string) {
  const rows = await prisma.questionAttempt.findMany({
    where: {
      isCorrect: true,
      session: { childId },
      word: { categoryId },
    },
    select: { wordId: true },
    distinct: ["wordId"],
  });
  return new Set(rows.map((r) => r.wordId));
}

async function assertChildOwnedByParent(
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

function shuffle<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

type ActivityMode = "LISTEN_SPELL" | "MATCHING" | "QUIZ" | "REVISION";

function normalizeActivityMode(
  value: StartLearningSessionInput["activityMode"]
): ActivityMode {
  if (
    value === "MATCHING" ||
    value === "QUIZ" ||
    value === "REVISION" ||
    value === "LISTEN_SPELL"
  ) {
    return value;
  }
  return "LISTEN_SPELL";
}

export async function getLevel1Curriculum(parentId: string, childId: string) {
  await assertChildOwnedByParent(parentId, childId);

  const level = await prisma.learningLevel.findUnique({
    where: { code: "LEVEL_1" },
    include: {
      groups: {
        orderBy: { sortOrder: "asc" },
        include: {
          categories: {
            where: { isPublished: true },
            orderBy: { sortOrder: "asc" },
            include: {
              _count: { select: { words: { where: { isActive: true } } } },
              progress: { where: { childId } },
            },
          },
        },
      },
    },
  });

  if (!level) {
    throw new AppError("Level 1 curriculum is not seeded. Run db:seed.", 500);
  }

  const ordered = level.groups.flatMap((g) => g.categories);

  // Sync wordsLearned from real distinct correct attempts (fixes stuck 8/26).
  const learnedByCategory = new Map<string, number>();
  await Promise.all(
    ordered.map(async (cat) => {
      const n = await countDistinctWordsLearned(childId, cat.id);
      learnedByCategory.set(cat.id, n);
      const progress = cat.progress[0];
      if (progress && progress.wordsLearned !== n) {
        const done = n >= cat._count.words && cat._count.words > 0;
        await prisma.childCategoryProgress.update({
          where: { id: progress.id },
          data: {
            wordsLearned: n,
            completed: done || progress.completed,
          },
        });
        progress.wordsLearned = n;
        if (done) progress.completed = true;
      }
    })
  );

  const completedIds = new Set(
    ordered.filter((c) => c.progress[0]?.completed).map((c) => c.id)
  );

  return {
    level: {
      id: level.id,
      code: level.code,
      label: level.label,
      ageMin: level.ageMin,
      ageMax: level.ageMax,
      description: level.description,
    },
    groups: level.groups.map((group) => ({
      id: group.id,
      code: group.code,
      label: group.label,
      sortOrder: group.sortOrder,
      categories: group.categories.map((cat) => {
        const progress = cat.progress[0] ?? null;
        const wordsLearned = learnedByCategory.get(cat.id) ?? progress?.wordsLearned ?? 0;
        const priorCompleted = ordered
          .filter((c) => c.unlockOrder < cat.unlockOrder)
          .every((c) => completedIds.has(c.id));
        const unlocked = cat.unlockOrder === 0 || priorCompleted || Boolean(progress?.lastPlayedAt);
        return {
          id: cat.id,
          code: cat.code,
          label: cat.label,
          description: cat.description,
          emoji: cat.emoji,
          wordCount: cat._count.words,
          unlockOrder: cat.unlockOrder,
          unlocked,
          progress: progress
            ? {
                wordsLearned,
                listenCorrect: progress.listenCorrect,
                listenAttempts: progress.listenAttempts,
                spellCorrect: progress.spellCorrect,
                spellAttempts: progress.spellAttempts,
                points: progress.points,
                stars: progress.stars,
                completed:
                  progress.completed ||
                  (cat._count.words > 0 && wordsLearned >= cat._count.words),
                minutesLearned: progress.minutesLearned,
                lastPlayedAt: progress.lastPlayedAt,
              }
            : wordsLearned > 0
              ? {
                  wordsLearned,
                  listenCorrect: 0,
                  listenAttempts: 0,
                  spellCorrect: 0,
                  spellAttempts: 0,
                  points: 0,
                  stars: 0,
                  completed: cat._count.words > 0 && wordsLearned >= cat._count.words,
                  minutesLearned: 0,
                  lastPlayedAt: null as Date | null,
                }
              : null,
        };
      }),
    })),
  };
}

type SessionWord = {
  id: string;
  text: string;
  meaning: string;
  emoji: string;
  imageUrl: string | null;
  audioUrl: string | null;
  firstLetter: string;
  phonetic: string | null;
  difficulty: number;
};

/** Prefer words with prior incorrect attempts, then previously correct, then new. */
async function orderPoolForRevision(childId: string, pool: SessionWord[]) {
  const attempts = await prisma.questionAttempt.findMany({
    where: {
      session: { childId },
      wordId: { in: pool.map((w) => w.id) },
    },
    select: { wordId: true, isCorrect: true },
    orderBy: { createdAt: "desc" },
  });

  const hadIncorrect = new Set<string>();
  const hadCorrect = new Set<string>();
  for (const a of attempts) {
    if (!a.isCorrect) hadIncorrect.add(a.wordId);
    else hadCorrect.add(a.wordId);
  }

  const weak = shuffle(pool.filter((w) => hadIncorrect.has(w.id)));
  const known = shuffle(
    pool.filter((w) => hadCorrect.has(w.id) && !hadIncorrect.has(w.id))
  );
  const fresh = shuffle(
    pool.filter((w) => !hadIncorrect.has(w.id) && !hadCorrect.has(w.id))
  );
  return {
    ordered: [...weak, ...known, ...fresh],
    hasHistory: weak.length + known.length > 0,
  };
}

function buildQuestions(selected: SessionWord[], pool: SessionWord[]) {
  return selected.map((word, index) => {
    const distractors = shuffle(pool.filter((w) => w.id !== word.id)).slice(0, 3);
    while (distractors.length < 3 && pool.length > 1) {
      const extra = pool[distractors.length % pool.length];
      if (extra.id !== word.id && !distractors.some((d) => d.id === extra.id)) {
        distractors.push(extra);
      } else break;
    }
    const options = shuffle([
      {
        id: word.id,
        text: word.text,
        emoji: liveEmoji(word.text, word.emoji),
        correct: true,
      },
      ...distractors.map((d) => ({
        id: d.id,
        text: d.text,
        emoji: liveEmoji(d.text, d.emoji),
        correct: false,
      })),
    ]).map((opt, i) => ({
      key: ["A", "B", "C", "D"][i] as "A" | "B" | "C" | "D",
      wordId: opt.id,
      text: opt.text,
      emoji: opt.emoji,
      isCorrect: opt.correct,
    }));

    return {
      index: index + 1,
      word: {
        id: word.id,
        text: word.text,
        meaning: word.meaning,
        emoji: liveEmoji(word.text, word.emoji),
        imageUrl: word.imageUrl,
        audioUrl: word.audioUrl,
        firstLetter: word.firstLetter || word.text.charAt(0).toUpperCase(),
        pronunciation: word.phonetic,
        difficulty: word.difficulty,
      },
      listenOptions: options,
    };
  });
}

async function rebuildSessionPayload(
  sessionId: string,
  words: SessionWord[],
  categoryMeta: {
    id: string;
    code: string;
    label: string;
    emoji: string;
    levelLabel: string;
    groupLabel: string;
  },
  lessonMeta: { id: string; title: string; activities: string[] } | null,
  resumed: boolean
) {
  const session = await prisma.learningSession.findUniqueOrThrow({
    where: { id: sessionId },
    include: { attempts: true },
  });
  const attemptedListen = new Set(
    session.attempts
      .filter((a) => a.round === "LISTEN" && a.isCorrect)
      .map((a) => a.wordId)
  );
  // Resume: keep original order preference; still include unanswered first
  const remaining = words.filter((w) => !attemptedListen.has(w.id));
  const selected =
    remaining.length > 0 ? remaining : words.slice(0, session.questionsTotal || words.length);
  const questions = buildQuestions(selected, words);

  return {
    sessionId: session.id,
    resumed,
    activityMode: "LISTEN_SPELL" as ActivityMode,
    lesson: lessonMeta,
    category: categoryMeta,
    questionsTotal: session.questionsTotal || questions.length,
    questions,
    progress: {
      points: session.points,
      listenCorrect: session.listenCorrect,
      spellCorrect: session.spellCorrect,
      attemptsCount: session.attempts.length,
    },
  };
}

export async function getActiveLearningSession(
  parentId: string,
  childId: string,
  opts: { lessonId?: string; categoryId?: string },
  role?: string
) {
  await assertChildOwnedByParent(parentId, childId, role);
  const session = await prisma.learningSession.findFirst({
    where: {
      childId,
      status: "IN_PROGRESS",
      ...(opts.lessonId ? { lessonId: opts.lessonId } : {}),
      ...(opts.categoryId && !opts.lessonId
        ? { categoryId: opts.categoryId, lessonId: null, mode: null }
        : {}),
    },
    orderBy: { startedAt: "desc" },
    select: { id: true, lessonId: true, categoryId: true, startedAt: true },
  });
  return session;
}

export async function startLearningSession(
  parentId: string,
  input: StartLearningSessionInput,
  mobile?: { installationId?: string; enforceDevice?: boolean },
  role?: string
) {
  await assertChildOwnedByParent(parentId, input.childId, role);
  await assertParentSubscriptionEligible(parentId);
  await assertChildHasLearningSeat(parentId, input.childId);

  if (mobile?.enforceDevice) {
    if (!mobile.installationId) {
      throw new AppError(
        "Mobile installation id is required for student learning on the app",
        400
      );
    }
    await assertStudentDeviceAllowed(input.childId, mobile.installationId);
  }

  const activityMode = normalizeActivityMode(input.activityMode);
  await assertActivityModeEnabled(activityMode);

  if (input.mix) {
    return startMixedSession(input.childId, input.mix, activityMode, input.questionCount);
  }

  // --- Lesson-backed session (Listen/Spell reuse) ---
  if (input.lessonId) {
    const lesson = await prisma.lesson.findFirst({
      where: {
        id: input.lessonId,
        isPublished: true,
        isActive: true,
        status: "PUBLISHED",
      },
      include: {
        learningCategory: {
          include: { group: { include: { level: true } } },
        },
        vocabItems: {
          orderBy: { sortOrder: "asc" },
          include: { vocabularyWord: true },
        },
      },
    });
    if (!lesson) throw new AppError("Lesson not found or not published", 404);

    const activeWords = lesson.vocabItems
      .map((i) => i.vocabularyWord)
      .filter((w) => w.isActive);
    if (!activeWords.length) {
      throw new AppError("Lesson has no active vocabulary words", 400);
    }

    const categoryId =
      lesson.learningCategoryId ??
      activeWords[0].categoryId;
    const category =
      lesson.learningCategory ??
      (await prisma.learningCategory.findUniqueOrThrow({
        where: { id: categoryId },
        include: { group: { include: { level: true } } },
      }));

    let activities: string[] = ["LISTEN", "SPELL"];
    try {
      const parsed = JSON.parse(lesson.activitiesJson) as unknown;
      if (Array.isArray(parsed)) {
        activities = parsed.map(String).filter((a) => a === "LISTEN" || a === "SPELL");
      }
    } catch {
      /* default */
    }

    const open = await prisma.learningSession.findFirst({
      where: {
        childId: input.childId,
        lessonId: lesson.id,
        status: "IN_PROGRESS",
      },
      orderBy: { startedAt: "desc" },
    });

    const pool: SessionWord[] = activeWords.map((w) => ({
      id: w.id,
      text: w.text,
      meaning: w.meaning,
      emoji: w.emoji,
      imageUrl: w.imageUrl,
      audioUrl: w.audioUrl,
      firstLetter: w.firstLetter,
      phonetic: w.phonetic,
      difficulty: w.difficulty,
    }));

    const categoryMeta = {
      id: category.id,
      code: category.code,
      label: category.label,
      emoji: category.emoji,
      levelLabel: category.group.level.label,
      groupLabel: category.group.label,
    };
    const lessonMeta = {
      id: lesson.id,
      title: lesson.title,
      activities: activities.length ? activities : ["LISTEN", "SPELL"],
    };

    if (open && (input.resume !== false)) {
      return rebuildSessionPayload(open.id, pool, categoryMeta, lessonMeta, true);
    }

    const count = Math.min(input.questionCount ?? pool.length, pool.length);
    // Preserve lesson order for lesson play (not random shuffle)
    const selected = pool.slice(0, count);

    const session = await prisma.learningSession.create({
      data: {
        childId: input.childId,
        categoryId: category.id,
        lessonId: lesson.id,
        questionsTotal: selected.length,
        status: "IN_PROGRESS",
      },
    });

    return {
      sessionId: session.id,
      resumed: false,
      activityMode,
      lesson: lessonMeta,
      category: categoryMeta,
      questionsTotal: selected.length,
      questions: buildQuestions(selected, pool),
      progress: {
        points: 0,
        listenCorrect: 0,
        spellCorrect: 0,
        attemptsCount: 0,
      },
    };
  }

  // --- Category-backed session (Listen/Spell + Matching/Quiz/Revision) ---
  if (!input.categoryId) {
    throw new AppError("categoryId or lessonId is required", 400);
  }

  if (input.resume && activityMode === "LISTEN_SPELL") {
    const open = await prisma.learningSession.findFirst({
      where: {
        childId: input.childId,
        categoryId: input.categoryId,
        lessonId: null,
        mode: null,
        status: "IN_PROGRESS",
      },
      orderBy: { startedAt: "desc" },
    });
    if (open) {
      const category = await prisma.learningCategory.findFirst({
        where: { id: input.categoryId, isPublished: true },
        include: {
          words: { where: { isActive: true }, orderBy: { sortOrder: "asc" } },
          group: { include: { level: true } },
        },
      });
      if (category?.words.length) {
        const pool: SessionWord[] = category.words.map((w) => ({
          id: w.id,
          text: w.text,
          meaning: w.meaning,
          emoji: w.emoji,
          imageUrl: w.imageUrl,
          audioUrl: w.audioUrl,
          firstLetter: w.firstLetter,
          phonetic: w.phonetic,
          difficulty: w.difficulty,
        }));
        return rebuildSessionPayload(
          open.id,
          pool,
          {
            id: category.id,
            code: category.code,
            label: category.label,
            emoji: category.emoji,
            levelLabel: category.group.level.label,
            groupLabel: category.group.label,
          },
          null,
          true
        );
      }
    }
  }

  const category = await prisma.learningCategory.findFirst({
    where: { id: input.categoryId, isPublished: true },
    include: {
      words: {
        where: { isActive: true },
        orderBy: { sortOrder: "asc" },
      },
      group: { include: { level: true } },
    },
  });

  if (!category || category.words.length === 0) {
    throw new AppError("Category not found or empty", 404);
  }

  const pool: SessionWord[] = category.words.map((w) => ({
    id: w.id,
    text: w.text,
    meaning: w.meaning,
    emoji: w.emoji,
    imageUrl: w.imageUrl,
    audioUrl: w.audioUrl,
    firstLetter: w.firstLetter,
    phonetic: w.phonetic,
    difficulty: w.difficulty,
  }));

  let orderedPool: SessionWord[] = pool;
  let revisionNote: string | null = null;
  let resolvedDefault = Math.min(10, pool.length);

  if (activityMode === "REVISION") {
    const revision = await orderPoolForRevision(input.childId, pool);
    orderedPool = revision.ordered;
    revisionNote = revision.hasHistory
      ? "Reviewing words you have practiced before, starting with ones that need more help."
      : "No prior attempts yet — practicing this category’s words to start your revision history.";
    resolvedDefault = Math.min(8, orderedPool.length);
  } else if (activityMode === "MATCHING") {
    orderedPool = shuffle(pool);
    resolvedDefault = Math.min(6, orderedPool.length);
  } else if (activityMode === "QUIZ") {
    orderedPool = shuffle(pool);
    resolvedDefault = Math.min(8, orderedPool.length);
  } else {
    const learnedIds = await learnedWordIdSet(input.childId, category.id);
    const unlearned = shuffle(pool.filter((w) => !learnedIds.has(w.id)));
    const already = shuffle(pool.filter((w) => learnedIds.has(w.id)));
    orderedPool = [...unlearned, ...already];
    resolvedDefault =
      unlearned.length > 0 ? unlearned.length : Math.min(10, pool.length);
  }

  const count = Math.min(
    input.questionCount ?? resolvedDefault,
    orderedPool.length
  );
  const selected = orderedPool.slice(0, count);

  const session = await prisma.learningSession.create({
    data: {
      childId: input.childId,
      categoryId: category.id,
      // Games are tagged so an abandoned game is never resumed as Listen/Spell.
      mode:
        activityMode === "LISTEN_SPELL"
          ? null
          : input.surprise && (activityMode === "MATCHING" || activityMode === "QUIZ")
            ? "SURPRISE"
            : activityMode,
      questionsTotal: selected.length,
      status: "IN_PROGRESS",
    },
  });

  return {
    sessionId: session.id,
    resumed: false as boolean,
    activityMode,
    revisionNote,
    lesson: null as null,
    category: {
      id: category.id,
      code: category.code,
      label: category.label,
      emoji: category.emoji,
      levelLabel: category.group.level.label,
      groupLabel: category.group.label,
    },
    questionsTotal: selected.length,
    questions: buildQuestions(selected, pool),
    progress: {
      points: 0,
      listenCorrect: 0,
      spellCorrect: 0,
      attemptsCount: 0,
    },
  };
}

/** Admin-only game preview: same questions as a real session, nothing is saved. */
export async function previewLearningSession(input: {
  categoryId: string;
  activityMode?: string;
  questionCount?: number;
}) {
  const activityMode = normalizeActivityMode(
    input.activityMode as StartLearningSessionInput["activityMode"]
  );
  const category = await prisma.learningCategory.findUnique({
    where: { id: input.categoryId },
    include: {
      words: { where: { isActive: true }, orderBy: { sortOrder: "asc" } },
      group: { include: { level: true } },
    },
  });
  if (!category || category.words.length === 0) {
    throw new AppError("This category has no active words yet", 404);
  }

  const pool: SessionWord[] = category.words.map((w) => ({
    id: w.id,
    text: w.text,
    meaning: w.meaning,
    emoji: w.emoji,
    imageUrl: w.imageUrl,
    audioUrl: w.audioUrl,
    firstLetter: w.firstLetter,
    phonetic: w.phonetic,
    difficulty: w.difficulty,
  }));
  const defaults: Record<string, number> = { MATCHING: 6, QUIZ: 8, REVISION: 8, LISTEN_SPELL: 10 };
  const count = Math.min(input.questionCount ?? defaults[activityMode] ?? 10, pool.length);
  const selected = shuffle(pool).slice(0, count);

  return {
    sessionId: `preview-${Date.now()}`,
    resumed: false,
    activityMode,
    revisionNote:
      activityMode === "REVISION"
        ? "Admin preview — children see the words they need more practice on first."
        : null,
    lesson: null,
    category: {
      id: category.id,
      code: category.code,
      label: category.label,
      emoji: category.emoji,
      levelLabel: category.group.level.label,
      groupLabel: category.group.label,
    },
    questionsTotal: selected.length,
    questions: buildQuestions(selected, pool),
    progress: { points: 0, listenCorrect: 0, spellCorrect: 0, attemptsCount: 0 },
  };
}

const MIX_META: Record<MixMode, { label: string; emoji: string }> = {
  DAILY_CHALLENGE: { label: "Daily Challenge", emoji: "📅" },
  REVISION_WORLD: { label: "Revision World", emoji: "🔁" },
  MIXED: { label: "Mixed Games", emoji: "🌈" },
};

/** Same order for the whole day per child, different every day. */
function seededShuffle<T>(items: T[], seed: string): T[] {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i += 1) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const next = () => {
    h ^= h << 13;
    h ^= h >>> 17;
    h ^= h << 5;
    return (h >>> 0) / 4294967296;
  };
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(next() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

/**
 * Daily Challenge: familiar (learned) words in a new daily mix.
 * Revision World: words from completed categories, weakest first.
 * Mixed Games: words from every unlocked category of the child's level.
 */
async function startMixedSession(
  childId: string,
  mix: MixMode,
  activityMode: ActivityMode,
  questionCount?: number
) {
  const child = await prisma.child.findUniqueOrThrow({
    where: { id: childId },
    select: { level: { select: { code: true } } },
  });
  const levelCode = child.level?.code ?? "LEVEL_1";
  const categories = await prisma.learningCategory.findMany({
    where: { isPublished: true, group: { level: { code: levelCode } } },
    orderBy: { unlockOrder: "asc" },
    include: {
      words: { where: { isActive: true }, orderBy: { sortOrder: "asc" } },
      progress: { where: { childId } },
    },
  });
  const toWord = (w: (typeof categories)[number]["words"][number]): SessionWord => ({
    id: w.id,
    text: w.text,
    meaning: w.meaning,
    emoji: w.emoji,
    imageUrl: w.imageUrl,
    audioUrl: w.audioUrl,
    firstLetter: w.firstLetter,
    phonetic: w.phonetic,
    difficulty: w.difficulty,
  });

  const completedIds = new Set(
    categories.filter((c) => c.progress[0]?.completed).map((c) => c.id)
  );
  const unlocked = categories.filter((c) => {
    const prior = categories.filter((o) => o.unlockOrder < c.unlockOrder);
    return (
      c.unlockOrder === 0 ||
      prior.every((o) => completedIds.has(o.id)) ||
      Boolean(c.progress[0]?.lastPlayedAt)
    );
  });

  const learnedRows = await prisma.questionAttempt.findMany({
    where: { isCorrect: true, session: { childId } },
    select: { wordId: true },
    distinct: ["wordId"],
  });
  const learned = new Set(learnedRows.map((r) => r.wordId));
  const unlockedWords = unlocked.flatMap((c) => c.words.map(toWord));

  let pool: SessionWord[];
  let note: string | null = null;
  if (mix === "DAILY_CHALLENGE") {
    const familiar = unlockedWords.filter((w) => learned.has(w.id));
    pool = familiar.length >= 4 ? familiar : unlockedWords;
    pool = seededShuffle(pool, `${childId}:${kolkataDayBounds().date}`);
    note = "Today's mix of words you know. A new mix comes tomorrow!";
  } else if (mix === "REVISION_WORLD") {
    const fromCompleted = categories
      .filter((c) => completedIds.has(c.id))
      .flatMap((c) => c.words.map(toWord));
    const base = fromCompleted.length >= 4
      ? fromCompleted
      : unlockedWords.filter((w) => learned.has(w.id));
    if (base.length < 4) {
      throw new AppError("Learn a few more words first, then Revision World opens.", 400);
    }
    pool = (await orderPoolForRevision(childId, base)).ordered;
    note = "Practising words from topics you finished, trickiest first.";
  } else {
    pool = shuffle(unlockedWords);
    note = `Words from ${unlocked.length} topic${unlocked.length === 1 ? "" : "s"} all mixed up!`;
  }

  if (pool.length < 4) {
    throw new AppError("Not enough words yet. Learn some words first!", 400);
  }

  const defaults: Record<ActivityMode, number> = { MATCHING: 6, QUIZ: 8, REVISION: 8, LISTEN_SPELL: 10 };
  const count = Math.min(questionCount ?? defaults[activityMode], pool.length);
  const selected = pool.slice(0, count);

  const session = await prisma.learningSession.create({
    data: {
      childId,
      categoryId:
        categories.find((c) => c.words.some((w) => w.id === selected[0].id))?.id ??
        categories[0].id,
      mode: mix,
      questionsTotal: selected.length,
      status: "IN_PROGRESS",
    },
  });

  return {
    sessionId: session.id,
    resumed: false as boolean,
    activityMode,
    mix,
    revisionNote: note,
    lesson: null as null,
    category: {
      id: mix,
      code: mix,
      label: MIX_META[mix].label,
      emoji: MIX_META[mix].emoji,
      levelLabel: levelCode,
      groupLabel: "",
    },
    questionsTotal: selected.length,
    questions: buildQuestions(selected, pool),
    progress: { points: 0, listenCorrect: 0, spellCorrect: 0, attemptsCount: 0 },
  };
}

export async function submitQuestionAttempt(
  parentId: string,
  sessionId: string,
  input: SubmitQuestionAttemptInput
) {
  const session = await prisma.learningSession.findUnique({
    where: { id: sessionId },
    include: { child: { select: { parentId: true } } },
  });

  if (!session || session.child.parentId !== parentId) {
    throw new AppError("Session not found", 404);
  }
  if (session.status !== "IN_PROGRESS") {
    throw new AppError("Session is already closed", 400);
  }

  const word = session.lessonId
    ? await prisma.vocabularyWord.findFirst({
        where: {
          id: input.wordId,
          lessonItems: { some: { lessonId: session.lessonId } },
        },
      })
    : isMixMode(session.mode)
      ? await prisma.vocabularyWord.findFirst({
          where: { id: input.wordId, isActive: true, category: { isPublished: true } },
        })
      : await prisma.vocabularyWord.findFirst({
          where: { id: input.wordId, categoryId: session.categoryId },
        });
  if (!word) {
    throw new AppError(
      session.lessonId ? "Word not in this lesson" : "Word not in this category",
      400
    );
  }

  // Idempotent: do not award points twice for the same word+round once already correct.
  const priorCorrect = await prisma.questionAttempt.findFirst({
    where: {
      sessionId,
      wordId: input.wordId,
      round: input.round,
      isCorrect: true,
    },
    orderBy: { createdAt: "asc" },
  });
  if (priorCorrect) {
    return {
      attemptId: priorCorrect.id,
      pointsAwarded: priorCorrect.pointsAwarded,
      isCorrect: true,
      duplicate: true,
    };
  }

  const points =
    input.pointsAwarded ??
    (input.isCorrect
      ? input.usedClue
        ? 5
        : input.round === "LISTEN"
          ? 10
          : input.round === "LETTER"
            ? 6
            : input.round === "MATCHING" ||
                input.round === "QUIZ" ||
                input.round === "REVISION"
              ? 8
              : 8
      : 0);

  const attempt = await prisma.questionAttempt.create({
    data: {
      sessionId,
      wordId: input.wordId,
      round: input.round,
      isCorrect: input.isCorrect,
      answerGiven: input.answerGiven,
      usedClue: input.usedClue ?? false,
      pointsAwarded: points,
    },
  });

  await prisma.learningSession.update({
    where: { id: sessionId },
    data: {
      points: { increment: points },
      listenScore: { increment: input.round === "LISTEN" && input.isCorrect ? 1 : 0 },
      spellScore: {
        increment:
          (input.round === "SPELL" || input.round === "LETTER") && input.isCorrect
            ? 1
            : 0,
      },
      listenCorrect: {
        increment: input.round === "LISTEN" && input.isCorrect ? 1 : 0,
      },
      spellCorrect: {
        increment:
          (input.round === "SPELL" || input.round === "LETTER") && input.isCorrect
            ? 1
            : 0,
      },
      wordsLearned: {
        increment: input.isCorrect && input.round === "LISTEN" ? 1 : 0,
      },
    },
  });

  return {
    attemptId: attempt.id,
    pointsAwarded: points,
    isCorrect: input.isCorrect,
    duplicate: false,
  };
}

export async function completeLearningSession(
  parentId: string,
  sessionId: string,
  input: CompleteLearningSessionInput
) {
  const session = await prisma.learningSession.findUnique({
    where: { id: sessionId },
    include: {
      child: { select: { id: true, parentId: true, displayName: true } },
      category: { select: { id: true, label: true, emoji: true, code: true } },
      attempts: true,
    },
  });

  if (!session || session.child.parentId !== parentId) {
    throw new AppError("Session not found", 404);
  }

  const listenAttempts = session.attempts.filter((a) => a.round === "LISTEN");
  const spellAttempts = session.attempts.filter(
    (a) => a.round === "SPELL" || a.round === "LETTER"
  );
  const listenCorrect = listenAttempts.filter((a) => a.isCorrect).length;
  const spellCorrect = spellAttempts.filter((a) => a.isCorrect).length;
  const points = session.attempts.reduce((sum, a) => sum + a.pointsAwarded, 0);
  const accuracy =
    session.attempts.length === 0
      ? 0
      : Math.round(
          (session.attempts.filter((a) => a.isCorrect).length / session.attempts.length) *
            100
        );
  const stars = accuracy >= 90 ? 3 : accuracy >= 70 ? 2 : accuracy >= 40 ? 1 : 0;
  const sessionWordsLearned = new Set(
    session.attempts.filter((a) => a.isCorrect).map((a) => a.wordId)
  ).size;

  const mix = isMixMode(session.mode) ? session.mode : null;
  const buildResult = async (
    durationSec: number,
    nextCategory: { id: string; label: string; emoji: string; code: string } | null,
    categoryWordsLearned: number,
    newCertificates: Awaited<ReturnType<typeof issueCertificateIfMastered>>[] = []
  ) => ({
    sessionId: session.id,
    childName: session.child.displayName,
    category: mix && MIX_META[mix]
      ? { id: mix, code: mix, label: MIX_META[mix].label, emoji: MIX_META[mix].emoji }
      : session.category,
    mix,
    newCertificates: newCertificates.filter((c): c is NonNullable<typeof c> => Boolean(c)),
    questionsAttempted: session.attempts.length,
    correctAnswers: session.attempts.filter((a) => a.isCorrect).length,
    listenCorrect,
    spellCorrect,
    points: session.status === "COMPLETED" ? session.points : points,
    stars: session.status === "COMPLETED" ? session.stars : stars,
    accuracy,
    wordsLearned: categoryWordsLearned,
    sessionWordsLearned:
      session.status === "COMPLETED" ? session.wordsLearned : sessionWordsLearned,
    durationSec,
    nextCategory,
  });

  // Idempotent complete: never double-apply category progress / achievements.
  if (session.status === "COMPLETED") {
    // Still refresh milestone achievements (upsert) for older completed sessions.
    await awardMilestoneAchievements(session.childId);
    const nextCategory = await prisma.learningCategory.findFirst({
      where: {
        isPublished: true,
        unlockOrder: { gt: 0 },
        group: { level: { code: "LEVEL_1" } },
        NOT: { id: session.categoryId },
        progress: { none: { childId: session.childId, completed: true } },
      },
      orderBy: { unlockOrder: "asc" },
      select: { id: true, label: true, emoji: true, code: true },
    });
    const categoryWordsLearned = await countDistinctWordsLearned(
      session.childId,
      session.categoryId
    );
    return buildResult(
      session.durationSec ?? input.durationSec ?? 0,
      nextCategory,
      categoryWordsLearned
    );
  }

  const durationSec = input.durationSec ?? 0;
  const minutesLearned = Math.max(1, Math.ceil(durationSec / 60));

  if (mix) {
    await prisma.learningSession.update({
      where: { id: sessionId },
      data: {
        status: "COMPLETED",
        completedAt: new Date(),
        points,
        stars,
        wordsLearned: sessionWordsLearned,
        durationSec,
      },
    });
    const correctWordIds = [
      ...new Set(session.attempts.filter((a) => a.isCorrect).map((a) => a.wordId)),
    ];
    const touched = await prisma.vocabularyWord.findMany({
      where: { id: { in: correctWordIds } },
      select: { categoryId: true },
      distinct: ["categoryId"],
    });
    const certs = [];
    for (const t of touched) {
      certs.push(await issueCertificateIfMastered(session.childId, t.categoryId));
    }
    await awardMilestoneAchievements(session.childId);
    return {
      ...(await buildResult(durationSec, null, sessionWordsLearned, certs)),
      challenge: await awardChallengePointsSafe(sessionId),
    };
  }

  const updated = await prisma.$transaction(async (tx) => {
    const closed = await tx.learningSession.update({
      where: { id: sessionId },
      data: {
        status: "COMPLETED",
        completedAt: new Date(),
        points,
        stars,
        wordsLearned: sessionWordsLearned,
        durationSec,
        listenCorrect,
        spellCorrect,
        listenScore: listenCorrect,
        spellScore: spellCorrect,
        questionsTotal: Math.max(session.questionsTotal, listenAttempts.length),
      },
    });

    const existing = await tx.childCategoryProgress.findUnique({
      where: {
        childId_categoryId: {
          childId: session.childId,
          categoryId: session.categoryId,
        },
      },
    });

    // Cumulative unique words across ALL sessions (not max of this session's 8).
    const distinctRows = await tx.questionAttempt.findMany({
      where: {
        isCorrect: true,
        session: { childId: session.childId },
        word: { categoryId: session.categoryId },
      },
      select: { wordId: true },
      distinct: ["wordId"],
    });
    const nextWords = distinctRows.length;
    const totalWords = await tx.vocabularyWord.count({
      where: { categoryId: session.categoryId, isActive: true },
    });
    const completed =
      (totalWords > 0 && nextWords >= totalWords) ||
      nextWords >= 10 ||
      accuracy >= 60;

    await tx.childCategoryProgress.upsert({
      where: {
        childId_categoryId: {
          childId: session.childId,
          categoryId: session.categoryId,
        },
      },
      create: {
        childId: session.childId,
        categoryId: session.categoryId,
        wordsLearned: nextWords,
        listenCorrect,
        listenAttempts: listenAttempts.length,
        spellCorrect,
        spellAttempts: spellAttempts.length,
        points,
        stars,
        completed,
        minutesLearned,
        lastPlayedAt: new Date(),
      },
      update: {
        wordsLearned: nextWords,
        listenCorrect: { increment: listenCorrect },
        listenAttempts: { increment: listenAttempts.length },
        spellCorrect: { increment: spellCorrect },
        spellAttempts: { increment: spellAttempts.length },
        points: { increment: points },
        stars: { increment: stars },
        completed: completed || Boolean(existing?.completed),
        minutesLearned: { increment: minutesLearned },
        lastPlayedAt: new Date(),
      },
    });

    await tx.learningProgress.upsert({
      where: { childId: session.childId },
      create: {
        childId: session.childId,
        wordsLearned: nextWords,
        readingScore: accuracy,
        spellingScore: spellAttempts.length
          ? Math.round((spellCorrect / spellAttempts.length) * 100)
          : 0,
        minutesLearned,
      },
      update: {
        wordsLearned: nextWords,
        readingScore: accuracy,
        spellingScore: spellAttempts.length
          ? Math.round((spellCorrect / spellAttempts.length) * 100)
          : undefined,
        minutesLearned: { increment: minutesLearned },
      },
    });

    if (completed) {
      await tx.achievement.upsert({
        where: {
          childId_code: {
            childId: session.childId,
            code: `cat_${session.category.code}`,
          },
        },
        create: {
          childId: session.childId,
          code: `cat_${session.category.code}`,
          title: `${session.category.label} complete`,
          description: `Finished ${session.category.label} in Level 1`,
        },
        update: {},
      });
    }

    if (session.lessonId) {
      await tx.childLessonProgress.upsert({
        where: {
          childId_lessonId: {
            childId: session.childId,
            lessonId: session.lessonId,
          },
        },
        create: {
          childId: session.childId,
          lessonId: session.lessonId,
          completed: true,
          points,
          stars,
          wordsLearned: sessionWordsLearned,
          listenCorrect,
          spellCorrect,
          minutesLearned,
          lastPlayedAt: new Date(),
        },
        update: {
          completed: true,
          points: { increment: points },
          stars: { increment: stars },
          wordsLearned: Math.max(sessionWordsLearned, 0),
          listenCorrect: { increment: listenCorrect },
          spellCorrect: { increment: spellCorrect },
          minutesLearned: { increment: minutesLearned },
          lastPlayedAt: new Date(),
        },
      });
    }

    return { closed, nextWords };
  });

  const nextCategory = await prisma.learningCategory.findFirst({
    where: {
      isPublished: true,
      unlockOrder: { gt: 0 },
      group: { level: { code: "LEVEL_1" } },
      NOT: { id: session.categoryId },
      progress: { none: { childId: session.childId, completed: true } },
    },
    orderBy: { unlockOrder: "asc" },
    select: { id: true, label: true, emoji: true, code: true },
  });

  const certificate = await issueCertificateIfMastered(session.childId, session.categoryId);

  // Milestone achievements + global wordsLearned / weak-word snapshot (idempotent).
  await awardMilestoneAchievements(session.childId);

  return {
    ...(await buildResult(durationSec, nextCategory, updated.nextWords, [certificate])),
    challenge: await awardChallengePointsSafe(sessionId),
  };
}

/** Weekly challenge points must never block finishing a session. */
async function awardChallengePointsSafe(sessionId: string) {
  try {
    return await awardSessionPoints(sessionId);
  } catch (err) {
    console.error("[challenges] could not award points", (err as Error).message);
    return null;
  }
}

/** Calendar day bounds in Asia/Kolkata (IST, UTC+05:30). */
export function kolkataDayBounds(now = new Date()) {
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

export async function getChildLearningOverview(
  parentId: string,
  childId: string,
  role?: string
) {
  return getChildProgressDashboard(parentId, childId, role);
}

type WordWithRelations = {
  id: string;
  text: string;
  meaning: string;
  emoji: string;
  imageUrl: string | null;
  audioUrl: string | null;
  phonetic: string | null;
  firstLetter: string;
  difficulty: number;
  sortOrder: number;
  isActive: boolean;
  category: {
    id: string;
    label: string;
    code: string;
    group: {
      id: string;
      code: string;
      label: string;
      levelId: string;
      level: { id: string; code: string; label: string };
    };
  };
};

function mapVocabularyRecord(word: WordWithRelations) {
  return {
    id: word.id,
    levelId: word.category.group.levelId,
    levelCode: word.category.group.level.code,
    levelName: word.category.group.level.label,
    groupName: word.category.group.label,
    groupCode: word.category.group.code,
    categoryId: word.category.id,
    categoryName: word.category.label,
    categoryCode: word.category.code,
    word: word.text,
    simpleMeaning: word.meaning,
    pronunciation: word.phonetic,
    imageUrl: word.imageUrl,
    audioUrl: word.audioUrl,
    emoji: word.emoji,
    firstLetter: word.firstLetter || word.text.charAt(0).toUpperCase(),
    difficulty: word.difficulty,
    displayOrder: word.sortOrder,
    isActive: word.isActive,
  };
}

const wordInclude = {
  category: {
    include: {
      group: {
        include: {
          level: { select: { id: true, code: true, label: true } },
        },
      },
    },
  },
} as const;

export async function listLearningLevels() {
  const levels = await prisma.learningLevel.findMany({
    orderBy: { sortOrder: "asc" },
    include: {
      grade: true,
      _count: { select: { groups: true } },
      groups: {
        include: {
          _count: { select: { categories: true } },
          categories: {
            include: {
              _count: { select: { words: { where: { isActive: true } } } },
            },
          },
        },
      },
    },
  });

  return levels.map((level) => {
    const wordCount = level.groups.reduce(
      (sum, g) =>
        sum + g.categories.reduce((s, c) => s + c._count.words, 0),
      0
    );
    return {
      id: level.id,
      code: level.code,
      label: level.label,
      description: level.description,
      ageMin: level.ageMin,
      ageMax: level.ageMax,
      sortOrder: level.sortOrder,
      kind: level.kind,
      grade: level.grade
        ? {
            id: level.grade.id,
            code: level.grade.code,
            label: level.grade.label,
            ageMin: level.grade.ageMin,
            ageMax: level.grade.ageMax,
          }
        : null,
      groupCount: level._count.groups,
      categoryCount: level.groups.reduce((s, g) => s + g._count.categories, 0),
      wordCount,
    };
  });
}

export async function listLevelGroups(
  levelKey: string,
  parentId?: string,
  childId?: string
) {
  const code = /^[1-4]$/.test(levelKey) ? `LEVEL_${levelKey}` : levelKey;
  const level = await prisma.learningLevel.findUnique({ where: { code } });
  if (!level) throw new AppError("Learning level not found", 404);
  return listLevelGroupsById(level.id, parentId, childId);
}

async function listLevelGroupsById(
  levelId: string,
  parentId?: string,
  childId?: string
) {
  if (childId) {
    if (!parentId) throw new AppError("Authentication required", 401);
    await assertChildOwnedByParent(parentId, childId);
  }

  const level = await prisma.learningLevel.findUniqueOrThrow({
    where: { id: levelId },
    include: {
      groups: {
        orderBy: { sortOrder: "asc" },
        include: {
          categories: {
            where: { isPublished: true },
            orderBy: { sortOrder: "asc" },
            include: {
              _count: { select: { words: { where: { isActive: true } } } },
              progress: childId ? { where: { childId } } : false,
            },
          },
        },
      },
    },
  });

  const ordered = level.groups.flatMap((g) => g.categories);

  const learnedByCategory = new Map<string, number>();
  if (childId) {
    await Promise.all(
      ordered.map(async (cat) => {
        const n = await countDistinctWordsLearned(childId, cat.id);
        learnedByCategory.set(cat.id, n);
        const progress = Array.isArray(cat.progress) ? cat.progress[0] : null;
        if (progress && progress.wordsLearned !== n) {
          const done = n >= cat._count.words && cat._count.words > 0;
          await prisma.childCategoryProgress.update({
            where: { id: progress.id },
            data: {
              wordsLearned: n,
              completed: done || progress.completed,
            },
          });
          progress.wordsLearned = n;
          if (done) progress.completed = true;
        }
      })
    );
  }

  const completedIds = new Set(
    ordered
      .filter((c) => {
        const progress = Array.isArray(c.progress) ? c.progress[0] : null;
        return progress?.completed;
      })
      .map((c) => c.id)
  );

  return {
    level: {
      id: level.id,
      code: level.code,
      label: level.label,
      ageMin: level.ageMin,
      ageMax: level.ageMax,
      description: level.description,
    },
    groups: level.groups.map((group) => ({
      id: group.id,
      code: group.code,
      label: group.label,
      sortOrder: group.sortOrder,
      categories: group.categories.map((cat) => {
        const progress = Array.isArray(cat.progress) ? cat.progress[0] ?? null : null;
        const wordsLearned =
          learnedByCategory.get(cat.id) ?? progress?.wordsLearned ?? 0;
        const priorCompleted = ordered
          .filter((c) => c.unlockOrder < cat.unlockOrder)
          .every((c) => completedIds.has(c.id));
        const unlocked =
          !childId ||
          cat.unlockOrder === 0 ||
          priorCompleted ||
          Boolean(progress?.lastPlayedAt);
        const completed =
          Boolean(progress?.completed) ||
          (cat._count.words > 0 && wordsLearned >= cat._count.words);
        return {
          id: cat.id,
          code: cat.code,
          label: cat.label,
          description: cat.description,
          emoji: cat.emoji,
          wordCount: cat._count.words,
          unlockOrder: cat.unlockOrder,
          unlocked,
          progress:
            progress || wordsLearned > 0
              ? {
                  wordsLearned,
                  points: progress?.points ?? 0,
                  stars: progress?.stars ?? 0,
                  completed,
                }
              : null,
        };
      }),
    })),
  };
}

export async function listLearningCategories(filters?: {
  levelCode?: string;
  groupCode?: string;
}) {
  const categories = await prisma.learningCategory.findMany({
    where: {
      isPublished: true,
      ...(filters?.groupCode || filters?.levelCode
        ? {
            group: {
              ...(filters.groupCode ? { code: filters.groupCode } : {}),
              ...(filters.levelCode
                ? {
                    level: {
                      code:
                        filters.levelCode === "1"
                          ? "LEVEL_1"
                          : filters.levelCode,
                    },
                  }
                : {}),
            },
          }
        : {}),
    },
    orderBy: { sortOrder: "asc" },
    include: {
      _count: { select: { words: { where: { isActive: true } } } },
      group: {
        include: {
          level: { select: { id: true, code: true, label: true } },
        },
      },
    },
  });

  return categories.map((cat) => ({
    id: cat.id,
    code: cat.code,
    categoryName: cat.label,
    description: cat.description,
    emoji: cat.emoji,
    wordCount: cat._count.words,
    groupName: cat.group.label,
    groupCode: cat.group.code,
    levelId: cat.group.level.id,
    levelCode: cat.group.level.code,
    levelName: cat.group.level.label,
    displayOrder: cat.sortOrder,
    isPublished: cat.isPublished,
  }));
}

export async function listCategoryWords(categoryId: string) {
  const category = await prisma.learningCategory.findFirst({
    where: { id: categoryId, isPublished: true },
    include: {
      group: {
        include: { level: { select: { id: true, code: true, label: true } } },
      },
      words: {
        where: { isActive: true },
        orderBy: { sortOrder: "asc" },
        include: wordInclude,
      },
    },
  });

  if (!category) throw new AppError("Category not found", 404);

  return {
    category: {
      id: category.id,
      code: category.code,
      categoryName: category.label,
      emoji: category.emoji,
      groupName: category.group.label,
      levelId: category.group.level.id,
      levelCode: category.group.level.code,
      wordCount: category.words.length,
    },
    words: category.words.map((w) => mapVocabularyRecord(w as WordWithRelations)),
  };
}

export async function getVocabularyWordById(wordId: string) {
  const word = await prisma.vocabularyWord.findFirst({
    where: { id: wordId, isActive: true },
    include: wordInclude,
  });
  if (!word) throw new AppError("Word not found", 404);
  return mapVocabularyRecord(word as WordWithRelations);
}
