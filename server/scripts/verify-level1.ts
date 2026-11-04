import { PrismaClient } from "@prisma/client";
import { assertLevel1Vocabulary } from "../prisma/data/level1-vocabulary.js";

const prisma = new PrismaClient();

async function main() {
  const fileCheck = assertLevel1Vocabulary();
  const words = await prisma.vocabularyWord.count();
  const cats = await prisma.learningCategory.findMany({
    include: {
      _count: { select: { words: true } },
      group: { select: { code: true } },
    },
    orderBy: { sortOrder: "asc" },
  });

  console.log(
    JSON.stringify(
      {
        file: fileCheck,
        dbWords: words,
        categories: cats.map((c) => ({
          code: c.code,
          group: c.group.code,
          count: c._count.words,
        })),
      },
      null,
      2
    )
  );

  if (words !== 750 || cats.length !== 10 || cats.some((c) => c._count.words !== 75)) {
    process.exitCode = 1;
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
