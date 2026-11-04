import type {
  CompleteLearningSessionInput,
  StartLearningSessionInput,
  SubmitQuestionAttemptInput,
} from "@little-readers/validation";
import { AppError } from "../lib/errors.js";
import { prisma } from "../lib/prisma.js";
import { assertStudentDeviceAllowed } from "../devices/device.service.js";
import {
  assertChildHasLearningSeat,
  assertParentSubscriptionEligible,
} from "../subscriptions/subscription.service.js";

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
                wordsLearned: progress.wordsLearned,
                listenCorrect: progress.listenCorrect,
                listenAttempts: progress.listenAttempts,
                spellCorrect: progress.spellCorrect,
                spellAttempts: progress.spellAttempts,
                points: progress.points,
                stars: progress.stars,
                completed: progress.completed,
                minutesLearned: progress.minutesLearned,
                lastPlayedAt: progress.lastPlayedAt,
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
      { id: word.id, text: word.text, emoji: word.emoji, correct: true },
      ...distractors.map((d) => ({
        id: d.id,
        text: d.text,
        emoji: d.emoji,
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
        emoji: word.emoji,
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
      ...(opts.categoryId && !opts.lessonId ? { categoryId: opts.categoryId, lessonId: null } : {}),
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

  // --- Category-backed session (existing Listen/Spell) ---
  if (!input.categoryId) {
    throw new AppError("categoryId or lessonId is required", 400);
  }

  if (input.resume) {
    const open = await prisma.learningSession.findFirst({
      where: {
        childId: input.childId,
        categoryId: input.categoryId,
        lessonId: null,
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

  const count = Math.min(input.questionCount ?? 10, category.words.length);
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
  const selected = shuffle(pool).slice(0, count);

  const session = await prisma.learningSession.create({
    data: {
      childId: input.childId,
      categoryId: category.id,
      questionsTotal: selected.length,
      status: "IN_PROGRESS",
    },
  });

  return {
    sessionId: session.id,
    resumed: false as boolean,
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
  const wordsLearned = new Set(
    session.attempts.filter((a) => a.isCorrect).map((a) => a.wordId)
  ).size;

  const buildResult = async (
    durationSec: number,
    nextCategory: { id: string; label: string; emoji: string; code: string } | null
  ) => ({
    sessionId: session.id,
    childName: session.child.displayName,
    category: session.category,
    questionsAttempted: session.attempts.length,
    correctAnswers: session.attempts.filter((a) => a.isCorrect).length,
    listenCorrect,
    spellCorrect,
    points: session.status === "COMPLETED" ? session.points : points,
    stars: session.status === "COMPLETED" ? session.stars : stars,
    accuracy,
    wordsLearned: session.status === "COMPLETED" ? session.wordsLearned : wordsLearned,
    durationSec,
    nextCategory,
  });

  // Idempotent complete: never double-apply category progress / achievements.
  if (session.status === "COMPLETED") {
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
    return buildResult(session.durationSec ?? input.durationSec ?? 0, nextCategory);
  }

  const durationSec = input.durationSec ?? 0;
  const minutesLearned = Math.max(1, Math.ceil(durationSec / 60));

  const updated = await prisma.$transaction(async (tx) => {
    const closed = await tx.learningSession.update({
      where: { id: sessionId },
      data: {
        status: "COMPLETED",
        completedAt: new Date(),
        points,
        stars,
        wordsLearned,
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

    const nextWords = Math.max(existing?.wordsLearned ?? 0, wordsLearned);
    const completed = nextWords >= 10 || accuracy >= 60;

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
        wordsLearned,
        readingScore: accuracy,
        spellingScore: spellAttempts.length
          ? Math.round((spellCorrect / spellAttempts.length) * 100)
          : 0,
        minutesLearned,
      },
      update: {
        wordsLearned: { increment: wordsLearned },
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
          wordsLearned,
          listenCorrect,
          spellCorrect,
          minutesLearned,
          lastPlayedAt: new Date(),
        },
        update: {
          completed: true,
          points: { increment: points },
          stars: { increment: stars },
          wordsLearned: Math.max(wordsLearned, 0),
          listenCorrect: { increment: listenCorrect },
          spellCorrect: { increment: spellCorrect },
          minutesLearned: { increment: minutesLearned },
          lastPlayedAt: new Date(),
        },
      });
    }

    return closed;
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

  return {
    sessionId: updated.id,
    childName: session.child.displayName,
    category: session.category,
    questionsAttempted: session.attempts.length,
    correctAnswers: session.attempts.filter((a) => a.isCorrect).length,
    listenCorrect,
    spellCorrect,
    points,
    stars,
    accuracy,
    wordsLearned,
    durationSec,
    nextCategory,
  };
}

export async function getChildLearningOverview(
  parentId: string,
  childId: string,
  role?: string
) {
  await assertChildOwnedByParent(parentId, childId, role);

  const [progressRows, sessions, achievements, learningProgress] = await Promise.all([
    prisma.childCategoryProgress.findMany({
      where: { childId },
      include: {
        category: {
          select: {
            id: true,
            label: true,
            emoji: true,
            code: true,
            group: { select: { label: true, code: true } },
          },
        },
      },
      orderBy: { lastPlayedAt: "desc" },
    }),
    prisma.learningSession.findMany({
      where: { childId, status: "COMPLETED" },
      include: {
        category: { select: { label: true, emoji: true, code: true } },
      },
      orderBy: { completedAt: "desc" },
      take: 20,
    }),
    prisma.achievement.findMany({
      where: { childId },
      orderBy: { earnedAt: "desc" },
    }),
    prisma.learningProgress.findUnique({ where: { childId } }),
  ]);

  return {
    summary: {
      categoriesCompleted: progressRows.filter((p) => p.completed).length,
      wordsLearned: progressRows.reduce((s, p) => s + p.wordsLearned, 0),
      points: progressRows.reduce((s, p) => s + p.points, 0),
      stars: progressRows.reduce((s, p) => s + p.stars, 0),
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
    },
    categories: progressRows.map((p) => ({
      categoryId: p.category.id,
      label: p.category.label,
      emoji: p.category.emoji,
      group: p.category.group.label,
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
    })),
    history: sessions.map((s) => ({
      sessionId: s.id,
      category: s.category.label,
      emoji: s.category.emoji,
      points: s.points,
      stars: s.stars,
      wordsLearned: s.wordsLearned,
      accuracy:
        s.questionsTotal > 0
          ? Math.round(((s.listenCorrect + s.spellCorrect) / Math.max(s.questionsTotal, 1)) * 50)
          : 0,
      completedAt: s.completedAt,
      durationSec: s.durationSec,
    })),
    achievements,
  };
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
        const priorCompleted = ordered
          .filter((c) => c.unlockOrder < cat.unlockOrder)
          .every((c) => completedIds.has(c.id));
        const unlocked =
          !childId ||
          cat.unlockOrder === 0 ||
          priorCompleted ||
          Boolean(progress?.lastPlayedAt);
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
                wordsLearned: progress.wordsLearned,
                points: progress.points,
                stars: progress.stars,
                completed: progress.completed,
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
