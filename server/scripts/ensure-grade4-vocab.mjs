/**
 * Ensure GRADE_4 has published dictionary words by assigning unused longer senses.
 * Does not create duplicate DictionaryEntry rows.
 */
import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();

const admin = await p.user.findFirst({
  where: { role: { in: ["ADMIN", "SUPER_ADMIN"] }, isActive: true },
});
if (!admin) throw new Error("No admin");

const grade4 = await p.learningGrade.findFirst({ where: { code: "GRADE_4" } });
if (!grade4) throw new Error("GRADE_4 missing");
if (!grade4.isActive) {
  await p.learningGrade.update({ where: { id: grade4.id }, data: { isActive: true } });
}

const cat = await p.learningCategory.findFirst({
  where: {
    isPublished: true,
    group: { level: { gradeId: grade4.id } },
  },
  include: { group: { include: { level: true } } },
  orderBy: { sortOrder: "asc" },
});
if (!cat) throw new Error("No GRADE_4 category");

const senses = await p.dictionarySense.findMany({
  include: { entry: true, assignments: { where: { gradeId: grade4.id } } },
  orderBy: { createdAt: "asc" },
});

// Prefer longer headwords not yet on GRADE_4
const candidates = senses
  .filter((s) => s.assignments.length === 0)
  .sort((a, b) => b.entry.headword.length - a.entry.headword.length);

let published = 0;
for (const sense of candidates.slice(0, 25)) {
  const existing = await p.vocabularyGradeAssignment.findUnique({
    where: {
      senseId_gradeId_categoryId: {
        senseId: sense.id,
        gradeId: grade4.id,
        categoryId: cat.id,
      },
    },
  });
  let assignmentId = existing?.id;
  if (!existing) {
    const row = await p.vocabularyGradeAssignment.create({
      data: {
        senseId: sense.id,
        gradeId: grade4.id,
        levelId: cat.group.levelId,
        categoryId: cat.id,
        status: "APPROVED",
        difficultyScore: 80,
        confidenceScore: 0.5,
        explanation: "Ensure GRADE_4 coverage from dictionary senses",
        classificationVersion: "classify-v1-rehydrate",
        reviewedById: admin.id,
        reviewedAt: new Date(),
      },
    });
    assignmentId = row.id;
  } else if (existing.status === "PUBLISHED") {
    continue;
  } else if (existing.status === "REJECTED") {
    continue;
  } else {
    await p.vocabularyGradeAssignment.update({
      where: { id: existing.id },
      data: {
        status: "APPROVED",
        reviewedById: admin.id,
        reviewedAt: new Date(),
      },
    });
  }

  const headword = sense.entry.headword;
  const word = await p.vocabularyWord.upsert({
    where: { categoryId_text: { categoryId: cat.id, text: headword } },
    update: {
      meaning: sense.definition,
      isActive: true,
      origin: "DICTIONARY",
      dictionarySenseId: sense.id,
      firstLetter: headword.charAt(0).toUpperCase(),
    },
    create: {
      categoryId: cat.id,
      text: headword,
      meaning: sense.definition,
      emoji: cat.emoji || "📚",
      firstLetter: headword.charAt(0).toUpperCase(),
      isActive: true,
      origin: "DICTIONARY",
      dictionarySenseId: sense.id,
      difficulty: 4,
      sortOrder: 0,
    },
  });
  await p.vocabularyGradeAssignment.update({
    where: { id: assignmentId },
    data: {
      status: "PUBLISHED",
      publishedWordId: word.id,
      reviewedById: admin.id,
      reviewedAt: new Date(),
    },
  });
  published += 1;
}

const active = await p.vocabularyWord.count({
  where: {
    isActive: true,
    category: { group: { level: { gradeId: grade4.id } } },
  },
});
console.log(JSON.stringify({ published, grade4ActiveWords: active }, null, 2));
await p.$disconnect();
