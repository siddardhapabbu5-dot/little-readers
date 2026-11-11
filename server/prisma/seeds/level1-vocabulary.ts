/**
 * Level 1 Ages 1–3 vocabulary seed.
 * Idempotent upsert of 10 categories × 75 unique words = 750.
 */
import type { PrismaClient } from "@prisma/client";
import {
  assertLevel1Vocabulary,
  LEVEL1_CATEGORIES,
} from "../data/level1-vocabulary.js";

export type Level1SeedResult = {
  levelId: string;
  categories: number;
  words: number;
  unique: number;
  perCategory: Array<{ code: string; label: string; count: number }>;
};

function pronunciationFor(word: string): string {
  return word.toLowerCase().replace(/[^a-z]/g, "");
}

function imageUrlFor(emoji: string, text: string): string {
  // Stable placeholder path; UI uses emoji when assets are missing.
  return `/assets/vocab/level1/${encodeURIComponent(text)}.svg?emoji=${encodeURIComponent(emoji)}`;
}

function audioUrlFor(text: string): string {
  // TTS fallback on client; optional asset path reserved for recordings.
  return `/assets/audio/level1/${encodeURIComponent(text)}.mp3`;
}

export function validateLevel1SeedData() {
  const check = assertLevel1Vocabulary();
  if (check.total !== 750 || check.unique !== 750) {
    throw new Error(
      `Level 1 vocabulary invalid: total=${check.total} unique=${check.unique} duplicates=${check.duplicates.join(",")}`
    );
  }
  for (const cat of check.categories) {
    if (cat.count !== 75) {
      throw new Error(
        `Category ${cat.code} must have 75 words, found ${cat.count}`
      );
    }
  }
  return check;
}

export type SeedLevel1Options = {
  /** When false (default), only levels/groups/categories are created — no word rows. */
  includeWords?: boolean;
};

/** Remove all vocabulary words (and cascaded question attempts). */
export async function clearAllVocabularyWords(prisma: PrismaClient) {
  const deletedAttempts = await prisma.questionAttempt.deleteMany({});
  // LessonVocabItem uses onDelete: Restrict — clear links before words
  const deletedLessonVocab = await prisma.lessonVocabItem.deleteMany({});
  // Drop grade suggestions too so old dictionary pending rows cannot be re-published
  const deletedAssignments = await prisma.vocabularyGradeAssignment.deleteMany({});
  const deletedWords = await prisma.vocabularyWord.deleteMany({});
  // Legacy Phase-1 Word table (lesson words), if any
  try {
    await prisma.lessonWord.deleteMany({});
    await prisma.word.deleteMany({});
  } catch {
    // ignore if models unused
  }
  return {
    attempts: deletedAttempts.count,
    lessonVocabItems: deletedLessonVocab.count,
    assignments: deletedAssignments.count,
    words: deletedWords.count,
  };
}

export async function seedLevel1Vocabulary(
  prisma: PrismaClient,
  options: SeedLevel1Options = {}
): Promise<Level1SeedResult> {
  const includeWords = options.includeWords === true;
  const check = includeWords ? validateLevel1SeedData() : null;

  const level1 = await prisma.learningLevel.upsert({
    where: { code: "LEVEL_1" },
    update: {
      label: "Level 1 – Ages 1–3",
      sortOrder: 0,
      description:
        "Structure ready — vocabulary uploaded by owner (no seeded English words)",
      ageMin: 1,
      ageMax: 3,
    },
    create: {
      code: "LEVEL_1",
      label: "Level 1 – Ages 1–3",
      sortOrder: 0,
      description:
        "Structure ready — vocabulary uploaded by owner (no seeded English words)",
      ageMin: 1,
      ageMax: 3,
    },
  });

  const groupDefs = [
    { code: "A", label: "Group A – Basic Vocabulary", sortOrder: 1 },
    { code: "B", label: "Group B – Everyday Vocabulary", sortOrder: 2 },
  ] as const;

  const groups = new Map<string, string>();
  for (const def of groupDefs) {
    const group = await prisma.learningGroup.upsert({
      where: { levelId_code: { levelId: level1.id, code: def.code } },
      update: { label: def.label, sortOrder: def.sortOrder },
      create: {
        levelId: level1.id,
        code: def.code,
        label: def.label,
        sortOrder: def.sortOrder,
      },
    });
    groups.set(def.code, group.id);
  }

  const perCategory: Level1SeedResult["perCategory"] = [];
  let unlockOrder = 0;

  for (const [index, cat] of LEVEL1_CATEGORIES.entries()) {
    if (includeWords && cat.words.length !== 75) {
      throw new Error(
        `Category ${cat.code} seed list length ${cat.words.length} !== 75`
      );
    }

    const groupId = groups.get(cat.group);
    if (!groupId) throw new Error(`Missing group ${cat.group}`);

    const category = await prisma.learningCategory.upsert({
      where: { groupId_code: { groupId, code: cat.code } },
      update: {
        label: cat.label,
        description: includeWords
          ? `${cat.words.length} age-appropriate words`
          : "No words yet — upload vocabulary in Admin",
        emoji: cat.emoji,
        sortOrder: index + 1,
        unlockOrder,
        isPublished: true,
        status: "PUBLISHED",
      },
      create: {
        groupId,
        code: cat.code,
        label: cat.label,
        description: includeWords
          ? `${cat.words.length} age-appropriate words`
          : "No words yet — upload vocabulary in Admin",
        emoji: cat.emoji,
        sortOrder: index + 1,
        unlockOrder,
        isPublished: true,
        status: "PUBLISHED",
      },
    });

    unlockOrder += 1;

    if (includeWords) {
      for (const [wordIndex, word] of cat.words.entries()) {
        const firstLetter = word.text.charAt(0).toUpperCase();
        await prisma.vocabularyWord.upsert({
          where: {
            categoryId_text: { categoryId: category.id, text: word.text },
          },
          update: {
            meaning: word.meaning,
            emoji: word.emoji,
            phonetic: pronunciationFor(word.text),
            firstLetter,
            difficulty: 1,
            sortOrder: wordIndex + 1,
            imageUrl: imageUrlFor(word.emoji, word.text),
            audioUrl: audioUrlFor(word.text),
            isActive: true,
          },
          create: {
            categoryId: category.id,
            text: word.text,
            meaning: word.meaning,
            emoji: word.emoji,
            phonetic: pronunciationFor(word.text),
            firstLetter,
            difficulty: 1,
            sortOrder: wordIndex + 1,
            imageUrl: imageUrlFor(word.emoji, word.text),
            audioUrl: audioUrlFor(word.text),
            isActive: true,
          },
        });
      }
    }

    perCategory.push({
      code: cat.code,
      label: cat.label,
      count: includeWords ? cat.words.length : 0,
    });
  }

  // Mirror empty category shells onto Grades 2–4 so dictionary classification can assign.
  // Shells start hidden; only the admin approve → publish workflow shows them to children.
  for (const levelCode of ["LEVEL_2", "LEVEL_3", "LEVEL_4"] as const) {
    const level = await prisma.learningLevel.findUnique({ where: { code: levelCode } });
    if (!level) continue;
    const groupMap = new Map<string, string>();
    for (const def of groupDefs) {
      const group = await prisma.learningGroup.upsert({
        where: { levelId_code: { levelId: level.id, code: def.code } },
        update: { label: def.label, sortOrder: def.sortOrder },
        create: {
          levelId: level.id,
          code: def.code,
          label: def.label,
          sortOrder: def.sortOrder,
        },
      });
      groupMap.set(def.code, group.id);
    }
    let uo = 0;
    for (const [index, cat] of LEVEL1_CATEGORIES.entries()) {
      const groupId = groupMap.get(cat.group);
      if (!groupId) continue;
      await prisma.learningCategory.upsert({
        where: { groupId_code: { groupId, code: cat.code } },
        update: {
          label: cat.label,
          description: "No words yet — upload / approve dictionary assignments",
          emoji: cat.emoji,
          sortOrder: index + 1,
          unlockOrder: uo,
        },
        create: {
          groupId,
          code: cat.code,
          label: cat.label,
          description: "No words yet — upload / approve dictionary assignments",
          emoji: cat.emoji,
          sortOrder: index + 1,
          unlockOrder: uo,
          isPublished: false,
        },
      });
      uo += 1;
    }
  }

  if (!includeWords) {
    const wordCount = await prisma.vocabularyWord.count({ where: { isActive: true } });
    console.log(
      `Grade structures ready (L1–L4 categories). Active vocabulary words left untouched (${wordCount}).`
    );
    return {
      levelId: level1.id,
      categories: perCategory.length,
      words: wordCount,
      unique: wordCount,
      perCategory,
    };
  }

  const dbCount = await prisma.vocabularyWord.count({
    where: {
      isActive: true,
      category: { group: { levelId: level1.id } },
    },
  });

  if (dbCount < 750) {
    throw new Error(
      `Post-seed Level 1 word count mismatch: expected at least 750, found ${dbCount}`
    );
  }

  for (const row of perCategory) {
    const count = await prisma.vocabularyWord.count({
      where: {
        isActive: true,
        category: {
          code: row.code,
          group: { levelId: level1.id },
        },
      },
    });
    if (count < 75) {
      throw new Error(
        `Post-seed category ${row.code} expected at least 75 words, found ${count}`
      );
    }
  }

  console.log(
    `Seeded Level 1: ${check!.total} unique vocabulary words across ${perCategory.length} categories.`
  );

  return {
    levelId: level1.id,
    categories: perCategory.length,
    words: dbCount,
    unique: check!.unique,
    perCategory,
  };
}
