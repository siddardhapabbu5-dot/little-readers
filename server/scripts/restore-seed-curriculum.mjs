/**
 * Restore Level 1–4 curriculum visibility after shared-DB test pollution.
 * Does not delete rows or wipe progress — only reactivates levels and republishes categories.
 */
import { PrismaClient } from "@prisma/client";

const p = new PrismaClient();

const levelCodes = ["LEVEL_1", "LEVEL_2", "LEVEL_3", "LEVEL_4"];

const levels = await p.learningLevel.updateMany({
  where: { code: { in: levelCodes } },
  data: { isActive: true },
});

const levelRows = await p.learningLevel.findMany({
  where: { code: { in: levelCodes } },
  select: { id: true },
});
const levelIds = levelRows.map((l) => l.id);

const groups = await p.learningGroup.findMany({
  where: { levelId: { in: levelIds } },
  select: { id: true },
});
const groupIds = groups.map((g) => g.id);

const cats = await p.learningCategory.updateMany({
  where: { groupId: { in: groupIds } },
  data: { isPublished: true },
});

const groupsActive = await p.learningGroup.updateMany({
  where: { id: { in: groupIds } },
  data: { isActive: true },
});

console.log(
  JSON.stringify(
    {
      levelsReactivated: levels.count,
      groupsReactivated: groupsActive.count,
      categoriesRepublished: cats.count,
    },
    null,
    2
  )
);

await p.$disconnect();
