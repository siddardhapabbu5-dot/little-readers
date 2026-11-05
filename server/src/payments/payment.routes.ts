import { Router } from "express";
import { z } from "zod";
import {
  requireAuth,
  requireRoles,
  type AuthenticatedRequest,
} from "../middleware/auth.js";
import { validateBody } from "../middleware/validate.js";
import * as paymentService from "./payment.service.js";

export const paymentsRouter = Router();

paymentsRouter.get("/plans", requireAuth, async (req, res, next) => {
  try {
    const levelId = req.query.levelId
      ? String(req.query.levelId)
      : undefined;
    res.json({ data: await paymentService.getPlansCatalog(levelId) });
  } catch (e) {
    next(e);
  }
});

paymentsRouter.post(
  "/orders",
  requireAuth,
  requireRoles("PARENT", "ADMIN", "SUPER_ADMIN"),
  validateBody(
    z.object({
      purpose: z
        .enum([
          "FAMILY_MONTHLY",
          "FAMILY_YEARLY",
          "FAMILY_3_MONTH",
          "FAMILY_6_MONTH",
          "EXTRA_SEATS",
        ])
        .optional(),
      planId: z.string().min(1).optional(),
      seats: z.number().int().min(1).max(20).optional(),
    })
  ),
  async (req: AuthenticatedRequest, res, next) => {
    try {
      const data = await paymentService.createCheckoutOrder(
        req.user!.id,
        req.body
      );
      res.status(201).json({ data });
    } catch (e) {
      next(e);
    }
  }
);

paymentsRouter.post(
  "/verify",
  requireAuth,
  requireRoles("PARENT", "ADMIN", "SUPER_ADMIN"),
  validateBody(
    z.object({
      orderId: z.string().min(1),
      paymentId: z.string().min(1),
      signature: z.string().min(1),
    })
  ),
  async (req: AuthenticatedRequest, res, next) => {
    try {
      const data = await paymentService.verifyAndActivate(req.user!.id, req.body);
      res.json({ data });
    } catch (e) {
      next(e);
    }
  }
);

paymentsRouter.get(
  "/me",
  requireAuth,
  requireRoles("PARENT", "ADMIN", "SUPER_ADMIN"),
  async (req: AuthenticatedRequest, res, next) => {
    try {
      const data = await paymentService.listMyPayments(req.user!.id);
      res.json({ data });
    } catch (e) {
      next(e);
    }
  }
);

paymentsRouter.get(
  "/admin",
  requireAuth,
  requireRoles("ADMIN", "SUPER_ADMIN"),
  async (req: AuthenticatedRequest, res, next) => {
    try {
      const take = Number(req.query.take ?? 100);
      const data = await paymentService.listPaymentsForAdmin(take);
      res.json({ data });
    } catch (e) {
      next(e);
    }
  }
);

/**
 * Razorpay webhooks — raw body required for signature. Mounted with express.raw
 * or text parser in app.ts for this path only.
 */
export async function paymentsWebhookHandler(
  req: AuthenticatedRequest & { rawBody?: string | Buffer },
  res: { status: (c: number) => { json: (b: unknown) => void } },
  next: (e?: unknown) => void
) {
  try {
    const raw =
      typeof req.rawBody === "string"
        ? req.rawBody
        : Buffer.isBuffer(req.rawBody)
          ? req.rawBody.toString("utf8")
          : typeof req.body === "string"
            ? req.body
            : JSON.stringify(req.body ?? {});
    const signature = req.headers["x-razorpay-signature"] as string | undefined;
    const data = await paymentService.handleWebhook(raw, signature);
    res.status(200).json({ data });
  } catch (e) {
    next(e);
  }
}
