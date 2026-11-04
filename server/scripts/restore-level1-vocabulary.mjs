/**
 * Restore Level 1 vocabulary from the repo-owned seed
 * (prisma/data/level1-vocabulary.generated.json — 10×75 = 750).
 *
 * Safe for remediation:
 * - Upserts words by (categoryId, text) via seedLevel1Vocabulary({ includeWords: true })
 * - Does NOT call clearAllVocabularyWords
 * - Does NOT delete learning progress, sessions, attempts, lessons, or seats
 */
import { PrismaClient } from "@prisma/client";
import { seedLevel1Vocabulary } from "../prisma/seeds/level1-vocabulary.ts";

const prisma = new PrismaClient();

const beforeProgress = await prisma.learningProgress.count();
const beforeAttempts = await prisma.questionAttempt.count();
const beforeSessions = await prisma.learningSession.count();
const beforeWords = await prisma.vocabularyWord.count({
  where: { isActive: true, category: { group: { level: { code: "LEVEL_1" } } } },
});

console.log(
  JSON.stringify(
    {
      before: {
        level1ActiveWords: beforeWords,
        learningProgress: beforeProgress,
        questionAttempts: beforeAttempts,
        learningSessions: beforeSessions,
      },
    },
    null,
    2
  )
);

const result = await seedLevel1Vocabulary(prisma, { includeWords: true });

// Residual pre-seed rows may still have sortOrder 0; learning API maps that to
// displayOrder and product tests require displayOrder > 0. Renumber leftovers
// after the seeded 1..N range without deleting them or touching progress.
const categories = await prisma.learningCategory.findMany({
  where: { group: { level: { code: "LEVEL_1" } } },
  select: { id: true },
});
let renumbered = 0;
for (const cat of categories) {
  const maxRow = await prisma.vocabularyWord.aggregate({
    where: { categoryId: cat.id, isActive: true },
    _max: { sortOrder: true },
  });
  let next = Math.max(maxRow._max.sortOrder ?? 0, 0) + 1;
  const zeroOrder = await prisma.vocabularyWord.findMany({
    where: { categoryId: cat.id, isActive: true, sortOrder: { lte: 0 } },
    select: { id: true },
    orderBy: { createdAt: "asc" },
  });
  for (const word of zeroOrder) {
    await prisma.vocabularyWord.update({
      where: { id: word.id },
      data: { sortOrder: next },
    });
    next += 1;
    renumbered += 1;
  }
}
console.log(JSON.stringify({ residualSortOrdersFixed: renumbered }));

const rows = await prisma.learningCategory.findMany({
  where: { isPublished: true, group: { level: { code: "LEVEL_1" } } },
  select: {
    code: true,
    label: true,
    _count: { select: { words: { where: { isActive: true } } } },
  },
  orderBy: { sortOrder: "asc" },
});

const afterProgress = await prisma.learningProgress.count();
const afterAttempts = await prisma.questionAttempt.count();
const afterSessions = await prisma.learningSession.count();

const perCategory = rows.map((r) => ({
  code: r.code,
  label: r.label,
  activeWords: r._count.words,
}));
const total = perCategory.reduce((n, r) => n + r.activeWords, 0);
const short = perCategory.filter((r) => r.activeWords < 75);

console.log(
  JSON.stringify(
    {
      seedResult: {
        categories: result.categories,
        words: result.words,
        unique: result.unique,
      },
      verified: {
        perCategory,
        totalActiveLevel1: total,
        categoriesBelow75: short,
        historyPreserved: {
          learningProgress: { before: beforeProgress, after: afterProgress },
          questionAttempts: { before: beforeAttempts, after: afterAttempts },
          learningSessions: { before: beforeSessions, after: afterSessions },
        },
      },
      ok: short.length === 0 && total >= 750,
    },
    null,
    2
  )
);

if (short.length > 0 || total < 750) {
  console.error(
    `Level 1 restore incomplete: total=${total}, shortCategories=${short.length}`
  );
  process.exit(1);
}

await prisma.$disconnect();
