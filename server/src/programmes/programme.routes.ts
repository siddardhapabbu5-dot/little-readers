import { Router } from "express";
import { z } from "zod";
import {
  requireAuth,
  requireRoles,
  type AuthenticatedRequest,
} from "../middleware/auth.js";
import { validateBody } from "../middleware/validate.js";
import {
  activateProgramme,
  approveProgramme,
  createProgramme,
  generateProgrammeSchedule,
  getProgramme,
  listProgrammes,
  replaceDayWords,
} from "./programme.service.js";

export const programmeRouter = Router();

programmeRouter.use(requireAuth, requireRoles("ADMIN", "SUPER_ADMIN"));

programmeRouter.get("/", async (_req, res, next) => {
  try {
    res.status(200).json({ data: await listProgrammes() });
  } catch (error) {
    next(error);
  }
});

programmeRouter.get("/:id", async (req, res, next) => {
  try {
    res.status(200).json({ data: await getProgramme(String(req.params.id)) });
  } catch (error) {
    next(error);
  }
});

const createSchema = z.object({
  title: z.string().min(1).max(180),
  gradeId: z.string().min(1),
  startDate: z.string().min(8),
  endDate: z.string().min(8),
  dailyTarget: z.coerce.number().int().min(1).max(20).optional(),
});

programmeRouter.post(
  "/",
  validateBody(createSchema),
  async (req: AuthenticatedRequest, res, next) => {
    try {
      const data = await createProgramme({
        ...req.body,
        createdById: req.user!.id,
      });
      res.status(201).json({ data });
    } catch (error) {
      next(error);
    }
  }
);

programmeRouter.post("/:id/generate", async (req, res, next) => {
  try {
    res
      .status(200)
      .json({ data: await generateProgrammeSchedule(String(req.params.id)) });
  } catch (error) {
    next(error);
  }
});

programmeRouter.post(
  "/:id/approve",
  async (req: AuthenticatedRequest, res, next) => {
    try {
      res
        .status(200)
        .json({ data: await approveProgramme(String(req.params.id), req.user!.id) });
    } catch (error) {
      next(error);
    }
  }
);

programmeRouter.post(
  "/:id/activate",
  async (req: AuthenticatedRequest, res, next) => {
    try {
      res
        .status(200)
        .json({
          data: await activateProgramme(String(req.params.id), req.user!.id),
        });
    } catch (error) {
      next(error);
    }
  }
);

const replaceSchema = z.object({
  vocabularyWordIds: z.array(z.string().min(1)).min(1).max(40),
});

programmeRouter.put(
  "/days/:dayId/words",
  validateBody(replaceSchema),
  async (req, res, next) => {
    try {
      res.status(200).json({
        data: await replaceDayWords(
          String(req.params.dayId),
          req.body.vocabularyWordIds
        ),
      });
    } catch (error) {
      next(error);
    }
  }
);
