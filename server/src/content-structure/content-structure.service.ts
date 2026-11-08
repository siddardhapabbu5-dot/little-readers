import type { LearningLevelKind } from "@prisma/client";
import { AppError } from "../lib/errors.js";
import { prisma } from "../lib/prisma.js";
import { resolveStarterPack } from "./category-starter-packs.js";
import { assertCategoryReadyToPublish } from "../learning/category-progress.js";

const CODE_RE = /^[A-Z0-9_]{1,40}$/;

function assertCode(code: string, label = "code") {
  const normalized = code.trim().toUpperCase();
  if (!CODE_RE.test(normalized)) {
    throw new AppError(
      `${label} must be 1–40 chars: A–Z, 0–9, underscore only`,
      400
    );
  }
  return normalized;
}

function assertAgeRange(ageMin: number, ageMax: number) {
  if (!Number.isInteger(ageMin) || !Number.isInteger(ageMax)) {
    throw new AppError("ageMin and ageMax must be integers", 400);
  }
  if (ageMin < 0 || ageMax > 18 || ageMin > ageMax) {
    throw new AppError("Invalid age range (require 0≤ageMin≤ageMax≤18)", 400);
  }
}

// ——— Grades ———

export async function listGradesAdmin(includeInactive = true) {
  return prisma.learningGrade.findMany({
    where: includeInactive ? undefined : { isActive: true },
    orderBy: [{ sortOrder: "asc" }, { code: "asc" }],
    include: {
      _count: { select: { levels: true, assignments: true } },
    },
  });
}

export async function createGrade(input: {
  code: string;
  label: string;
  ageMin: number;
  ageMax: number;
  description?: string;
  sortOrder?: number;
  isActive?: boolean;
}) {
  const code = assertCode(input.code, "grade code");
  assertAgeRange(input.ageMin, input.ageMax);
  const label = input.label.trim();
  if (!label) throw new AppError("label is required", 400);

  const fromCode = Number((code.match(/(\d+)/) ?? [])[1]);
  const sortOrder =
    input.sortOrder ??
    (Number.isFinite(fromCode) && fromCode > 0
      ? fromCode
      : ((await prisma.learningGrade.aggregate({ _max: { sortOrder: true } }))
          ._max.sortOrder ?? 0) + 1);

  return prisma.learningGrade.create({
    data: {
      code,
      label,
      ageMin: input.ageMin,
      ageMax: input.ageMax,
      description: input.description?.trim() || null,
      sortOrder,
      isActive: input.isActive ?? true,
    },
  });
}

export async function updateGrade(
  id: string,
  patch: {
    code?: string;
    label?: string;
    ageMin?: number;
    ageMax?: number;
    description?: string | null;
    sortOrder?: number;
    isActive?: boolean;
  }
) {
  const existing = await prisma.learningGrade.findUnique({ where: { id } });
  if (!existing) throw new AppError("Grade not found", 404);

  const ageMin = patch.ageMin ?? existing.ageMin;
  const ageMax = patch.ageMax ?? existing.ageMax;
  assertAgeRange(ageMin, ageMax);

  let nextCode: string | undefined;
  if (patch.code !== undefined) {
    nextCode = assertCode(patch.code, "grade code");
    if (nextCode !== existing.code) {
      const clash = await prisma.learningGrade.findUnique({
        where: { code: nextCode },
      });
      if (clash) throw new AppError(`Grade code ${nextCode} already exists`, 409);
    }
  }

  return prisma.learningGrade.update({
    where: { id },
    data: {
      ...(nextCode !== undefined ? { code: nextCode } : {}),
      ...(patch.label !== undefined ? { label: patch.label.trim() } : {}),
      ageMin,
      ageMax,
      ...(patch.description !== undefined
        ? { description: patch.description?.trim() || null }
        : {}),
      ...(patch.sortOrder !== undefined ? { sortOrder: patch.sortOrder } : {}),
      ...(patch.isActive !== undefined ? { isActive: patch.isActive } : {}),
    },
  });
}

export async function deactivateGrade(id: string) {
  return updateGrade(id, { isActive: false });
}

export async function deleteGrade(id: string, opts?: { force?: boolean }) {
  const force = opts?.force === true;
  const existing = await prisma.learningGrade.findUnique({
    where: { id },
    include: {
      levels: {
        include: {
          groups: {
            include: {
              categories: { select: { id: true, label: true } },
            },
          },
        },
      },
      _count: { select: { levels: true, assignments: true, programmes: true } },
    },
  });
  if (!existing) throw new AppError("Grade not found", 404);

  const categoryIds = existing.levels.flatMap((l) =>
    l.groups.flatMap((g) => g.categories.map((c) => c.id))
  );
  const levelIds = existing.levels.map((l) => l.id);
  const inUse =
    existing._count.levels > 0 ||
    existing._count.assignments > 0 ||
    existing._count.programmes > 0 ||
    categoryIds.length > 0;

  if (inUse && !force) {
    throw new AppError(
      `Grade has ${existing._count.levels} level(s) and ${categoryIds.length} categor(ies). Use force delete to remove the grade, levels, groups, categories, and words — or Deactivate to hide it.`,
      409,
      {
        code: "GRADE_IN_USE",
        suggest: "force",
        levelCount: existing._count.levels,
        categoryCount: categoryIds.length,
      }
    );
  }

  // Cascade: categories (+ words) → groups → levels → grade
  for (const categoryId of categoryIds) {
    await deleteCategory(categoryId, { force: true });
  }

  const groupIds = existing.levels.flatMap((l) => l.groups.map((g) => g.id));
  if (groupIds.length) {
    await prisma.lesson.updateMany({
      where: { groupId: { in: groupIds } },
      data: { groupId: null },
    });
    await prisma.learningGroup.deleteMany({ where: { id: { in: groupIds } } });
  }

  if (levelIds.length) {
    await prisma.child.updateMany({
      where: { levelId: { in: levelIds } },
      data: { levelId: null },
    });
    await prisma.vocabImportBatch.deleteMany({
      where: { levelId: { in: levelIds } },
    });
    await prisma.lesson.updateMany({
      where: { levelId: { in: levelIds } },
      data: { levelId: null },
    });
    // Programmes cascade from grade; still clear level-linked leftovers
    await prisma.learningLevel.deleteMany({ where: { id: { in: levelIds } } });
  }

  await prisma.lesson.updateMany({
    where: { gradeId: id },
    data: { gradeId: null },
  });
  await prisma.learningGrade.delete({ where: { id } });

  return {
    id,
    deleted: true,
    forced: force,
    categoriesRemoved: categoryIds.length,
    levelsRemoved: levelIds.length,
  };
}

// ——— Levels ———

export async function listLevelsAdmin(gradeId?: string, includeInactive = true) {
  return prisma.learningLevel.findMany({
    where: {
      ...(gradeId ? { gradeId } : {}),
      ...(includeInactive ? {} : { isActive: true }),
    },
    orderBy: { sortOrder: "asc" },
    include: {
      grade: { select: { id: true, code: true, label: true } },
      _count: { select: { groups: true, children: true, assignments: true } },
    },
  });
}

export async function createLevel(input: {
  code: string;
  label: string;
  kind?: LearningLevelKind;
  gradeId?: string | null;
  ageMin?: number;
  ageMax?: number;
  description?: string;
  sortOrder?: number;
  isActive?: boolean;
}) {
  const code = assertCode(input.code, "level code");
  const label = input.label.trim();
  if (!label) throw new AppError("label is required", 400);

  const kind = input.kind ?? "DIFFICULTY";
  let gradeId = input.gradeId ?? null;

  if (kind === "DIFFICULTY" && !gradeId) {
    throw new AppError("Difficulty levels must belong to a grade (gradeId)", 400);
  }
  if (gradeId) {
    const grade = await prisma.learningGrade.findUnique({ where: { id: gradeId } });
    if (!grade) throw new AppError("gradeId not found", 400);
  }

  const ageMin = input.ageMin ?? 1;
  const ageMax = input.ageMax ?? 12;
  assertAgeRange(ageMin, ageMax);

  return prisma.learningLevel.create({
    data: {
      code,
      label,
      kind,
      gradeId,
      ageMin,
      ageMax,
      description: input.description?.trim() || null,
      sortOrder: input.sortOrder ?? 0,
      isActive: input.isActive ?? true,
    },
  });
}

export async function updateLevel(
  id: string,
  patch: {
    label?: string;
    kind?: LearningLevelKind;
    gradeId?: string | null;
    ageMin?: number;
    ageMax?: number;
    description?: string | null;
    sortOrder?: number;
    isActive?: boolean;
  }
) {
  const existing = await prisma.learningLevel.findUnique({ where: { id } });
  if (!existing) throw new AppError("Level not found", 404);

  const kind = patch.kind ?? existing.kind;
  const gradeId =
    patch.gradeId !== undefined ? patch.gradeId : existing.gradeId;

  if (kind === "DIFFICULTY" && !gradeId) {
    throw new AppError("Difficulty levels must belong to a grade (gradeId)", 400);
  }
  if (gradeId) {
    const grade = await prisma.learningGrade.findUnique({ where: { id: gradeId } });
    if (!grade) throw new AppError("gradeId not found", 400);
  }

  const ageMin = patch.ageMin ?? existing.ageMin;
  const ageMax = patch.ageMax ?? existing.ageMax;
  assertAgeRange(ageMin, ageMax);

  return prisma.learningLevel.update({
    where: { id },
    data: {
      ...(patch.label !== undefined ? { label: patch.label.trim() } : {}),
      kind,
      gradeId,
      ageMin,
      ageMax,
      ...(patch.description !== undefined
        ? { description: patch.description?.trim() || null }
        : {}),
      ...(patch.sortOrder !== undefined ? { sortOrder: patch.sortOrder } : {}),
      ...(patch.isActive !== undefined ? { isActive: patch.isActive } : {}),
    },
  });
}

export async function deactivateLevel(id: string) {
  return updateLevel(id, { isActive: false });
}

export async function deleteLevel(id: string) {
  const existing = await prisma.learningLevel.findUnique({
    where: { id },
    include: {
      _count: {
        select: { groups: true, children: true, assignments: true, vocabImports: true },
      },
    },
  });
  if (!existing) throw new AppError("Level not found", 404);
  const used =
    existing._count.groups +
    existing._count.children +
    existing._count.assignments +
    existing._count.vocabImports;
  if (used > 0) {
    throw new AppError(
      "Level is referenced by groups, children, imports, or assignments. Deactivate instead.",
      409,
      { code: "LEVEL_IN_USE", suggest: "deactivate" }
    );
  }
  await prisma.learningLevel.delete({ where: { id } });
  return { id, deleted: true };
}

// ——— Groups ———

export async function listGroupsAdmin(levelId?: string, includeInactive = true) {
  return prisma.learningGroup.findMany({
    where: {
      ...(levelId ? { levelId } : {}),
      ...(includeInactive ? {} : { isActive: true }),
    },
    orderBy: [{ levelId: "asc" }, { sortOrder: "asc" }],
    include: {
      level: {
        select: {
          id: true,
          code: true,
          label: true,
          gradeId: true,
          grade: { select: { id: true, code: true, label: true } },
        },
      },
      _count: { select: { categories: true } },
    },
  });
}

export async function createGroup(input: {
  levelId: string;
  code: string;
  label: string;
  description?: string;
  sortOrder?: number;
  isActive?: boolean;
}) {
  const code = assertCode(input.code, "group code");
  const label = input.label.trim();
  if (!label) throw new AppError("label is required", 400);

  const level = await prisma.learningLevel.findUnique({ where: { id: input.levelId } });
  if (!level) throw new AppError("levelId not found", 400);

  return prisma.learningGroup.create({
    data: {
      levelId: input.levelId,
      code,
      label,
      description: input.description?.trim() || null,
      sortOrder: input.sortOrder ?? 0,
      isActive: input.isActive ?? true,
    },
  });
}

export async function updateGroup(
  id: string,
  patch: {
    levelId?: string;
    label?: string;
    description?: string | null;
    sortOrder?: number;
    isActive?: boolean;
  }
) {
  const existing = await prisma.learningGroup.findUnique({ where: { id } });
  if (!existing) throw new AppError("Group not found", 404);

  if (patch.levelId && patch.levelId !== existing.levelId) {
    const level = await prisma.learningLevel.findUnique({
      where: { id: patch.levelId },
    });
    if (!level) throw new AppError("levelId not found", 400);
    const clash = await prisma.learningGroup.findUnique({
      where: {
        levelId_code: { levelId: patch.levelId, code: existing.code },
      },
    });
    if (clash) {
      throw new AppError(
        "A group with this code already exists on the target level",
        409
      );
    }
  }

  return prisma.learningGroup.update({
    where: { id },
    data: {
      ...(patch.levelId ? { levelId: patch.levelId } : {}),
      ...(patch.label !== undefined ? { label: patch.label.trim() } : {}),
      ...(patch.description !== undefined
        ? { description: patch.description?.trim() || null }
        : {}),
      ...(patch.sortOrder !== undefined ? { sortOrder: patch.sortOrder } : {}),
      ...(patch.isActive !== undefined ? { isActive: patch.isActive } : {}),
    },
  });
}

export async function deactivateGroup(id: string) {
  return updateGroup(id, { isActive: false });
}

export async function deleteGroup(id: string) {
  const existing = await prisma.learningGroup.findUnique({
    where: { id },
    include: { _count: { select: { categories: true } } },
  });
  if (!existing) throw new AppError("Group not found", 404);
  if (existing._count.categories > 0) {
    throw new AppError(
      "Group still has categories. Deactivate instead.",
      409,
      { code: "GROUP_IN_USE", suggest: "deactivate" }
    );
  }
  await prisma.learningGroup.delete({ where: { id } });
  return { id, deleted: true };
}

// ——— Categories ———

export async function listCategoriesAdmin(filters: {
  groupId?: string;
  levelId?: string;
  includeUnpublished?: boolean;
}) {
  return prisma.learningCategory.findMany({
    where: {
      ...(filters.groupId ? { groupId: filters.groupId } : {}),
      ...(filters.levelId ? { group: { levelId: filters.levelId } } : {}),
      ...(filters.includeUnpublished === false ? { isPublished: true } : {}),
    },
    orderBy: { sortOrder: "asc" },
    include: {
      group: {
        include: {
          level: {
            select: {
              id: true,
              code: true,
              label: true,
              grade: { select: { id: true, code: true, label: true } },
            },
          },
        },
      },
      _count: {
        select: {
          words: { where: { isActive: true } },
          lessons: true,
          sessions: true,
          progress: true,
          assignments: true,
        },
      },
    },
  });
}

export async function createCategory(input: {
  groupId: string;
  code: string;
  label: string;
  description?: string;
  emoji?: string;
  sortOrder?: number;
  unlockOrder?: number;
  isPublished?: boolean;
  /** When true, seed curated starter words + emoji for known themes. */
  fillStarters?: boolean;
}) {
  const code = assertCode(input.code, "category code");
  const label = input.label.trim();
  if (!label) throw new AppError("label is required", 400);

  const group = await prisma.learningGroup.findUnique({ where: { id: input.groupId } });
  if (!group) throw new AppError("groupId not found", 400);

  const pack = input.fillStarters
    ? resolveStarterPack(code, label)
    : null;

  const category = await prisma.learningCategory.create({
    data: {
      groupId: input.groupId,
      code,
      label,
      description: input.description?.trim() || null,
      emoji: input.emoji?.trim() || pack?.emoji || "📚",
      sortOrder: input.sortOrder ?? 0,
      unlockOrder: input.unlockOrder ?? 0,
      isPublished: input.isPublished ?? true,
    },
  });

  if (input.fillStarters) {
    // Only fill when a known theme matches — any custom name still creates fine.
    if (resolveStarterPack(code, label)) {
      const filled = await fillCategoryStarterWords(category.id);
      return { ...category, starterFill: filled };
    }
    return {
      ...category,
      starterFill: {
        categoryId: category.id,
        theme: null as string | null,
        created: 0,
        skipped: 0,
        totalInPack: 0,
        skippedReason: "NO_STARTER_PACK" as const,
      },
    };
  }

  return category;
}

/**
 * Add curated starter words (with emoji) for a category theme.
 * Skips words that already exist in the category. No Google images.
 */
export async function fillCategoryStarterWords(categoryId: string) {
  const category = await prisma.learningCategory.findUnique({
    where: { id: categoryId },
  });
  if (!category) throw new AppError("Category not found", 404);

  const pack = resolveStarterPack(category.code, category.label);
  if (!pack) {
    throw new AppError(
      "No starter pack for this category name. Use a theme like Family, Animals, Fruits, Colors, Body, School, Household, Food, Nature, or Action — or upload a CSV.",
      400,
      { code: "NO_STARTER_PACK" }
    );
  }

  let created = 0;
  let skipped = 0;
  let sortOrder = 0;
  for (const w of pack.words) {
    const text = w.text.trim().toLowerCase();
    const existing = await prisma.vocabularyWord.findUnique({
      where: {
        categoryId_text: { categoryId: category.id, text },
      },
    });
    if (existing) {
      skipped += 1;
      continue;
    }
    await prisma.vocabularyWord.create({
      data: {
        categoryId: category.id,
        text,
        meaning: w.meaning,
        emoji: w.emoji,
        phonetic: w.phonetic ?? null,
        firstLetter: text.slice(0, 1),
        difficulty: w.difficulty ?? 1,
        sortOrder: sortOrder++,
        isActive: true,
        origin: "LEGACY",
      },
    });
    created += 1;
  }

  if (pack.emoji && category.emoji === "📚") {
    await prisma.learningCategory.update({
      where: { id: category.id },
      data: { emoji: pack.emoji },
    });
  }

  return {
    categoryId: category.id,
    theme: pack.key,
    created,
    skipped,
    totalInPack: pack.words.length,
  };
}

export async function updateCategory(
  id: string,
  patch: {
    groupId?: string;
    label?: string;
    description?: string | null;
    emoji?: string;
    sortOrder?: number;
    unlockOrder?: number;
    isPublished?: boolean;
  }
) {
  const existing = await prisma.learningCategory.findUnique({ where: { id } });
  if (!existing) throw new AppError("Category not found", 404);

  if (patch.isPublished === true && !existing.isPublished) {
    await assertCategoryReadyToPublish(id);
  }

  if (patch.groupId && patch.groupId !== existing.groupId) {
    const group = await prisma.learningGroup.findUnique({
      where: { id: patch.groupId },
    });
    if (!group) throw new AppError("groupId not found", 400);
    const clash = await prisma.learningCategory.findUnique({
      where: {
        groupId_code: { groupId: patch.groupId, code: existing.code },
      },
    });
    if (clash) {
      throw new AppError(
        "A category with this code already exists in the target group",
        409
      );
    }
  }

  return prisma.learningCategory.update({
    where: { id },
    data: {
      ...(patch.groupId ? { groupId: patch.groupId } : {}),
      ...(patch.label !== undefined ? { label: patch.label.trim() } : {}),
      ...(patch.description !== undefined
        ? { description: patch.description?.trim() || null }
        : {}),
      ...(patch.emoji !== undefined ? { emoji: patch.emoji.trim() || "📚" } : {}),
      ...(patch.sortOrder !== undefined ? { sortOrder: patch.sortOrder } : {}),
      ...(patch.unlockOrder !== undefined ? { unlockOrder: patch.unlockOrder } : {}),
      ...(patch.isPublished !== undefined ? { isPublished: patch.isPublished } : {}),
    },
  });
}

export async function deactivateCategory(id: string) {
  return updateCategory(id, { isPublished: false });
}

export async function deleteCategory(id: string, opts?: { force?: boolean }) {
  const force = opts?.force === true;
  const existing = await prisma.learningCategory.findUnique({
    where: { id },
    include: {
      words: { select: { id: true } },
      _count: {
        select: {
          words: true,
          sessions: true,
          progress: true,
          assignments: true,
          vocabImports: true,
          lessons: true,
        },
      },
    },
  });
  if (!existing) throw new AppError("Category not found", 404);

  const used =
    existing._count.words +
    existing._count.sessions +
    existing._count.progress +
    existing._count.assignments +
    existing._count.vocabImports +
    existing._count.lessons;

  if (used > 0 && !force) {
    throw new AppError(
      `Category still has ${existing._count.words} word(s) or other links. Use force delete to remove the category and its words, or Unpublish to hide it.`,
      409,
      {
        code: "CATEGORY_IN_USE",
        suggest: "force",
        wordCount: existing._count.words,
      }
    );
  }

  const wordIds = existing.words.map((w) => w.id);

  await prisma.$transaction(async (tx) => {
    if (wordIds.length) {
      await tx.questionAttempt.deleteMany({ where: { wordId: { in: wordIds } } });
      await tx.lessonVocabItem.deleteMany({
        where: { vocabularyWordId: { in: wordIds } },
      });
      await tx.vocabProgrammeItem.deleteMany({
        where: { vocabularyWordId: { in: wordIds } },
      });
      await tx.vocabularyGradeAssignment.updateMany({
        where: { publishedWordId: { in: wordIds } },
        data: { publishedWordId: null },
      });
      await tx.vocabularyWord.deleteMany({ where: { categoryId: id } });
    }

    await tx.childCategoryProgress.deleteMany({ where: { categoryId: id } });
    await tx.learningSession.deleteMany({ where: { categoryId: id } });
    await tx.vocabularyGradeAssignment.deleteMany({ where: { categoryId: id } });
    await tx.vocabImportBatch.deleteMany({ where: { categoryId: id } });
    await tx.lesson.updateMany({
      where: { learningCategoryId: id },
      data: { learningCategoryId: null },
    });

    await tx.learningCategory.delete({ where: { id } });
  });

  return {
    id,
    deleted: true,
    forced: force,
    wordsRemoved: wordIds.length,
  };
}
