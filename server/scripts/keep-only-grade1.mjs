/**
 * Keep GRADE_1 (+ its level/group/categories/words). Delete other grades.
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const keep = await prisma.learningGrade.findUnique({
    where: { code: "GRADE_1" },
  });
  if (!keep) {
    console.log("GRADE_1 not found — nothing to keep.");
    return;
  }

  const extras = await prisma.learningGrade.findMany({
    where: { NOT: { code: "GRADE_1" } },
    include: { levels: { select: { id: true, code: true } } },
  });
  console.log(
    "Removing grades:",
    extras.map((g) => g.code).join(", ") || "(none)"
  );

  const levelIds = extras.flatMap((g) => g.levels.map((l) => l.id));

  if (levelIds.length) {
    const groups = await prisma.learningGroup.findMany({
      where: { levelId: { in: levelIds } },
      select: { id: true },
    });
    const groupIds = groups.map((g) => g.id);
    const cats = await prisma.learningCategory.findMany({
      where: { groupId: { in: groupIds } },
      select: { id: true },
    });
    const catIds = cats.map((c) => c.id);

    if (catIds.length) {
      await prisma.questionAttempt.deleteMany({
        where: { word: { categoryId: { in: catIds } } },
      }).catch(() => {});
      await prisma.lessonVocabItem.deleteMany({
        where: { vocabularyWord: { categoryId: { in: catIds } } },
      }).catch(() => {});
      await prisma.vocabProgrammeItem.deleteMany({
        where: { vocabularyWord: { categoryId: { in: catIds } } },
      }).catch(() => {});
      await prisma.vocabularyGradeAssignment
        .deleteMany({ where: { categoryId: { in: catIds } } })
        .catch(() => {});
      await prisma.childCategoryProgress
        .deleteMany({ where: { categoryId: { in: catIds } } })
        .catch(() => {});
      await prisma.learningSession
        .deleteMany({ where: { categoryId: { in: catIds } } })
        .catch(() => {});
      await prisma.vocabularyWord.deleteMany({
        where: { categoryId: { in: catIds } },
      });
      await prisma.vocabImportBatch
        .deleteMany({ where: { categoryId: { in: catIds } } })
        .catch(() => {});
      await prisma.lesson.updateMany({
        where: { learningCategoryId: { in: catIds } },
        data: { learningCategoryId: null },
      });
      await prisma.learningCategory.deleteMany({ where: { id: { in: catIds } } });
    }

    await prisma.learningGroup.deleteMany({ where: { id: { in: groupIds } } });
    await prisma.child.updateMany({
      where: { levelId: { in: levelIds } },
      data: { levelId: null },
    });
    await prisma.vocabImportBatch
      .deleteMany({ where: { levelId: { in: levelIds } } })
      .catch(() => {});
    await prisma.lesson.updateMany({
      where: { levelId: { in: levelIds } },
      data: { levelId: null },
    });
    await prisma.learningLevel.deleteMany({ where: { id: { in: levelIds } } });
  }

  await prisma.vocabProgramme.deleteMany({
    where: { gradeId: { in: extras.map((g) => g.id) } },
  }).catch(() => {});
  await prisma.vocabularyGradeAssignment
    .deleteMany({ where: { gradeId: { in: extras.map((g) => g.id) } } })
    .catch(() => {});
  await prisma.lesson.updateMany({
    where: { gradeId: { in: extras.map((g) => g.id) } },
    data: { gradeId: null },
  });
  const removed = await prisma.learningGrade.deleteMany({
    where: { id: { in: extras.map((g) => g.id) } },
  });

  const left = await prisma.learningGrade.findMany({
    select: { code: true, label: true },
    orderBy: { sortOrder: "asc" },
  });
  console.log("Deleted grades:", removed.count);
  console.log("Remaining:", left);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
