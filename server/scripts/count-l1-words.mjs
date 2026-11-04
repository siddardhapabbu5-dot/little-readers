import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();
const rows = await p.learningCategory.findMany({
  where: { isPublished: true, group: { level: { code: "LEVEL_1" } } },
  select: {
    label: true,
    _count: { select: { words: { where: { isActive: true } } } },
  },
});
console.log(rows.map((r) => ({ label: r.label, words: r._count.words })));
console.log(
  "total",
  rows.reduce((n, r) => n + r._count.words, 0)
);
await p.$disconnect();
