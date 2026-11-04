import type { VocabWordOrigin } from "@prisma/client";
import { AppError } from "../lib/errors.js";
import { prisma } from "../lib/prisma.js";
import { sanitizeText, sanitizeWord } from "./file-security.js";

export type WordListFilters = {
  q?: string;
  gradeId?: string;
  levelId?: string;
  groupId?: string;
  categoryId?: string;
  isActive?: boolean;
  origin?: VocabWordOrigin;
  /** Filter words linked to an assignment with this review/publication status */
  assignmentStatus?: "PENDING" | "APPROVED" | "REJECTED" | "PUBLISHED";
  take?: number;
  skip?: number;
};

function categoryWhere(filters: WordListFilters) {
  return {
    ...(filters.categoryId ? { id: filters.categoryId } : {}),
    ...(filters.groupId ? { groupId: filters.groupId } : {}),
    ...(filters.levelId || filters.gradeId
      ? {
          group: {
            ...(filters.groupId ? {} : {}),
            ...(filters.levelId ? { levelId: filters.levelId } : {}),
            ...(filters.gradeId
              ? { level: { gradeId: filters.gradeId } }
              : {}),
          },
        }
      : {}),
  };
}

export async function searchAdminWords(filters: WordListFilters) {
  const take = Math.min(filters.take ?? 100, 500);
  const skip = Math.max(filters.skip ?? 0, 0);
  const q = filters.q?.trim();

  const and: object[] = [{ category: categoryWhere(filters) }];
  if (filters.isActive !== undefined) and.push({ isActive: filters.isActive });
  if (filters.origin) and.push({ origin: filters.origin });
  if (filters.assignmentStatus) {
    and.push({
      OR: [
        {
          publishedFrom: {
            some: { status: filters.assignmentStatus },
          },
        },
        {
          dictionarySense: {
            assignments: {
              some: { status: filters.assignmentStatus },
            },
          },
        },
      ],
    });
  }
  if (q) {
    and.push({
      OR: [
        { text: { contains: q, mode: "insensitive" as const } },
        { meaning: { contains: q, mode: "insensitive" as const } },
      ],
    });
  }
  const where = { AND: and };

  const [total, rows] = await Promise.all([
    prisma.vocabularyWord.count({ where }),
    prisma.vocabularyWord.findMany({
      where,
      orderBy: [{ categoryId: "asc" }, { sortOrder: "asc" }, { text: "asc" }],
      take,
      skip,
      include: {
        category: {
          include: {
            group: {
              include: {
                level: {
                  include: {
                    grade: { select: { id: true, code: true, label: true } },
                  },
                },
              },
            },
          },
        },
        dictionarySense: {
          include: {
            entry: {
              select: {
                id: true,
                headword: true,
                pronunciation: true,
                sourceName: true,
                licence: true,
              },
            },
          },
        },
        _count: { select: { attempts: true, publishedFrom: true } },
      },
    }),
  ]);

  return { total, take, skip, words: rows };
}

export async function getAdminWord(id: string) {
  const word = await prisma.vocabularyWord.findUnique({
    where: { id },
    include: {
      category: {
        include: {
          group: {
            include: {
              level: {
                include: { grade: true },
              },
            },
          },
        },
      },
      dictionarySense: {
        include: {
          entry: true,
          assignments: {
            include: {
              grade: true,
              level: { select: { id: true, code: true, label: true } },
              category: { select: { id: true, code: true, label: true } },
            },
            orderBy: { createdAt: "desc" },
          },
        },
      },
      publishedFrom: {
        include: {
          grade: true,
          level: { select: { id: true, code: true, label: true } },
        },
      },
      _count: { select: { attempts: true } },
    },
  });
  if (!word) throw new AppError("Word not found", 404);
  return word;
}

export async function createAdminWord(input: {
  categoryId: string;
  text: string;
  meaning: string;
  emoji?: string;
  phonetic?: string;
  imageUrl?: string;
  audioUrl?: string;
  difficulty?: number;
  sortOrder?: number;
  isActive?: boolean;
}) {
  const category = await prisma.learningCategory.findUnique({
    where: { id: input.categoryId },
  });
  if (!category) throw new AppError("categoryId not found", 400);

  const text = sanitizeWord(input.text);
  const meaning = sanitizeText(input.meaning, 500);
  if (!text) throw new AppError("text is required", 400);
  if (!meaning) throw new AppError("meaning is required (not invented)", 400);

  const clash = await prisma.vocabularyWord.findUnique({
    where: { categoryId_text: { categoryId: input.categoryId, text } },
  });
  if (clash) {
    throw new AppError("Word already exists in this category", 409);
  }

  return prisma.vocabularyWord.create({
    data: {
      categoryId: input.categoryId,
      text,
      meaning,
      emoji: input.emoji?.trim() || "📝",
      phonetic: input.phonetic ? sanitizeText(input.phonetic, 120) : null,
      imageUrl: input.imageUrl ? sanitizeText(input.imageUrl, 500) : null,
      audioUrl: input.audioUrl ? sanitizeText(input.audioUrl, 500) : null,
      firstLetter: text.charAt(0).toUpperCase(),
      difficulty: Math.min(5, Math.max(1, input.difficulty ?? 1)),
      sortOrder: input.sortOrder ?? 0,
      isActive: input.isActive ?? true,
      origin: "LEGACY",
    },
  });
}

export async function updateAdminWord(
  id: string,
  patch: {
    text?: string;
    meaning?: string;
    emoji?: string;
    phonetic?: string | null;
    imageUrl?: string | null;
    audioUrl?: string | null;
    difficulty?: number;
    sortOrder?: number;
    isActive?: boolean;
  }
) {
  const existing = await prisma.vocabularyWord.findUnique({ where: { id } });
  if (!existing) throw new AppError("Word not found", 404);

  let text = existing.text;
  if (patch.text !== undefined) {
    text = sanitizeWord(patch.text);
    if (!text) throw new AppError("text is required", 400);
    if (text !== existing.text) {
      const clash = await prisma.vocabularyWord.findUnique({
        where: {
          categoryId_text: { categoryId: existing.categoryId, text },
        },
      });
      if (clash) throw new AppError("Word already exists in this category", 409);
    }
  }

  let meaning = existing.meaning;
  if (patch.meaning !== undefined) {
    meaning = sanitizeText(patch.meaning, 500);
    if (!meaning) throw new AppError("meaning is required (not invented)", 400);
  }

  // Also sync dictionary sense definition when linked and meaning changes
  return prisma.$transaction(async (tx) => {
    const word = await tx.vocabularyWord.update({
      where: { id },
      data: {
        text,
        meaning,
        firstLetter: text.charAt(0).toUpperCase(),
        ...(patch.emoji !== undefined ? { emoji: patch.emoji.trim() || "📝" } : {}),
        ...(patch.phonetic !== undefined
          ? { phonetic: patch.phonetic ? sanitizeText(patch.phonetic, 120) : null }
          : {}),
        ...(patch.imageUrl !== undefined
          ? { imageUrl: patch.imageUrl ? sanitizeText(patch.imageUrl, 500) : null }
          : {}),
        ...(patch.audioUrl !== undefined
          ? { audioUrl: patch.audioUrl ? sanitizeText(patch.audioUrl, 500) : null }
          : {}),
        ...(patch.difficulty !== undefined
          ? { difficulty: Math.min(5, Math.max(1, patch.difficulty)) }
          : {}),
        ...(patch.sortOrder !== undefined ? { sortOrder: patch.sortOrder } : {}),
        ...(patch.isActive !== undefined ? { isActive: patch.isActive } : {}),
      },
    });

    if (existing.dictionarySenseId && patch.meaning !== undefined) {
      await tx.dictionarySense.update({
        where: { id: existing.dictionarySenseId },
        data: { definition: meaning },
      });
    }

    return word;
  });
}

export async function deactivateAdminWord(id: string) {
  return updateAdminWord(id, { isActive: false });
}

export async function deleteAdminWord(id: string) {
  const existing = await prisma.vocabularyWord.findUnique({
    where: { id },
    include: {
      _count: { select: { attempts: true, publishedFrom: true } },
    },
  });
  if (!existing) throw new AppError("Word not found", 404);
  if (existing._count.attempts > 0 || existing._count.publishedFrom > 0) {
    throw new AppError(
      "Word is used in learning history or dictionary publications. Deactivate instead.",
      409,
      { code: "WORD_IN_USE", suggest: "deactivate" }
    );
  }
  await prisma.vocabularyWord.delete({ where: { id } });
  return { id, deleted: true };
}

/**
 * Move word to another category without changing id (progress stays linked).
 * Validates group→level→grade chain when gradeId/levelId provided.
 */
export async function reclassifyAdminWord(
  id: string,
  input: { categoryId: string; levelId?: string; gradeId?: string }
) {
  const word = await prisma.vocabularyWord.findUnique({
    where: { id },
    include: { publishedFrom: true },
  });
  if (!word) throw new AppError("Word not found", 404);

  const category = await prisma.learningCategory.findUnique({
    where: { id: input.categoryId },
    include: {
      group: {
        include: {
          level: { include: { grade: true } },
        },
      },
    },
  });
  if (!category) throw new AppError("categoryId not found", 400);

  if (input.levelId && category.group.levelId !== input.levelId) {
    throw new AppError("Category does not belong to the given level", 400);
  }
  if (input.gradeId) {
    const gradeId = category.group.level.gradeId;
    if (gradeId !== input.gradeId) {
      throw new AppError("Category does not belong to the given grade", 400);
    }
  }

  if (category.id === word.categoryId) {
    return getAdminWord(id);
  }

  const clash = await prisma.vocabularyWord.findUnique({
    where: {
      categoryId_text: { categoryId: category.id, text: word.text },
    },
  });
  if (clash) {
    throw new AppError(
      "Target category already has this headword. Merge manually or deactivate one copy.",
      409
    );
  }

  const levelId = category.group.levelId;
  const gradeId = category.group.level.gradeId;
  if (word.publishedFrom.length && !gradeId) {
    throw new AppError(
      "Target category's level has no grade — cannot reclassify published dictionary words",
      400
    );
  }

  await prisma.$transaction(async (tx) => {
    await tx.vocabularyWord.update({
      where: { id },
      data: { categoryId: category.id },
    });

    // Keep published assignment rows pointing at same word id; update placement only
    if (word.publishedFrom.length && gradeId) {
      for (const a of word.publishedFrom) {
        const conflict = await tx.vocabularyGradeAssignment.findFirst({
          where: {
            senseId: a.senseId,
            gradeId,
            categoryId: category.id,
            NOT: { id: a.id },
          },
        });
        if (conflict) {
          throw new AppError(
            "Reclassify would conflict with an existing grade assignment for this sense",
            409
          );
        }
        await tx.vocabularyGradeAssignment.update({
          where: { id: a.id },
          data: {
            categoryId: category.id,
            levelId,
            gradeId,
          },
        });
      }
    }
  });

  return getAdminWord(id);
}
