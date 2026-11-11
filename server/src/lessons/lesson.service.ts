import type { PublishStatus } from "@prisma/client";
import { AppError } from "../lib/errors.js";
import { prisma } from "../lib/prisma.js";
import { assertChildGradeAccess, effectiveLevelForChild } from "../learning/grade-access.js";

const ALLOWED_ACTIVITIES = new Set(["LISTEN", "SPELL"]);

export type LessonListFilters = {
  q?: string;
  gradeId?: string;
  levelId?: string;
  groupId?: string;
  learningCategoryId?: string;
  status?: PublishStatus;
  isPublished?: boolean;
  isActive?: boolean;
  take?: number;
  skip?: number;
};

function parseActivities(raw: string | string[] | undefined): string[] {
  if (Array.isArray(raw)) {
    const cleaned = raw.map((a) => String(a).toUpperCase()).filter((a) => ALLOWED_ACTIVITIES.has(a));
    return cleaned.length ? [...new Set(cleaned)] : ["LISTEN", "SPELL"];
  }
  if (!raw) return ["LISTEN", "SPELL"];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (Array.isArray(parsed)) return parseActivities(parsed as string[]);
  } catch {
    /* ignore */
  }
  return ["LISTEN", "SPELL"];
}

function activitiesToJson(activities?: string[]) {
  return JSON.stringify(parseActivities(activities));
}

async function assertPlacement(input: {
  gradeId?: string | null;
  levelId?: string | null;
  groupId?: string | null;
  learningCategoryId?: string | null;
}) {
  let gradeId = input.gradeId ?? null;
  let levelId = input.levelId ?? null;
  let groupId = input.groupId ?? null;
  let learningCategoryId = input.learningCategoryId ?? null;
  let categoryLabel: string | null = null;

  if (learningCategoryId) {
    const cat = await prisma.learningCategory.findUnique({
      where: { id: learningCategoryId },
      include: {
        group: { include: { level: { include: { grade: true } } } },
      },
    });
    if (!cat) throw new AppError("learningCategoryId not found", 400);
    categoryLabel = cat.label;
    groupId = cat.groupId;
    levelId = cat.group.levelId;
    gradeId = cat.group.level.gradeId;
    if (input.groupId && input.groupId !== groupId) {
      throw new AppError("Category does not belong to the given group", 400);
    }
    if (input.levelId && input.levelId !== levelId) {
      throw new AppError("Category does not belong to the given level", 400);
    }
    if (input.gradeId && gradeId && input.gradeId !== gradeId) {
      throw new AppError("Category does not belong to the given grade", 400);
    }
  } else if (groupId) {
    const group = await prisma.learningGroup.findUnique({
      where: { id: groupId },
      include: { level: true },
    });
    if (!group) throw new AppError("groupId not found", 400);
    levelId = group.levelId;
    gradeId = group.level.gradeId;
    if (input.levelId && input.levelId !== levelId) {
      throw new AppError("Group does not belong to the given level", 400);
    }
    if (input.gradeId && gradeId && input.gradeId !== gradeId) {
      throw new AppError("Group does not belong to the given grade", 400);
    }
  } else if (levelId) {
    const level = await prisma.learningLevel.findUnique({ where: { id: levelId } });
    if (!level) throw new AppError("levelId not found", 400);
    gradeId = level.gradeId;
    if (input.gradeId && gradeId && input.gradeId !== gradeId) {
      throw new AppError("Level does not belong to the given grade", 400);
    }
  } else if (gradeId) {
    const grade = await prisma.learningGrade.findUnique({ where: { id: gradeId } });
    if (!grade) throw new AppError("gradeId not found", 400);
  }

  return { gradeId, levelId, groupId, learningCategoryId, categoryLabel };
}

const lessonInclude = {
  grade: { select: { id: true, code: true, label: true } },
  level: { select: { id: true, code: true, label: true } },
  group: { select: { id: true, code: true, label: true } },
  learningCategory: {
    select: { id: true, code: true, label: true, emoji: true },
  },
  vocabItems: {
    orderBy: { sortOrder: "asc" as const },
    include: {
      vocabularyWord: {
        select: {
          id: true,
          text: true,
          meaning: true,
          emoji: true,
          phonetic: true,
          isActive: true,
          origin: true,
          categoryId: true,
          publishedFrom: {
            select: { status: true },
            take: 5,
          },
        },
      },
    },
  },
  _count: {
    select: {
      sessions: true,
      childProgress: true,
      vocabItems: true,
    },
  },
};

export async function listAdminLessons(filters: LessonListFilters) {
  const take = Math.min(filters.take ?? 100, 500);
  const skip = Math.max(filters.skip ?? 0, 0);
  const q = filters.q?.trim();

  const where = {
    ...(filters.gradeId ? { gradeId: filters.gradeId } : {}),
    ...(filters.levelId ? { levelId: filters.levelId } : {}),
    ...(filters.groupId ? { groupId: filters.groupId } : {}),
    ...(filters.learningCategoryId
      ? { learningCategoryId: filters.learningCategoryId }
      : {}),
    ...(filters.status ? { status: filters.status } : {}),
    ...(filters.isPublished === undefined
      ? {}
      : { isPublished: filters.isPublished }),
    ...(filters.isActive === undefined ? {} : { isActive: filters.isActive }),
    ...(q
      ? {
          OR: [
            { title: { contains: q, mode: "insensitive" as const } },
            { description: { contains: q, mode: "insensitive" as const } },
            { category: { contains: q, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };

  const [total, lessons] = await Promise.all([
    prisma.lesson.count({ where }),
    prisma.lesson.findMany({
      where,
      orderBy: [{ sortOrder: "asc" }, { title: "asc" }],
      take,
      skip,
      include: lessonInclude,
    }),
  ]);

  return {
    total,
    take,
    skip,
    lessons: lessons.map(serializeLesson),
  };
}

export async function getAdminLesson(id: string) {
  const lesson = await prisma.lesson.findUnique({
    where: { id },
    include: lessonInclude,
  });
  if (!lesson) throw new AppError("Lesson not found", 404);
  return serializeLesson(lesson);
}

function serializeLesson<T extends { activitiesJson: string }>(lesson: T) {
  return {
    ...lesson,
    activities: parseActivities(lesson.activitiesJson),
  };
}

export async function createAdminLesson(input: {
  title: string;
  description?: string;
  instructions?: string;
  gradeId?: string;
  levelId?: string;
  groupId?: string;
  learningCategoryId?: string;
  difficulty?: number;
  sortOrder?: number;
  activities?: string[];
  category?: string;
}) {
  const title = input.title.trim();
  if (!title) throw new AppError("title is required", 400);

  const placement = await assertPlacement(input);
  const category =
    input.category?.trim() ||
    placement.categoryLabel ||
    "General";

  const lesson = await prisma.lesson.create({
    data: {
      title,
      description: input.description?.trim() || null,
      instructions: input.instructions?.trim() || null,
      category,
      gradeId: placement.gradeId,
      levelId: placement.levelId,
      groupId: placement.groupId,
      learningCategoryId: placement.learningCategoryId,
      difficulty: Math.min(5, Math.max(1, input.difficulty ?? 1)),
      sortOrder: input.sortOrder ?? 0,
      activitiesJson: activitiesToJson(input.activities),
      status: "DRAFT",
      isPublished: false,
      isActive: true,
    },
    include: lessonInclude,
  });
  return serializeLesson(lesson);
}

export async function updateAdminLesson(
  id: string,
  patch: {
    title?: string;
    description?: string | null;
    instructions?: string | null;
    gradeId?: string | null;
    levelId?: string | null;
    groupId?: string | null;
    learningCategoryId?: string | null;
    difficulty?: number;
    sortOrder?: number;
    activities?: string[];
    category?: string;
    isActive?: boolean;
  }
) {
  const existing = await prisma.lesson.findUnique({ where: { id } });
  if (!existing) throw new AppError("Lesson not found", 404);

  const placement = await assertPlacement({
    gradeId:
      patch.gradeId !== undefined ? patch.gradeId : existing.gradeId,
    levelId:
      patch.levelId !== undefined ? patch.levelId : existing.levelId,
    groupId:
      patch.groupId !== undefined ? patch.groupId : existing.groupId,
    learningCategoryId:
      patch.learningCategoryId !== undefined
        ? patch.learningCategoryId
        : existing.learningCategoryId,
  });

  const lesson = await prisma.lesson.update({
    where: { id },
    data: {
      ...(patch.title !== undefined ? { title: patch.title.trim() } : {}),
      ...(patch.description !== undefined
        ? { description: patch.description?.trim() || null }
        : {}),
      ...(patch.instructions !== undefined
        ? { instructions: patch.instructions?.trim() || null }
        : {}),
      ...(patch.category !== undefined
        ? { category: patch.category.trim() || existing.category }
        : placement.categoryLabel
          ? { category: placement.categoryLabel }
          : {}),
      gradeId: placement.gradeId,
      levelId: placement.levelId,
      groupId: placement.groupId,
      learningCategoryId: placement.learningCategoryId,
      ...(patch.difficulty !== undefined
        ? { difficulty: Math.min(5, Math.max(1, patch.difficulty)) }
        : {}),
      ...(patch.sortOrder !== undefined ? { sortOrder: patch.sortOrder } : {}),
      ...(patch.activities !== undefined
        ? { activitiesJson: activitiesToJson(patch.activities) }
        : {}),
      ...(patch.isActive !== undefined ? { isActive: patch.isActive } : {}),
    },
    include: lessonInclude,
  });
  return serializeLesson(lesson);
}

export async function deactivateAdminLesson(id: string) {
  const existing = await prisma.lesson.findUnique({ where: { id } });
  if (!existing) throw new AppError("Lesson not found", 404);
  const lesson = await prisma.lesson.update({
    where: { id },
    data: {
      isActive: false,
      isPublished: false,
      status: existing.status === "PUBLISHED" ? "ARCHIVED" : existing.status,
    },
    include: lessonInclude,
  });
  return serializeLesson(lesson);
}

/** Word is eligible for a published lesson: active + not rejected-only dictionary. */
export async function assertWordPublishable(
  vocabularyWordId: string,
  learningCategoryId?: string | null
) {
  const word = await prisma.vocabularyWord.findUnique({
    where: { id: vocabularyWordId },
    include: {
      publishedFrom: { select: { status: true } },
    },
  });
  if (!word) throw new AppError(`Word ${vocabularyWordId} not found`, 400);
  if (!word.isActive) {
    throw new AppError(`Word "${word.text}" is inactive`, 400);
  }
  if (learningCategoryId && word.categoryId !== learningCategoryId) {
    throw new AppError(
      `Word "${word.text}" does not belong to the lesson category`,
      400
    );
  }
  if (word.origin === "DICTIONARY" && word.publishedFrom.length) {
    const hasPublished = word.publishedFrom.some((a) => a.status === "PUBLISHED");
    const onlyRejected = word.publishedFrom.every((a) => a.status === "REJECTED");
    if (onlyRejected || !hasPublished) {
      throw new AppError(
        `Word "${word.text}" is not an approved published dictionary word`,
        400
      );
    }
  }
  return word;
}

export async function setLessonWords(lessonId: string, vocabularyWordIds: string[]) {
  const lesson = await prisma.lesson.findUnique({ where: { id: lessonId } });
  if (!lesson) throw new AppError("Lesson not found", 404);

  const unique = [...new Set(vocabularyWordIds)];
  if (unique.length !== vocabularyWordIds.length) {
    throw new AppError("Duplicate vocabulary words are not allowed in a lesson", 400);
  }

  for (const id of unique) {
    const word = await prisma.vocabularyWord.findUnique({ where: { id } });
    if (!word) throw new AppError(`Word ${id} not found`, 400);
    if (!word.isActive) {
      throw new AppError(`Word "${word.text}" is inactive and cannot be added`, 400);
    }
    if (
      lesson.learningCategoryId &&
      word.categoryId !== lesson.learningCategoryId
    ) {
      throw new AppError(
        `Word "${word.text}" must belong to the lesson's learning category`,
        400
      );
    }
    if (lesson.isPublished) {
      await assertWordPublishable(id, lesson.learningCategoryId);
    }
  }

  await prisma.$transaction(async (tx) => {
    await tx.lessonVocabItem.deleteMany({ where: { lessonId } });
    if (unique.length) {
      await tx.lessonVocabItem.createMany({
        data: unique.map((vocabularyWordId, index) => ({
          lessonId,
          vocabularyWordId,
          sortOrder: index + 1,
        })),
      });
    }
  });

  return getAdminLesson(lessonId);
}

export async function removeLessonWord(lessonId: string, vocabularyWordId: string) {
  const existing = await prisma.lessonVocabItem.findUnique({
    where: {
      lessonId_vocabularyWordId: { lessonId, vocabularyWordId },
    },
  });
  if (!existing) throw new AppError("Lesson word link not found", 404);
  await prisma.lessonVocabItem.delete({ where: { id: existing.id } });
  // Does not delete or modify VocabularyWord
  return getAdminLesson(lessonId);
}

export async function publishLesson(id: string) {
  const lesson = await prisma.lesson.findUnique({
    where: { id },
    include: { vocabItems: true },
  });
  if (!lesson) throw new AppError("Lesson not found", 404);
  if (!lesson.isActive) throw new AppError("Cannot publish an inactive lesson", 400);
  if (!lesson.vocabItems.length) {
    throw new AppError("Cannot publish a lesson with no vocabulary words", 400);
  }
  for (const item of lesson.vocabItems) {
    await assertWordPublishable(item.vocabularyWordId, lesson.learningCategoryId);
  }
  if (!parseActivities(lesson.activitiesJson).length) {
    throw new AppError("Lesson needs at least one supported activity (LISTEN/SPELL)", 400);
  }

  const updated = await prisma.lesson.update({
    where: { id },
    data: { status: "PUBLISHED", isPublished: true },
    include: lessonInclude,
  });
  return serializeLesson(updated);
}

export async function unpublishLesson(id: string) {
  const existing = await prisma.lesson.findUnique({ where: { id } });
  if (!existing) throw new AppError("Lesson not found", 404);
  const updated = await prisma.lesson.update({
    where: { id },
    data: { status: "DRAFT", isPublished: false },
    include: lessonInclude,
  });
  return serializeLesson(updated);
}

export async function previewLesson(id: string) {
  const lesson = await getAdminLesson(id);
  return {
    id: lesson.id,
    title: lesson.title,
    description: lesson.description,
    instructions: lesson.instructions,
    activities: lesson.activities,
    isPublished: lesson.isPublished,
    isActive: lesson.isActive,
    placement: {
      grade: lesson.grade,
      level: lesson.level,
      group: lesson.group,
      learningCategory: lesson.learningCategory,
    },
    words: lesson.vocabItems.map((v) => ({
      id: v.vocabularyWord.id,
      text: v.vocabularyWord.text,
      meaning: v.vocabularyWord.meaning,
      emoji: v.vocabularyWord.emoji,
      phonetic: v.vocabularyWord.phonetic,
      isActive: v.vocabularyWord.isActive,
      sortOrder: v.sortOrder,
    })),
    wordCount: lesson.vocabItems.length,
  };
}

/** Published lessons for a child (parent-owned), filtered by placement. */
export async function listPublishedLessonsForChild(
  parentId: string,
  childId: string,
  role?: string
) {
  const child =
    role === "ADMIN" || role === "SUPER_ADMIN"
      ? await prisma.child.findFirst({
          where: { id: childId, isActive: true },
          include: { level: { include: { grade: true } } },
        })
      : await prisma.child.findFirst({
          where: { id: childId, parentId, isActive: true },
          include: { level: { include: { grade: true } } },
        });
  if (!child) throw new AppError("Child not found", 404);
  if (role !== "ADMIN" && role !== "SUPER_ADMIN") {
    await assertChildGradeAccess(parentId, childId);
  }

  const level = await effectiveLevelForChild(childId);
  const levelId = level.id;
  const gradeId =
    (await prisma.learningLevel.findUnique({ where: { id: levelId }, select: { gradeId: true } }))
      ?.gradeId ?? null;

  // Visible only within the child's Learn Wise grade: placed on its level/grade/category,
  // or unscoped lessons whose words all belong to that grade.
  const candidates = await prisma.lesson.findMany({
    where: {
      isPublished: true,
      isActive: true,
      status: "PUBLISHED",
      OR: [
        {
          gradeId: null,
          levelId: null,
          groupId: null,
          learningCategoryId: null,
        },
        ...(gradeId ? [{ gradeId }] : []),
        ...(levelId ? [{ levelId }, { group: { levelId } }] : []),
        ...(levelId
          ? [{ learningCategory: { group: { levelId } } }]
          : []),
        ...(gradeId
          ? [{ learningCategory: { group: { level: { gradeId } } } }]
          : []),
      ],
    },
    orderBy: [{ sortOrder: "asc" }, { title: "asc" }],
    include: {
      ...lessonInclude,
      childProgress: { where: { childId } },
      sessions: {
        where: { childId, status: "IN_PROGRESS" },
        orderBy: { startedAt: "desc" },
        take: 1,
        select: { id: true, startedAt: true },
      },
    },
  });

  const unscopedIds = candidates
    .filter((l) => !l.gradeId && !l.levelId && !l.groupId && !l.learningCategoryId)
    .map((l) => l.id);
  const unscopedLevels = new Map<string, Set<string>>();
  if (unscopedIds.length) {
    const items = await prisma.lessonVocabItem.findMany({
      where: { lessonId: { in: unscopedIds }, vocabularyWord: { isActive: true } },
      select: {
        lessonId: true,
        vocabularyWord: { select: { category: { select: { group: { select: { levelId: true } } } } } },
      },
    });
    for (const item of items) {
      const set = unscopedLevels.get(item.lessonId) ?? new Set<string>();
      set.add(item.vocabularyWord.category.group.levelId);
      unscopedLevels.set(item.lessonId, set);
    }
  }
  const lessons = candidates.filter((l) => {
    if (!unscopedIds.includes(l.id)) return true;
    const levels = unscopedLevels.get(l.id);
    return Boolean(levels && levels.size === 1 && levels.has(levelId));
  });

  return lessons.map((l) => {
    const progress = l.childProgress[0] ?? null;
    const activeSessionId = l.sessions[0]?.id ?? null;
    const playStatus = progress?.completed
      ? ("COMPLETED" as const)
      : activeSessionId
        ? ("IN_PROGRESS" as const)
        : ("NOT_STARTED" as const);
    return {
      ...serializeLesson(l),
      progress,
      activeSessionId,
      playStatus,
      wordCount: l.vocabItems?.length ?? l._count?.vocabItems ?? 0,
      activities: parseActivities(l.activitiesJson).filter(
        (a) => a === "LISTEN" || a === "SPELL"
      ),
    };
  });
}

export async function getPublishedLessonForChild(
  parentId: string,
  lessonId: string,
  childId: string,
  role?: string
) {
  const list = await listPublishedLessonsForChild(parentId, childId, role);
  const lesson = list.find((l) => l.id === lessonId);
  if (!lesson) throw new AppError("Lesson not found", 404);
  return lesson;
}
