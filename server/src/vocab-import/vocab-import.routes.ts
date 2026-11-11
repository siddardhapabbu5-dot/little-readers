import { Router } from "express";
import multer from "multer";
import { z } from "zod";
import {
  requireAuth,
  requireRoles,
  type AuthenticatedRequest,
} from "../middleware/auth.js";
import { requirePermission } from "../auth/permissions.js";
import { AppError } from "../lib/errors.js";
import { MAX_VOCAB_UPLOAD_BYTES } from "./file-security.js";
import {
  confirmImport,
  createUploadBatch,
  getImportBatch,
  listAdminCategories,
  listAdminGroups,
  listAdminLevels,
  listImportHistory,
  updateImportPreview,
} from "./vocab-import.service.js";
import {
  clearAllAdminVocabularyWords,
  createAdminWord,
  deactivateAdminWord,
  deleteAdminWord,
  exportAdminWordsCsv,
  getAdminWord,
  importVocabularySheet,
  reclassifyAdminWord,
  searchAdminWords,
  updateAdminWord,
} from "./word-management.service.js";
import type { ExtractedVocabRow } from "./types.js";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_VOCAB_UPLOAD_BYTES, files: 1 },
});

export const vocabImportRouter = Router();

vocabImportRouter.use(requireAuth, requirePermission("content.manage"));

vocabImportRouter.get("/levels", async (_req, res, next) => {
  try {
    res.status(200).json({ data: await listAdminLevels() });
  } catch (error) {
    next(error);
  }
});

vocabImportRouter.get("/groups", async (req, res, next) => {
  try {
    const levelId =
      typeof req.query.levelId === "string" ? req.query.levelId : undefined;
    res.status(200).json({ data: await listAdminGroups(levelId) });
  } catch (error) {
    next(error);
  }
});

vocabImportRouter.get("/categories", async (req, res, next) => {
  try {
    const groupId =
      typeof req.query.groupId === "string" ? req.query.groupId : undefined;
    const levelId =
      typeof req.query.levelId === "string" ? req.query.levelId : undefined;
    res.status(200).json({ data: await listAdminCategories(groupId, levelId) });
  } catch (error) {
    next(error);
  }
});

vocabImportRouter.get("/words", async (req, res, next) => {
  try {
    const bool = (v: unknown) => {
      if (v === "true" || v === "1") return true;
      if (v === "false" || v === "0") return false;
      return undefined;
    };
    const origin =
      typeof req.query.origin === "string" &&
      ["LEGACY", "DICTIONARY", "CATEGORY_IMPORT"].includes(req.query.origin)
        ? (req.query.origin as "LEGACY" | "DICTIONARY" | "CATEGORY_IMPORT")
        : undefined;
    const assignmentStatus =
      typeof req.query.assignmentStatus === "string" &&
      ["PENDING", "APPROVED", "REJECTED", "PUBLISHED"].includes(
        req.query.assignmentStatus
      )
        ? (req.query.assignmentStatus as
            | "PENDING"
            | "APPROVED"
            | "REJECTED"
            | "PUBLISHED")
        : undefined;

    const data = await searchAdminWords({
      q: typeof req.query.q === "string" ? req.query.q : undefined,
      gradeId:
        typeof req.query.gradeId === "string" ? req.query.gradeId : undefined,
      levelId:
        typeof req.query.levelId === "string" ? req.query.levelId : undefined,
      groupId:
        typeof req.query.groupId === "string" ? req.query.groupId : undefined,
      categoryId:
        typeof req.query.categoryId === "string"
          ? req.query.categoryId
          : undefined,
      isActive: bool(req.query.isActive),
      origin,
      assignmentStatus,
      take: req.query.take != null ? Number(req.query.take) : 100,
      skip: req.query.skip != null ? Number(req.query.skip) : 0,
    });
    res.status(200).json({ data });
  } catch (error) {
    next(error);
  }
});

const clearWordsSchema = z.object({
  confirm: z.literal("DELETE_ALL_WORDS"),
});

/** Wipe published VocabularyWord rows so a new dictionary can replace them. */
vocabImportRouter.post("/words/clear-all", requirePermission("content.destroy"), async (req, res, next) => {
  try {
    const parsed = clearWordsSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new AppError(
        'Send { "confirm": "DELETE_ALL_WORDS" } to clear vocabulary',
        400
      );
    }
    const data = await clearAllAdminVocabularyWords();
    res.status(200).json({ data });
  } catch (error) {
    next(error);
  }
});

/**
 * Download words as CSV.
 * - Single ABC/Alphabet category → A–Z sheet (Capital/Small/Symbol/Word/Example) with live emoji
 * - Otherwise grade/level sheet (emoji column uses displayable emoji + UTF-8 BOM for Excel)
 */
vocabImportRouter.get("/words/export.csv", async (req, res, next) => {
  try {
    const bool = (v: unknown) => {
      if (v === "true" || v === "1") return true;
      if (v === "false" || v === "0") return false;
      return undefined;
    };
    const formatRaw =
      typeof req.query.format === "string" ? req.query.format : "auto";
    const format =
      formatRaw === "alphabet" || formatRaw === "grade_level"
        ? formatRaw
        : "auto";
    const { csv, count, filename } = await exportAdminWordsCsv({
      gradeId:
        typeof req.query.gradeId === "string" ? req.query.gradeId : undefined,
      levelId:
        typeof req.query.levelId === "string" ? req.query.levelId : undefined,
      groupId:
        typeof req.query.groupId === "string" ? req.query.groupId : undefined,
      categoryId:
        typeof req.query.categoryId === "string"
          ? req.query.categoryId
          : undefined,
      isActive: bool(req.query.isActive) ?? true,
      format,
    });
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${filename || `learn-wise-words-${count}.csv`}"`
    );
    res.status(200).send(csv);
  } catch (error) {
    next(error);
  }
});

/**
 * Upload word sheet:
 * - A–Z alphabet XLSX/CSV (Capital Letter, Small Letter, Symbol, Word, Example Sentence)
 *   → requires categoryId (selected category in Admin)
 * - Grade/level/category CSV template
 */
vocabImportRouter.post("/words/import-sheet", (req, res, next) => {
  const ct = String(req.headers["content-type"] ?? "");
  if (ct.includes("multipart/form-data")) {
    return upload.single("file")(req, res, next);
  }
  return next();
}, async (req, res, next) => {
  try {
    const categoryId =
      (typeof req.body?.categoryId === "string" && req.body.categoryId) ||
      (typeof req.query.categoryId === "string" ? req.query.categoryId : "") ||
      undefined;

    const levelCode =
      (typeof req.body?.levelCode === "string" && req.body.levelCode) ||
      (typeof req.query.levelCode === "string" ? req.query.levelCode : "") ||
      undefined;

    const data = await importVocabularySheet({
      buffer: req.file?.buffer,
      filename: req.file?.originalname,
      csvText: typeof req.body?.csv === "string" ? req.body.csv : undefined,
      categoryId,
      levelCode,
    });
    res.status(200).json({ data });
  } catch (error) {
    next(error);
  }
});

vocabImportRouter.get("/words/:id", async (req, res, next) => {
  try {
    res.status(200).json({ data: await getAdminWord(String(req.params.id)) });
  } catch (error) {
    next(error);
  }
});

const createWordSchema = z.object({
  categoryId: z.string().min(1),
  text: z.string().min(1).max(80),
  meaning: z.string().min(1).max(500),
  emoji: z.string().max(8).optional(),
  phonetic: z.string().max(120).optional(),
  imageUrl: z.string().max(500).optional(),
  audioUrl: z.string().max(500).optional(),
  difficulty: z.number().int().min(1).max(5).optional(),
  sortOrder: z.number().int().optional(),
  isActive: z.boolean().optional(),
});

vocabImportRouter.post("/words", async (req, res, next) => {
  try {
    const parsed = createWordSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new AppError("Invalid word payload", 400, parsed.error.flatten());
    }
    const data = await createAdminWord(parsed.data);
    res.status(201).json({ data });
  } catch (error) {
    next(error);
  }
});

const patchWordSchema = z.object({
  text: z.string().min(1).max(80).optional(),
  meaning: z.string().min(1).max(500).optional(),
  emoji: z.string().max(8).optional(),
  phonetic: z.string().max(120).nullable().optional(),
  imageUrl: z.string().max(500).nullable().optional(),
  audioUrl: z.string().max(500).nullable().optional(),
  difficulty: z.number().int().min(1).max(5).optional(),
  sortOrder: z.number().int().optional(),
  isActive: z.boolean().optional(),
});

vocabImportRouter.patch("/words/:id", async (req, res, next) => {
  try {
    const parsed = patchWordSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new AppError("Invalid word patch", 400, parsed.error.flatten());
    }
    const data = await updateAdminWord(String(req.params.id), parsed.data);
    res.status(200).json({ data });
  } catch (error) {
    next(error);
  }
});

vocabImportRouter.post("/words/:id/deactivate", async (req, res, next) => {
  try {
    const data = await deactivateAdminWord(String(req.params.id));
    res.status(200).json({ data });
  } catch (error) {
    next(error);
  }
});

vocabImportRouter.delete("/words/:id", async (req, res, next) => {
  try {
    const data = await deleteAdminWord(String(req.params.id));
    res.status(200).json({ data });
  } catch (error) {
    next(error);
  }
});

const reclassifySchema = z.object({
  categoryId: z.string().min(1),
  levelId: z.string().min(1).optional(),
  gradeId: z.string().min(1).optional(),
});

vocabImportRouter.post("/words/:id/reclassify", async (req, res, next) => {
  try {
    const parsed = reclassifySchema.safeParse(req.body);
    if (!parsed.success) {
      throw new AppError("Invalid reclassify payload", 400, parsed.error.flatten());
    }
    const data = await reclassifyAdminWord(String(req.params.id), parsed.data);
    res.status(200).json({ data });
  } catch (error) {
    next(error);
  }
});

vocabImportRouter.get("/imports", async (_req, res, next) => {
  try {
    res.status(200).json({ data: await listImportHistory() });
  } catch (error) {
    next(error);
  }
});

vocabImportRouter.get("/imports/:id", async (req, res, next) => {
  try {
    res.status(200).json({ data: await getImportBatch(String(req.params.id)) });
  } catch (error) {
    next(error);
  }
});

vocabImportRouter.post(
  "/uploads",
  (req, res, next) => {
    upload.single("file")(req, res, (err) => {
      if (err instanceof multer.MulterError) {
        if (err.code === "LIMIT_FILE_SIZE") {
          return next(new AppError("File exceeds 5MB limit", 400));
        }
        return next(new AppError(err.message, 400));
      }
      return next(err);
    });
  },
  async (req: AuthenticatedRequest, res, next) => {
    try {
      const schema = z.object({
        levelId: z.string().min(1),
        categoryId: z.string().min(1),
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) {
        throw new AppError("levelId and categoryId are required", 400);
      }
      if (!req.file) {
        throw new AppError("File is required", 400);
      }

      const data = await createUploadBatch({
        adminId: req.user!.id,
        levelId: parsed.data.levelId,
        categoryId: parsed.data.categoryId,
        originalFilename: req.file.originalname,
        mimeType: req.file.mimetype,
        buffer: req.file.buffer,
      });
      res.status(201).json({ data });
    } catch (error) {
      next(error);
    }
  }
);

vocabImportRouter.put("/imports/:id/preview", async (req, res, next) => {
  try {
    const schema = z.object({
      rows: z.array(
        z.object({
          rowId: z.string(),
          serial: z.number().optional(),
          word: z.string(),
          simpleMeaning: z.string(),
          pronunciation: z.string().optional().default(""),
          categoryHint: z.string().optional().default(""),
          imageUrl: z.string().optional().default(""),
          audioUrl: z.string().optional().default(""),
          status: z.enum(["valid", "invalid", "duplicate"]).optional(),
          issues: z.array(z.string()).optional().default([]),
          selected: z.boolean().optional().default(true),
        })
      ),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      throw new AppError("Invalid preview payload", 400, parsed.error.flatten());
    }
    const data = await updateImportPreview(
      String(req.params.id),
      parsed.data.rows as ExtractedVocabRow[]
    );
    res.status(200).json({ data });
  } catch (error) {
    next(error);
  }
});

vocabImportRouter.post(
  "/imports/:id/confirm",
  async (req: AuthenticatedRequest, res, next) => {
    try {
      const data = await confirmImport(String(req.params.id), req.user!.id);
      res.status(200).json({ data });
    } catch (error) {
      next(error);
    }
  }
);
