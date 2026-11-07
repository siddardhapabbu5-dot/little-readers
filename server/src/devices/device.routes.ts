import { Router } from "express";
import { z } from "zod";
import {
  requireAuth,
  requireRoles,
  type AuthenticatedRequest,
} from "../middleware/auth.js";
import { AppError } from "../lib/errors.js";
import {
  getChildDeviceStatus,
  listDeviceTransfers,
  registerOrVerifyStudentDevice,
  transferStudentDevice,
} from "./device.service.js";
import {
  assignLearningSeat,
  cancelParentSubscription,
  getParentSubscription,
  grantExtraSeats,
  grantManualSubscription,
  listSubscriptionsForAdmin,
  revokeExtraSeats,
  unassignLearningSeat,
} from "../subscriptions/subscription.service.js";
import { validateBody } from "../middleware/validate.js";

export const deviceRouter = Router();
export const subscriptionRouter = Router();

const registerSchema = z.object({
  childId: z.string().min(1),
  installationId: z.string().min(16).max(128),
  platform: z.enum(["ios", "android", "web", "unknown"]).or(z.string().min(2).max(40)),
  deviceLabel: z.string().max(80).optional(),
  appVersion: z.string().max(40).optional(),
});

const transferSchema = z.object({
  childId: z.string().min(1),
  reason: z.string().max(300).optional(),
  newInstallationId: z.string().min(16).max(128).optional(),
  platform: z.string().max(40).optional(),
  deviceLabel: z.string().max(80).optional(),
  appVersion: z.string().max(40).optional(),
});

deviceRouter.use(requireAuth, requireRoles("PARENT", "ADMIN", "SUPER_ADMIN"));

deviceRouter.get("/children/:childId", async (req: AuthenticatedRequest, res, next) => {
  try {
    const childId = String(req.params.childId);
    // ownership check via transfer list helper pattern
    const status = await getChildDeviceStatus(childId);
    // Ensure caller owns child unless admin
    if (req.user!.role === "PARENT") {
      const { prisma } = await import("../lib/prisma.js");
      const child = await prisma.child.findFirst({
        where: { id: childId, parentId: req.user!.id, isActive: true },
      });
      if (!child) throw new AppError("Child not found", 404);
    }
    res.status(200).json({ data: status });
  } catch (error) {
    next(error);
  }
});

deviceRouter.post("/register", async (req: AuthenticatedRequest, res, next) => {
  try {
    const parsed = registerSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new AppError("Invalid device registration payload", 400, parsed.error.flatten());
    }
    const data = await registerOrVerifyStudentDevice({
      userId: req.user!.id,
      role: req.user!.role,
      ...parsed.data,
      platform: String(parsed.data.platform),
    });
    res.status(200).json({ data });
  } catch (error) {
    next(error);
  }
});

deviceRouter.post("/transfer", async (req: AuthenticatedRequest, res, next) => {
  try {
    const parsed = transferSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new AppError("Invalid transfer payload", 400, parsed.error.flatten());
    }
    const data = await transferStudentDevice({
      userId: req.user!.id,
      role: req.user!.role,
      ...parsed.data,
    });
    res.status(200).json({ data });
  } catch (error) {
    next(error);
  }
});

deviceRouter.get(
  "/children/:childId/transfers",
  async (req: AuthenticatedRequest, res, next) => {
    try {
      const data = await listDeviceTransfers(
        String(req.params.childId),
        req.user!.id,
        req.user!.role
      );
      res.status(200).json({ data });
    } catch (error) {
      next(error);
    }
  }
);

subscriptionRouter.use(requireAuth, requireRoles("PARENT", "ADMIN", "SUPER_ADMIN"));

const seatChildSchema = z.object({
  childId: z.string().min(1),
});

const grantSeatsSchema = z.object({
  parentUserId: z.string().min(1),
  seats: z.number().int().min(1).max(20),
  amountCents: z.number().int().min(0).optional(),
  provider: z.string().min(2).max(40).optional(),
  providerRef: z.string().min(2).max(120).optional(),
});

subscriptionRouter.get("/me", async (req: AuthenticatedRequest, res, next) => {
  try {
    const data = await getParentSubscription(req.user!.id);
    res.status(200).json({ data });
  } catch (error) {
    next(error);
  }
});

subscriptionRouter.post(
  "/seats/assign",
  validateBody(seatChildSchema),
  async (req: AuthenticatedRequest, res, next) => {
    try {
      const data = await assignLearningSeat(req.user!.id, req.body.childId);
      res.status(200).json({ data });
    } catch (error) {
      next(error);
    }
  }
);

subscriptionRouter.post(
  "/seats/unassign",
  validateBody(seatChildSchema),
  async (req: AuthenticatedRequest, res, next) => {
    try {
      const data = await unassignLearningSeat(req.user!.id, req.body.childId);
      res.status(200).json({ data });
    } catch (error) {
      next(error);
    }
  }
);

subscriptionRouter.post(
  "/seats/grant",
  requireRoles("ADMIN", "SUPER_ADMIN"),
  validateBody(grantSeatsSchema),
  async (req: AuthenticatedRequest, res, next) => {
    try {
      const data = await grantExtraSeats({
        ...req.body,
        grantedByUserId: req.user!.id,
      });
      res.status(200).json({ data });
    } catch (error) {
      next(error);
    }
  }
);

const grantSubscriptionSchema = z.object({
  parentEmail: z.string().email().max(254),
  months: z.number().int().min(1).max(24),
});

subscriptionRouter.post(
  "/admin/grant",
  requireRoles("ADMIN", "SUPER_ADMIN"),
  validateBody(grantSubscriptionSchema),
  async (req: AuthenticatedRequest, res, next) => {
    try {
      const data = await grantManualSubscription({
        ...req.body,
        grantedByUserId: req.user!.id,
      });
      res.status(200).json({ data });
    } catch (error) {
      next(error);
    }
  }
);

const revokeSeatsSchema = z.object({
  parentUserId: z.string().min(1),
  seats: z.number().int().min(1).max(20),
});

subscriptionRouter.post(
  "/seats/revoke",
  requireRoles("ADMIN", "SUPER_ADMIN"),
  validateBody(revokeSeatsSchema),
  async (req: AuthenticatedRequest, res, next) => {
    try {
      const data = await revokeExtraSeats({
        ...req.body,
        grantedByUserId: req.user!.id,
      });
      res.status(200).json({ data });
    } catch (error) {
      next(error);
    }
  }
);

subscriptionRouter.post(
  "/cancel",
  requireRoles("PARENT", "ADMIN", "SUPER_ADMIN"),
  async (req: AuthenticatedRequest, res, next) => {
    try {
      const parentUserId =
        req.user!.role === "PARENT"
          ? req.user!.id
          : typeof req.body?.parentUserId === "string"
            ? req.body.parentUserId
            : req.user!.id;
      if (req.user!.role === "PARENT" && parentUserId !== req.user!.id) {
        throw new AppError("Parents may only cancel their own subscription", 403);
      }
      const data = await cancelParentSubscription(parentUserId);
      res.status(200).json({ data });
    } catch (error) {
      next(error);
    }
  }
);

subscriptionRouter.get(
  "/admin",
  requireRoles("ADMIN", "SUPER_ADMIN"),
  async (_req, res, next) => {
    try {
      const data = await listSubscriptionsForAdmin();
      res.status(200).json({ data });
    } catch (error) {
      next(error);
    }
  }
);
