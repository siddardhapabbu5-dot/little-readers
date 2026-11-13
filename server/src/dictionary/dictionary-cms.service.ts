import { AppError } from "../lib/errors.js";
import { prisma } from "../lib/prisma.js";
import { sanitizeText, sanitizeWord, assertWordQuality } from "../vocab-import/file-security.js";

const TOPIC_SOFT_TARGET = 20;

function normalizeHeadword(raw: string) {
  return sanitizeWord(raw).toLowerCase();
}

export async function searchDictionaryEntries(opts: {
  q?: string;
  take?: number;
}) {
  const take = Math.min(opts.take ?? 50, 200);
  const q = opts.q?.trim();
  return prisma.dictionaryEntry.findMany({
    where: q
      ? {
          OR: [
            { headword: { contains: q, mode: "insensitive" } },
            { normalizedHeadword: { contains: q.toLowerCase() } },
          ],
        }
      : undefined,
    orderBy: { headword: "asc" },
    take,
    include: {
      senses: {
        orderBy: { senseIndex: "asc" },
        include: {
          _count: { select: { assignments: true } },
        },
      },
      _count: { select: { senses: true } },
    },
  });
}

export async function getDictionaryEntry(id: string) {
  const entry = await prisma.dictionaryEntry.findUnique({
    where: { id },
    include: {
      senses: {
        orderBy: { senseIndex: "asc" },
        include: {
          assignments: {
            include: {
              grade: { select: { id: true, code: true, label: true } },
              category: { select: { id: true, code: true, label: true } },
              level: { select: { id: true, code: true, label: true } },
            },
          },
        },
      },
    },
  });
  if (!entry) throw new AppError("Dictionary entry not found", 404);
  return entry;
}

export async function createDictionaryEntry(input: {
  headword: string;
  pronunciation?: string;
  audioUrl?: string;
  sourceName?: string;
  licence?: string;
  definition: string;
  wordType?: string;
  example?: string;
}) {
  const headword = sanitizeWord(input.headword);
  const definition = sanitizeText(input.definition);
  if (!headword) throw new AppError("Word is required", 400);
  if (!definition) throw new AppError("Meaning is required", 400);
  assertWordQuality(headword, definition);

  const normalizedHeadword = normalizeHeadword(headword);
  const existing = await prisma.dictionaryEntry.findUnique({
    where: { normalizedHeadword },
  });
  if (existing) {
    throw new AppError(
      `Duplicate headword "${headword}" already exists in the central dictionary`,
      409
    );
  }

  return prisma.dictionaryEntry.create({
    data: {
      headword,
      normalizedHeadword,
      pronunciation: input.pronunciation
        ? sanitizeText(input.pronunciation)
        : null,
      audioUrl: input.audioUrl ? sanitizeText(input.audioUrl) : null,
      sourceName: input.sourceName ? sanitizeText(input.sourceName) : null,
      licence: input.licence ? sanitizeText(input.licence) : null,
      senses: {
        create: {
          senseIndex: 0,
          definition,
          wordType: input.wordType ? sanitizeText(input.wordType) : null,
          examplesJson: input.example
            ? JSON.stringify([sanitizeText(input.example)])
            : null,
        },
      },
    },
    include: { senses: true },
  });
}

export async function updateDictionaryEntry(
  id: string,
  patch: {
    headword?: string;
    pronunciation?: string | null;
    audioUrl?: string | null;
    sourceName?: string | null;
    licence?: string | null;
  }
) {
  const existing = await prisma.dictionaryEntry.findUnique({ where: { id } });
  if (!existing) throw new AppError("Dictionary entry not found", 404);

  let normalizedHeadword = existing.normalizedHeadword;
  let headword = existing.headword;
  if (patch.headword != null) {
    headword = sanitizeWord(patch.headword);
    if (!headword) throw new AppError("Word is required", 400);
    normalizedHeadword = normalizeHeadword(headword);
    if (normalizedHeadword !== existing.normalizedHeadword) {
      const clash = await prisma.dictionaryEntry.findUnique({
        where: { normalizedHeadword },
      });
      if (clash) throw new AppError(`Duplicate headword "${headword}"`, 409);
    }
  }

  return prisma.dictionaryEntry.update({
    where: { id },
    data: {
      headword,
      normalizedHeadword,
      ...(patch.pronunciation !== undefined
        ? {
            pronunciation: patch.pronunciation
              ? sanitizeText(patch.pronunciation)
              : null,
          }
        : {}),
      ...(patch.audioUrl !== undefined
        ? { audioUrl: patch.audioUrl ? sanitizeText(patch.audioUrl) : null }
        : {}),
      ...(patch.sourceName !== undefined
        ? {
            sourceName: patch.sourceName
              ? sanitizeText(patch.sourceName)
              : null,
          }
        : {}),
      ...(patch.licence !== undefined
        ? { licence: patch.licence ? sanitizeText(patch.licence) : null }
        : {}),
    },
    include: { senses: { orderBy: { senseIndex: "asc" } } },
  });
}

export async function deleteDictionaryEntry(id: string) {
  const entry = await prisma.dictionaryEntry.findUnique({
    where: { id },
    include: {
      senses: {
        include: {
          assignments: { select: { status: true } },
        },
      },
    },
  });
  if (!entry) throw new AppError("Dictionary entry not found", 404);

  const published = entry.senses.some((s) =>
    s.assignments.some((a) => a.status === "PUBLISHED")
  );
  if (published) {
    throw new AppError(
      "Cannot delete an entry with PUBLISHED assignments — unpublish first",
      400
    );
  }

  await prisma.dictionaryEntry.delete({ where: { id } });
  return { deleted: true, id };
}

export async function addDictionarySense(
  entryId: string,
  input: {
    definition: string;
    wordType?: string;
    example?: string;
  }
) {
  const entry = await prisma.dictionaryEntry.findUnique({
    where: { id: entryId },
    include: { senses: { select: { senseIndex: true, definition: true } } },
  });
  if (!entry) throw new AppError("Dictionary entry not found", 404);

  const definition = sanitizeText(input.definition);
  if (!definition) throw new AppError("Meaning is required", 400);
  assertWordQuality(entry.headword, definition);

  const dup = entry.senses.some(
    (s) => s.definition.toLowerCase() === definition.toLowerCase()
  );
  if (dup) throw new AppError("Duplicate sense definition on this entry", 409);

  const nextIndex =
    entry.senses.reduce((m, s) => Math.max(m, s.senseIndex), -1) + 1;

  return prisma.dictionarySense.create({
    data: {
      entryId,
      senseIndex: nextIndex,
      definition,
      wordType: input.wordType ? sanitizeText(input.wordType) : null,
      examplesJson: input.example
        ? JSON.stringify([sanitizeText(input.example)])
        : null,
    },
  });
}

export async function updateDictionarySense(
  senseId: string,
  patch: {
    definition?: string;
    wordType?: string | null;
    example?: string | null;
  }
) {
  const sense = await prisma.dictionarySense.findUnique({
    where: { id: senseId },
    include: { entry: true },
  });
  if (!sense) throw new AppError("Dictionary sense not found", 404);

  const definition =
    patch.definition != null
      ? sanitizeText(patch.definition)
      : sense.definition;
  if (!definition) throw new AppError("Meaning is required", 400);
  if (patch.definition != null) {
    assertWordQuality(sense.entry.headword, definition);
  }

  return prisma.dictionarySense.update({
    where: { id: senseId },
    data: {
      definition,
      ...(patch.wordType !== undefined
        ? { wordType: patch.wordType ? sanitizeText(patch.wordType) : null }
        : {}),
      ...(patch.example !== undefined
        ? {
            examplesJson: patch.example
              ? JSON.stringify([sanitizeText(patch.example)])
              : null,
          }
        : {}),
    },
  });
}

export async function createDraftAssignment(input: {
  senseId: string;
  gradeId: string;
  levelId: string;
  categoryId: string;
  meaningOverride?: string;
  exampleOverride?: string;
  difficultyOverride?: number;
}) {
  const sense = await prisma.dictionarySense.findUnique({
    where: { id: input.senseId },
  });
  if (!sense) throw new AppError("Dictionary sense not found", 404);

  if (input.meaningOverride) {
    assertWordQuality("word", sanitizeText(input.meaningOverride));
  }

  try {
    return await prisma.vocabularyGradeAssignment.create({
      data: {
        senseId: input.senseId,
        gradeId: input.gradeId,
        levelId: input.levelId,
        categoryId: input.categoryId,
        status: "DRAFT",
        difficultyScore: 0,
        confidenceScore: 0,
        explanation: "Manual draft assignment (not classified)",
        classificationVersion: "manual-draft",
        meaningOverride: input.meaningOverride
          ? sanitizeText(input.meaningOverride)
          : null,
        exampleOverride: input.exampleOverride
          ? sanitizeText(input.exampleOverride)
          : null,
        difficultyOverride: input.difficultyOverride ?? null,
      },
      include: {
        sense: { include: { entry: true } },
        grade: true,
        category: true,
      },
    });
  } catch {
    throw new AppError(
      "Assignment already exists for this sense + grade + category",
      409
    );
  }
}

export async function getDictionaryDashboard(filters: {
  gradeId?: string;
  categoryId?: string;
  status?: string;
}) {
  const grades = await prisma.learningGrade.findMany({
    orderBy: { sortOrder: "asc" },
  });

  const gradeStats = [];
  for (const grade of grades) {
    if (filters.gradeId && grade.id !== filters.gradeId) continue;

    const level = await prisma.learningLevel.findFirst({
      where: { gradeId: grade.id },
      include: {
        groups: {
          include: {
            categories: {
              where: filters.categoryId
                ? { id: filters.categoryId }
                : undefined,
              include: {
                _count: {
                  select: {
                    words: { where: { isActive: true } },
                  },
                },
              },
            },
          },
        },
      },
    });

    const topics = level?.groups.flatMap((g) => g.categories) ?? [];
    const assignmentWhere = {
      gradeId: grade.id,
      ...(filters.categoryId ? { categoryId: filters.categoryId } : {}),
      ...(filters.status
        ? { status: filters.status as never }
        : {}),
    };

    const [assigned, draft, pending, approved, published, unpublished] =
      await Promise.all([
        prisma.vocabularyGradeAssignment.count({ where: { gradeId: grade.id, ...(filters.categoryId ? { categoryId: filters.categoryId } : {}) } }),
        prisma.vocabularyGradeAssignment.count({ where: { ...assignmentWhere, status: "DRAFT" } }),
        prisma.vocabularyGradeAssignment.count({ where: { ...assignmentWhere, status: "PENDING" } }),
        prisma.vocabularyGradeAssignment.count({ where: { ...assignmentWhere, status: "APPROVED" } }),
        prisma.vocabularyGradeAssignment.count({ where: { ...assignmentWhere, status: "PUBLISHED" } }),
        prisma.vocabularyGradeAssignment.count({ where: { ...assignmentWhere, status: "UNPUBLISHED" } }),
      ]);

    // When filtering by status alone, the status-specific counts still use that filter;
    // for the overview cards without status filter, use unfiltered per-status counts.
    const useFilteredStatus = Boolean(filters.status);

    gradeStats.push({
      grade: {
        id: grade.id,
        code: grade.code,
        label: grade.label,
        ageMin: grade.ageMin,
        ageMax: grade.ageMax,
      },
      assigned,
      draft: useFilteredStatus && filters.status !== "DRAFT" ? 0 : draft,
      pending: useFilteredStatus && filters.status !== "PENDING" ? 0 : pending,
      approved: useFilteredStatus && filters.status !== "APPROVED" ? 0 : approved,
      published: useFilteredStatus && filters.status !== "PUBLISHED" ? 0 : published,
      unpublished:
        useFilteredStatus && filters.status !== "UNPUBLISHED" ? 0 : unpublished,
      topicCount: topics.length,
      insufficientTopics: topics
        .filter((t) => t._count.words < TOPIC_SOFT_TARGET)
        .map((t) => ({
          id: t.id,
          code: t.code,
          label: t.label,
          activeWordCount: t._count.words,
          softTarget: TOPIC_SOFT_TARGET,
        })),
    });
  }

  return {
    softTargetPerTopic: TOPIC_SOFT_TARGET,
    grades: gradeStats,
  };
}

export async function buildGradeVocabularyExportRows(gradeId: string) {
  const grade = await prisma.learningGrade.findUnique({ where: { id: gradeId } });
  if (!grade) throw new AppError("Grade not found", 404);

  const assignments = await prisma.vocabularyGradeAssignment.findMany({
    where: { gradeId },
    include: {
      sense: { include: { entry: true } },
      category: { select: { code: true, label: true } },
      level: { select: { code: true, label: true } },
      publishedWord: true,
    },
    orderBy: [{ status: "asc" }, { createdAt: "asc" }],
  });

  return {
    grade,
    rows: assignments.map((a) => ({
      headword: a.sense.entry.headword,
      centralMeaning: a.sense.definition,
      publishedMeaning: a.publishedWord?.meaning ?? "",
      meaningOverride: a.meaningOverride ?? "",
      exampleOverride: a.exampleOverride ?? "",
      exampleSentence: a.publishedWord?.exampleSentence ?? "",
      pos: a.sense.wordType ?? "",
      pronunciation: a.sense.entry.pronunciation ?? "",
      grade: grade.code,
      level: a.level.code,
      category: a.category.code,
      categoryLabel: a.category.label,
      status: a.status,
      wordActive: a.publishedWord?.isActive ?? false,
    })),
  };
}

export async function listPublishEvents(assignmentId?: string, take = 50) {
  return prisma.dictionaryPublishEvent.findMany({
    where: assignmentId ? { assignmentId } : undefined,
    orderBy: { createdAt: "desc" },
    take: Math.min(take, 200),
    include: {
      actor: { select: { id: true, email: true, name: true } },
      assignment: {
        select: {
          id: true,
          status: true,
          sense: {
            select: {
              definition: true,
              entry: { select: { headword: true } },
            },
          },
        },
      },
    },
  });
}
