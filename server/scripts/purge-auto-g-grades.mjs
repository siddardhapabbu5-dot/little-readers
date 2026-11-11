/**
 * One-shot cleanup: remove Phase 10B auto-seeded G1–G12 grades.
 * Keeps GRADE_* and any other custom grade codes.
 *
 * Usage (from server/): node scripts/purge-auto-g-grades.mjs
 */
import { PrismaClient } from "@prisma/client";
import { assertDestructiveAllowed } from "./lib/destructive-guard.mjs";

assertDestructiveAllowed("purge-auto-g-grades");

const prisma = new PrismaClient();
const AUTO_CODES = Array.from({ length: 12 }, (_, i) => `G${i + 1}`);

async function forceDeleteGrade(id) {
  const grade = await prisma.learningGrade.findUnique({
    where: { id },
    include: {
      levels: {
        include: {
          groups: { include: { categories: { select: { id: true } } } },
        },
      },
    },
  });
  if (!grade) return;

  const categoryIds = grade.levels.flatMap((l) =>
    l.groups.flatMap((g) => g.categories.map((c) => c.id))
  );
  const groupIds = grade.levels.flatMap((l) => l.groups.map((g) => g.id));
  const levelIds = grade.levels.map((l) => l.id);

  if (categoryIds.length) {
    await prisma.vocabularyWord.deleteMany({
      where: { categoryId: { in: categoryIds } },
    });
    await prisma.learningCategory.deleteMany({
      where: { id: { in: categoryIds } },
    });
  }
  if (groupIds.length) {
    await prisma.lesson.updateMany({
      where: { groupId: { in: groupIds } },
      data: { groupId: null },
    });
    await prisma.learningGroup.deleteMany({ where: { id: { in: groupIds } } });
  }
  if (levelIds.length) {
    await prisma.child.updateMany({
      where: { levelId: { in: levelIds } },
      data: { levelId: null },
    });
    await prisma.vocabImportBatch.deleteMany({
      where: { levelId: { in: levelIds } },
    });
    await prisma.lesson.updateMany({
      where: { levelId: { in: levelIds } },
      data: { levelId: null },
    });
    // Never delete shared LEVEL_1..3; only grade-owned difficulty levels.
    await prisma.learningLevel.deleteMany({
      where: {
        id: { in: levelIds },
        code: { notIn: ["LEVEL_1", "LEVEL_2", "LEVEL_3"] },
      },
    });
    await prisma.learningLevel.updateMany({
      where: {
        id: { in: levelIds },
        code: { in: ["LEVEL_1", "LEVEL_2", "LEVEL_3"] },
      },
      data: { gradeId: null },
    });
  }

  await prisma.vocabularyGradeAssignment.deleteMany({ where: { gradeId: id } });
  await prisma.lesson.updateMany({
    where: { gradeId: id },
    data: { gradeId: null },
  });
  await prisma.vocabProgramme.deleteMany({ where: { gradeId: id } });
  await prisma.learningGrade.delete({ where: { id } });
}

async function main() {
  const before = await prisma.learningGrade.findMany({
    orderBy: [{ sortOrder: "asc" }, { code: "asc" }],
    select: { id: true, code: true, label: true },
  });
  console.log(`Grades before (${before.length}):`);
  for (const g of before) console.log(`  ${g.code} · ${g.label}`);

  const victims = before.filter((g) => AUTO_CODES.includes(g.code));
  console.log(`\nPurging ${victims.length} auto G1–G12 grade(s)…`);
  for (const g of victims) {
    try {
      await forceDeleteGrade(g.id);
      console.log(`  deleted ${g.code}`);
    } catch (err) {
      console.error(`  FAILED ${g.code}:`, err?.message ?? err);
    }
  }

  const after = await prisma.learningGrade.findMany({
    orderBy: [{ sortOrder: "asc" }, { code: "asc" }],
    select: { code: true, label: true },
  });
  console.log(`\nGrades after (${after.length}):`);
  for (const g of after) console.log(`  ${g.code} · ${g.label}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
