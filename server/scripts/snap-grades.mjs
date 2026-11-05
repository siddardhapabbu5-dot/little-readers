import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();
const grades = await p.learningGrade.findMany({
  orderBy: { sortOrder: "asc" },
  include: {
    _count: { select: { levels: true } },
    levels: { select: { code: true, label: true } },
  },
});
const cats = await p.learningCategory.findMany({
  select: {
    code: true,
    label: true,
    isPublished: true,
    group: { select: { level: { select: { code: true, grade: { select: { code: true } } } } } },
    _count: { select: { words: true } },
  },
});
console.log(JSON.stringify({ gradeCount: grades.length, grades, cats }, null, 2));
await p.$disconnect();
