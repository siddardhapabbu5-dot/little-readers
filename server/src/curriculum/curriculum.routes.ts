import { Router, type RequestHandler } from "express";
import multer from "multer";
import { z } from "zod";
import { requireAuth } from "../middleware/auth.js";
import { requirePermission } from "../auth/permissions.js";
import { AppError } from "../lib/errors.js";
import { MAX_VOCAB_UPLOAD_BYTES } from "../vocab-import/file-security.js";
import {
  applyCurriculumImport,
  assertCurriculumLevel,
  bulkSetCategoryStatus,
  exportCurriculumWorkbook,
  getCurriculumOverview,
  getCurriculumSummary,
  previewCurriculumImport,
  setCategoryStatus,
} from "./curriculum.service.js";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_VOCAB_UPLOAD_BYTES, files: 1 },
});

const uploadFile: RequestHandler = (req, res, next) => {
  upload.single("file")(req, res, (err: unknown) => {
    if (err instanceof multer.MulterError) {
      return next(new AppError(err.code === "LIMIT_FILE_SIZE" ? "File exceeds 5MB limit" : err.message, 400));
    }
    return next(err);
  });
};

const STATUSES = ["DRAFT", "PENDING_APPROVAL", "APPROVED", "PUBLISHED", "UNPUBLISHED"] as const;

export const curriculumRouter = Router();

curriculumRouter.use(requireAuth, requirePermission("content.manage"));

curriculumRouter.get("/overview", async (_req, res, next) => {
  try {
    res.status(200).json({ data: await getCurriculumOverview() });
  } catch (e) {
    next(e);
  }
});

curriculumRouter.get("/summary", async (req, res, next) => {
  try {
    const levelCode = assertCurriculumLevel(req.query.levelCode);
    res.status(200).json({ data: await getCurriculumSummary(levelCode) });
  } catch (e) {
    next(e);
  }
});

curriculumRouter.get("/export.xlsx", async (req, res, next) => {
  try {
    const levelCode = assertCurriculumLevel(req.query.levelCode);
    const { buffer, filename } = await exportCurriculumWorkbook(levelCode);
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.status(200).send(buffer);
  } catch (e) {
    next(e);
  }
});

curriculumRouter.post("/import/preview", uploadFile as never, async (req, res, next) => {
  try {
    const levelCode = assertCurriculumLevel(req.body?.levelCode ?? req.query.levelCode);
    if (!req.file) throw new AppError("File is required", 400);
    res.status(200).json({
      data: await previewCurriculumImport({
        levelCode,
        buffer: req.file.buffer,
        filename: req.file.originalname,
      }),
    });
  } catch (e) {
    next(e);
  }
});

curriculumRouter.post("/import/apply", uploadFile as never, async (req, res, next) => {
  try {
    const levelCode = assertCurriculumLevel(req.body?.levelCode ?? req.query.levelCode);
    if (!req.file) throw new AppError("File is required", 400);
    const allowPartial = req.body?.allowPartial === "true" || req.body?.allowPartial === true;
    res.status(200).json({
      data: await applyCurriculumImport({
        levelCode,
        buffer: req.file.buffer,
        filename: req.file.originalname,
        allowPartial,
      }),
    });
  } catch (e) {
    next(e);
  }
});

const statusSchema = z.object({ status: z.enum(STATUSES) });

curriculumRouter.post("/categories/:id/status", async (req, res, next) => {
  try {
    const parsed = statusSchema.safeParse(req.body);
    if (!parsed.success) throw new AppError("status must be one of " + STATUSES.join(", "), 400);
    res.status(200).json({ data: await setCategoryStatus(String(req.params.id), parsed.data.status) });
  } catch (e) {
    next(e);
  }
});

const bulkSchema = z.object({
  categoryIds: z.array(z.string().min(1)).min(1).max(200),
  status: z.enum(STATUSES),
});

curriculumRouter.post("/categories/status", async (req, res, next) => {
  try {
    const parsed = bulkSchema.safeParse(req.body);
    if (!parsed.success) throw new AppError("Invalid bulk status payload", 400, parsed.error.flatten());
    res.status(200).json({ data: await bulkSetCategoryStatus(parsed.data.categoryIds, parsed.data.status) });
  } catch (e) {
    next(e);
  }
});
