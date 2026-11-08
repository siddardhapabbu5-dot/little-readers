import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { VocabAssignmentStatus } from "@prisma/client";
import { AppError } from "../lib/errors.js";
import { prisma } from "../lib/prisma.js";
import {
  assertAllowedExtension,
  detectFileKind,
  hashFile,
  MAX_VOCAB_UPLOAD_BYTES,
  sanitizeText,
  assertWordQuality,
} from "../vocab-import/file-security.js";
import {
  CLASSIFICATION_VERSION,
  classifySense,
  type CategoryHint,
  type GradeCode,
} from "./classify.js";
import { parseDictionaryFile } from "./dictionary-parse.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const STORAGE_ROOT = path.resolve(__dirname, "../../storage/dictionary-uploads");

const GRADE_LEVEL: Record<GradeCode, string> = {
  GRADE_1: "LEVEL_1",
  GRADE_2: "LEVEL_2",
  GRADE_3: "LEVEL_3",
  GRADE_4: "LEVEL_4",
};

/**
 * Sync grade/level rows. By default does NOT create missing grades (so wiping
 * GRADE_2–4 for a client DB is not undone by Classify / list-grades).
 * Tests that need the full ladder: ensureFourGrades({ createMissing: true }).
 */
export async function ensureFourGrades(opts?: { createMissing?: boolean }) {
  const createMissing = opts?.createMissing === true;
  const defs = [
    { code: "GRADE_1", label: "Grade 1", ageMin: 1, ageMax: 3, sortOrder: 1, level: "LEVEL_1" },
    { code: "GRADE_2", label: "Grade 2", ageMin: 4, ageMax: 6, sortOrder: 2, level: "LEVEL_2" },
    { code: "GRADE_3", label: "Grade 3", ageMin: 7, ageMax: 9, sortOrder: 3, level: "LEVEL_3" },
    { code: "GRADE_4", label: "Grade 4", ageMin: 10, ageMax: 12, sortOrder: 4, level: "LEVEL_4" },
  ] as const;

  for (const def of defs) {
    const existing = await prisma.learningGrade.findUnique({
      where: { code: def.code },
    });
    if (!existing && !createMissing) continue;

    const grade = existing
      ? await prisma.learningGrade.update({
          where: { id: existing.id },
          data: {
            label: def.label,
            ageMin: def.ageMin,
            ageMax: def.ageMax,
            sortOrder: def.sortOrder,
          },
        })
      : await prisma.learningGrade.create({
          data: {
            code: def.code,
            label: def.label,
            ageMin: def.ageMin,
            ageMax: def.ageMax,
            sortOrder: def.sortOrder,
          },
        });

    await prisma.learningLevel.upsert({
      where: { code: def.level },
      update: {
        gradeId: grade.id,
        ageMin: def.ageMin,
        ageMax: def.ageMax,
        kind: "GRADE_BAND",
        label: `Level ${def.sortOrder} – Ages ${def.ageMin}–${def.ageMax} (${def.label})`,
      },
      create: {
        code: def.level,
        label: `Level ${def.sortOrder} – Ages ${def.ageMin}–${def.ageMax} (${def.label})`,
        sortOrder: def.sortOrder - 1,
        ageMin: def.ageMin,
        ageMax: def.ageMax,
        kind: "GRADE_BAND",
        gradeId: grade.id,
      },
    });
  }
}

async function loadCategoryHints(): Promise<Record<GradeCode, CategoryHint[]>> {
  // Do not recreate wiped grades here.
  const levels = await prisma.learningLevel.findMany({
    where: { code: { in: Object.values(GRADE_LEVEL) } },
    include: {
      grade: true,
      groups: {
        include: {
          categories: { where: { isPublished: true }, orderBy: { sortOrder: "asc" } },
        },
      },
    },
  });

  const out: Record<GradeCode, CategoryHint[]> = {
    GRADE_1: [],
    GRADE_2: [],
    GRADE_3: [],
    GRADE_4: [],
  };

  for (const level of levels) {
    const gradeCode = (level.grade?.code ?? Object.entries(GRADE_LEVEL).find(([, c]) => c === level.code)?.[0]) as
      | GradeCode
      | undefined;
    if (!gradeCode || !level.gradeId) continue;
    for (const group of level.groups) {
      for (const cat of group.categories) {
        out[gradeCode].push({
          id: cat.id,
          code: cat.code,
          label: cat.label,
          gradeCode,
          gradeId: level.gradeId,
          levelId: level.id,
        });
      }
    }
  }
  return out;
}

export async function listGrades() {
  return prisma.learningGrade.findMany({ orderBy: { sortOrder: "asc" } });
}

export async function createDictionaryUpload(input: {
  adminId: string;
  originalFilename: string;
  mimeType: string;
  buffer: Buffer;
  sourceName?: string;
  licence?: string;
}) {
  if (!input.buffer.length) throw new AppError("Uploaded file is empty", 400);
  if (input.buffer.length > MAX_VOCAB_UPLOAD_BYTES) {
    throw new AppError("File exceeds 5MB limit", 400);
  }

  const extWithDot = assertAllowedExtension(input.originalFilename);
  const ext = extWithDot.replace(/^\./, "");
  detectFileKind(input.buffer, extWithDot);
  const fileHash = hashFile(input.buffer);

  await mkdir(STORAGE_ROOT, { recursive: true });
  const storedName = `${Date.now()}_${fileHash.slice(0, 12)}.${ext}`;
  const storedPath = path.join(STORAGE_ROOT, storedName);
  await writeFile(storedPath, input.buffer);

  const parsed = await parseDictionaryFile(input.buffer, ext);
  const validRows = parsed.rows.filter(
    (r) => r.normalizedHeadword && r.senses.length > 0 && r.issues.length === 0
  );

  const batch = await prisma.dictionaryImportBatch.create({
    data: {
      adminId: input.adminId,
      originalFilename: input.originalFilename,
      storedPath,
      mimeType: input.mimeType || "application/octet-stream",
      fileExt: ext,
      fileSize: input.buffer.length,
      fileHash,
      status: "PARSED",
      sourceName: input.sourceName ? sanitizeText(input.sourceName) : null,
      licence: input.licence ? sanitizeText(input.licence) : null,
      extractedCount: parsed.rows.length,
      duplicateCount: parsed.duplicateNormalized,
      parseNotes: parsed.notes.join("\n"),
      previewJson: JSON.stringify(validRows.slice(0, 40)),
    },
  });

  let entryCount = 0;
  let senseCount = 0;

  for (const row of validRows) {
    const entry = await prisma.dictionaryEntry.upsert({
      where: { normalizedHeadword: row.normalizedHeadword },
      update: {
        headword: row.headword,
        pronunciation: row.pronunciation ?? undefined,
        sourceName: input.sourceName ? sanitizeText(input.sourceName) : undefined,
        licence: input.licence ? sanitizeText(input.licence) : undefined,
        sourceRef: row.sourceRef,
        importBatchId: batch.id,
      },
      create: {
        normalizedHeadword: row.normalizedHeadword,
        headword: row.headword,
        pronunciation: row.pronunciation,
        sourceName: input.sourceName ? sanitizeText(input.sourceName) : null,
        licence: input.licence ? sanitizeText(input.licence) : null,
        sourceRef: row.sourceRef,
        importBatchId: batch.id,
      },
    });
    entryCount += 1;

    const existingSenses = await prisma.dictionarySense.findMany({
      where: { entryId: entry.id },
      select: { senseIndex: true, definition: true },
    });
    let nextIndex =
      existingSenses.reduce((m, s) => Math.max(m, s.senseIndex), -1) + 1;

    for (const sense of row.senses) {
      const dupDef = existingSenses.some(
        (s) => s.definition.toLowerCase() === sense.definition.toLowerCase()
      );
      if (dupDef) continue;
      await prisma.dictionarySense.create({
        data: {
          entryId: entry.id,
          senseIndex: nextIndex,
          definition: sense.definition,
          wordType: sense.wordType,
          synonymsJson: sense.synonyms ? JSON.stringify(sense.synonyms) : null,
          antonymsJson: sense.antonyms ? JSON.stringify(sense.antonyms) : null,
          examplesJson: sense.examples ? JSON.stringify(sense.examples) : null,
          relationsJson: sense.relations ? JSON.stringify(sense.relations) : null,
          rawPayloadJson: sense.raw ? JSON.stringify(sense.raw) : null,
        },
      });
      nextIndex += 1;
      senseCount += 1;
    }
  }

  return prisma.dictionaryImportBatch.update({
    where: { id: batch.id },
    data: { entryCount, senseCount },
  });
}

export async function classifyDictionaryBatch(batchId: string) {
  const batch = await prisma.dictionaryImportBatch.findUnique({
    where: { id: batchId },
  });
  if (!batch) throw new AppError("Dictionary import not found", 404);

  const hints = await loadCategoryHints();
  const hasAny = Object.values(hints).some((c) => c.length > 0);
  if (!hasAny) {
    throw new AppError(
      "No published categories found. Seed Level/Grade category structure first.",
      400
    );
  }

  const entries = await prisma.dictionaryEntry.findMany({
    where: { importBatchId: batchId },
    include: { senses: true },
  });

  let assignmentCount = 0;
  for (const entry of entries) {
    for (const sense of entry.senses) {
      const suggestions = classifySense(
        {
          headword: entry.headword,
          definition: sense.definition,
          wordType: sense.wordType,
        },
        hints
      );
      for (const sug of suggestions) {
        const existing = await prisma.vocabularyGradeAssignment.findUnique({
          where: {
            senseId_gradeId_categoryId: {
              senseId: sense.id,
              gradeId: sug.gradeId,
              categoryId: sug.categoryId,
            },
          },
        });
        if (existing) {
          if (existing.status === "PENDING") {
            await prisma.vocabularyGradeAssignment.update({
              where: { id: existing.id },
              data: {
                levelId: sug.levelId,
                difficultyScore: sug.difficultyScore,
                confidenceScore: sug.confidenceScore,
                explanation: sug.explanation,
                classificationVersion: CLASSIFICATION_VERSION,
              },
            });
            assignmentCount += 1;
          }
          continue;
        }
        await prisma.vocabularyGradeAssignment.create({
          data: {
            senseId: sense.id,
            gradeId: sug.gradeId,
            levelId: sug.levelId,
            categoryId: sug.categoryId,
            status: "PENDING",
            difficultyScore: sug.difficultyScore,
            confidenceScore: sug.confidenceScore,
            explanation: sug.explanation,
            classificationVersion: CLASSIFICATION_VERSION,
          },
        });
        assignmentCount += 1;
      }
    }
  }

  return prisma.dictionaryImportBatch.update({
    where: { id: batchId },
    data: {
      status: "CLASSIFIED",
      assignmentCount,
      classifiedAt: new Date(),
    },
  });
}

export async function listDictionaryImports(take = 50) {
  return prisma.dictionaryImportBatch.findMany({
    orderBy: { createdAt: "desc" },
    take: Math.min(take, 200),
    include: {
      admin: { select: { id: true, email: true, name: true } },
    },
  });
}

export async function listAssignments(filters: {
  status?: VocabAssignmentStatus;
  gradeId?: string;
  maxConfidence?: number;
  take?: number;
}) {
  return prisma.vocabularyGradeAssignment.findMany({
    where: {
      ...(filters.status ? { status: filters.status } : {}),
      ...(filters.gradeId ? { gradeId: filters.gradeId } : {}),
      ...(filters.maxConfidence != null
        ? { confidenceScore: { lte: filters.maxConfidence } }
        : {}),
    },
    orderBy: [{ confidenceScore: "asc" }, { createdAt: "desc" }],
    take: Math.min(filters.take ?? 100, 500),
    include: {
      sense: {
        include: {
          entry: {
            select: {
              id: true,
              headword: true,
              normalizedHeadword: true,
              pronunciation: true,
              sourceName: true,
              licence: true,
            },
          },
        },
      },
      grade: true,
      level: { select: { id: true, code: true, label: true } },
      category: { select: { id: true, code: true, label: true, emoji: true } },
    },
  });
}

export async function updateAssignment(
  assignmentId: string,
  patch: {
    gradeId?: string;
    levelId?: string;
    categoryId?: string;
    status?: VocabAssignmentStatus;
  },
  reviewerId?: string
) {
  const existing = await prisma.vocabularyGradeAssignment.findUnique({
    where: { id: assignmentId },
  });
  if (!existing) throw new AppError("Assignment not found", 404);

  return prisma.vocabularyGradeAssignment.update({
    where: { id: assignmentId },
    data: {
      ...(patch.gradeId ? { gradeId: patch.gradeId } : {}),
      ...(patch.levelId ? { levelId: patch.levelId } : {}),
      ...(patch.categoryId ? { categoryId: patch.categoryId } : {}),
      ...(patch.status ? { status: patch.status } : {}),
      ...(reviewerId
        ? { reviewedById: reviewerId, reviewedAt: new Date() }
        : {}),
    },
  });
}

export async function approveAssignment(assignmentId: string, reviewerId: string) {
  return updateAssignment(assignmentId, { status: "APPROVED" }, reviewerId);
}

export async function rejectAssignment(assignmentId: string, reviewerId: string) {
  return updateAssignment(assignmentId, { status: "REJECTED" }, reviewerId);
}

export async function bulkApproveAssignments(
  ids: string[],
  reviewerId: string
) {
  const results: Array<{ id: string; ok: boolean; error?: string; status?: string }> =
    [];
  for (const id of ids) {
    try {
      const row = await approveAssignment(id, reviewerId);
      results.push({ id, ok: true, status: row.status });
    } catch (err) {
      results.push({
        id,
        ok: false,
        error: err instanceof Error ? err.message : "Approve failed",
      });
    }
  }
  return {
    updated: results.filter((r) => r.ok).length,
    failed: results.filter((r) => !r.ok).length,
    results,
  };
}

export async function bulkRejectAssignments(
  ids: string[],
  reviewerId: string
) {
  const results: Array<{ id: string; ok: boolean; error?: string; status?: string }> =
    [];
  for (const id of ids) {
    try {
      const row = await rejectAssignment(id, reviewerId);
      results.push({ id, ok: true, status: row.status });
    } catch (err) {
      results.push({
        id,
        ok: false,
        error: err instanceof Error ? err.message : "Reject failed",
      });
    }
  }
  return {
    updated: results.filter((r) => r.ok).length,
    failed: results.filter((r) => !r.ok).length,
    results,
  };
}

export async function bulkPublishAssignments(
  ids: string[],
  reviewerId: string
) {
  const results: Array<{
    id: string;
    ok: boolean;
    error?: string;
    status?: string;
    publishedWordId?: string | null;
  }> = [];
  for (const id of ids) {
    try {
      const row = await publishAssignment(id, reviewerId);
      results.push({
        id,
        ok: true,
        status: row.status,
        publishedWordId: row.publishedWordId,
      });
    } catch (err) {
      results.push({
        id,
        ok: false,
        error: err instanceof Error ? err.message : "Publish failed",
      });
    }
  }
  return {
    updated: results.filter((r) => r.ok).length,
    failed: results.filter((r) => !r.ok).length,
    results,
  };
}

/**
 * Publish approved assignment into kids-facing VocabularyWord (category-scoped).
 * Never invents meaning — uses dictionary sense definition.
 */
export async function publishAssignment(assignmentId: string, reviewerId: string) {
  const assignment = await prisma.vocabularyGradeAssignment.findUnique({
    where: { id: assignmentId },
    include: {
      sense: { include: { entry: true } },
      category: true,
    },
  });
  if (!assignment) throw new AppError("Assignment not found", 404);
  if (assignment.status === "REJECTED") {
    throw new AppError("Cannot publish a rejected assignment", 400);
  }

  const headword = assignment.sense.entry.headword;
  const meaning = assignment.sense.definition;
  assertWordQuality(headword, meaning);
  const firstLetter = headword.charAt(0).toUpperCase();

  const word = await prisma.vocabularyWord.upsert({
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
      difficulty: Math.max(1, Math.min(5, Math.round(assignment.difficultyScore / 20))),
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
      difficulty: Math.max(1, Math.min(5, Math.round(assignment.difficultyScore / 20))),
      sortOrder: 0,
    },
  });

  return prisma.vocabularyGradeAssignment.update({
    where: { id: assignmentId },
    data: {
      status: "PUBLISHED",
      publishedWordId: word.id,
      reviewedById: reviewerId,
      reviewedAt: new Date(),
    },
    include: { publishedWord: true },
  });
}

/** Map child birth year → grade code for learn filtering helpers. */
export function gradeCodeForBirthYear(birthYear: number, now = new Date()): GradeCode {
  const age = now.getFullYear() - birthYear;
  if (age <= 3) return "GRADE_1";
  if (age <= 6) return "GRADE_2";
  if (age <= 9) return "GRADE_3";
  return "GRADE_4";
}
