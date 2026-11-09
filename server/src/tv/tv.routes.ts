import { Router, type NextFunction, type Response } from "express";
import rateLimit from "express-rate-limit";
import {
  completeLearningSessionSchema,
  startLearningSessionSchema,
  submitQuestionAttemptSchema,
} from "@little-readers/validation";
import { env } from "../config/env.js";
import { AppError } from "../lib/errors.js";
import {
  requireAuth,
  requireRoles,
  type AuthenticatedRequest,
} from "../middleware/auth.js";
import { validateBody } from "../middleware/validate.js";
import { listActivitySettings } from "../learning/activity-settings.js";
import {
  completeLearningSession,
  getChildLearningOverview,
  listLearningLevels,
  listLevelGroups,
  startLearningSession,
  submitQuestionAttempt,
} from "../learning/learning.service.js";
import { prisma } from "../lib/prisma.js";
import {
  approveTvPairing,
  assertTvOwnsLearningSession,
  authenticateTvToken,
  disconnectTv,
  listTvConnections,
  pollTvPairing,
  revokeTvConnection,
  startTvPairing,
  type TvSession,
} from "./tv.service.js";

type TvRequest = AuthenticatedRequest & { tv?: TvSession };

const skipInTests = () => process.env.VITEST === "true" || process.env.NODE_ENV === "test";

const pairStartLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: env.NODE_ENV === "production" ? 30 : 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many TV codes requested. Please wait a few minutes." },
  skip: skipInTests,
});

const pairApproveLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: env.NODE_ENV === "production" ? 30 : 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many TV connection attempts. Please wait a few minutes." },
  skip: skipInTests,
});

async function requireTvSession(req: TvRequest, _res: Response, next: NextFunction) {
  try {
    const header = req.headers.authorization ?? "";
    const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
    req.tv = await authenticateTvToken(token);
    next();
  } catch (error) {
    next(error);
  }
}

const parentOnly = [requireAuth, requireRoles("PARENT")];

export const tvRouter = Router();

/* ---------- Pairing: TV side (no account; short-lived single-use code) ---------- */

tvRouter.post("/pair/start", pairStartLimit, (req, res, next) => {
  try {
    res.status(201).json({ data: startTvPairing(req.body?.deviceLabel) });
  } catch (error) {
    next(error);
  }
});

tvRouter.post("/pair/poll", (req, res, next) => {
  try {
    res.status(200).json({ data: pollTvPairing(req.body?.pairingId, req.body?.pollToken) });
  } catch (error) {
    next(error);
  }
});

/* ---------- Pairing: parent phone side (signed-in parent approves) ---------- */

tvRouter.post("/pair/approve", ...parentOnly, pairApproveLimit, async (req: AuthenticatedRequest, res, next) => {
  try {
    const data = await approveTvPairing(req.user!.id, req.body?.code, req.body?.childId);
    res.status(200).json({ data });
  } catch (error) {
    next(error);
  }
});

tvRouter.get("/connections", ...parentOnly, async (req: AuthenticatedRequest, res, next) => {
  try {
    res.status(200).json({ data: await listTvConnections(req.user!.id) });
  } catch (error) {
    next(error);
  }
});

tvRouter.delete("/connections/:id", ...parentOnly, async (req: AuthenticatedRequest, res, next) => {
  try {
    res.status(200).json({ data: await revokeTvConnection(req.user!.id, String(req.params.id)) });
  } catch (error) {
    next(error);
  }
});

/* ---------- Paired TV: one child's learning only ---------- */

tvRouter.get("/me", requireTvSession, async (req: TvRequest, res, next) => {
  try {
    const tv = req.tv!;
    const child = await prisma.child.findUniqueOrThrow({
      where: { id: tv.childId },
      select: { id: true, displayName: true, avatarUrl: true, hasLearningSeat: true },
    });
    const overview = await getChildLearningOverview(tv.parentId, tv.childId).catch(() => null);
    res.status(200).json({
      data: {
        connectionId: tv.id,
        child,
        summary: overview
          ? {
              points: overview.summary.points,
              stars: overview.summary.stars,
              wordsLearned: overview.summary.wordsLearned,
              daily: overview.summary.daily,
            }
          : null,
      },
    });
  } catch (error) {
    next(error);
  }
});

tvRouter.get("/activities", requireTvSession, async (_req: TvRequest, res, next) => {
  try {
    res.status(200).json({ data: await listActivitySettings() });
  } catch (error) {
    next(error);
  }
});

/** Same Admin-published vocabulary the mobile Learn tab shows (first level with words). */
tvRouter.get("/categories", requireTvSession, async (req: TvRequest, res, next) => {
  try {
    const tv = req.tv!;
    const levels = await listLearningLevels();
    const level = levels.find((l) => l.wordCount > 0) ?? levels[0];
    if (!level) {
      res.status(200).json({ data: { level: null, categories: [] } });
      return;
    }
    const data = await listLevelGroups(level.code, tv.parentId, tv.childId);
    res.status(200).json({
      data: {
        level: data.level,
        categories: data.groups.flatMap((g) => g.categories).filter((c) => c.wordCount > 0),
      },
    });
  } catch (error) {
    next(error);
  }
});

tvRouter.post("/sessions", requireTvSession, async (req: TvRequest, res, next) => {
  try {
    const tv = req.tv!;
    const parsed = startLearningSessionSchema.safeParse({
      childId: tv.childId,
      categoryId: req.body?.categoryId,
      activityMode: req.body?.activityMode,
      questionCount: req.body?.questionCount,
      surprise: req.body?.surprise === true ? true : undefined,
      resume: false,
    });
    if (!parsed.success) throw new AppError("Invalid activity request", 400);
    const data = await startLearningSession(tv.parentId, parsed.data, { enforceDevice: false }, "PARENT");
    res.status(201).json({ data });
  } catch (error) {
    next(error);
  }
});

tvRouter.post(
  "/sessions/:sessionId/attempts",
  requireTvSession,
  validateBody(submitQuestionAttemptSchema),
  async (req: TvRequest, res, next) => {
    try {
      const sessionId = String(req.params.sessionId);
      await assertTvOwnsLearningSession(req.tv!, sessionId);
      const data = await submitQuestionAttempt(req.tv!.parentId, sessionId, req.body);
      res.status(201).json({ data });
    } catch (error) {
      next(error);
    }
  }
);

tvRouter.post(
  "/sessions/:sessionId/complete",
  requireTvSession,
  validateBody(completeLearningSessionSchema),
  async (req: TvRequest, res, next) => {
    try {
      const sessionId = String(req.params.sessionId);
      await assertTvOwnsLearningSession(req.tv!, sessionId);
      const data = await completeLearningSession(req.tv!.parentId, sessionId, req.body);
      res.status(200).json({ data });
    } catch (error) {
      next(error);
    }
  }
);

tvRouter.post("/disconnect", requireTvSession, async (req: TvRequest, res, next) => {
  try {
    res.status(200).json({ data: await disconnectTv(req.tv!) });
  } catch (error) {
    next(error);
  }
});
