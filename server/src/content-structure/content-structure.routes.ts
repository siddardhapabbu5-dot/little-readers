import { Router } from "express";
import { z } from "zod";
import {
  requireAuth,
  requireRoles,
  type AuthenticatedRequest,
} from "../middleware/auth.js";
import { requirePermission } from "../auth/permissions.js";
import { validateBody } from "../middleware/validate.js";
import {
  createCategory,
  createGrade,
  createGroup,
  createLevel,
  deactivateCategory,
  deactivateGrade,
  deactivateGroup,
  deactivateLevel,
  deleteCategory,
  deleteGrade,
  deleteGroup,
  deleteLevel,
  fillCategoryStarterWords,
  listCategoriesAdmin,
  listGradesAdmin,
  listGroupsAdmin,
  listLevelsAdmin,
  updateCategory,
  updateGrade,
  updateGroup,
  updateLevel,
} from "./content-structure.service.js";
import { listStarterPackThemes } from "./category-starter-packs.js";

export const contentStructureRouter = Router();

contentStructureRouter.use(requireAuth, requirePermission("content.manage"));

const gradeCreateSchema = z.object({
  code: z.string().min(1).max(40),
  label: z.string().min(1).max(120),
  ageMin: z.coerce.number().int(),
  ageMax: z.coerce.number().int(),
  description: z.string().max(500).optional(),
  sortOrder: z.coerce.number().int().optional(),
  isActive: z.boolean().optional(),
});

const gradePatchSchema = z.object({
  code: z.string().min(1).max(40).optional(),
  label: z.string().min(1).max(120).optional(),
  ageMin: z.coerce.number().int().optional(),
  ageMax: z.coerce.number().int().optional(),
  description: z.string().max(500).nullable().optional(),
  sortOrder: z.coerce.number().int().optional(),
  isActive: z.boolean().optional(),
});

const levelCreateSchema = z.object({
  code: z.string().min(1).max(40),
  label: z.string().min(1).max(120),
  kind: z.enum(["GRADE_BAND", "DIFFICULTY"]).optional(),
  gradeId: z.string().min(1).nullable().optional(),
  ageMin: z.coerce.number().int().optional(),
  ageMax: z.coerce.number().int().optional(),
  description: z.string().max(500).optional(),
  sortOrder: z.coerce.number().int().optional(),
  isActive: z.boolean().optional(),
});

const levelPatchSchema = z.object({
  label: z.string().min(1).max(120).optional(),
  kind: z.enum(["GRADE_BAND", "DIFFICULTY"]).optional(),
  gradeId: z.string().min(1).nullable().optional(),
  ageMin: z.coerce.number().int().optional(),
  ageMax: z.coerce.number().int().optional(),
  description: z.string().max(500).nullable().optional(),
  sortOrder: z.coerce.number().int().optional(),
  isActive: z.boolean().optional(),
});

const groupCreateSchema = z.object({
  levelId: z.string().min(1),
  code: z.string().min(1).max(40),
  label: z.string().min(1).max(120),
  description: z.string().max(500).optional(),
  sortOrder: z.coerce.number().int().optional(),
  isActive: z.boolean().optional(),
});

const groupPatchSchema = z.object({
  levelId: z.string().min(1).optional(),
  label: z.string().min(1).max(120).optional(),
  description: z.string().max(500).nullable().optional(),
  sortOrder: z.coerce.number().int().optional(),
  isActive: z.boolean().optional(),
});

const categoryCreateSchema = z.object({
  groupId: z.string().min(1),
  code: z.string().min(1).max(40),
  label: z.string().min(1).max(120),
  description: z.string().max(500).optional(),
  emoji: z.string().max(16).optional(),
  sortOrder: z.coerce.number().int().optional(),
  unlockOrder: z.coerce.number().int().optional(),
  isPublished: z.boolean().optional(),
  fillStarters: z.boolean().optional(),
});

const categoryPatchSchema = z.object({
  groupId: z.string().min(1).optional(),
  label: z.string().min(1).max(120).optional(),
  description: z.string().max(500).nullable().optional(),
  emoji: z.string().max(16).optional(),
  sortOrder: z.coerce.number().int().optional(),
  unlockOrder: z.coerce.number().int().optional(),
  isPublished: z.boolean().optional(),
});

// Grades
contentStructureRouter.get("/grades", async (req, res, next) => {
  try {
    const includeInactive = req.query.includeInactive !== "false";
    res.status(200).json({ data: await listGradesAdmin(includeInactive) });
  } catch (e) {
    next(e);
  }
});

contentStructureRouter.post(
  "/grades",
  validateBody(gradeCreateSchema),
  async (req: AuthenticatedRequest, res, next) => {
    try {
      res.status(201).json({ data: await createGrade(req.body) });
    } catch (e) {
      next(e);
    }
  }
);

contentStructureRouter.patch(
  "/grades/:id",
  validateBody(gradePatchSchema),
  async (req, res, next) => {
    try {
      res.status(200).json({ data: await updateGrade(String(req.params.id), req.body) });
    } catch (e) {
      next(e);
    }
  }
);

contentStructureRouter.post("/grades/:id/deactivate", async (req, res, next) => {
  try {
    res.status(200).json({ data: await deactivateGrade(String(req.params.id)) });
  } catch (e) {
    next(e);
  }
});

contentStructureRouter.delete("/grades/:id", requirePermission("content.destroy"), async (req, res, next) => {
  try {
    const force =
      req.query.force === "1" ||
      req.query.force === "true" ||
      (req.body && req.body.force === true);
    res
      .status(200)
      .json({ data: await deleteGrade(String(req.params.id), { force }) });
  } catch (e) {
    next(e);
  }
});

// Levels
contentStructureRouter.get("/levels", async (req, res, next) => {
  try {
    const gradeId =
      typeof req.query.gradeId === "string" ? req.query.gradeId : undefined;
    const includeInactive = req.query.includeInactive !== "false";
    res.status(200).json({ data: await listLevelsAdmin(gradeId, includeInactive) });
  } catch (e) {
    next(e);
  }
});

contentStructureRouter.post(
  "/levels",
  validateBody(levelCreateSchema),
  async (req, res, next) => {
    try {
      res.status(201).json({ data: await createLevel(req.body) });
    } catch (e) {
      next(e);
    }
  }
);

contentStructureRouter.patch(
  "/levels/:id",
  validateBody(levelPatchSchema),
  async (req, res, next) => {
    try {
      res.status(200).json({ data: await updateLevel(String(req.params.id), req.body) });
    } catch (e) {
      next(e);
    }
  }
);

contentStructureRouter.post("/levels/:id/deactivate", async (req, res, next) => {
  try {
    res.status(200).json({ data: await deactivateLevel(String(req.params.id)) });
  } catch (e) {
    next(e);
  }
});

contentStructureRouter.delete("/levels/:id", requirePermission("content.destroy"), async (req, res, next) => {
  try {
    res.status(200).json({ data: await deleteLevel(String(req.params.id)) });
  } catch (e) {
    next(e);
  }
});

// Groups
contentStructureRouter.get("/groups", async (req, res, next) => {
  try {
    const levelId =
      typeof req.query.levelId === "string" ? req.query.levelId : undefined;
    const includeInactive = req.query.includeInactive !== "false";
    res.status(200).json({ data: await listGroupsAdmin(levelId, includeInactive) });
  } catch (e) {
    next(e);
  }
});

contentStructureRouter.post(
  "/groups",
  validateBody(groupCreateSchema),
  async (req, res, next) => {
    try {
      res.status(201).json({ data: await createGroup(req.body) });
    } catch (e) {
      next(e);
    }
  }
);

contentStructureRouter.patch(
  "/groups/:id",
  validateBody(groupPatchSchema),
  async (req, res, next) => {
    try {
      res.status(200).json({ data: await updateGroup(String(req.params.id), req.body) });
    } catch (e) {
      next(e);
    }
  }
);

contentStructureRouter.post("/groups/:id/deactivate", async (req, res, next) => {
  try {
    res.status(200).json({ data: await deactivateGroup(String(req.params.id)) });
  } catch (e) {
    next(e);
  }
});

contentStructureRouter.delete("/groups/:id", requirePermission("content.destroy"), async (req, res, next) => {
  try {
    res.status(200).json({ data: await deleteGroup(String(req.params.id)) });
  } catch (e) {
    next(e);
  }
});

// Categories
contentStructureRouter.get("/categories", async (req, res, next) => {
  try {
    const groupId =
      typeof req.query.groupId === "string" ? req.query.groupId : undefined;
    const levelId =
      typeof req.query.levelId === "string" ? req.query.levelId : undefined;
    const includeUnpublished = req.query.includeUnpublished !== "false";
    res.status(200).json({
      data: await listCategoriesAdmin({ groupId, levelId, includeUnpublished }),
    });
  } catch (e) {
    next(e);
  }
});

contentStructureRouter.get("/starter-packs", async (_req, res, next) => {
  try {
    res.status(200).json({ data: listStarterPackThemes() });
  } catch (e) {
    next(e);
  }
});

contentStructureRouter.post(
  "/categories",
  validateBody(categoryCreateSchema),
  async (req, res, next) => {
    try {
      res.status(201).json({ data: await createCategory(req.body) });
    } catch (e) {
      next(e);
    }
  }
);

contentStructureRouter.post(
  "/categories/:id/fill-starters",
  async (req, res, next) => {
    try {
      res
        .status(200)
        .json({ data: await fillCategoryStarterWords(String(req.params.id)) });
    } catch (e) {
      next(e);
    }
  }
);

contentStructureRouter.patch(
  "/categories/:id",
  validateBody(categoryPatchSchema),
  async (req, res, next) => {
    try {
      res
        .status(200)
        .json({ data: await updateCategory(String(req.params.id), req.body) });
    } catch (e) {
      next(e);
    }
  }
);

contentStructureRouter.post("/categories/:id/deactivate", async (req, res, next) => {
  try {
    res.status(200).json({ data: await deactivateCategory(String(req.params.id)) });
  } catch (e) {
    next(e);
  }
});

contentStructureRouter.delete("/categories/:id", requirePermission("content.destroy"), async (req, res, next) => {
  try {
    const force =
      req.query.force === "1" ||
      req.query.force === "true" ||
      (req.body && req.body.force === true);
    res
      .status(200)
      .json({ data: await deleteCategory(String(req.params.id), { force }) });
  } catch (e) {
    next(e);
  }
});
