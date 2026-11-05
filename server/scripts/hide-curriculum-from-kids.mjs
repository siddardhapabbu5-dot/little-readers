/**
 * Hide all vocabulary from Parent/Kids Learn & Play.
 * Keeps Admin structure; categories unpublished + words inactive until republished.
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const cats = await prisma.learningCategory.updateMany({
    data: { isPublished: false },
  });
  const words = await prisma.vocabularyWord.updateMany({
    data: { isActive: false },
  });
  const lessons = await prisma.lesson.updateMany({
    data: { isPublished: false, status: "DRAFT" },
  });

  console.log({
    unpublishedCategories: cats.count,
    deactivatedWords: words.count,
    unpublishedLessons: lessons.count,
    stillPublishedCategories: await prisma.learningCategory.count({
      where: { isPublished: true },
    }),
    stillActiveWords: await prisma.vocabularyWord.count({
      where: { isActive: true },
    }),
  });
  console.log("Kids Learn/Play will show no playable categories until Admin publishes again.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
