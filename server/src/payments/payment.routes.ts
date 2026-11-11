import { Router } from "express";
import { z } from "zod";
import {
  requireAuth,
  requireRoles,
  type AuthenticatedRequest,
} from "../middleware/auth.js";
import { requirePermission } from "../auth/permissions.js";
import { validateBody } from "../middleware/validate.js";
import * as cashfreeService from "./cashfree.service.js";
import * as googlePlay from "./google-play.js";
import * as paymentService from "./payment.service.js";
import { PRICE_REGIONS } from "./region.js";
import { adminRevenueSummary } from "./revenue.js";

export const paymentsRouter = Router();

paymentsRouter.get(
  "/google-play/config",
  requireAuth,
  requireRoles("PARENT", "ADMIN", "SUPER_ADMIN"),
  async (req: AuthenticatedRequest, res, next) => {
    try {
      res.json({ data: await googlePlay.getGooglePlayConfig(req.user!.id) });
    } catch (e) {
      next(e);
    }
  }
);

const playPurchaseBody = z.object({
  productId: z.string().min(1).max(100),
  purchaseToken: z.string().min(10).max(4096),
  /** Child the new purchase is for; ignored when the purchase is already linked. */
  childId: z.string().min(1).max(64).optional(),
});

paymentsRouter.post(
  "/google-play/verify",
  requireAuth,
  requireRoles("PARENT", "ADMIN", "SUPER_ADMIN"),
  validateBody(playPurchaseBody),
  async (req: AuthenticatedRequest, res, next) => {
    try {
      res.json({ data: await googlePlay.verifyGooglePlayPurchase(req.user!.id, req.body) });
    } catch (e) {
      next(e);
    }
  }
);

paymentsRouter.post(
  "/google-play/restore",
  requireAuth,
  requireRoles("PARENT", "ADMIN", "SUPER_ADMIN"),
  validateBody(z.object({ purchases: z.array(playPurchaseBody).min(1).max(10) })),
  async (req: AuthenticatedRequest, res, next) => {
    try {
      const results = [];
      for (const p of req.body.purchases as Array<z.infer<typeof playPurchaseBody>>) {
        try {
          results.push(
            await googlePlay.verifyGooglePlayPurchase(req.user!.id, p, "google_play_restore")
          );
        } catch (e) {
          const err = e as { statusCode?: number; details?: { code?: string } };
          if (!err.statusCode || err.statusCode >= 500 || err.details?.code === "GOOGLE_PLAY_DISABLED") throw e;
          results.push({ productId: p.productId, error: err.details?.code ?? "NOT_RESTORED" });
        }
      }
      res.json({ data: { results } });
    } catch (e) {
      next(e);
    }
  }
);

/** Google Play RTDN (Pub/Sub push). Authenticated by the shared token in the push URL. */
paymentsRouter.post("/google-play/rtdn", async (req, res, next) => {
  try {
    if (!googlePlay.rtdnTokenValid(req.query.token)) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    res.status(200).json({ data: await googlePlay.handleGooglePlayRtdn(req.body ?? {}) });
  } catch (e) {
    next(e);
  }
});

const regionField = z.enum(PRICE_REGIONS).optional();

paymentsRouter.get("/plans", requireAuth, async (req: AuthenticatedRequest, res, next) => {
  try {
    const levelId = req.query.levelId
      ? String(req.query.levelId)
      : undefined;
    const region = regionField.catch(undefined).parse(req.query.region);
    res.json({
      data: await paymentService.getPlansCatalog(levelId, { region, userId: req.user?.id }),
    });
  } catch (e) {
    next(e);
  }
});

/** Public price list for the website pricing page (published plans only, no gateway keys). */
paymentsRouter.get("/public-plans", async (_req, res, next) => {
  try {
    res.json({ data: await paymentService.getPublicPriceList() });
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
      childId: z.string().min(1).max(64).optional(),
      seats: z.number().int().min(1).max(20).optional(),
      region: regionField,
    })
  ),
  async (req: AuthenticatedRequest, res, next) => {
    try {
      const data = await paymentService.createCheckoutOrder(
        req.user!.id,
        req.body,
        req.header("x-client-platform") ?? undefined
      );
      res.status(201).json({ data });
    } catch (e) {
      next(e);
    }
  }
);

const checkoutPurpose = z
  .enum(["FAMILY_MONTHLY", "FAMILY_YEARLY", "FAMILY_3_MONTH", "FAMILY_6_MONTH", "EXTRA_SEATS"])
  .optional();

paymentsRouter.post(
  "/cashfree/orders",
  requireAuth,
  requireRoles("PARENT", "ADMIN", "SUPER_ADMIN"),
  validateBody(
    z.object({
      purpose: checkoutPurpose,
      planId: z.string().min(1).optional(),
      childId: z.string().min(1).max(64).optional(),
      seats: z.number().int().min(1).max(20).optional(),
      phone: z.string().min(10).max(16).optional(),
      returnTo: z.enum(["web", "app", "sdk"]).optional(),
      region: regionField,
    })
  ),
  async (req: AuthenticatedRequest, res, next) => {
    try {
      const data = await cashfreeService.createCashfreeOrder(
        req.user!.id,
        req.body,
        req.header("x-client-platform") ?? undefined
      );
      res.status(201).json({ data });
    } catch (e) {
      next(e);
    }
  }
);

paymentsRouter.post(
  "/cashfree/verify",
  requireAuth,
  requireRoles("PARENT", "ADMIN", "SUPER_ADMIN"),
  validateBody(z.object({ orderId: z.string().min(3).max(64) })),
  async (req: AuthenticatedRequest, res, next) => {
    try {
      res.json({ data: await cashfreeService.verifyCashfreeOrder(req.user!.id, req.body.orderId) });
    } catch (e) {
      next(e);
    }
  }
);

/** Cashfree webhooks — signed over the raw body (captured in app.ts for this path). */
paymentsRouter.post(
  "/cashfree/webhook",
  async (req: AuthenticatedRequest & { rawBody?: string }, res, next) => {
    try {
      const raw = typeof req.rawBody === "string" ? req.rawBody : JSON.stringify(req.body ?? {});
      const data = await cashfreeService.handleCashfreeWebhook(
        raw,
        req.header("x-webhook-signature") ?? undefined,
        req.header("x-webhook-timestamp") ?? undefined
      );
      res.status(200).json({ data });
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
  "/:id/receipt",
  requireAuth,
  requireRoles("PARENT", "ADMIN", "SUPER_ADMIN"),
  async (req: AuthenticatedRequest, res, next) => {
    try {
      const data = await paymentService.getPaymentReceipt(req.user!.id, String(req.params.id));
      res.json({ data });
    } catch (e) {
      next(e);
    }
  }
);

paymentsRouter.post(
  "/cancel",
  requireAuth,
  requireRoles("PARENT", "ADMIN", "SUPER_ADMIN"),
  validateBody(
    z.object({
      orderId: z.string().min(1).optional(),
      paymentId: z.string().min(1).optional(),
    })
  ),
  async (req: AuthenticatedRequest, res, next) => {
    try {
      const data = await paymentService.cancelPendingPayment(
        req.user!.id,
        req.body
      );
      res.json({ data });
    } catch (e) {
      next(e);
    }
  }
);

paymentsRouter.get(
  "/admin",
  requireAuth,
  requirePermission("payments.manage"),
  async (req: AuthenticatedRequest, res, next) => {
    try {
      const take = Number(req.query.take ?? 100);
      const q = typeof req.query.q === "string" ? req.query.q.slice(0, 120) : undefined;
      const provider =
        typeof req.query.provider === "string" ? req.query.provider.slice(0, 40) : undefined;
      const data = await paymentService.listPaymentsForAdmin(take, { q, provider });
      res.json({ data });
    } catch (e) {
      next(e);
    }
  }
);

paymentsRouter.get(
  "/admin/revenue",
  requireAuth,
  requirePermission("payments.manage"),
  async (_req: AuthenticatedRequest, res, next) => {
    try {
      res.json({ data: await adminRevenueSummary() });
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
