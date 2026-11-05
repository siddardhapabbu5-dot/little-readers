import { Router } from "express";
import { z } from "zod";
import {
  requireAuth,
  requireRoles,
  type AuthenticatedRequest,
} from "../middleware/auth.js";
import { validateBody } from "../middleware/validate.js";
import {
  getPublisherConfig,
  listAdminAlerts,
  markAlertRead,
  processDuePublishJobs,
  updatePublisherConfig,
} from "./publisher.service.js";
import { prisma } from "../lib/prisma.js";

export const publisherRouter = Router();

publisherRouter.use(requireAuth, requireRoles("ADMIN", "SUPER_ADMIN"));

publisherRouter.get("/config", async (_req, res, next) => {
  try {
    res.status(200).json({ data: await getPublisherConfig() });
  } catch (error) {
    next(error);
  }
});

const configSchema = z.object({
  publishHour: z.coerce.number().int().min(0).max(23).optional(),
  publishMinute: z.coerce.number().int().min(0).max(59).optional(),
  timezone: z.literal("Asia/Kolkata").optional(),
  status: z.enum(["RUNNING", "PAUSED", "STOPPED"]).optional(),
});

publisherRouter.put(
  "/config",
  validateBody(configSchema),
  async (req: AuthenticatedRequest, res, next) => {
    try {
      res.status(200).json({
        data: await updatePublisherConfig({
          ...req.body,
          updatedById: req.user!.id,
        }),
      });
    } catch (error) {
      next(error);
    }
  }
);

publisherRouter.post("/run-once", async (_req, res, next) => {
  try {
    res.status(200).json({ data: await processDuePublishJobs() });
  } catch (error) {
    next(error);
  }
});

publisherRouter.get("/jobs", async (req, res, next) => {
  try {
    const take = Math.min(100, Math.max(1, Number(req.query.take ?? 40) || 40));
    const data = await prisma.vocabPublishJob.findMany({
      orderBy: [{ dueDate: "asc" }, { createdAt: "desc" }],
      take,
      include: {
        day: {
          select: {
            id: true,
            date: true,
            status: true,
            programmeId: true,
          },
        },
      },
    });
    res.status(200).json({ data });
  } catch (error) {
    next(error);
  }
});

publisherRouter.get("/alerts", async (req, res, next) => {
  try {
    const take = Math.min(100, Math.max(1, Number(req.query.take ?? 50) || 50));
    res.status(200).json({ data: await listAdminAlerts(take) });
  } catch (error) {
    next(error);
  }
});

publisherRouter.post("/alerts/:id/read", async (req, res, next) => {
  try {
    res.status(200).json({ data: await markAlertRead(String(req.params.id)) });
  } catch (error) {
    next(error);
  }
});
