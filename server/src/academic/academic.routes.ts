import { Router } from "express";
import { z } from "zod";
import {
  requireAuth,
  requireRoles,
  type AuthenticatedRequest,
} from "../middleware/auth.js";
import { validateBody } from "../middleware/validate.js";
import * as academic from "./academic.service.js";
import * as plans from "./subscription-plan.service.js";

export const academicAdminRouter = Router();
export const academicParentRouter = Router();

academicAdminRouter.use(requireAuth, requireRoles("ADMIN", "SUPER_ADMIN"));

const levelBody = z.object({
  code: z.string().min(1).max(40).optional(),
  label: z.string().min(1).max(120),
  startGrade: z.coerce.number().int().min(1).max(12),
  endGrade: z.coerce.number().int().min(1).max(12),
  description: z.string().max(500).optional().nullable(),
  sortOrder: z.coerce.number().int().optional(),
  isActive: z.boolean().optional(),
  isPublished: z.boolean().optional(),
});

const gradeBody = z.object({
  code: z.string().min(1).max(40).optional(),
  label: z.string().min(1).max(120),
  gradeNumber: z.coerce.number().int().min(1).max(12),
  assignedLevelId: z.string().min(1),
  description: z.string().max(500).optional().nullable(),
  sortOrder: z.coerce.number().int().optional(),
  isActive: z.boolean().optional(),
  isPublished: z.boolean().optional(),
});

const planBody = z.object({
  name: z.string().min(1).max(120),
  code: z.string().min(1).max(40).optional(),
  description: z.string().max(500).optional().nullable(),
  durationMonths: z.coerce.number().int().refine((n) => [1, 3, 6, 12].includes(n)),
  amountPaise: z.coerce.number().int().positive(),
  applicableLevel: z.string().min(1).max(40).optional(),
  levelId: z.string().min(1).nullable().optional(),
  includedSeats: z.coerce.number().int().min(1).max(20).optional(),
  sortOrder: z.coerce.number().int().optional(),
  isActive: z.boolean().optional(),
  isPublished: z.boolean().optional(),
});

// ——— Levels ———
academicAdminRouter.get("/levels", async (req, res, next) => {
  try {
    const includeInactive = String(req.query.includeInactive ?? "1") !== "0";
    res.json({ data: await academic.listLevelsAdmin(includeInactive) });
  } catch (e) {
    next(e);
  }
});

academicAdminRouter.post(
  "/levels",
  validateBody(levelBody.extend({ code: z.string().min(1).max(40) })),
  async (req, res, next) => {
    try {
      res.status(201).json({ data: await academic.createLevel(req.body) });
    } catch (e) {
      next(e);
    }
  }
);

academicAdminRouter.post(
  "/levels/preview-range",
  validateBody(
    z.object({
      levelId: z.string().optional(),
      startGrade: z.coerce.number().int(),
      endGrade: z.coerce.number().int(),
    })
  ),
  async (req, res, next) => {
    try {
      res.json({ data: await academic.previewLevelRangeImpact(req.body) });
    } catch (e) {
      next(e);
    }
  }
);

academicAdminRouter.patch(
  "/levels/:id",
  validateBody(levelBody.partial()),
  async (req, res, next) => {
    try {
      res.json({
        data: await academic.updateLevel(String(req.params.id), req.body),
      });
    } catch (e) {
      next(e);
    }
  }
);

academicAdminRouter.post("/levels/:id/deactivate", async (req, res, next) => {
  try {
    res.json({
      data: await academic.deactivateLevel(String(req.params.id)),
    });
  } catch (e) {
    next(e);
  }
});

academicAdminRouter.post("/levels/:id/publish", async (req, res, next) => {
  try {
    const published = String(req.query.published ?? "1") !== "0";
    res.json({
      data: await academic.updateLevel(String(req.params.id), {
        isPublished: published,
      }),
    });
  } catch (e) {
    next(e);
  }
});

academicAdminRouter.delete("/levels/:id", async (req, res, next) => {
  try {
    res.json({
      data: await academic.deleteOrArchiveLevel(String(req.params.id)),
    });
  } catch (e) {
    next(e);
  }
});

academicAdminRouter.post("/ensure-defaults", async (req, res, next) => {
  try {
    // Levels only by default. Pass seedGrades=1 only when intentionally
    // bootstrapping G1–G12 (never from routine screen loads).
    const seedGrades =
      req.query.seedGrades === "1" ||
      req.query.seedGrades === "true" ||
      req.body?.seedGrades === true;
    res.json({
      data: await academic.ensureAcademicDefaults({ seedGrades }),
    });
  } catch (e) {
    next(e);
  }
});

// ——— Grades ———
academicAdminRouter.get("/grades", async (req, res, next) => {
  try {
    const includeInactive = String(req.query.includeInactive ?? "1") !== "0";
    res.json({ data: await academic.listGradesAdmin(includeInactive) });
  } catch (e) {
    next(e);
  }
});

academicAdminRouter.post(
  "/grades",
  validateBody(gradeBody.extend({ code: z.string().min(1).max(40) })),
  async (req, res, next) => {
    try {
      res.status(201).json({ data: await academic.createGrade(req.body) });
    } catch (e) {
      next(e);
    }
  }
);

academicAdminRouter.patch(
  "/grades/:id",
  validateBody(gradeBody.partial()),
  async (req, res, next) => {
    try {
      res.json({
        data: await academic.updateGrade(String(req.params.id), req.body),
      });
    } catch (e) {
      next(e);
    }
  }
);

academicAdminRouter.post("/grades/:id/deactivate", async (req, res, next) => {
  try {
    res.json({
      data: await academic.deactivateGrade(String(req.params.id)),
    });
  } catch (e) {
    next(e);
  }
});

academicAdminRouter.post("/grades/:id/publish", async (req, res, next) => {
  try {
    const published = String(req.query.published ?? "1") !== "0";
    res.json({
      data: await academic.updateGrade(String(req.params.id), {
        isPublished: published,
      }),
    });
  } catch (e) {
    next(e);
  }
});

academicAdminRouter.delete("/grades/:id", async (req, res, next) => {
  try {
    res.json({
      data: await academic.deleteOrArchiveGrade(String(req.params.id)),
    });
  } catch (e) {
    next(e);
  }
});

// ——— Subscription plans ———
academicAdminRouter.get("/subscription-plans", async (req, res, next) => {
  try {
    const includeInactive = String(req.query.includeInactive ?? "1") !== "0";
    res.json({ data: await plans.listPlansAdmin(includeInactive) });
  } catch (e) {
    next(e);
  }
});

academicAdminRouter.post(
  "/subscription-plans",
  validateBody(planBody.extend({ code: z.string().min(1).max(40) })),
  async (req, res, next) => {
    try {
      res.status(201).json({ data: await plans.createPlan(req.body) });
    } catch (e) {
      next(e);
    }
  }
);

academicAdminRouter.patch(
  "/subscription-plans/:id",
  validateBody(planBody.partial()),
  async (req, res, next) => {
    try {
      res.json({
        data: await plans.updatePlan(String(req.params.id), req.body),
      });
    } catch (e) {
      next(e);
    }
  }
);

academicAdminRouter.post(
  "/subscription-plans/:id/deactivate",
  async (req, res, next) => {
    try {
      res.json({
        data: await plans.deactivatePlan(String(req.params.id)),
      });
    } catch (e) {
      next(e);
    }
  }
);

academicAdminRouter.post(
  "/subscription-plans/:id/publish",
  async (req, res, next) => {
    try {
      const published = String(req.query.published ?? "1") !== "0";
      res.json({
        data: await plans.updatePlan(String(req.params.id), {
          isPublished: published,
        }),
      });
    } catch (e) {
      next(e);
    }
  }
);

academicAdminRouter.delete("/subscription-plans/:id", async (req, res, next) => {
  try {
    res.json({
      data: await plans.deleteOrArchivePlan(String(req.params.id)),
    });
  } catch (e) {
    next(e);
  }
});

// ——— Parent published catalog ———
academicParentRouter.get(
  "/levels",
  requireAuth,
  requireRoles("PARENT", "ADMIN", "SUPER_ADMIN"),
  async (_req, res, next) => {
    try {
      res.json({ data: await academic.listPublishedLevels() });
    } catch (e) {
      next(e);
    }
  }
);

academicParentRouter.get(
  "/grades",
  requireAuth,
  requireRoles("PARENT", "ADMIN", "SUPER_ADMIN"),
  async (req, res, next) => {
    try {
      const levelId = req.query.levelId
        ? String(req.query.levelId)
        : undefined;
      res.json({ data: await academic.listPublishedGrades(levelId) });
    } catch (e) {
      next(e);
    }
  }
);

academicParentRouter.get(
  "/subscription-plans",
  requireAuth,
  requireRoles("PARENT", "ADMIN", "SUPER_ADMIN"),
  async (req, res, next) => {
    try {
      const levelId = req.query.levelId
        ? String(req.query.levelId)
        : undefined;
      res.json({ data: await plans.listPublishedPlans(levelId) });
    } catch (e) {
      next(e);
    }
  }
);
