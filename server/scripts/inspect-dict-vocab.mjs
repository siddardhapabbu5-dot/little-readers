import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();

const grades = await p.learningGrade.findMany({
  orderBy: { sortOrder: "asc" },
  select: { id: true, code: true, label: true, isActive: true },
});
const dictEntries = await p.dictionaryEntry.count();
const dictSenses = await p.dictionarySense.count();
const batches = await p.dictionaryImportBatch.findMany({
  orderBy: { createdAt: "desc" },
  take: 8,
  select: {
    id: true,
    originalFilename: true,
    storedPath: true,
    status: true,
    fileHash: true,
    extractedCount: true,
    entryCount: true,
    senseCount: true,
    assignmentCount: true,
    createdAt: true,
  },
});
const assignByStatus = await p.vocabularyGradeAssignment.groupBy({
  by: ["status"],
  _count: true,
});
const wordsTotal = await p.vocabularyWord.count();
const wordsActive = await p.vocabularyWord.count({ where: { isActive: true } });
const wordsByOrigin = await p.vocabularyWord.groupBy({
  by: ["origin"],
  _count: true,
});

const perGrade = [];
for (const g of grades) {
  const active = await p.vocabularyWord.count({
    where: { isActive: true, category: { group: { level: { gradeId: g.id } } } },
  });
  const all = await p.vocabularyWord.count({
    where: { category: { group: { level: { gradeId: g.id } } } },
  });
  const pending = await p.vocabularyGradeAssignment.count({
    where: { status: "PENDING", gradeId: g.id },
  });
  const approved = await p.vocabularyGradeAssignment.count({
    where: { status: "APPROVED", gradeId: g.id },
  });
  const published = await p.vocabularyGradeAssignment.count({
    where: { status: "PUBLISHED", gradeId: g.id },
  });
  const rejected = await p.vocabularyGradeAssignment.count({
    where: { status: "REJECTED", gradeId: g.id },
  });
  perGrade.push({
    code: g.code,
    label: g.label,
    activeWords: active,
    allWords: all,
    pending,
    approved,
    published,
    rejected,
  });
}

console.log(
  JSON.stringify(
    {
      grades,
      dictEntries,
      dictSenses,
      batches,
      assignByStatus,
      wordsTotal,
      wordsActive,
      wordsByOrigin,
      perGrade,
    },
    null,
    2
  )
);
await p.$disconnect();
