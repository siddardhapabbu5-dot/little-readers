/**
 * Remove all grades + categories (+ words / groups / grade-band levels)
 * so Admin can create/upload a fresh structure.
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function del(label, fn) {
  try {
    const r = await fn();
    console.log(`${label}: ${r?.count ?? r ?? 0}`);
  } catch (e) {
    console.log(`${label}: skip (${e.message.split("\n")[0]})`);
  }
}

async function main() {
  await del("publishJobs", () => prisma.vocabPublishJob.deleteMany({}));
  await del("publishLogs", () => prisma.vocabProgrammePublishLog.deleteMany({}));
  await del("programmeItems", () => prisma.vocabProgrammeItem.deleteMany({}));
  await del("programmeDays", () => prisma.vocabProgrammeDay.deleteMany({}));
  await del("programmes", () => prisma.vocabProgramme.deleteMany({}));

  await del("questionAttempts", () => prisma.questionAttempt.deleteMany({}));
  await del("lessonVocabItems", () => prisma.lessonVocabItem.deleteMany({}));
  await del("gradeAssignments", () =>
    prisma.vocabularyGradeAssignment.deleteMany({})
  );
  await del("categoryProgress", () =>
    prisma.childCategoryProgress.deleteMany({})
  );
  await del("learningSessions", () => prisma.learningSession.deleteMany({}));
  await del("vocabWords", () => prisma.vocabularyWord.deleteMany({}));
  await del("vocabImportBatches", () => prisma.vocabImportBatch.deleteMany({}));
  await del("adminAlerts", () => prisma.adminAlert.deleteMany({}).catch(() => ({ count: 0 })));

  await del("lessonClearLinks", () =>
    prisma.lesson.updateMany({
      data: {
        learningCategoryId: null,
        groupId: null,
        gradeId: null,
        levelId: null,
      },
    })
  );

  await del("categories", () => prisma.learningCategory.deleteMany({}));
  await del("groups", () => prisma.learningGroup.deleteMany({}));

  const gradeBandLevels = await prisma.learningLevel.findMany({
    where: {
      OR: [
        { kind: "GRADE_BAND" },
        { code: { in: ["LEVEL_1", "LEVEL_2", "LEVEL_3", "LEVEL_4"] } },
        { gradeId: { not: null } },
      ],
    },
    select: { id: true, code: true },
  });
  const levelIds = gradeBandLevels.map((l) => l.id);
  console.log(
    "grade-band levels:",
    gradeBandLevels.map((l) => l.code).join(", ") || "(none)"
  );

  if (levelIds.length) {
    await del("childLevelClear", () =>
      prisma.child.updateMany({
        where: { levelId: { in: levelIds } },
        data: { levelId: null },
      })
    );
    await del("levels", () =>
      prisma.learningLevel.deleteMany({ where: { id: { in: levelIds } } })
    );
  }

  await del("grades", () => prisma.learningGrade.deleteMany({}));

  console.log("Remaining:", {
    grades: await prisma.learningGrade.count(),
    levels: await prisma.learningLevel.count(),
    groups: await prisma.learningGroup.count(),
    categories: await prisma.learningCategory.count(),
    words: await prisma.vocabularyWord.count(),
  });
  console.log(
    "Done. Admin → Academic Structure: Create grade (+ category), then upload words CSV."
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
