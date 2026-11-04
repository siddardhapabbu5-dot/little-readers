import { PrismaClient } from "@prisma/client";

const p = new PrismaClient();
const levels = await p.learningLevel.findMany({
  select: { id: true, code: true, isActive: true },
});
const publishedCats = await p.learningCategory.count({ where: { isPublished: true } });
const totalCats = await p.learningCategory.count();
const words = await p.vocabularyWord.count({ where: { isActive: true } });
const groups = await p.learningGroup.findMany({
  select: {
    code: true,
    level: { select: { code: true } },
    _count: { select: { categories: true } },
  },
});
const parent = await p.user.findUnique({
  where: { email: "parent@littlereaders.test" },
  include: { children: { where: { isActive: true }, take: 5 } },
});
console.log(
  JSON.stringify(
    {
      levels,
      totalCats,
      publishedCats,
      groups,
      activeWords: words,
      parentChildren: parent?.children?.map((c) => ({
        id: c.id,
        name: c.displayName,
        levelId: c.levelId,
        hasLearningSeat: c.hasLearningSeat,
      })),
    },
    null,
    2
  )
);
await p.$disconnect();
