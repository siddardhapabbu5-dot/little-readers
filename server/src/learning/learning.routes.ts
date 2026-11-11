import { Router } from "express";
import {
  completeLearningSessionSchema,
  startLearningSessionSchema,
  submitQuestionAttemptSchema,
} from "@little-readers/validation";
import {
  completeLearningSession,
  getActiveLearningSession,
  getChildLearningOverview,
  getLevel1Curriculum,
  getVocabularyWordById,
  listCategoryWords,
  listLearningCategories,
  listLearningLevels,
  listLevelGroups,
  previewLearningSession,
  startLearningSession,
  submitQuestionAttempt,
} from "./learning.service.js";
import {
  getChildLearningHistory,
  getDailyChallengeStatus,
  listWeakWords,
} from "./progress-rewards.js";
import {
  getPublishedLessonForChild,
  listPublishedLessonsForChild,
} from "../lessons/lesson.service.js";
import {
  requireAuth,
  requireRoles,
  type AuthenticatedRequest,
} from "../middleware/auth.js";
import { validateBody } from "../middleware/validate.js";
import { listActivitySettings, setActivityEnabled } from "./activity-settings.js";
import { getCategoryActivityProgress, getContentReadiness } from "./category-progress.js";
import {
  assertParentOwnsChild,
  getCertificate,
  listChildCertificates,
} from "./certificates.js";
import { prisma } from "../lib/prisma.js";
import { AppError } from "../lib/errors.js";

export const learningRouter = Router();

learningRouter.use(requireAuth);

const progressReadRoles = requireRoles(
  "PARENT",
  "TEACHER",
  "SCHOOL_ADMIN",
  "ADMIN",
  "SUPER_ADMIN"
);

const parentAdminRoles = requireRoles("PARENT", "ADMIN", "SUPER_ADMIN");

/** Parents see grade content only through a child; admins may browse the catalog without one. */
function contentChildId(req: AuthenticatedRequest): string | undefined {
  const childId = typeof req.query.childId === "string" && req.query.childId ? req.query.childId : undefined;
  const role = req.user!.role;
  if (!childId && role !== "ADMIN" && role !== "SUPER_ADMIN") {
    throw new AppError("childId query parameter is required", 400, { code: "CHILD_REQUIRED" });
  }
  return childId;
}

/** Teachers may only hit /progress* read APIs; everything else stays parent/admin. */
learningRouter.use((req, res, next) => {
  if (req.path.startsWith("/progress")) {
    return next();
  }
  return parentAdminRoles(req, res, next);
});

/** Catalog: all learning levels */
learningRouter.get("/levels", async (_req: AuthenticatedRequest, res, next) => {
  try {
    const data = await listLearningLevels();
    res.status(200).json({ data });
  } catch (error) {
    next(error);
  }
});

/** Catalog: groups (+ optional child progress) for a level. Use "1" for Level 1. */
learningRouter.get(
  "/levels/:levelKey/groups",
  async (req: AuthenticatedRequest, res, next) => {
    try {
      const childId = contentChildId(req);
      const data = await listLevelGroups(
        String(req.params.levelKey),
        req.user!.id,
        childId
      );
      res.status(200).json({ data });
    } catch (error) {
      next(error);
    }
  }
);

/** Catalog: published categories (optional ?level=LEVEL_1|1&group=A|B) */
learningRouter.get(
  "/categories",
  async (req: AuthenticatedRequest, res, next) => {
    try {
      const levelCode =
        typeof req.query.level === "string" ? req.query.level : undefined;
      const groupCode =
        typeof req.query.group === "string" ? req.query.group : undefined;
      const data = await listLearningCategories({ levelCode, groupCode });
      res.status(200).json({ data });
    } catch (error) {
      next(error);
    }
  }
);

/** Catalog: active words in a category */
learningRouter.get(
  "/categories/:id/words",
  async (req: AuthenticatedRequest, res, next) => {
    try {
      const childId = contentChildId(req);
      const data = await listCategoryWords(
        String(req.params.id),
        childId ? { parentId: req.user!.id, childId } : undefined
      );
      res.status(200).json({ data });
    } catch (error) {
      next(error);
    }
  }
);

/** Catalog: single vocabulary word */
learningRouter.get(
  "/words/:id",
  async (req: AuthenticatedRequest, res, next) => {
    try {
      const childId = contentChildId(req);
      const data = await getVocabularyWordById(
        String(req.params.id),
        childId ? { parentId: req.user!.id, childId } : undefined
      );
      res.status(200).json({ data });
    } catch (error) {
      next(error);
    }
  }
);

learningRouter.get(
  "/level-1/:childId",
  async (req: AuthenticatedRequest, res, next) => {
    try {
      const data = await getLevel1Curriculum(req.user!.id, String(req.params.childId));
      res.status(200).json({ data });
    } catch (error) {
      next(error);
    }
  }
);

learningRouter.get(
  "/progress/:childId",
  progressReadRoles,
  async (req: AuthenticatedRequest, res, next) => {
    try {
      const data = await getChildLearningOverview(
        req.user!.id,
        String(req.params.childId),
        req.user!.role
      );
      res.status(200).json({ data });
    } catch (error) {
      next(error);
    }
  }
);

learningRouter.get(
  "/progress/:childId/history",
  progressReadRoles,
  async (req: AuthenticatedRequest, res, next) => {
    try {
      const limit =
        typeof req.query.limit === "string"
          ? Number(req.query.limit)
          : undefined;
      const offset =
        typeof req.query.offset === "string"
          ? Number(req.query.offset)
          : undefined;
      const data = await getChildLearningHistory(
        req.user!.id,
        String(req.params.childId),
        { limit, offset },
        req.user!.role
      );
      res.status(200).json({ data });
    } catch (error) {
      next(error);
    }
  }
);

learningRouter.get(
  "/progress/:childId/weak-words",
  progressReadRoles,
  async (req: AuthenticatedRequest, res, next) => {
    try {
      const categoryId =
        typeof req.query.categoryId === "string"
          ? req.query.categoryId
          : undefined;
      const limit =
        typeof req.query.limit === "string"
          ? Number(req.query.limit)
          : undefined;
      const data = await listWeakWords(
        req.user!.id,
        String(req.params.childId),
        { categoryId, limit },
        req.user!.role
      );
      res.status(200).json({ data });
    } catch (error) {
      next(error);
    }
  }
);

learningRouter.get(
  "/lessons",
  async (req: AuthenticatedRequest, res, next) => {
    try {
      const childId = String(req.query.childId ?? "");
      if (!childId) {
        res.status(400).json({ error: "childId query parameter is required" });
        return;
      }
      const data = await listPublishedLessonsForChild(
        req.user!.id,
        childId,
        req.user!.role
      );
      res.status(200).json({ data });
    } catch (error) {
      next(error);
    }
  }
);

learningRouter.get(
  "/lessons/:id",
  async (req: AuthenticatedRequest, res, next) => {
    try {
      const childId = String(req.query.childId ?? "");
      if (!childId) {
        res.status(400).json({ error: "childId query parameter is required" });
        return;
      }
      const data = await getPublishedLessonForChild(
        req.user!.id,
        String(req.params.id),
        childId,
        req.user!.role
      );
      res.status(200).json({ data });
    } catch (error) {
      next(error);
    }
  }
);

learningRouter.get(
  "/sessions/active",
  async (req: AuthenticatedRequest, res, next) => {
    try {
      const childId = String(req.query.childId ?? "");
      if (!childId) {
        res.status(400).json({ error: "childId query parameter is required" });
        return;
      }
      const data = await getActiveLearningSession(
        req.user!.id,
        childId,
        {
          lessonId:
            typeof req.query.lessonId === "string"
              ? req.query.lessonId
              : undefined,
          categoryId:
            typeof req.query.categoryId === "string"
              ? req.query.categoryId
              : undefined,
        },
        req.user!.role
      );
      res.status(200).json({ data });
    } catch (error) {
      next(error);
    }
  }
);

learningRouter.post(
  "/sessions",
  validateBody(startLearningSessionSchema),
  async (req: AuthenticatedRequest, res, next) => {
    try {
      const installationId = req.get("x-installation-id") ?? undefined;
      const clientPlatform = (req.get("x-client-platform") ?? "").toLowerCase();
      const enforceDevice =
        clientPlatform === "mobile" ||
        clientPlatform === "ios" ||
        clientPlatform === "android";
      const data = await startLearningSession(
        req.user!.id,
        req.body,
        {
          installationId,
          enforceDevice,
        },
        req.user!.role
      );
      const status = data.resumed ? 200 : 201;
      res.status(status).json({ data });
    } catch (error) {
      next(error);
    }
  }
);

learningRouter.post(
  "/preview-session",
  requireRoles("ADMIN", "SUPER_ADMIN"),
  async (req: AuthenticatedRequest, res, next) => {
    try {
      const categoryId = String(req.body?.categoryId ?? "");
      if (!categoryId) {
        res.status(400).json({ error: "categoryId is required" });
        return;
      }
      const questionCount = Number(req.body?.questionCount);
      const data = await previewLearningSession({
        categoryId,
        activityMode:
          typeof req.body?.activityMode === "string" ? req.body.activityMode : undefined,
        questionCount:
          Number.isInteger(questionCount) && questionCount > 0 && questionCount <= 50
            ? questionCount
            : undefined,
      });
      res.status(200).json({ data });
    } catch (error) {
      next(error);
    }
  }
);

learningRouter.post(
  "/sessions/:sessionId/attempts",
  validateBody(submitQuestionAttemptSchema),
  async (req: AuthenticatedRequest, res, next) => {
    try {
      const data = await submitQuestionAttempt(
        req.user!.id,
        String(req.params.sessionId),
        req.body
      );
      res.status(201).json({ data });
    } catch (error) {
      next(error);
    }
  }
);

learningRouter.post(
  "/sessions/:sessionId/complete",
  validateBody(completeLearningSessionSchema),
  async (req: AuthenticatedRequest, res, next) => {
    try {
      const data = await completeLearningSession(
        req.user!.id,
        String(req.params.sessionId),
        req.body
      );
      res.status(200).json({ data });
    } catch (error) {
      next(error);
    }
  }
);

/** The five child activities with the admin ON/OFF state (same list for admin and parent). */
learningRouter.get("/activities", async (_req: AuthenticatedRequest, res, next) => {
  try {
    res.status(200).json({ data: await listActivitySettings() });
  } catch (error) {
    next(error);
  }
});

learningRouter.put(
  "/activities/:code",
  requireRoles("ADMIN", "SUPER_ADMIN"),
  async (req: AuthenticatedRequest, res, next) => {
    try {
      if (typeof req.body?.enabled !== "boolean") {
        res.status(400).json({ error: "enabled must be true or false" });
        return;
      }
      const data = await setActivityEnabled(String(req.params.code), req.body.enabled, req.user!.id);
      res.status(200).json({ data });
    } catch (error) {
      next(error);
    }
  }
);

learningRouter.get(
  "/progress/:childId/categories/:categoryId",
  progressReadRoles,
  async (req: AuthenticatedRequest, res, next) => {
    try {
      const data = await getCategoryActivityProgress(
        req.user!.id,
        String(req.params.childId),
        String(req.params.categoryId),
        req.user!.role
      );
      res.status(200).json({ data });
    } catch (error) {
      next(error);
    }
  }
);

learningRouter.get(
  "/progress/:childId/daily-challenge",
  progressReadRoles,
  async (req: AuthenticatedRequest, res, next) => {
    try {
      const childId = String(req.params.childId);
      await assertParentOwnsChild(req.user!.id, childId, req.user!.role);
      res.status(200).json({ data: await getDailyChallengeStatus(childId) });
    } catch (error) {
      next(error);
    }
  }
);

learningRouter.get(
  "/progress/:childId/certificates",
  progressReadRoles,
  async (req: AuthenticatedRequest, res, next) => {
    try {
      const data = await listChildCertificates(
        req.user!.id,
        String(req.params.childId),
        req.user!.role
      );
      res.status(200).json({ data });
    } catch (error) {
      next(error);
    }
  }
);

learningRouter.get("/certificates/:id", async (req: AuthenticatedRequest, res, next) => {
  try {
    const data = await getCertificate(req.user!.id, String(req.params.id), req.user!.role);
    res.status(200).json({ data });
  } catch (error) {
    next(error);
  }
});

learningRouter.get(
  "/admin/readiness",
  requireRoles("ADMIN", "SUPER_ADMIN"),
  async (req: AuthenticatedRequest, res, next) => {
    try {
      const data = await getContentReadiness({
        levelCode: typeof req.query.level === "string" ? req.query.level : undefined,
        gradeCode: typeof req.query.grade === "string" ? req.query.grade : undefined,
      });
      res.status(200).json({ data });
    } catch (error) {
      next(error);
    }
  }
);

learningRouter.get(
  "/admin/vocabulary",
  requireRoles("ADMIN", "SUPER_ADMIN"),
  async (_req: AuthenticatedRequest, res, next) => {
    try {
      const categories = await prisma.learningCategory.findMany({
        include: {
          _count: { select: { words: { where: { isActive: true } } } },
          group: {
            select: {
              code: true,
              label: true,
              level: { select: { code: true, label: true } },
            },
          },
          words: {
            where: { isActive: true },
            select: {
              id: true,
              text: true,
              meaning: true,
              emoji: true,
              sortOrder: true,
              firstLetter: true,
              difficulty: true,
            },
            orderBy: { sortOrder: "asc" },
            take: 5,
          },
        },
        orderBy: { sortOrder: "asc" },
      });
      res.status(200).json({
        data: {
          totalWords: categories.reduce((s, c) => s + c._count.words, 0),
          categories: categories.map((c) => ({
            id: c.id,
            code: c.code,
            label: c.label,
            emoji: c.emoji,
            isPublished: c.isPublished,
            wordCount: c._count.words,
            group: c.group,
            sampleWords: c.words,
          })),
        },
      });
    } catch (error) {
      next(error);
    }
  }
);
