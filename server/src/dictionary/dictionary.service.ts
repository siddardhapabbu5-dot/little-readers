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
          categories: { orderBy: { sortOrder: "asc" } },
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
        // Grades 2–4 topics stay drafts until the approve → publish workflow; children never
        // see words in them before that. Grade 1 is live, so only its published categories count.
        if (!cat.isPublished && level.code === GRADE_LEVEL.GRADE_1) continue;
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

type PreviewErrorRow = {
  row: number;
  headword: string;
  issues: string[];
};

async function parseUploadBuffer(input: {
  originalFilename: string;
  buffer: Buffer;
}) {
  if (!input.buffer.length) throw new AppError("Uploaded file is empty", 400);
  if (input.buffer.length > MAX_VOCAB_UPLOAD_BYTES) {
    throw new AppError("File exceeds 5MB limit", 400);
  }
  const extWithDot = assertAllowedExtension(input.originalFilename);
  const ext = extWithDot.replace(/^\./, "");
  detectFileKind(input.buffer, extWithDot);
  const parsed = await parseDictionaryFile(input.buffer, ext);

  const errors: PreviewErrorRow[] = [];
  const validRows = [];
  const seenInFile = new Map<string, number>();

  for (let i = 0; i < parsed.rows.length; i++) {
    const row = parsed.rows[i]!;
    const issues = [...row.issues];
    if (!row.normalizedHeadword) issues.push("Empty word");
    if (!row.senses.length) issues.push("Missing definition — not invented");
    const prev = seenInFile.get(row.normalizedHeadword);
    if (prev != null) {
      issues.push(`Duplicate headword in file (also row ${prev + 1})`);
    } else if (row.normalizedHeadword) {
      seenInFile.set(row.normalizedHeadword, i);
    }
    const existing = row.normalizedHeadword
      ? await prisma.dictionaryEntry.findUnique({
          where: { normalizedHeadword: row.normalizedHeadword },
          select: { id: true },
        })
      : null;
    if (existing) {
      issues.push("Headword already exists in central dictionary (will merge senses on confirm)");
    }
    if (issues.length && !row.senses.length) {
      errors.push({
        row: i + 1,
        headword: row.headword || "",
        issues,
      });
      continue;
    }
    if (!row.normalizedHeadword || !row.senses.length) {
      errors.push({
        row: i + 1,
        headword: row.headword || "",
        issues: issues.length ? issues : ["Invalid row"],
      });
      continue;
    }
    // Soft warnings (existing headword / in-file dup) still allow import of new senses
    const hard = issues.filter(
      (x) =>
        !x.includes("already exists") &&
        !x.includes("Duplicate headword in file")
    );
    if (hard.length) {
      errors.push({ row: i + 1, headword: row.headword, issues: hard });
      continue;
    }
    validRows.push(row);
  }

  return {
    ext,
    extWithDot,
    fileHash: hashFile(input.buffer),
    parsed,
    validRows,
    errors,
    notes: [
      ...parsed.notes,
      `Valid rows: ${validRows.length}`,
      `Invalid rows: ${errors.length}`,
      `In-file duplicate headwords: ${parsed.duplicateNormalized}`,
    ],
  };
}

/** Parse + validate only — no DictionaryEntry writes. */
export async function previewDictionaryUpload(input: {
  adminId: string;
  originalFilename: string;
  mimeType: string;
  buffer: Buffer;
  sourceName?: string;
  licence?: string;
}) {
  const prepared = await parseUploadBuffer(input);
  await mkdir(STORAGE_ROOT, { recursive: true });
  const storedName = `${Date.now()}_${prepared.fileHash.slice(0, 12)}.${prepared.ext}`;
  const storedPath = path.join(STORAGE_ROOT, storedName);
  await writeFile(storedPath, input.buffer);

  const previewPayload = {
    validRows: prepared.validRows.slice(0, 100).map((r) => ({
      headword: r.headword,
      normalizedHeadword: r.normalizedHeadword,
      pronunciation: r.pronunciation,
      senseCount: r.senses.length,
      firstDefinition: r.senses[0]?.definition,
    })),
    errors: prepared.errors,
    notes: prepared.notes,
  };

  const batch = await prisma.dictionaryImportBatch.create({
    data: {
      adminId: input.adminId,
      originalFilename: input.originalFilename,
      storedPath,
      mimeType: input.mimeType || "application/octet-stream",
      fileExt: prepared.ext,
      fileSize: input.buffer.length,
      fileHash: prepared.fileHash,
      status: "PENDING",
      sourceName: input.sourceName ? sanitizeText(input.sourceName) : null,
      licence: input.licence ? sanitizeText(input.licence) : null,
      extractedCount: prepared.parsed.rows.length,
      duplicateCount: prepared.parsed.duplicateNormalized,
      parseNotes: prepared.notes.join("\n"),
      previewJson: JSON.stringify(previewPayload),
      errorReportJson: JSON.stringify(prepared.errors),
      entryCount: 0,
      senseCount: 0,
    },
  });

  return {
    ...batch,
    validCount: prepared.validRows.length,
    errorCount: prepared.errors.length,
    errors: prepared.errors,
    preview: previewPayload.validRows,
  };
}

async function writeEntriesFromParsedRows(
  batchId: string,
  validRows: Awaited<ReturnType<typeof parseUploadBuffer>>["validRows"],
  meta: { sourceName?: string; licence?: string }
) {
  let entryCount = 0;
  let senseCount = 0;

  for (const row of validRows) {
    const entry = await prisma.dictionaryEntry.upsert({
      where: { normalizedHeadword: row.normalizedHeadword },
      update: {
        headword: row.headword,
        pronunciation: row.pronunciation ?? undefined,
        sourceName: meta.sourceName ? sanitizeText(meta.sourceName) : undefined,
        licence: meta.licence ? sanitizeText(meta.licence) : undefined,
        sourceRef: row.sourceRef,
        importBatchId: batchId,
      },
      create: {
        normalizedHeadword: row.normalizedHeadword,
        headword: row.headword,
        pronunciation: row.pronunciation,
        sourceName: meta.sourceName ? sanitizeText(meta.sourceName) : null,
        licence: meta.licence ? sanitizeText(meta.licence) : null,
        sourceRef: row.sourceRef,
        importBatchId: batchId,
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
      existingSenses.push({
        senseIndex: nextIndex,
        definition: sense.definition,
      });
      nextIndex += 1;
      senseCount += 1;
    }
  }

  return { entryCount, senseCount };
}

/** Confirm a preview batch: write DictionaryEntry/Sense rows. */
export async function confirmDictionaryUpload(batchId: string) {
  const batch = await prisma.dictionaryImportBatch.findUnique({
    where: { id: batchId },
  });
  if (!batch) throw new AppError("Dictionary import not found", 404);
  if (batch.confirmedAt) {
    throw new AppError("Import batch already confirmed", 400);
  }
  if (batch.status !== "PENDING" && batch.status !== "PARSED") {
    throw new AppError(`Cannot confirm batch in status ${batch.status}`, 400);
  }

  const { readFile } = await import("node:fs/promises");
  const buffer = await readFile(batch.storedPath);
  const prepared = await parseUploadBuffer({
    originalFilename: batch.originalFilename,
    buffer,
  });

  if (!prepared.validRows.length) {
    throw new AppError(
      `No valid rows to import (${prepared.errors.length} invalid). Download error report.`,
      400
    );
  }

  const { entryCount, senseCount } = await writeEntriesFromParsedRows(
    batch.id,
    prepared.validRows,
    { sourceName: batch.sourceName ?? undefined, licence: batch.licence ?? undefined }
  );

  return prisma.dictionaryImportBatch.update({
    where: { id: batch.id },
    data: {
      status: "PARSED",
      entryCount,
      senseCount,
      confirmedAt: new Date(),
      errorReportJson: JSON.stringify(prepared.errors),
      parseNotes: prepared.notes.join("\n"),
    },
  });
}

/**
 * Backward-compatible upload: preview + immediate confirm (existing clients / tests).
 * Prefer preview → confirm for admin UI.
 */
export async function createDictionaryUpload(input: {
  adminId: string;
  originalFilename: string;
  mimeType: string;
  buffer: Buffer;
  sourceName?: string;
  licence?: string;
}) {
  const preview = await previewDictionaryUpload(input);
  if (!preview.validCount) {
    throw new AppError(
      `No valid rows to import (${preview.errorCount} invalid). Fix the file or use preview.`,
      400
    );
  }
  return confirmDictionaryUpload(preview.id);
}

export function errorReportToCsv(errors: PreviewErrorRow[]) {
  const escape = (v: string) =>
    /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
  return [
    "row,headword,issues",
    ...errors.map((e) =>
      [e.row, escape(e.headword), escape(e.issues.join("; "))].join(",")
    ),
  ].join("\n");
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
    meaningOverride?: string | null;
    exampleOverride?: string | null;
    difficultyOverride?: number | null;
  },
  reviewerId?: string
) {
  const existing = await prisma.vocabularyGradeAssignment.findUnique({
    where: { id: assignmentId },
  });
  if (!existing) throw new AppError("Assignment not found", 404);

  // Overrides never touch DictionarySense.definition — assignment fields only.
  if (patch.meaningOverride) {
    assertWordQuality("word", sanitizeText(patch.meaningOverride));
  }

  return prisma.vocabularyGradeAssignment.update({
    where: { id: assignmentId },
    data: {
      ...(patch.gradeId ? { gradeId: patch.gradeId } : {}),
      ...(patch.levelId ? { levelId: patch.levelId } : {}),
      ...(patch.categoryId ? { categoryId: patch.categoryId } : {}),
      ...(patch.status ? { status: patch.status } : {}),
      ...(patch.meaningOverride !== undefined
        ? {
            meaningOverride: patch.meaningOverride
              ? sanitizeText(patch.meaningOverride)
              : null,
          }
        : {}),
      ...(patch.exampleOverride !== undefined
        ? {
            exampleOverride: patch.exampleOverride
              ? sanitizeText(patch.exampleOverride)
              : null,
          }
        : {}),
      ...(patch.difficultyOverride !== undefined
        ? { difficultyOverride: patch.difficultyOverride }
        : {}),
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
      const current = await prisma.vocabularyGradeAssignment.findUnique({
        where: { id },
      });
      // Explicit approve step for PENDING/DRAFT so bulk "Publish all" stays policy-safe.
      if (
        current &&
        (current.status === "PENDING" || current.status === "DRAFT")
      ) {
        await approveAssignment(id, reviewerId);
      }
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
 * Publish approved (or republish unpublished) assignment into kids-facing VocabularyWord.
 * Kids meaning = meaningOverride ?? central DictionarySense.definition.
 * Never mutates DictionarySense.definition.
 * Upserts on (categoryId, text) — no duplicate words in the same topic.
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
  if (
    assignment.status !== "APPROVED" &&
    assignment.status !== "UNPUBLISHED" &&
    assignment.status !== "PUBLISHED"
  ) {
    throw new AppError(
      "Only APPROVED, PUBLISHED (re-publish), or UNPUBLISHED assignments can be published (approve first)",
      400
    );
  }

  const headword = assignment.sense.entry.headword;
  const centralMeaning = assignment.sense.definition;
  const meaning = assignment.meaningOverride?.trim() || centralMeaning;
  assertWordQuality(headword, meaning);

  let exampleSentence: string | null = assignment.exampleOverride?.trim() || null;
  if (!exampleSentence && assignment.sense.examplesJson) {
    try {
      const examples = JSON.parse(assignment.sense.examplesJson) as unknown;
      if (Array.isArray(examples) && typeof examples[0] === "string") {
        exampleSentence = examples[0];
      }
    } catch {
      /* ignore */
    }
  }

  const firstLetter = headword.charAt(0).toUpperCase();
  const difficulty =
    assignment.difficultyOverride != null
      ? Math.max(1, Math.min(5, assignment.difficultyOverride))
      : Math.max(1, Math.min(5, Math.round(assignment.difficultyScore / 20)));

  return prisma.$transaction(async (tx) => {
    const word = await tx.vocabularyWord.upsert({
      where: {
        categoryId_text: {
          categoryId: assignment.categoryId,
          text: headword,
        },
      },
      update: {
        meaning,
        exampleSentence: exampleSentence ?? undefined,
        phonetic: assignment.sense.entry.pronunciation ?? undefined,
        audioUrl: assignment.sense.entry.audioUrl ?? undefined,
        firstLetter,
        isActive: true,
        origin: "DICTIONARY",
        dictionarySenseId: assignment.senseId,
        difficulty,
      },
      create: {
        categoryId: assignment.categoryId,
        text: headword,
        meaning,
        exampleSentence,
        emoji: assignment.category.emoji || "📚",
        phonetic: assignment.sense.entry.pronunciation,
        audioUrl: assignment.sense.entry.audioUrl,
        firstLetter,
        isActive: true,
        origin: "DICTIONARY",
        dictionarySenseId: assignment.senseId,
        difficulty,
        sortOrder: 0,
      },
    });

    const updated = await tx.vocabularyGradeAssignment.update({
      where: { id: assignmentId },
      data: {
        status: "PUBLISHED",
        publishedWordId: word.id,
        reviewedById: reviewerId,
        reviewedAt: new Date(),
      },
      include: { publishedWord: true, sense: { include: { entry: true } } },
    });

    await tx.dictionaryPublishEvent.create({
      data: {
        assignmentId,
        wordId: word.id,
        action: "PUBLISH",
        actorId: reviewerId,
        note: assignment.meaningOverride
          ? "Published with assignment meaning override (central sense unchanged)"
          : "Published using central dictionary meaning",
      },
    });

    return updated;
  });
}

/**
 * Hide kids word; keep DictionaryEntry / DictionarySense / assignment row.
 */
export async function unpublishAssignment(
  assignmentId: string,
  reviewerId: string
) {
  const assignment = await prisma.vocabularyGradeAssignment.findUnique({
    where: { id: assignmentId },
  });
  if (!assignment) throw new AppError("Assignment not found", 404);
  if (assignment.status !== "PUBLISHED") {
    throw new AppError("Only PUBLISHED assignments can be unpublished", 400);
  }

  return prisma.$transaction(async (tx) => {
    if (assignment.publishedWordId) {
      await tx.vocabularyWord.update({
        where: { id: assignment.publishedWordId },
        data: { isActive: false },
      });
    }

    const updated = await tx.vocabularyGradeAssignment.update({
      where: { id: assignmentId },
      data: {
        status: "UNPUBLISHED",
        reviewedById: reviewerId,
        reviewedAt: new Date(),
      },
      include: {
        publishedWord: true,
        sense: { include: { entry: true } },
      },
    });

    await tx.dictionaryPublishEvent.create({
      data: {
        assignmentId,
        wordId: assignment.publishedWordId,
        action: "UNPUBLISH",
        actorId: reviewerId,
        note: "Unpublished — dictionary entry/sense preserved",
      },
    });

    return updated;
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
