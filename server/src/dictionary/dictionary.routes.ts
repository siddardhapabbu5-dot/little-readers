import { Router } from "express";
import multer from "multer";
import * as XLSX from "xlsx";
import { z } from "zod";
import {
  requireAuth,
  type AuthenticatedRequest,
} from "../middleware/auth.js";
import { requirePermission } from "../auth/permissions.js";
import { AppError } from "../lib/errors.js";
import { MAX_VOCAB_UPLOAD_BYTES } from "../vocab-import/file-security.js";
import { validateBody } from "../middleware/validate.js";
import { prisma } from "../lib/prisma.js";
import {
  approveAssignment,
  bulkApproveAssignments,
  bulkPublishAssignments,
  bulkRejectAssignments,
  classifyDictionaryBatch,
  confirmDictionaryUpload,
  createDictionaryUpload,
  errorReportToCsv,
  listAssignments,
  listDictionaryImports,
  listGrades,
  previewDictionaryUpload,
  publishAssignment,
  rejectAssignment,
  unpublishAssignment,
  updateAssignment,
} from "./dictionary.service.js";
import {
  addDictionarySense,
  buildGradeVocabularyExportRows,
  createDictionaryEntry,
  createDraftAssignment,
  deleteDictionaryEntry,
  getDictionaryDashboard,
  getDictionaryEntry,
  listPublishEvents,
  searchDictionaryEntries,
  updateDictionaryEntry,
  updateDictionarySense,
} from "./dictionary-cms.service.js";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_VOCAB_UPLOAD_BYTES, files: 1 },
});

export const dictionaryRouter = Router();

dictionaryRouter.use(requireAuth, requirePermission("content.manage"));

dictionaryRouter.get("/grades", async (_req, res, next) => {
  try {
    res.status(200).json({ data: await listGrades() });
  } catch (error) {
    next(error);
  }
});

dictionaryRouter.get("/dashboard", async (req, res, next) => {
  try {
    const data = await getDictionaryDashboard({
      gradeId:
        typeof req.query.gradeId === "string" ? req.query.gradeId : undefined,
      categoryId:
        typeof req.query.categoryId === "string"
          ? req.query.categoryId
          : undefined,
      status:
        typeof req.query.status === "string" ? req.query.status : undefined,
    });
    res.status(200).json({ data });
  } catch (error) {
    next(error);
  }
});

dictionaryRouter.get("/entries", async (req, res, next) => {
  try {
    const data = await searchDictionaryEntries({
      q: typeof req.query.q === "string" ? req.query.q : undefined,
      take: req.query.take != null ? Number(req.query.take) : 50,
    });
    res.status(200).json({ data });
  } catch (error) {
    next(error);
  }
});

dictionaryRouter.get("/entries/:id", async (req, res, next) => {
  try {
    res.status(200).json({ data: await getDictionaryEntry(String(req.params.id)) });
  } catch (error) {
    next(error);
  }
});

const createEntrySchema = z.object({
  headword: z.string().min(1).max(80),
  definition: z.string().min(1).max(500),
  pronunciation: z.string().max(120).optional(),
  audioUrl: z.string().max(500).optional(),
  sourceName: z.string().max(180).optional(),
  licence: z.string().max(180).optional(),
  wordType: z.string().max(40).optional(),
  example: z.string().max(300).optional(),
});

dictionaryRouter.post(
  "/entries",
  validateBody(createEntrySchema),
  async (req, res, next) => {
    try {
      const data = await createDictionaryEntry(req.body);
      res.status(201).json({ data });
    } catch (error) {
      next(error);
    }
  }
);

const patchEntrySchema = z.object({
  headword: z.string().min(1).max(80).optional(),
  pronunciation: z.string().max(120).nullable().optional(),
  audioUrl: z.string().max(500).nullable().optional(),
  sourceName: z.string().max(180).nullable().optional(),
  licence: z.string().max(180).nullable().optional(),
});

dictionaryRouter.patch(
  "/entries/:id",
  validateBody(patchEntrySchema),
  async (req, res, next) => {
    try {
      const data = await updateDictionaryEntry(String(req.params.id), req.body);
      res.status(200).json({ data });
    } catch (error) {
      next(error);
    }
  }
);

dictionaryRouter.delete("/entries/:id", async (req, res, next) => {
  try {
    res.status(200).json({ data: await deleteDictionaryEntry(String(req.params.id)) });
  } catch (error) {
    next(error);
  }
});

const senseSchema = z.object({
  definition: z.string().min(1).max(500),
  wordType: z.string().max(40).optional(),
  example: z.string().max(300).optional(),
});

dictionaryRouter.post(
  "/entries/:id/senses",
  validateBody(senseSchema),
  async (req, res, next) => {
    try {
      const data = await addDictionarySense(String(req.params.id), req.body);
      res.status(201).json({ data });
    } catch (error) {
      next(error);
    }
  }
);

const patchSenseSchema = z.object({
  definition: z.string().min(1).max(500).optional(),
  wordType: z.string().max(40).nullable().optional(),
  example: z.string().max(300).nullable().optional(),
});

dictionaryRouter.patch(
  "/senses/:id",
  validateBody(patchSenseSchema),
  async (req, res, next) => {
    try {
      const data = await updateDictionarySense(String(req.params.id), req.body);
      res.status(200).json({ data });
    } catch (error) {
      next(error);
    }
  }
);

const draftAssignmentSchema = z.object({
  senseId: z.string().min(1),
  gradeId: z.string().min(1),
  levelId: z.string().min(1),
  categoryId: z.string().min(1),
  meaningOverride: z.string().max(500).optional(),
  exampleOverride: z.string().max(300).optional(),
  difficultyOverride: z.number().int().min(1).max(5).optional(),
});

dictionaryRouter.post(
  "/assignments/draft",
  validateBody(draftAssignmentSchema),
  async (req, res, next) => {
    try {
      const data = await createDraftAssignment(req.body);
      res.status(201).json({ data });
    } catch (error) {
      next(error);
    }
  }
);

dictionaryRouter.get("/imports", async (_req, res, next) => {
  try {
    res.status(200).json({ data: await listDictionaryImports() });
  } catch (error) {
    next(error);
  }
});

dictionaryRouter.get("/imports/:id/errors.csv", async (req, res, next) => {
  try {
    const batch = await prisma.dictionaryImportBatch.findUnique({
      where: { id: String(req.params.id) },
    });
    if (!batch) throw new AppError("Dictionary import not found", 404);
    const errors = batch.errorReportJson
      ? (JSON.parse(batch.errorReportJson) as Array<{
          row: number;
          headword: string;
          issues: string[];
        }>)
      : [];
    const csv = errorReportToCsv(errors);
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="dictionary-import-${batch.id}-errors.csv"`
    );
    res.status(200).send(csv);
  } catch (error) {
    next(error);
  }
});

dictionaryRouter.post(
  "/uploads/preview",
  upload.single("file"),
  async (req: AuthenticatedRequest, res, next) => {
    try {
      if (!req.file) throw new AppError("file is required", 400);
      const data = await previewDictionaryUpload({
        adminId: req.user!.id,
        originalFilename: req.file.originalname,
        mimeType: req.file.mimetype,
        buffer: req.file.buffer,
        sourceName:
          typeof req.body.sourceName === "string" ? req.body.sourceName : undefined,
        licence: typeof req.body.licence === "string" ? req.body.licence : undefined,
      });
      res.status(201).json({ data });
    } catch (error) {
      next(error);
    }
  }
);

dictionaryRouter.post("/uploads/confirm/:id", async (req, res, next) => {
  try {
    const data = await confirmDictionaryUpload(String(req.params.id));
    res.status(200).json({ data });
  } catch (error) {
    next(error);
  }
});

dictionaryRouter.post(
  "/uploads",
  upload.single("file"),
  async (req: AuthenticatedRequest, res, next) => {
    try {
      if (!req.file) throw new AppError("file is required", 400);
      const data = await createDictionaryUpload({
        adminId: req.user!.id,
        originalFilename: req.file.originalname,
        mimeType: req.file.mimetype,
        buffer: req.file.buffer,
        sourceName:
          typeof req.body.sourceName === "string" ? req.body.sourceName : undefined,
        licence: typeof req.body.licence === "string" ? req.body.licence : undefined,
      });
      res.status(201).json({ data });
    } catch (error) {
      next(error);
    }
  }
);

const inlineUploadSchema = z.object({
  sourceName: z.string().min(1).max(180).optional(),
  licence: z.string().min(1).max(180).optional(),
  filename: z.string().min(1).max(180).optional(),
  rows: z
    .array(
      z.object({
        headword: z.string().min(1).max(80),
        definition: z.string().min(1).max(500),
        pos: z.string().max(40).optional(),
        example: z.string().max(300).optional(),
      })
    )
    .min(1)
    .max(500),
});

/** Phone-friendly upload: JSON rows (no multipart file required). */
dictionaryRouter.post(
  "/uploads/inline",
  validateBody(inlineUploadSchema),
  async (req: AuthenticatedRequest, res, next) => {
    try {
      const body = req.body as z.infer<typeof inlineUploadSchema>;
      const escape = (v: string) =>
        /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
      const csv = [
        "headword,definition,pos,example",
        ...body.rows.map((r) =>
          [
            escape(r.headword),
            escape(r.definition),
            escape(r.pos ?? ""),
            escape(r.example ?? ""),
          ].join(",")
        ),
      ].join("\n");
      const data = await createDictionaryUpload({
        adminId: req.user!.id,
        originalFilename: body.filename ?? "kids-inline.csv",
        mimeType: "text/csv",
        buffer: Buffer.from(csv, "utf8"),
        sourceName: body.sourceName ?? "LEARN WISE Kids Starter",
        licence:
          body.licence ?? "Project-owned sample template for LEARN WISE",
      });
      res.status(201).json({ data });
    } catch (error) {
      next(error);
    }
  }
);

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
        ? (req.query.status as
            | "DRAFT"
            | "PENDING"
            | "APPROVED"
            | "REJECTED"
            | "PUBLISHED"
            | "UNPUBLISHED")
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

dictionaryRouter.get("/publish-events", async (req, res, next) => {
  try {
    const data = await listPublishEvents(
      typeof req.query.assignmentId === "string"
        ? req.query.assignmentId
        : undefined,
      req.query.take != null ? Number(req.query.take) : 50
    );
    res.status(200).json({ data });
  } catch (error) {
    next(error);
  }
});

dictionaryRouter.get("/export.xlsx", async (req, res, next) => {
  try {
    const gradeId =
      typeof req.query.gradeId === "string" ? req.query.gradeId : undefined;
    if (!gradeId) throw new AppError("gradeId is required", 400);
    const { grade, rows } = await buildGradeVocabularyExportRows(gradeId);
    const aoa = [
      [
        "headword",
        "central_meaning",
        "meaning_override",
        "published_meaning",
        "example_override",
        "example_sentence",
        "pos",
        "pronunciation",
        "grade",
        "level",
        "category",
        "category_label",
        "status",
        "word_active",
      ],
      ...rows.map((r) => [
        r.headword,
        r.centralMeaning,
        r.meaningOverride,
        r.publishedMeaning,
        r.exampleOverride,
        r.exampleSentence,
        r.pos,
        r.pronunciation,
        r.grade,
        r.level,
        r.category,
        r.categoryLabel,
        r.status,
        r.wordActive ? "yes" : "no",
      ]),
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.aoa_to_sheet(aoa),
      `${grade.code} Vocabulary`
    );
    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="dictionary-${grade.code}.xlsx"`
    );
    res.status(200).send(buf);
  } catch (error) {
    next(error);
  }
});

const patchAssignmentSchema = z.object({
  gradeId: z.string().min(1).optional(),
  levelId: z.string().min(1).optional(),
  categoryId: z.string().min(1).optional(),
  status: z
    .enum(["DRAFT", "PENDING", "APPROVED", "REJECTED", "PUBLISHED", "UNPUBLISHED"])
    .optional(),
  meaningOverride: z.string().max(500).nullable().optional(),
  exampleOverride: z.string().max(300).nullable().optional(),
  difficultyOverride: z.number().int().min(1).max(5).nullable().optional(),
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

dictionaryRouter.post(
  "/assignments/:id/unpublish",
  async (req: AuthenticatedRequest, res, next) => {
    try {
      const data = await unpublishAssignment(String(req.params.id), req.user!.id);
      res.status(200).json({ data });
    } catch (error) {
      next(error);
    }
  }
);

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
