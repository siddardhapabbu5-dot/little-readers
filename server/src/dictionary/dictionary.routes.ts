import { Router } from "express";
import multer from "multer";
import { z } from "zod";
import {
  requireAuth,
  requireRoles,
  type AuthenticatedRequest,
} from "../middleware/auth.js";
import { AppError } from "../lib/errors.js";
import { MAX_VOCAB_UPLOAD_BYTES } from "../vocab-import/file-security.js";
import { validateBody } from "../middleware/validate.js";
import {
  approveAssignment,
  bulkApproveAssignments,
  bulkPublishAssignments,
  bulkRejectAssignments,
  classifyDictionaryBatch,
  createDictionaryUpload,
  listAssignments,
  listDictionaryImports,
  listGrades,
  publishAssignment,
  rejectAssignment,
  updateAssignment,
} from "./dictionary.service.js";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_VOCAB_UPLOAD_BYTES, files: 1 },
});

export const dictionaryRouter = Router();

dictionaryRouter.use(requireAuth, requireRoles("ADMIN", "SUPER_ADMIN"));

dictionaryRouter.get("/grades", async (_req, res, next) => {
  try {
    res.status(200).json({ data: await listGrades() });
  } catch (error) {
    next(error);
  }
});

dictionaryRouter.get("/imports", async (_req, res, next) => {
  try {
    res.status(200).json({ data: await listDictionaryImports() });
  } catch (error) {
    next(error);
  }
});

dictionaryRouter.post("/uploads", upload.single("file"), async (req: AuthenticatedRequest, res, next) => {
  try {
    if (!req.file) throw new AppError("file is required", 400);
    const data = await createDictionaryUpload({
      adminId: req.user!.id,
      originalFilename: req.file.originalname,
      mimeType: req.file.mimetype,
      buffer: req.file.buffer,
      sourceName: typeof req.body.sourceName === "string" ? req.body.sourceName : undefined,
      licence: typeof req.body.licence === "string" ? req.body.licence : undefined,
    });
    res.status(201).json({ data });
  } catch (error) {
    next(error);
  }
});

dictionaryRouter.post("/imports/:id/classify", async (req, res, next) => {
  try {
    const data = await classifyDictionaryBatch(String(req.params.id));
    res.status(200).json({ data });
  } catch (error) {
    next(error);
  }
});

dictionaryRouter.get("/assignments", async (req, res, next) => {
  try {
    const status =
      typeof req.query.status === "string"
        ? (req.query.status as "PENDING" | "APPROVED" | "REJECTED" | "PUBLISHED")
        : undefined;
    const gradeId =
      typeof req.query.gradeId === "string" ? req.query.gradeId : undefined;
    const maxConfidence =
      req.query.maxConfidence != null ? Number(req.query.maxConfidence) : undefined;
    const take = req.query.take != null ? Number(req.query.take) : 100;
    const data = await listAssignments({ status, gradeId, maxConfidence, take });
    res.status(200).json({ data });
  } catch (error) {
    next(error);
  }
});

const patchAssignmentSchema = z.object({
  gradeId: z.string().min(1).optional(),
  levelId: z.string().min(1).optional(),
  categoryId: z.string().min(1).optional(),
  status: z.enum(["PENDING", "APPROVED", "REJECTED", "PUBLISHED"]).optional(),
});

dictionaryRouter.patch(
  "/assignments/:id",
  validateBody(patchAssignmentSchema),
  async (req: AuthenticatedRequest, res, next) => {
    try {
      const data = await updateAssignment(
        String(req.params.id),
        req.body,
        req.user!.id
      );
      res.status(200).json({ data });
    } catch (error) {
      next(error);
    }
  }
);

dictionaryRouter.post("/assignments/:id/approve", async (req: AuthenticatedRequest, res, next) => {
  try {
    const data = await approveAssignment(String(req.params.id), req.user!.id);
    res.status(200).json({ data });
  } catch (error) {
    next(error);
  }
});

dictionaryRouter.post("/assignments/:id/reject", async (req: AuthenticatedRequest, res, next) => {
  try {
    const data = await rejectAssignment(String(req.params.id), req.user!.id);
    res.status(200).json({ data });
  } catch (error) {
    next(error);
  }
});

dictionaryRouter.post("/assignments/:id/publish", async (req: AuthenticatedRequest, res, next) => {
  try {
    const data = await publishAssignment(String(req.params.id), req.user!.id);
    res.status(200).json({ data });
  } catch (error) {
    next(error);
  }
});

const bulkSchema = z.object({
  ids: z.array(z.string().min(1)).min(1).max(200),
});

dictionaryRouter.post(
  "/assignments/bulk-approve",
  validateBody(bulkSchema),
  async (req: AuthenticatedRequest, res, next) => {
    try {
      const data = await bulkApproveAssignments(req.body.ids, req.user!.id);
      res.status(200).json({ data });
    } catch (error) {
      next(error);
    }
  }
);

dictionaryRouter.post(
  "/assignments/bulk-reject",
  validateBody(bulkSchema),
  async (req: AuthenticatedRequest, res, next) => {
    try {
      const data = await bulkRejectAssignments(req.body.ids, req.user!.id);
      res.status(200).json({ data });
    } catch (error) {
      next(error);
    }
  }
);

dictionaryRouter.post(
  "/assignments/bulk-publish",
  validateBody(bulkSchema),
  async (req: AuthenticatedRequest, res, next) => {
    try {
      const data = await bulkPublishAssignments(req.body.ids, req.user!.id);
      res.status(200).json({ data });
    } catch (error) {
      next(error);
    }
  }
);
