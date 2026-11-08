import { AppError } from "../lib/errors.js";
import { prisma } from "../lib/prisma.js";

async function assertChildAccess(parentId: string, childId: string, role?: string) {
  const where =
    role === "ADMIN" || role === "SUPER_ADMIN"
      ? { id: childId }
      : { id: childId, parentId, isActive: true };
  const child = await prisma.child.findFirst({ where, select: { id: true } });
  if (!child) throw new AppError("Child not found", 404);
}

/** One child's progress in one category, split by activity, plus resume + certificate. */
export async function getCategoryActivityProgress(
  parentId: string,
  childId: string,
  categoryId: string,
  role?: string
) {
  await assertChildAccess(parentId, childId, role);
  const [wordCount, rows, progress, active, certificate] = await Promise.all([
    prisma.vocabularyWord.count({ where: { categoryId, isActive: true } }),
    prisma.questionAttempt.groupBy({
      by: ["round", "wordId"],
      where: { isCorrect: true, session: { childId }, word: { categoryId, isActive: true } },
    }),
    prisma.childCategoryProgress.findUnique({
      where: { childId_categoryId: { childId, categoryId } },
      select: { stars: true, points: true, completed: true, lastPlayedAt: true },
    }),
    prisma.learningSession.findFirst({
      where: { childId, categoryId, lessonId: null, mode: null, status: "IN_PROGRESS" },
      orderBy: { startedAt: "desc" },
      select: {
        id: true,
        startedAt: true,
        questionsTotal: true,
        attempts: { where: { isCorrect: true, round: "LISTEN" }, select: { wordId: true } },
      },
    }),
    prisma.certificate.findUnique({
      where: { childId_categoryId: { childId, categoryId } },
      select: { id: true, certificateNo: true, issuedAt: true },
    }),
  ]);

  const perRound = new Map<string, Set<string>>();
  const all = new Set<string>();
  for (const r of rows) {
    const key = r.round === "LETTER" ? "SPELL" : r.round;
    if (!perRound.has(key)) perRound.set(key, new Set());
    perRound.get(key)!.add(r.wordId);
    all.add(r.wordId);
  }
  const count = (k: string) => perRound.get(k)?.size ?? 0;

  return {
    categoryId,
    wordCount,
    wordsLearned: all.size,
    progressPct: wordCount ? Math.round((all.size / wordCount) * 100) : 0,
    byActivity: {
      LISTEN: count("LISTEN"),
      SPELL: count("SPELL"),
      MATCH_IT: count("MATCHING"),
      QUIZ_TIME: count("QUIZ"),
      REVISION: count("REVISION"),
    },
    stars: progress?.stars ?? 0,
    points: progress?.points ?? 0,
    lastPlayedAt: progress?.lastPlayedAt ?? null,
    resume: active
      ? {
          sessionId: active.id,
          startedAt: active.startedAt,
          answered: new Set(active.attempts.map((a) => a.wordId)).size,
          total: active.questionsTotal,
        }
      : null,
    certificate,
  };
}

/** Admin readiness: every word needs a picture (emoji or image) and a meaning. */
export async function getContentReadiness(filter: { levelCode?: string; gradeCode?: string }) {
  const categories = await prisma.learningCategory.findMany({
    where: {
      group: {
        level: filter.gradeCode
          ? { grade: { code: filter.gradeCode } }
          : { code: filter.levelCode ?? "LEVEL_1" },
      },
    },
    orderBy: { sortOrder: "asc" },
    select: {
      id: true,
      label: true,
      emoji: true,
      isPublished: true,
      words: {
        where: { isActive: true },
        select: { text: true, emoji: true, imageUrl: true, audioUrl: true, meaning: true },
      },
    },
  });
  return categories.map((c) => {
    const missingPicture = c.words.filter((w) => !w.imageUrl && !w.emoji?.trim()).map((w) => w.text);
    const missingMeaning = c.words.filter((w) => !w.meaning?.trim()).map((w) => w.text);
    const noAudioFile = c.words.filter((w) => !w.audioUrl).map((w) => w.text);
    return {
      id: c.id,
      label: c.label,
      emoji: c.emoji,
      isPublished: c.isPublished,
      wordCount: c.words.length,
      missingPicture,
      missingMeaning,
      noAudioFile,
      ready: c.words.length > 0 && missingPicture.length === 0 && missingMeaning.length === 0,
    };
  });
}

export async function assertCategoryReadyToPublish(categoryId: string) {
  const c = await prisma.learningCategory.findUnique({
    where: { id: categoryId },
    select: {
      label: true,
      words: { where: { isActive: true }, select: { text: true, emoji: true, imageUrl: true, meaning: true } },
    },
  });
  if (!c) throw new AppError("Category not found", 404);
  if (c.words.length === 0) {
    throw new AppError(`${c.label} has no words yet. Upload words before publishing.`, 400);
  }
  const bad = c.words
    .filter((w) => (!w.imageUrl && !w.emoji?.trim()) || !w.meaning?.trim())
    .map((w) => w.text);
  if (bad.length) {
    throw new AppError(
      `${c.label} is not ready: ${bad.length} word(s) need a picture or meaning (${bad.slice(0, 5).join(", ")}${bad.length > 5 ? "…" : ""}).`,
      400
    );
  }
}
