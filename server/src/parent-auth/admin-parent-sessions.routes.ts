import { Router } from "express";
import { z } from "zod";
import { AppError } from "../lib/errors.js";
import { prisma } from "../lib/prisma.js";
import { requireAuth, type AuthenticatedRequest } from "../middleware/auth.js";
import { requirePermission } from "../auth/permissions.js";
import { validateBody } from "../middleware/validate.js";
import {
  adminSetParentMobile,
  listParentDeviceSessions,
  revokeAllParentDeviceSessions,
  revokeParentDeviceSession,
} from "./session.service.js";

export const adminParentSessionsRouter = Router();

adminParentSessionsRouter.use(
  requireAuth,
  requirePermission("users.manage")
);

const mobileSchema = z.object({
  mobile: z.string().min(8).max(20),
  countryCode: z.string().min(1).max(6).optional(),
});

adminParentSessionsRouter.get("/", async (_req, res, next) => {
  try {
    const parents = await prisma.user.findMany({
      where: { role: "PARENT", isActive: true },
      orderBy: { updatedAt: "desc" },
      take: 200,
      select: {
        id: true,
        name: true,
        email: true,
        mobileE164: true,
        isActive: true,
        parentDeviceSessions: {
          where: { status: "ACTIVE" },
          take: 1,
          orderBy: { lastSeenAt: "desc" },
          select: {
            id: true,
            deviceId: true,
            deviceName: true,
            platform: true,
            appVersion: true,
            lastSeenAt: true,
            createdAt: true,
            status: true,
          },
        },
      },
    });

    res.status(200).json({
      data: parents.map((p) => ({
        id: p.id,
        name: p.name,
        email: p.email,
        mobileE164: p.mobileE164,
        isActive: p.isActive,
        activeSession: p.parentDeviceSessions[0] ?? null,
      })),
    });
  } catch (error) {
    next(error);
  }
});

adminParentSessionsRouter.get(
  "/:parentId/device-sessions",
  async (req, res, next) => {
    try {
      const parentId = String(req.params.parentId);
      const parent = await prisma.user.findFirst({
        where: { id: parentId, role: "PARENT" },
        select: {
          id: true,
          name: true,
          email: true,
          mobileE164: true,
          isActive: true,
        },
      });
      if (!parent) throw new AppError("Parent not found", 404);
      const sessions = await listParentDeviceSessions(parentId);
      res.status(200).json({ data: { parent, sessions } });
    } catch (error) {
      next(error);
    }
  }
);

adminParentSessionsRouter.post(
  "/:parentId/device-sessions/:sessionId/revoke",
  async (req: AuthenticatedRequest, res, next) => {
    try {
      const data = await revokeParentDeviceSession({
        parentId: String(req.params.parentId),
        sessionId: String(req.params.sessionId),
        reason: "ADMIN_REVOKE",
      });
      res.status(200).json({ data });
    } catch (error) {
      next(error);
    }
  }
);

adminParentSessionsRouter.post(
  "/:parentId/device-sessions/reset",
  async (req, res, next) => {
    try {
      const data = await revokeAllParentDeviceSessions(
        String(req.params.parentId),
        "ADMIN_RESET"
      );
      res.status(200).json({ data });
    } catch (error) {
      next(error);
    }
  }
);

adminParentSessionsRouter.patch(
  "/:parentId/mobile",
  validateBody(mobileSchema),
  async (req, res, next) => {
    try {
      const data = await adminSetParentMobile({
        parentId: String(req.params.parentId),
        mobile: req.body.mobile,
        countryCode: req.body.countryCode,
      });
      res.status(200).json({ data });
    } catch (error) {
      next(error);
    }
  }
);
