import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();

await p.vocabProgramme.updateMany({
  where: { status: "ACTIVE" },
  data: { status: "CANCELLED" },
});
const r = await p.vocabularyWord.updateMany({
  where: { origin: "DICTIONARY" },
  data: { isActive: true },
});
const grades = await p.learningGrade.findMany({
  where: { code: { in: ["GRADE_1", "GRADE_2", "GRADE_3", "GRADE_4"] } },
  orderBy: { sortOrder: "asc" },
});
const per = [];
for (const g of grades) {
  per.push({
    code: g.code,
    active: await p.vocabularyWord.count({
      where: {
        isActive: true,
        category: { group: { level: { gradeId: g.id } } },
      },
    }),
    published: await p.vocabularyGradeAssignment.count({
      where: { gradeId: g.id, status: "PUBLISHED" },
    }),
  });
}
console.log(
  JSON.stringify(
    {
      restored: r.count,
      dictEntries: await p.dictionaryEntry.count(),
      dictSenses: await p.dictionarySense.count(),
      per,
    },
    null,
    2
  )
);
await p.$disconnect();
