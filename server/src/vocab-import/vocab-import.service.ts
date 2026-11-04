import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { AppError } from "../lib/errors.js";
import { prisma } from "../lib/prisma.js";
import {
  assertAllowedExtension,
  detectFileKind,
  hashFile,
  MAX_VOCAB_UPLOAD_BYTES,
  sanitizeText,
  sanitizeWord,
} from "./file-security.js";
import { annotateDuplicates, parseVocabularyFile } from "./parsers.js";
import type { ExtractedVocabRow } from "./types.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const STORAGE_ROOT = path.resolve(__dirname, "../../storage/vocab-uploads");

function summarize(rows: ExtractedVocabRow[]) {
  return {
    extractedCount: rows.length,
    validCount: rows.filter((r) => r.status === "valid").length,
    invalidCount: rows.filter((r) => r.status === "invalid").length,
    duplicateCount: rows.filter((r) => r.status === "duplicate").length,
  };
}

function parsePreview(json: string): ExtractedVocabRow[] {
  return JSON.parse(json) as ExtractedVocabRow[];
}

export async function listAdminLevels() {
  return prisma.learningLevel.findMany({
    orderBy: { sortOrder: "asc" },
    include: {
      groups: {
        orderBy: { sortOrder: "asc" },
        include: {
          _count: { select: { categories: true } },
        },
      },
    },
  });
}

export async function listAdminGroups(levelId?: string) {
  return prisma.learningGroup.findMany({
    where: levelId ? { levelId } : undefined,
    orderBy: [{ levelId: "asc" }, { sortOrder: "asc" }],
    include: {
      level: { select: { id: true, code: true, label: true } },
      _count: { select: { categories: true } },
    },
  });
}

export async function listAdminCategories(groupId?: string, levelId?: string) {
  return prisma.learningCategory.findMany({
    where: {
      ...(groupId ? { groupId } : {}),
      ...(levelId ? { group: { levelId } } : {}),
    },
    orderBy: { sortOrder: "asc" },
    include: {
      _count: { select: { words: { where: { isActive: true } } } },
      group: {
        include: { level: { select: { id: true, code: true, label: true } } },
      },
    },
  });
}

export async function listAdminVocabulary(categoryId?: string, take = 100) {
  return prisma.vocabularyWord.findMany({
    where: {
      isActive: true,
      ...(categoryId ? { categoryId } : {}),
    },
    orderBy: [{ categoryId: "asc" }, { sortOrder: "asc" }],
    take: Math.min(take, 500),
    include: {
      category: {
        select: {
          id: true,
          label: true,
          code: true,
          group: {
            select: {
              label: true,
              code: true,
              level: { select: { label: true, code: true } },
            },
          },
        },
      },
    },
  });
}

export async function createUploadBatch(input: {
  adminId: string;
  levelId: string;
  categoryId: string;
  originalFilename: string;
  mimeType: string;
  buffer: Buffer;
}) {
  if (input.buffer.length === 0) {
    throw new AppError("Uploaded file is empty", 400);
  }
  if (input.buffer.length > MAX_VOCAB_UPLOAD_BYTES) {
    throw new AppError("File exceeds 5MB limit", 400);
  }

  const ext = assertAllowedExtension(input.originalFilename);
  const kind = detectFileKind(input.buffer, ext);
  const fileHash = hashFile(input.buffer);

  const category = await prisma.learningCategory.findUnique({
    where: { id: input.categoryId },
    include: { group: { include: { level: true } } },
  });
  if (!category) throw new AppError("Category not found", 404);
  if (category.group.levelId !== input.levelId) {
    throw new AppError("Selected category does not belong to the selected level", 400);
  }

  const existingWords = await prisma.vocabularyWord.findMany({
    where: { isActive: true },
    select: { text: true },
  });
  const existingSet = new Set(existingWords.map((w) => w.text));

  const parsed = await parseVocabularyFile(input.buffer, kind);
  const rows = annotateDuplicates(parsed.rows, existingSet).map((row, i) => ({
    ...row,
    serial: i + 1,
  }));

  if (rows.length === 0) {
    throw new AppError(
      parsed.parseNotes.join(" ") ||
        "No vocabulary words could be extracted from this file",
      400
    );
  }

  await mkdir(STORAGE_ROOT, { recursive: true });
  const storedName = `${Date.now()}_${fileHash.slice(0, 12)}${ext}`;
  const storedPath = path.join(STORAGE_ROOT, storedName);
  await writeFile(storedPath, input.buffer);

  const counts = summarize(rows);
  const batch = await prisma.vocabImportBatch.create({
    data: {
      adminId: input.adminId,
      levelId: input.levelId,
      categoryId: input.categoryId,
      originalFilename: sanitizeText(input.originalFilename, 180),
      storedPath,
      mimeType: sanitizeText(input.mimeType || "application/octet-stream", 120),
      fileExt: ext,
      fileSize: input.buffer.length,
      fileHash,
      status: "PENDING",
      extractedCount: counts.extractedCount,
      validCount: counts.validCount,
      invalidCount: counts.invalidCount,
      duplicateCount: counts.duplicateCount,
      previewJson: JSON.stringify(rows),
      parseNotes: parsed.parseNotes.join("\n"),
    },
    include: {
      category: { select: { id: true, label: true, code: true } },
      level: { select: { id: true, label: true, code: true } },
      admin: { select: { id: true, name: true, email: true } },
    },
  });

  const categoryWordCount = await prisma.vocabularyWord.count({
    where: { categoryId: input.categoryId, isActive: true },
  });

  return {
    batch: serializeBatch(batch),
    rows,
    summary: {
      ...counts,
      selectedCount: rows.filter((r) => r.selected).length,
      categoryWordCount,
      recommendedTarget: 75,
      remainingToTarget: Math.max(0, 75 - categoryWordCount),
      detectedColumns: parsed.detectedColumns,
      parseNotes: parsed.parseNotes,
      priorImportsWithSameHash: await prisma.vocabImportBatch.count({
        where: { fileHash, status: "IMPORTED" },
      }),
    },
  };
}

export async function getImportBatch(batchId: string, adminId?: string) {
  const batch = await prisma.vocabImportBatch.findUnique({
    where: { id: batchId },
    include: {
      category: { select: { id: true, label: true, code: true } },
      level: { select: { id: true, label: true, code: true } },
      admin: { select: { id: true, name: true, email: true } },
    },
  });
  if (!batch) throw new AppError("Import batch not found", 404);
  if (adminId && batch.adminId !== adminId) {
    // any admin can review history
  }
  return {
    batch: serializeBatch(batch),
    rows: parsePreview(batch.previewJson),
  };
}

export async function updateImportPreview(
  batchId: string,
  rows: ExtractedVocabRow[]
) {
  const batch = await prisma.vocabImportBatch.findUnique({
    where: { id: batchId },
  });
  if (!batch) throw new AppError("Import batch not found", 404);
  if (batch.status !== "PENDING") {
    throw new AppError("Only pending imports can be edited", 400);
  }

  const existingWords = await prisma.vocabularyWord.findMany({
    where: { isActive: true },
    select: { text: true },
  });
  const normalized = annotateDuplicates(
    rows.map((row, i) => {
      const word = sanitizeWord(row.word);
      const simpleMeaning = sanitizeText(row.simpleMeaning, 200);
      const issues: string[] = [];
      if (!word) issues.push("Empty word");
      if (word && word.length < 2) issues.push("Word too short");
      if (!simpleMeaning) issues.push("Missing simple meaning");
      return {
        ...row,
        serial: i + 1,
        word,
        simpleMeaning,
        pronunciation: sanitizeText(row.pronunciation || word, 80),
        imageUrl: sanitizeText(row.imageUrl, 300),
        audioUrl: sanitizeText(row.audioUrl, 300),
        categoryHint: sanitizeText(row.categoryHint, 80),
        status: issues.length ? ("invalid" as const) : ("valid" as const),
        issues,
        selected: Boolean(row.selected) && issues.length === 0,
      };
    }),
    new Set(existingWords.map((w) => w.text))
  ).map((row) => ({
    ...row,
    selected: row.selected && row.status === "valid",
  }));

  const counts = summarize(normalized);
  const updated = await prisma.vocabImportBatch.update({
    where: { id: batchId },
    data: {
      previewJson: JSON.stringify(normalized),
      extractedCount: counts.extractedCount,
      validCount: counts.validCount,
      invalidCount: counts.invalidCount,
      duplicateCount: counts.duplicateCount,
    },
    include: {
      category: { select: { id: true, label: true, code: true } },
      level: { select: { id: true, label: true, code: true } },
      admin: { select: { id: true, name: true, email: true } },
    },
  });

  return {
    batch: serializeBatch(updated),
    rows: normalized,
    summary: {
      ...counts,
      selectedCount: normalized.filter((r) => r.selected).length,
    },
  };
}

export async function confirmImport(batchId: string, adminId: string) {
  const batch = await prisma.vocabImportBatch.findUnique({
    where: { id: batchId },
    include: { category: true },
  });
  if (!batch) throw new AppError("Import batch not found", 404);
  if (batch.status !== "PENDING") {
    throw new AppError("This import batch was already processed", 400);
  }

  const rows = parsePreview(batch.previewJson).filter(
    (r) => r.selected && r.status === "valid"
  );
  if (rows.length === 0) {
    throw new AppError("No valid selected words to import", 400);
  }

  let imported = 0;
  let skipped = 0;
  const maxSort = await prisma.vocabularyWord.aggregate({
    where: { categoryId: batch.categoryId },
    _max: { sortOrder: true },
  });
  let nextOrder = (maxSort._max.sortOrder ?? 0) + 1;

  for (const row of rows) {
    const existing = await prisma.vocabularyWord.findUnique({
      where: {
        categoryId_text: {
          categoryId: batch.categoryId,
          text: row.word,
        },
      },
    });
    if (existing) {
      skipped += 1;
      continue;
    }
    await prisma.vocabularyWord.create({
      data: {
        categoryId: batch.categoryId,
        text: row.word,
        meaning: row.simpleMeaning,
        emoji: "📝",
        phonetic: row.pronunciation || row.word,
        firstLetter: row.word.charAt(0).toUpperCase(),
        difficulty: 1,
        sortOrder: nextOrder,
        imageUrl: row.imageUrl || null,
        audioUrl: row.audioUrl || null,
        isActive: true,
      },
    });
    nextOrder += 1;
    imported += 1;
  }

  const updated = await prisma.vocabImportBatch.update({
    where: { id: batchId },
    data: {
      status: "IMPORTED",
      importedCount: imported,
      skippedCount: skipped,
      importedAt: new Date(),
      adminId,
    },
    include: {
      category: { select: { id: true, label: true, code: true } },
      level: { select: { id: true, label: true, code: true } },
      admin: { select: { id: true, name: true, email: true } },
    },
  });

  const categoryWordCount = await prisma.vocabularyWord.count({
    where: { categoryId: batch.categoryId, isActive: true },
  });

  return {
    batch: serializeBatch(updated),
    summary: {
      imported,
      skipped,
      categoryWordCount,
      message:
        imported > 0
          ? `Imported ${imported} word(s). They are now available in Kids Zone for “${batch.category.label}”.`
          : "No new words imported (all selected words already existed).",
    },
  };
}

export async function listImportHistory(take = 50) {
  const batches = await prisma.vocabImportBatch.findMany({
    orderBy: { createdAt: "desc" },
    take: Math.min(take, 200),
    include: {
      category: { select: { id: true, label: true, code: true } },
      level: { select: { id: true, label: true, code: true } },
      admin: { select: { id: true, name: true, email: true } },
    },
  });
  return batches.map(serializeBatch);
}

function serializeBatch(batch: {
  id: string;
  adminId: string;
  levelId: string;
  categoryId: string;
  originalFilename: string;
  storedPath: string;
  mimeType: string;
  fileExt: string;
  fileSize: number;
  fileHash: string;
  status: string;
  extractedCount: number;
  validCount: number;
  invalidCount: number;
  duplicateCount: number;
  importedCount: number;
  skippedCount: number;
  parseNotes: string | null;
  errorMessage: string | null;
  createdAt: Date;
  importedAt: Date | null;
  category?: { id: string; label: string; code: string };
  level?: { id: string; label: string; code: string };
  admin?: { id: string; name: string; email: string };
}) {
  return {
    id: batch.id,
    adminId: batch.adminId,
    levelId: batch.levelId,
    categoryId: batch.categoryId,
    originalFilename: batch.originalFilename,
    fileExt: batch.fileExt,
    fileSize: batch.fileSize,
    fileHash: batch.fileHash,
    status: batch.status,
    extractedCount: batch.extractedCount,
    validCount: batch.validCount,
    invalidCount: batch.invalidCount,
    duplicateCount: batch.duplicateCount,
    importedCount: batch.importedCount,
    skippedCount: batch.skippedCount,
    parseNotes: batch.parseNotes,
    errorMessage: batch.errorMessage,
    createdAt: batch.createdAt,
    importedAt: batch.importedAt,
    category: batch.category,
    level: batch.level,
    admin: batch.admin,
    // Never expose absolute storedPath to clients
  };
}
