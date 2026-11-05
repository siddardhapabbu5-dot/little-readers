/**
 * Rehydrate grade vocabulary from existing dictionary entries/senses.
 * Does NOT re-upload files or create duplicate DictionaryEntry rows.
 */
import { PrismaClient } from "@prisma/client";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
// Use compiled-free path: call classify via dynamic import of TS through tsx when run with tsx.
// This script is Prisma-only + inlined classify mirror for safety when run with node.

const p = new PrismaClient();

const CLASSIFICATION_VERSION = "classify-v1-rehydrate";

function scoreSense(headword, definition, wordType) {
  const text = `${headword} ${definition} ${wordType || ""}`.toLowerCase();
  const len = headword.trim().length;
  let difficulty = 20;
  if (len <= 3) difficulty = 10;
  else if (len <= 5) difficulty = 25;
  else if (len <= 7) difficulty = 45;
  else difficulty = 65;
  if (/animal|pet|fruit|family|color|colour|body|food|home/.test(text)) difficulty -= 8;
  if (/science|history|abstract|complex/.test(text)) difficulty += 15;
  return Math.max(5, Math.min(95, difficulty));
}

function pickGrade(difficulty) {
  if (difficulty < 30) return "GRADE_1";
  if (difficulty < 50) return "GRADE_2";
  if (difficulty < 70) return "GRADE_3";
  return "GRADE_4";
}

async function main() {
  // 1) Ensure GRADE_1–4 active
  const grades = await p.learningGrade.findMany({
    where: { code: { in: ["GRADE_1", "GRADE_2", "GRADE_3", "GRADE_4"] } },
  });
  for (const g of grades) {
    if (!g.isActive) {
      await p.learningGrade.update({ where: { id: g.id }, data: { isActive: true } });
    }
  }
  const gradeByCode = Object.fromEntries(grades.map((g) => [g.code, g]));

  // Load first published category per grade (prefer A group)
  const categories = await p.learningCategory.findMany({
    where: {
      isPublished: true,
      group: { isActive: true, level: { isActive: true, gradeId: { not: null } } },
    },
    include: {
      group: { include: { level: true } },
    },
    orderBy: [{ sortOrder: "asc" }],
  });
  const catByGrade = {};
  for (const c of categories) {
    const gid = c.group.level.gradeId;
    if (!gid) continue;
    if (!catByGrade[gid]) catByGrade[gid] = c;
  }

  const senses = await p.dictionarySense.findMany({
    include: { entry: true },
    orderBy: { createdAt: "asc" },
  });
  console.log(`Dictionary senses: ${senses.length}`);

  let createdAssign = 0;
  let reusedAssign = 0;
  const pendingIds = [];

  for (const sense of senses) {
    const difficulty = scoreSense(
      sense.entry.headword,
      sense.definition,
      sense.wordType
    );
    const gradeCode = pickGrade(difficulty);
    const grade = gradeByCode[gradeCode];
    if (!grade) continue;
    const cat = catByGrade[grade.id];
    if (!cat) {
      console.warn(`No category for ${gradeCode}`);
      continue;
    }

    const existing = await p.vocabularyGradeAssignment.findUnique({
      where: {
        senseId_gradeId_categoryId: {
          senseId: sense.id,
          gradeId: grade.id,
          categoryId: cat.id,
        },
      },
    });
    if (existing) {
      reusedAssign += 1;
      if (existing.status === "PENDING" || existing.status === "APPROVED") {
        pendingIds.push(existing.id);
      }
      continue;
    }

    const row = await p.vocabularyGradeAssignment.create({
      data: {
        senseId: sense.id,
        gradeId: grade.id,
        levelId: cat.group.levelId,
        categoryId: cat.id,
        status: "PENDING",
        difficultyScore: difficulty,
        confidenceScore: 0.55,
        explanation: `Rehydrate ${CLASSIFICATION_VERSION}: length/topic heuristic → ${gradeCode}`,
        classificationVersion: CLASSIFICATION_VERSION,
      },
    });
    createdAssign += 1;
    pendingIds.push(row.id);
  }

  // Admin user for reviewer
  const admin = await p.user.findFirst({
    where: { role: { in: ["ADMIN", "SUPER_ADMIN"] }, isActive: true },
  });
  if (!admin) throw new Error("No admin user");

  let published = 0;
  let approved = 0;
  for (const id of pendingIds) {
    const assignment = await p.vocabularyGradeAssignment.findUnique({
      where: { id },
      include: {
        sense: { include: { entry: true } },
        category: true,
      },
    });
    if (!assignment) continue;
    if (assignment.status === "REJECTED" || assignment.status === "PUBLISHED") continue;

    if (assignment.status === "PENDING") {
      await p.vocabularyGradeAssignment.update({
        where: { id },
        data: {
          status: "APPROVED",
          reviewedById: admin.id,
          reviewedAt: new Date(),
        },
      });
      approved += 1;
    }

    const headword = assignment.sense.entry.headword;
    const meaning = assignment.sense.definition;
    const firstLetter = headword.charAt(0).toUpperCase();
    const word = await p.vocabularyWord.upsert({
      where: {
        categoryId_text: {
          categoryId: assignment.categoryId,
          text: headword,
        },
      },
      update: {
        meaning,
        phonetic: assignment.sense.entry.pronunciation ?? undefined,
        firstLetter,
        isActive: true,
        origin: "DICTIONARY",
        dictionarySenseId: assignment.senseId,
        difficulty: Math.max(
          1,
          Math.min(5, Math.round(assignment.difficultyScore / 20))
        ),
      },
      create: {
        categoryId: assignment.categoryId,
        text: headword,
        meaning,
        emoji: assignment.category.emoji || "📚",
        phonetic: assignment.sense.entry.pronunciation,
        firstLetter,
        isActive: true,
        origin: "DICTIONARY",
        dictionarySenseId: assignment.senseId,
        difficulty: Math.max(
          1,
          Math.min(5, Math.round(assignment.difficultyScore / 20))
        ),
        sortOrder: 0,
      },
    });
    await p.vocabularyGradeAssignment.update({
      where: { id },
      data: {
        status: "PUBLISHED",
        publishedWordId: word.id,
        reviewedById: admin.id,
        reviewedAt: new Date(),
      },
    });
    published += 1;
  }

  const perGrade = [];
  for (const g of grades.sort((a, b) => a.sortOrder - b.sortOrder)) {
    const activeWords = await p.vocabularyWord.count({
      where: {
        isActive: true,
        category: { group: { level: { gradeId: g.id } } },
      },
    });
    const publishedAssign = await p.vocabularyGradeAssignment.count({
      where: { gradeId: g.id, status: "PUBLISHED" },
    });
    perGrade.push({
      code: g.code,
      activeWords,
      publishedAssign,
    });
  }

  console.log(
    JSON.stringify(
      {
        createdAssign,
        reusedAssign,
        approved,
        published,
        dictEntries: await p.dictionaryEntry.count(),
        dictSenses: await p.dictionarySense.count(),
        perGrade,
      },
      null,
      2
    )
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => p.$disconnect());
