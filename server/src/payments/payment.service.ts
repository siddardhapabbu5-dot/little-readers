import type { PaymentPurpose, Prisma } from "@prisma/client";
import { AppError } from "../lib/errors.js";
import { prisma } from "../lib/prisma.js";
import {
  entitlementSubscription,
  isSubscriptionRecordEligible,
  seatCapacity,
} from "../subscriptions/subscription.service.js";
import { recordSubscriptionAudit } from "../subscriptions/audit.js";
import {
  getPlan,
  listConfiguredPlans,
  paymentsEnabled,
  publicKeyId,
  type CatalogPlan,
  type PlanPurpose,
} from "./plans.js";
import {
  getPublishedPlanById,
  listPublishedPlans,
  purposeForDuration,
} from "../academic/subscription-plan.service.js";
import { assertAgreementsAccepted } from "../agreements/agreements.service.js";
import { cashfreeEnabled, cashfreeMode } from "./cashfree.js";
import {
  getRazorpayClient,
  liveKeyBlocked,
  verifyCheckoutSignature,
  verifyWebhookSignature,
} from "./razorpay.js";

const BASE_INCLUDED = 2;

function addMonths(from: Date, months: number) {
  const d = new Date(from);
  d.setUTCMonth(d.getUTCMonth() + months);
  return d;
}

function addPeriod(
  from: Date,
  purpose: PlanPurpose | PaymentPurpose,
  durationMonths?: number
) {
  if (durationMonths && durationMonths > 0) {
    return addMonths(from, durationMonths);
  }
  const d = new Date(from);
  if (purpose === "FAMILY_MONTHLY") {
    d.setUTCDate(d.getUTCDate() + 30);
  } else if (purpose === "FAMILY_3_MONTH") {
    return addMonths(from, 3);
  } else if (purpose === "FAMILY_6_MONTH") {
    return addMonths(from, 6);
  } else if (purpose === "FAMILY_YEARLY") {
    d.setUTCDate(d.getUTCDate() + 365);
  }
  return d;
}

function durationLabel(months: number) {
  if (months === 1) return "Monthly";
  if (months === 3) return "3 Months";
  if (months === 6) return "6 Months";
  if (months === 12) return "1 Year";
  return `${months} Months`;
}

/** Parent-facing label — strip test stamps / raw codes from admin names. */
function publicPlanLabel(name: string, durationMonths: number) {
  const stripped = name
    .replace(/\b\d{10,}\b/g, "")
    .replace(/\bL\d+\b/gi, "")
    .replace(/\b\d+mo\b/gi, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const looksTechnical =
    !stripped ||
    stripped.length < 3 ||
    /renamed/i.test(stripped) ||
    /^\d/.test(stripped);
  return looksTechnical ? durationLabel(durationMonths) : stripped;
}

export async function getPublicPriceList() {
  const dbPlans = await listPublishedPlans();
  return {
    currency: dbPlans[0]?.currency ?? "INR",
    plans: dbPlans.map((p) => ({
      code: p.code,
      label: publicPlanLabel(p.name, p.durationMonths),
      durationMonths: p.durationMonths,
      amountPaise: p.amountPaise,
      taxPaise: p.taxPaise,
      totalPaise: p.totalPaise,
      currency: p.currency,
    })),
  };
}

export async function getPlansCatalog(levelId?: string) {
  const dbPlans = await listPublishedPlans(levelId);
  const envPlans = listConfiguredPlans().filter((p) => p.purpose === "EXTRA_SEATS");
  const mapped: Array<CatalogPlan & { planId?: string; durationMonths?: number }> =
    dbPlans.map((p) => ({
      purpose: p.purpose as PlanPurpose,
      code: p.code,
      label: publicPlanLabel(p.name, p.durationMonths),
      description: p.description ?? `Full access for ${durationLabel(p.durationMonths).toLowerCase()}`,
      billingPeriod:
        p.durationMonths === 12
          ? "year"
          : p.durationMonths === 1
            ? "month"
            : "month",
      includedSeats: p.includedSeats,
      seatsPurchased: 0,
      amountPaise: p.amountPaise,
      taxPaise: p.taxPaise,
      totalPaise: p.totalPaise,
      currency: p.currency,
      planId: p.id,
      durationMonths: p.durationMonths,
    }));

  // Subscription prices come only from Admin-published DB plans.
  const hasSubscriptionPlans = mapped.length > 0;
  mapped.push(...envPlans);

  const liveBlocked = liveKeyBlocked();
  const razorpayOn = Boolean(paymentsEnabled() && !liveBlocked);
  const cashfreeOn = cashfreeEnabled();
  const gatewayOn = razorpayOn || cashfreeOn;
  const enabled = Boolean(gatewayOn && hasSubscriptionPlans);
  return {
    enabled,
    currency: mapped[0]?.currency ?? "INR",
    keyId: enabled && razorpayOn ? publicKeyId() : null,
    gateways: {
      razorpay: enabled && razorpayOn,
      cashfree: enabled && cashfreeOn,
    },
    cashfreeMode: enabled && cashfreeOn ? cashfreeMode() : null,
    plans: mapped,
    dbCatalog: dbPlans.length > 0,
    note: !gatewayOn
      ? liveBlocked && paymentsEnabled()
        ? "Checkout is paused: live Razorpay keys are not approved yet."
        : "Online payments are not open yet."
      : hasSubscriptionPlans
        ? null
        : "No published subscription plans yet. Ask Admin to publish plans.",
    gatewayReady: enabled,
  };
}

const NATIVE_APP_PLATFORMS = new Set(["android", "ios"]);
const FAMILY_PURPOSES = new Set([
  "FAMILY_MONTHLY",
  "FAMILY_YEARLY",
  "FAMILY_3_MONTH",
  "FAMILY_6_MONTH",
]);

/** Website gateways share one prepaid row; store-managed and manual rows are never relabelled. */
export const WEB_PAYMENT_PROVIDERS = new Set(["razorpay", "cashfree"]);

async function latestWebSubscription(userId: string, tx: Prisma.TransactionClient) {
  return tx.subscription.findFirst({
    where: { userId, provider: { in: [...WEB_PAYMENT_PROVIDERS] } },
    orderBy: { createdAt: "desc" },
  });
}

export type CheckoutInput = { purpose?: PlanPurpose; seats?: number; planId?: string };

/** Shared website-checkout guards and price lookup; the caller creates the gateway order. */
export async function resolveCheckoutPlan(
  userId: string,
  input: CheckoutInput,
  clientPlatform: string | undefined,
  gatewayReady: boolean
) {
  if (clientPlatform && NATIVE_APP_PLATFORMS.has(clientPlatform.toLowerCase())) {
    throw new AppError(
      "Website checkout is not available in the mobile app. Use the app store's subscription option.",
      403,
      { code: "USE_STORE_BILLING" }
    );
  }
  await assertAgreementsAccepted(userId);
  if (!gatewayReady) {
    throw new AppError("Checkout is not configured", 503, {
      code: "PLAN_PRICES_NOT_CONFIGURED",
    });
  }
  const current = await entitlementSubscription(userId);
  if (
    current?.provider === "google_play" &&
    isSubscriptionRecordEligible(current) &&
    (input.planId || (input.purpose && FAMILY_PURPOSES.has(input.purpose)))
  ) {
    throw new AppError(
      "You already have an active subscription through Google Play. Manage it in Google Play.",
      409,
      { code: "MANAGED_BY_GOOGLE_PLAY" }
    );
  }

  let plan: CatalogPlan & {
    planId?: string;
    durationMonths?: number;
    includedSeats?: number;
  };
  let durationMonths: number | undefined;
  let snapshot: Record<string, unknown> = {};

  if (input.planId) {
    const dbPlan = await getPublishedPlanById(input.planId);
    if (!dbPlan) {
      throw new AppError(
        "Selected plan is not available (draft, inactive, or unpublished)",
        400,
        { code: "PLAN_UNAVAILABLE" }
      );
    }
    durationMonths = dbPlan.durationMonths;
    plan = {
      purpose: purposeForDuration(dbPlan.durationMonths) as PlanPurpose,
      code: dbPlan.code,
      label: dbPlan.name,
      description: dbPlan.description ?? "",
      billingPeriod: dbPlan.durationMonths === 12 ? "year" : "month",
      includedSeats: dbPlan.includedSeats,
      seatsPurchased: 0,
      amountPaise: dbPlan.amountPaise,
      taxPaise: dbPlan.taxPaise,
      totalPaise: dbPlan.totalPaise,
      currency: dbPlan.currency,
      planId: dbPlan.id,
      durationMonths: dbPlan.durationMonths,
    };
    snapshot = {
      planId: dbPlan.id,
      planCode: dbPlan.code,
      planName: dbPlan.name,
      durationMonths: dbPlan.durationMonths,
      includedSeats: dbPlan.includedSeats,
      amountPaise: dbPlan.amountPaise,
      taxPaise: dbPlan.taxPaise,
      totalPaise: dbPlan.totalPaise,
      applicableLevel: dbPlan.applicableLevel,
    };
  } else {
    const purpose = input.purpose;
    if (purpose !== "EXTRA_SEATS") {
      throw new AppError("Choose a published subscription plan", 400, {
        code: "PLAN_REQUIRED",
      });
    }
    const envPlan = getPlan(purpose, input.seats ?? 1);
    if (!envPlan) {
      throw new AppError("Selected plan is not available", 400);
    }
    plan = envPlan;
    snapshot = {
      planCode: envPlan.code,
      planName: envPlan.label,
      includedSeats: envPlan.includedSeats,
      amountPaise: envPlan.amountPaise,
      taxPaise: envPlan.taxPaise,
      totalPaise: envPlan.totalPaise,
    };
  }

  if (plan.purpose === "EXTRA_SEATS") {
    const sub = await prisma.subscription.findFirst({
      where: { userId },
      orderBy: { createdAt: "desc" },
    });
    if (!sub) {
      throw new AppError(
        "Purchase a family subscription before adding extra seats",
        400,
        { code: "SUBSCRIPTION_REQUIRED" }
      );
    }
  }

  return { plan, durationMonths, snapshot };
}

export async function createCheckoutOrder(
  userId: string,
  input: CheckoutInput,
  clientPlatform?: string
) {
  const { plan, durationMonths, snapshot } = await resolveCheckoutPlan(
    userId,
    input,
    clientPlatform,
    Boolean(paymentsEnabled() && publicKeyId())
  );

  const receipt = `lr_${userId.slice(-6)}_${Date.now()}`.slice(0, 40);
  const client = getRazorpayClient();
  const order = await client.createOrder({
    amountPaise: plan.totalPaise,
    currency: plan.currency,
    receipt,
    notes: {
      purpose: plan.purpose,
      userId,
      seats: String(plan.seatsPurchased),
      planId: plan.planId ?? "",
    },
  });

  const payment = await prisma.payment.create({
    data: {
      userId,
      amountCents: plan.totalPaise,
      currency: plan.currency,
      status: "PENDING",
      provider: "razorpay",
      providerRef: order.id,
      purpose: plan.purpose as PaymentPurpose,
      seatsPurchased: plan.seatsPurchased,
      planCode: plan.code,
      razorpayOrderId: order.id,
      metadataJson: JSON.stringify({
        amountPaise: plan.amountPaise,
        taxPaise: plan.taxPaise,
        totalPaise: plan.totalPaise,
        durationMonths,
        receipt,
        ...snapshot,
      }),
    },
  });

  return {
    paymentId: payment.id,
    orderId: order.id,
    amountPaise: plan.totalPaise,
    currency: plan.currency,
    keyId: publicKeyId(),
    purpose: plan.purpose,
    plan,
  };
}

/** Grants access for a gateway-verified website payment (Razorpay or Cashfree). Idempotent. */
export async function activateVerifiedPayment(
  paymentRowId: string,
  gatewayPaymentId: string,
  opts?: { eventId?: string }
) {
  return prisma.$transaction(async (tx) => {
    // Serialises /verify and webhook deliveries for the same order.
    await tx.$executeRaw`SELECT id FROM "Payment" WHERE id = ${paymentRowId} FOR UPDATE`;
    const payment = await tx.payment.findUnique({ where: { id: paymentRowId } });
    if (!payment) throw new AppError("Payment not found", 404);

    if (opts?.eventId) {
      const dupEvent = await tx.payment.findFirst({
        where: { rawEventId: opts.eventId },
      });
      if (dupEvent && dupEvent.id !== payment.id) {
        return { payment: dupEvent, alreadyProcessed: true as const };
      }
    }

    if (payment.status === "SUCCEEDED") {
      return { payment, alreadyProcessed: true as const };
    }
    if (payment.status === "REFUNDED") {
      throw new AppError("Payment was refunded", 409);
    }

    const purpose = payment.purpose as PlanPurpose | "MANUAL_ADMIN";
    const provider = payment.provider;
    const isRazorpay = provider === "razorpay";
    const now = new Date();

    // Family plans extend the website row; add-on seats attach to the row that grants access.
    let subscription =
      purpose === "EXTRA_SEATS"
        ? await entitlementSubscription(payment.userId, tx)
        : await latestWebSubscription(payment.userId, tx);
    if (subscription) {
      await tx.$executeRaw`SELECT id FROM "Subscription" WHERE id = ${subscription.id} FOR UPDATE`;
      subscription = await tx.subscription.findUnique({ where: { id: subscription.id } });
    }
    const previousStatus = subscription?.status ?? null;
    const webRows = await tx.subscription.findMany({
      where: { userId: payment.userId, provider: { not: "google_play" } },
    });
    const latestWebExpiry = webRows
      .filter((r) => isSubscriptionRecordEligible(r, now) && r.expiresAt > now)
      .reduce<Date | null>((max, r) => (!max || r.expiresAt > max ? r.expiresAt : max), null);
    let meta: {
      durationMonths?: number;
      planCode?: string;
      planName?: string;
      includedSeats?: number;
      [key: string]: unknown;
    } = {};
    try {
      meta = payment.metadataJson
        ? (JSON.parse(payment.metadataJson) as typeof meta)
        : {};
    } catch {
      meta = {};
    }

    const familyPurposes = new Set([
      "FAMILY_MONTHLY",
      "FAMILY_YEARLY",
      "FAMILY_3_MONTH",
      "FAMILY_6_MONTH",
    ]);

    if (familyPurposes.has(purpose)) {
      const base = latestWebExpiry ?? now;
      const expiresAt = addPeriod(base, purpose, meta.durationMonths);
      // Preserve purchased plan code/label on the subscription row (history).
      const planLabel =
        meta.planCode ||
        payment.planCode ||
        (purpose === "FAMILY_MONTHLY"
          ? "MONTHLY"
          : purpose === "FAMILY_YEARLY"
            ? "YEARLY"
            : purpose);
      const includedSeats = Math.max(
        1,
        Math.min(
          20,
          Number(meta.includedSeats) > 0
            ? Number(meta.includedSeats)
            : BASE_INCLUDED
        )
      );

      // Receipt facts for this payment only; later renewals must not rewrite them.
      const children = await tx.child.findMany({
        where: { parentId: payment.userId, isActive: true },
        orderBy: [{ hasLearningSeat: "desc" }, { createdAt: "asc" }],
        take: includedSeats,
        select: { displayName: true },
      });
      meta = {
        ...meta,
        periodStartsAt: base.toISOString(),
        periodEndsAt: expiresAt.toISOString(),
        childNames: children.map((c) => c.displayName),
      };

      if (subscription) {
        subscription = await tx.subscription.update({
          where: { id: subscription.id },
          data: {
            plan: planLabel,
            status: "ACTIVE",
            expiresAt,
            graceEndsAt: null,
            cancelledAt: null,
            provider,
            providerRef: gatewayPaymentId,
            includedSeats,
            startedAt: subscription.startedAt ?? now,
            productId: payment.planCode,
            autoRenewing: false,
            verificationStatus: "VERIFIED",
            verifiedAt: now,
          },
        });
      } else {
        subscription = await tx.subscription.create({
          data: {
            userId: payment.userId,
            plan: planLabel,
            status: "ACTIVE",
            startedAt: now,
            expiresAt,
            provider,
            providerRef: gatewayPaymentId,
            includedSeats,
            extraSeats: 0,
            productId: payment.planCode,
            autoRenewing: false,
            verificationStatus: "VERIFIED",
            verifiedAt: now,
          },
        });
      }
    } else if (purpose === "EXTRA_SEATS") {
      if (!subscription) {
        throw new AppError("No subscription to attach seats to", 400);
      }
      const n = Math.max(1, payment.seatsPurchased || 1);
      subscription = await tx.subscription.update({
        where: { id: subscription.id },
        data: { extraSeats: { increment: n } },
      });
    }

    if (!isRazorpay) meta.gatewayPaymentId = gatewayPaymentId;
    const updated = await tx.payment.update({
      where: { id: payment.id },
      data: {
        status: "SUCCEEDED",
        paidAt: now,
        ...(isRazorpay ? { razorpayPaymentId: gatewayPaymentId } : {}),
        receiptNumber: payment.receiptNumber ?? receiptNumberFor(payment.id, now),
        subscriptionId: subscription?.id ?? payment.subscriptionId,
        rawEventId: opts?.eventId ?? payment.rawEventId,
        metadataJson: JSON.stringify(meta),
      },
    });

    await recordSubscriptionAudit(
      {
        userId: payment.userId,
        subscriptionId: subscription?.id ?? null,
        paymentId: payment.id,
        provider,
        source: opts?.eventId ? `${provider}_webhook` : `${provider}_verify`,
        eventType: purpose === "EXTRA_SEATS" ? "EXTRA_SEATS_PAID" : "PAYMENT_CAPTURED",
        providerEventId: opts?.eventId ? `${provider}:${opts.eventId}` : null,
        fromStatus: previousStatus,
        toStatus: subscription?.status ?? null,
        details: {
          orderId: payment.razorpayOrderId ?? payment.providerRef,
          paymentId: gatewayPaymentId,
          amount: payment.amountCents,
          currency: payment.currency,
          planCode: payment.planCode,
          expiresAt: subscription?.expiresAt?.toISOString() ?? null,
        },
      },
      tx
    );

    return {
      payment: updated,
      alreadyProcessed: false as const,
      subscription: subscription
        ? {
            id: subscription.id,
            status: subscription.status,
            expiresAt: subscription.expiresAt,
            includedSeats: subscription.includedSeats,
            extraSeats: subscription.extraSeats,
            capacity: seatCapacity(subscription),
          }
        : null,
    };
  });
}

export async function verifyAndActivate(
  userId: string,
  input: { orderId: string; paymentId: string; signature: string }
) {
  verifyCheckoutSignature({
    orderId: input.orderId,
    paymentId: input.paymentId,
    signature: input.signature,
  });

  const payment = await prisma.payment.findFirst({
    where: {
      userId,
      razorpayOrderId: input.orderId,
      provider: "razorpay",
    },
  });
  if (!payment) throw new AppError("Order not found for this account", 404);

  const remote = await getRazorpayClient().fetchPayment(input.paymentId);
  if (remote.order_id !== input.orderId) {
    throw new AppError("Payment does not match order", 400);
  }
  if (remote.status === "authorized") {
    // Not money yet: access starts when Razorpay reports the capture (payment.captured webhook).
    await prisma.payment.update({
      where: { id: payment.id },
      data: { razorpayPaymentId: input.paymentId },
    });
    return {
      processing: true as const,
      code: "PAYMENT_PROCESSING",
      paymentId: payment.id,
      message:
        "Your payment is being confirmed by the bank. Access will start automatically once it is captured.",
    };
  }
  if (remote.status !== "captured") {
    await prisma.payment.update({
      where: { id: payment.id },
      data: { status: "FAILED", razorpayPaymentId: input.paymentId },
    });
    await recordSubscriptionAudit({
      userId: payment.userId,
      paymentId: payment.id,
      provider: "razorpay",
      source: "razorpay_verify",
      eventType: "PAYMENT_FAILED",
      toStatus: "FAILED",
      details: { orderId: input.orderId, paymentId: input.paymentId, gatewayStatus: remote.status },
    });
    throw new AppError(`Payment not successful (${remote.status})`, 402);
  }
  if (
    remote.amount !== payment.amountCents ||
    (remote.currency && remote.currency !== payment.currency)
  ) {
    throw new AppError("Payment amount mismatch", 400, { code: "AMOUNT_MISMATCH" });
  }

  return activateVerifiedPayment(payment.id, input.paymentId);
}

export async function handleWebhook(rawBody: string, signature: string | undefined) {
  verifyWebhookSignature(rawBody, signature);
  const payload = JSON.parse(rawBody) as {
    event?: string;
    id?: string;
    payload?: {
      payment?: {
        entity?: {
          id?: string;
          order_id?: string;
          status?: string;
          amount?: number;
        };
      };
      refund?: {
        entity?: {
          id?: string;
          payment_id?: string;
          amount?: number;
        };
      };
    };
  };

  const eventId = payload.id ?? `${payload.event}:${payload.payload?.payment?.entity?.id ?? ""}`;
  const event = payload.event ?? "";

  if (event === "payment.authorized") {
    return { ignored: true, reason: "authorized is not captured; waiting for payment.captured" };
  }

  if (event === "payment.captured") {
    const entity = payload.payload?.payment?.entity;
    if (!entity?.id || !entity.order_id) {
      return { ignored: true, reason: "missing payment entity" };
    }
    const payment = await prisma.payment.findFirst({
      where: { razorpayOrderId: entity.order_id, provider: "razorpay" },
    });
    if (!payment) return { ignored: true, reason: "unknown order" };
    if (entity.amount !== payment.amountCents) {
      throw new AppError("Webhook amount mismatch", 400);
    }
    return activateVerifiedPayment(payment.id, entity.id, { eventId });
  }

  if (event === "payment.failed") {
    const entity = payload.payload?.payment?.entity;
    if (!entity?.order_id) return { ignored: true };
    const failed = await prisma.payment.findFirst({
      where: { razorpayOrderId: entity.order_id, provider: "razorpay" },
    });
    const updated = await prisma.payment.updateMany({
      where: {
        razorpayOrderId: entity.order_id,
        status: "PENDING",
      },
      data: {
        status: "FAILED",
        razorpayPaymentId: entity.id,
        rawEventId: eventId,
      },
    });
    if (failed) {
      await recordSubscriptionAudit({
        userId: failed.userId,
        paymentId: failed.id,
        provider: "razorpay",
        source: "razorpay_webhook",
        eventType: "PAYMENT_FAILED",
        providerEventId: `razorpay:${eventId}`,
        fromStatus: failed.status,
        toStatus: updated.count ? "FAILED" : failed.status,
        details: { orderId: entity.order_id, paymentId: entity.id ?? null },
      });
    }
    return { failed: true };
  }

  if (event === "refund.processed") {
    const refund = payload.payload?.refund?.entity;
    const paymentId = refund?.payment_id;
    if (!paymentId) return { ignored: true };
    return applyGatewayRefund({
      provider: "razorpay",
      paymentWhere: { razorpayPaymentId: paymentId, provider: "razorpay" },
      refundAmount: refund?.amount,
      refundId: refund?.id ?? null,
      eventId,
    });
  }

  if (event.startsWith("refund.")) {
    return { ignored: true, reason: `refund event ${event} does not change access` };
  }

  return { ignored: true, reason: `unhandled event ${event}` };
}

/**
 * A processed full refund removes the refunded period from the website row (access ends now if
 * nothing else remains). Partial refunds and add-on seat refunds are recorded for Admin review.
 */
export async function applyGatewayRefund(input: {
  provider: "razorpay" | "cashfree";
  paymentWhere: Prisma.PaymentWhereInput;
  /** Paise. */
  refundAmount?: number;
  refundId: string | null;
  eventId: string;
}) {
  const provider = input.provider;
  return prisma.$transaction(async (tx) => {
    const found = await tx.payment.findFirst({ where: input.paymentWhere });
    if (!found) return { ignored: true as const, reason: "unknown payment" };
    await tx.$executeRaw`SELECT id FROM "Payment" WHERE id = ${found.id} FOR UPDATE`;
    const payment = await tx.payment.findUnique({ where: { id: found.id } });
    if (!payment) return { ignored: true as const, reason: "unknown payment" };
    if (payment.status === "REFUNDED") {
      return { payment, alreadyProcessed: true as const };
    }

    let meta: Record<string, unknown> = {};
    try {
      meta = payment.metadataJson ? (JSON.parse(payment.metadataJson) as Record<string, unknown>) : {};
    } catch {
      meta = {};
    }
    const refunds = Array.isArray(meta.refunds)
      ? (meta.refunds as Array<{ refundId?: string | null; amount?: number | null }>)
      : [];
    if (input.refundId && refunds.some((r) => r.refundId === input.refundId)) {
      return { payment, alreadyProcessed: true as const };
    }
    const refundedSoFar = refunds.reduce((sum, r) => sum + (typeof r.amount === "number" ? r.amount : 0), 0);
    const isPartial =
      typeof input.refundAmount === "number" &&
      refundedSoFar + input.refundAmount < payment.amountCents;
    meta.refunds = [
      ...refunds,
      { refundId: input.refundId, amount: input.refundAmount ?? null, at: new Date().toISOString() },
    ];

    if (isPartial) {
      await tx.payment.update({
        where: { id: payment.id },
        data: { metadataJson: JSON.stringify(meta) },
      });
      await recordSubscriptionAudit(
        {
          userId: payment.userId,
          subscriptionId: payment.subscriptionId,
          paymentId: payment.id,
          provider,
          source: `${provider}_webhook`,
          eventType: "PARTIAL_REFUND",
          providerEventId: `${provider}:${input.eventId}`,
          details: { refundAmount: input.refundAmount, paymentAmount: payment.amountCents },
        },
        tx
      );
      return { refunded: false as const, partial: true as const, paymentId: payment.id };
    }

    await tx.payment.update({
      where: { id: payment.id },
      data: { status: "REFUNDED", rawEventId: input.eventId, metadataJson: JSON.stringify(meta) },
    });

    let subscriptionChange: { id: string; from: string; to: string; expiresAt: Date } | null = null;
    const start = typeof meta.periodStartsAt === "string" ? new Date(meta.periodStartsAt) : null;
    const end = typeof meta.periodEndsAt === "string" ? new Date(meta.periodEndsAt) : null;
    if (
      FAMILY_PURPOSES.has(payment.purpose) &&
      payment.subscriptionId &&
      payment.status === "SUCCEEDED" &&
      start &&
      end &&
      end > start
    ) {
      await tx.$executeRaw`SELECT id FROM "Subscription" WHERE id = ${payment.subscriptionId} FOR UPDATE`;
      const sub = await tx.subscription.findUnique({ where: { id: payment.subscriptionId } });
      if (sub && WEB_PAYMENT_PROVIDERS.has(sub.provider ?? "")) {
        const now = new Date();
        const refundedMs = end.getTime() - start.getTime();
        const nextExpiry = new Date(Math.max(sub.expiresAt.getTime() - refundedMs, now.getTime()));
        const ended = nextExpiry.getTime() <= now.getTime();
        const updated = await tx.subscription.update({
          where: { id: sub.id },
          data: {
            expiresAt: nextExpiry,
            status: ended ? "EXPIRED" : sub.status,
            graceEndsAt: ended ? null : sub.graceEndsAt,
          },
        });
        subscriptionChange = {
          id: sub.id,
          from: sub.status,
          to: updated.status,
          expiresAt: updated.expiresAt,
        };
      }
    }

    await recordSubscriptionAudit(
      {
        userId: payment.userId,
        subscriptionId: subscriptionChange?.id ?? payment.subscriptionId,
        paymentId: payment.id,
        provider,
        source: `${provider}_webhook`,
        eventType:
          payment.purpose === "EXTRA_SEATS" ? "REFUND_EXTRA_SEATS_ADMIN_REVIEW" : "REFUND_PROCESSED",
        providerEventId: `${provider}:${input.eventId}`,
        fromStatus: subscriptionChange?.from ?? null,
        toStatus: subscriptionChange?.to ?? null,
        details: {
          refundAmount: input.refundAmount ?? null,
          expiresAt: subscriptionChange?.expiresAt.toISOString() ?? null,
        },
      },
      tx
    );
    return {
      refunded: true as const,
      paymentId: payment.id,
      accessRevoked: subscriptionChange?.to === "EXPIRED",
      subscriptionExpiresAt: subscriptionChange?.expiresAt ?? null,
    };
  });
}

/** Mark a pending checkout as failed when the user dismisses Razorpay. */
export async function cancelPendingPayment(
  userId: string,
  input: { orderId?: string; paymentId?: string }
) {
  if (!input.paymentId && !input.orderId) {
    throw new AppError("orderId or paymentId is required", 400);
  }
  const payment = await prisma.payment.findFirst({
    where: input.paymentId
      ? { id: input.paymentId, userId }
      : {
          userId,
          OR: [{ razorpayOrderId: input.orderId! }, { providerRef: input.orderId!, provider: "cashfree" }],
        },
  });
  if (!payment) throw new AppError("Payment not found", 404);
  if (payment.status === "SUCCEEDED") {
    return {
      paymentId: payment.id,
      status: "SUCCEEDED" as const,
      alreadySucceeded: true,
      message: "Payment already succeeded — not cancelled",
    };
  }
  if (payment.status === "REFUNDED") {
    return {
      paymentId: payment.id,
      status: "REFUNDED" as const,
      alreadySucceeded: false,
      message: "Payment was refunded",
    };
  }
  let meta: Record<string, unknown> = {};
  try {
    meta = payment.metadataJson
      ? (JSON.parse(payment.metadataJson) as Record<string, unknown>)
      : {};
  } catch {
    meta = {};
  }
  meta.cancelledByUser = true;
  meta.cancelledAt = new Date().toISOString();
  const updated = await prisma.payment.update({
    where: { id: payment.id },
    data: {
      status: "FAILED",
      metadataJson: JSON.stringify(meta),
    },
  });
  return {
    paymentId: updated.id,
    status: updated.status,
    alreadySucceeded: false,
    message: "Pending payment marked cancelled",
  };
}

function receiptNumberFor(paymentId: string, paidAt: Date) {
  const IST_OFFSET_MS = 330 * 60 * 1000;
  const ymd = new Date(paidAt.getTime() + IST_OFFSET_MS).toISOString().slice(0, 10).replace(/-/g, "");
  return `LW-${ymd}-${paymentId.slice(-8).toUpperCase()}`;
}

/** Receipts exist only for payments the server has verified. */
export async function getPaymentReceipt(userId: string, paymentId: string) {
  const payment = await prisma.payment.findFirst({
    where: { id: paymentId, userId },
    include: {
      user: { select: { name: true, email: true } },
      subscription: { select: { plan: true, startedAt: true, expiresAt: true } },
    },
  });
  if (!payment) throw new AppError("Payment not found", 404);
  if (payment.status !== "SUCCEEDED" || !payment.receiptNumber || !payment.paidAt) {
    throw new AppError("A receipt is available only after the payment is verified", 409, {
      code: "RECEIPT_NOT_AVAILABLE",
    });
  }
  let meta: {
    planName?: string;
    durationMonths?: number;
    amountPaise?: number;
    taxPaise?: number;
    periodStartsAt?: string;
    periodEndsAt?: string;
    childNames?: string[];
    gatewayPaymentId?: string;
  } = {};
  try {
    meta = payment.metadataJson ? JSON.parse(payment.metadataJson) : {};
  } catch {
    meta = {};
  }
  const total = payment.amountCents;
  const tax = Number(meta.taxPaise) || 0;
  const childNames =
    meta.childNames ??
    (
      await prisma.child.findMany({
        where: { parentId: payment.userId, isActive: true },
        orderBy: [{ hasLearningSeat: "desc" }, { createdAt: "asc" }],
        select: { displayName: true },
      })
    ).map((c) => c.displayName);
  const startsAt = meta.periodStartsAt ?? payment.subscription?.startedAt ?? null;
  const endsAt = meta.periodEndsAt ?? payment.subscription?.expiresAt ?? null;
  return {
    receiptNumber: payment.receiptNumber,
    paidAt: payment.paidAt,
    parentName: payment.user.name,
    parentEmail: payment.user.email,
    childNames,
    planName: meta.planName ?? payment.planCode ?? payment.purpose,
    durationMonths: meta.durationMonths ?? null,
    seatsPurchased: payment.seatsPurchased,
    amountPaise: Number(meta.amountPaise) || total - tax,
    taxPaise: tax,
    totalPaise: total,
    currency: payment.currency,
    provider: payment.provider,
    gatewayOrderId: payment.razorpayOrderId ?? payment.providerRef,
    gatewayPaymentId: payment.razorpayPaymentId ?? meta.gatewayPaymentId ?? null,
    razorpayOrderId: payment.razorpayOrderId,
    razorpayPaymentId: payment.razorpayPaymentId,
    subscriptionStartsAt: startsAt,
    subscriptionEndsAt: endsAt,
    validUntil: endsAt,
  };
}

export async function listMyPayments(userId: string) {
  return prisma.payment.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
}

export async function listPaymentsForAdmin(
  take = 100,
  filter: { q?: string; provider?: string } = {}
) {
  const q = filter.q?.trim();
  const where: Prisma.PaymentWhereInput = {
    ...(filter.provider ? { provider: filter.provider } : {}),
    ...(q
      ? {
          OR: [
            { providerRef: { contains: q } },
            { razorpayOrderId: { contains: q } },
            { razorpayPaymentId: { contains: q } },
            { receiptNumber: { contains: q } },
            { user: { email: { contains: q, mode: "insensitive" } } },
          ],
        }
      : {}),
  };
  return prisma.payment.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: Math.min(Number.isFinite(take) ? take : 100, 200),
    include: {
      user: { select: { id: true, name: true, email: true } },
      subscription: {
        select: {
          id: true,
          plan: true,
          status: true,
          expiresAt: true,
          includedSeats: true,
          extraSeats: true,
        },
      },
    },
  });
}
