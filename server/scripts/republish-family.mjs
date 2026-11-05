import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();
await p.learningCategory.updateMany({
  where: { code: "FAMILY_AND_PEOPLE" },
  data: { isPublished: true },
});
console.log(
  await p.learningCategory.findMany({
    select: { code: true, isPublished: true, _count: { select: { words: true } } },
  })
);
await p.$disconnect();
