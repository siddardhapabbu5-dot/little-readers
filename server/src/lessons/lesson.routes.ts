import { Router } from "express";
import { z } from "zod";
import { requireAuth, requireRoles } from "../middleware/auth.js";
import { AppError } from "../lib/errors.js";
import {
  createAdminLesson,
  deactivateAdminLesson,
  getAdminLesson,
  listAdminLessons,
  previewLesson,
  publishLesson,
  removeLessonWord,
  setLessonWords,
  unpublishLesson,
  updateAdminLesson,
} from "./lesson.service.js";

export const lessonAdminRouter = Router();

lessonAdminRouter.use(requireAuth, requireRoles("ADMIN", "SUPER_ADMIN"));

lessonAdminRouter.get("/", async (req, res, next) => {
  try {
    const bool = (v: unknown) => {
      if (v === "true" || v === "1") return true;
      if (v === "false" || v === "0") return false;
      return undefined;
    };
    const status =
      typeof req.query.status === "string" &&
      ["DRAFT", "PUBLISHED", "ARCHIVED"].includes(req.query.status)
        ? (req.query.status as "DRAFT" | "PUBLISHED" | "ARCHIVED")
        : undefined;
    const data = await listAdminLessons({
      q: typeof req.query.q === "string" ? req.query.q : undefined,
      gradeId:
        typeof req.query.gradeId === "string" ? req.query.gradeId : undefined,
      levelId:
        typeof req.query.levelId === "string" ? req.query.levelId : undefined,
      groupId:
        typeof req.query.groupId === "string" ? req.query.groupId : undefined,
      learningCategoryId:
        typeof req.query.learningCategoryId === "string"
          ? req.query.learningCategoryId
          : undefined,
      status,
      isPublished: bool(req.query.isPublished),
      isActive: bool(req.query.isActive),
      take: req.query.take != null ? Number(req.query.take) : 100,
      skip: req.query.skip != null ? Number(req.query.skip) : 0,
    });
    res.status(200).json({ data });
  } catch (error) {
    next(error);
  }
});

lessonAdminRouter.get("/:id", async (req, res, next) => {
  try {
    res.status(200).json({ data: await getAdminLesson(String(req.params.id)) });
  } catch (error) {
    next(error);
  }
});

lessonAdminRouter.get("/:id/preview", async (req, res, next) => {
  try {
    res.status(200).json({ data: await previewLesson(String(req.params.id)) });
  } catch (error) {
    next(error);
  }
});

const createSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  instructions: z.string().max(4000).optional(),
  gradeId: z.string().min(1).optional(),
  levelId: z.string().min(1).optional(),
  groupId: z.string().min(1).optional(),
  learningCategoryId: z.string().min(1).optional(),
  difficulty: z.number().int().min(1).max(5).optional(),
  sortOrder: z.number().int().optional(),
  activities: z.array(z.enum(["LISTEN", "SPELL"])).optional(),
  category: z.string().max(120).optional(),
});

lessonAdminRouter.post("/", async (req, res, next) => {
  try {
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new AppError("Invalid lesson payload", 400, parsed.error.flatten());
    }
    const data = await createAdminLesson(parsed.data);
    res.status(201).json({ data });
  } catch (error) {
    next(error);
  }
});

const patchSchema = createSchema.partial().extend({
  description: z.string().max(2000).nullable().optional(),
  instructions: z.string().max(4000).nullable().optional(),
  gradeId: z.string().min(1).nullable().optional(),
  levelId: z.string().min(1).nullable().optional(),
  groupId: z.string().min(1).nullable().optional(),
  learningCategoryId: z.string().min(1).nullable().optional(),
  isActive: z.boolean().optional(),
});

lessonAdminRouter.patch("/:id", async (req, res, next) => {
  try {
    const parsed = patchSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new AppError("Invalid lesson patch", 400, parsed.error.flatten());
    }
    const data = await updateAdminLesson(String(req.params.id), parsed.data);
    res.status(200).json({ data });
  } catch (error) {
    next(error);
  }
});

lessonAdminRouter.post("/:id/deactivate", async (req, res, next) => {
  try {
    res
      .status(200)
      .json({ data: await deactivateAdminLesson(String(req.params.id)) });
  } catch (error) {
    next(error);
  }
});

lessonAdminRouter.post("/:id/publish", async (req, res, next) => {
  try {
    res.status(200).json({ data: await publishLesson(String(req.params.id)) });
  } catch (error) {
    next(error);
  }
});

lessonAdminRouter.post("/:id/unpublish", async (req, res, next) => {
  try {
    res.status(200).json({ data: await unpublishLesson(String(req.params.id)) });
  } catch (error) {
    next(error);
  }
});

const wordsSchema = z.object({
  vocabularyWordIds: z.array(z.string().min(1)).max(200),
});

lessonAdminRouter.put("/:id/words", async (req, res, next) => {
  try {
    const parsed = wordsSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new AppError("Invalid words payload", 400, parsed.error.flatten());
    }
    const data = await setLessonWords(
      String(req.params.id),
      parsed.data.vocabularyWordIds
    );
    res.status(200).json({ data });
  } catch (error) {
    next(error);
  }
});

lessonAdminRouter.delete(
  "/:id/words/:vocabularyWordId",
  async (req, res, next) => {
    try {
      const data = await removeLessonWord(
        String(req.params.id),
        String(req.params.vocabularyWordId)
      );
      res.status(200).json({ data });
    } catch (error) {
      next(error);
    }
  }
);
