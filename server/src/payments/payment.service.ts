import type { PaymentPurpose, Prisma } from "@prisma/client";
import { AppError } from "../lib/errors.js";
import { prisma } from "../lib/prisma.js";
import { seatCapacity } from "../subscriptions/subscription.service.js";
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

  // Fallback env monthly/yearly only when no DB catalog yet.
  if (!mapped.length) {
    mapped.push(
      ...listConfiguredPlans().filter((p) => p.purpose !== "EXTRA_SEATS")
    );
  }
  mapped.push(...envPlans);

  const enabled = paymentsEnabled() || mapped.some((p) => p.purpose !== "EXTRA_SEATS");
  const liveBlocked = liveKeyBlocked();
  return {
    enabled: Boolean(
      (process.env.PAYMENT_ENABLED === "true" ||
        process.env.PAYMENT_ENABLED === "1" ||
        paymentsEnabled()) &&
        (process.env.RAZORPAY_KEY_ID || publicKeyId()) &&
        mapped.length > 0 &&
        !liveBlocked
    ),
    currency: mapped[0]?.currency ?? "INR",
    keyId: liveBlocked ? null : publicKeyId(),
    plans: mapped,
    dbCatalog: dbPlans.length > 0,
    note: liveBlocked
      ? "Checkout is paused: live Razorpay keys are not approved yet."
      : mapped.length > 0
        ? null
        : "No published subscription plans yet. Ask Admin to publish plans, or configure env plan amounts.",
    // keep flag for callers that still check paymentsEnabled alone
    gatewayReady: paymentsEnabled() || enabled,
  };
}

export async function createCheckoutOrder(
  userId: string,
  input: { purpose?: PlanPurpose; seats?: number; planId?: string }
) {
  await assertAgreementsAccepted(userId);
  const gatewayOk =
    process.env.PAYMENT_ENABLED === "true" ||
    process.env.PAYMENT_ENABLED === "1" ||
    paymentsEnabled();
  if (!gatewayOk || !publicKeyId()) {
    throw new AppError("Checkout is not configured", 503, {
      code: "PLAN_PRICES_NOT_CONFIGURED",
    });
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
    if (!purpose) {
      throw new AppError("planId or purpose is required", 400);
    }
    const envPlan = getPlan(purpose, input.seats ?? 1);
    if (!envPlan) {
      throw new AppError("Selected plan is not available", 400);
    }
    plan = envPlan;
    durationMonths =
      purpose === "FAMILY_MONTHLY"
        ? 1
        : purpose === "FAMILY_3_MONTH"
          ? 3
          : purpose === "FAMILY_6_MONTH"
            ? 6
            : purpose === "FAMILY_YEARLY"
              ? 12
              : undefined;
    snapshot = {
      planCode: envPlan.code,
      planName: envPlan.label,
      durationMonths,
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

async function activateVerifiedPayment(
  paymentRowId: string,
  razorpayPaymentId: string,
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

    // Lock subscription if present
    let subscription = await tx.subscription.findFirst({
      where: { userId: payment.userId },
      orderBy: { createdAt: "desc" },
    });
    if (subscription) {
      await tx.$executeRaw`SELECT id FROM "Subscription" WHERE id = ${subscription.id} FOR UPDATE`;
      subscription = await tx.subscription.findUnique({ where: { id: subscription.id } });
    }

    const purpose = payment.purpose as PlanPurpose | "MANUAL_ADMIN";
    const now = new Date();
    let meta: {
      durationMonths?: number;
      planCode?: string;
      planName?: string;
      includedSeats?: number;
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
      const base =
        subscription?.expiresAt && subscription.expiresAt > now
          ? subscription.expiresAt
          : now;
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

      if (subscription) {
        subscription = await tx.subscription.update({
          where: { id: subscription.id },
          data: {
            plan: planLabel,
            status: "ACTIVE",
            expiresAt,
            graceEndsAt: null,
            cancelledAt: null,
            provider: "razorpay",
            providerRef: razorpayPaymentId,
            includedSeats,
            startedAt: subscription.startedAt ?? now,
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
            provider: "razorpay",
            providerRef: razorpayPaymentId,
            includedSeats,
            extraSeats: 0,
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

    const updated = await tx.payment.update({
      where: { id: payment.id },
      data: {
        status: "SUCCEEDED",
        paidAt: now,
        razorpayPaymentId,
        receiptNumber: payment.receiptNumber ?? receiptNumberFor(payment.id, now),
        subscriptionId: subscription?.id ?? payment.subscriptionId,
        rawEventId: opts?.eventId ?? payment.rawEventId,
      },
    });

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
  if (remote.status !== "captured" && remote.status !== "authorized") {
    await prisma.payment.update({
      where: { id: payment.id },
      data: { status: "FAILED", razorpayPaymentId: input.paymentId },
    });
    throw new AppError(`Payment not successful (${remote.status})`, 402);
  }
  if (remote.amount !== payment.amountCents) {
    throw new AppError("Payment amount mismatch", 400);
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
        };
      };
    };
  };

  const eventId = payload.id ?? `${payload.event}:${payload.payload?.payment?.entity?.id ?? ""}`;
  const event = payload.event ?? "";

  if (event === "payment.captured" || event === "payment.authorized") {
    const entity = payload.payload?.payment?.entity;
    if (!entity?.id || !entity.order_id) {
      return { ignored: true, reason: "missing payment entity" };
    }
    const payment = await prisma.payment.findFirst({
      where: { razorpayOrderId: entity.order_id, provider: "razorpay" },
    });
    if (!payment) return { ignored: true, reason: "unknown order" };
    if (entity.amount != null && entity.amount !== payment.amountCents) {
      throw new AppError("Webhook amount mismatch", 400);
    }
    return activateVerifiedPayment(payment.id, entity.id, { eventId });
  }

  if (event === "payment.failed") {
    const entity = payload.payload?.payment?.entity;
    if (!entity?.order_id) return { ignored: true };
    await prisma.payment.updateMany({
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
    return { failed: true };
  }

  if (event === "refund.processed" || event.startsWith("refund.")) {
    const refund = payload.payload?.refund?.entity;
    const paymentId = refund?.payment_id;
    if (!paymentId) return { ignored: true };
    const payment = await prisma.payment.findFirst({
      where: { razorpayPaymentId: paymentId },
    });
    if (!payment) return { ignored: true, reason: "unknown payment" };
    if (payment.status === "REFUNDED") {
      return { payment, alreadyProcessed: true };
    }
    await prisma.payment.update({
      where: { id: payment.id },
      data: { status: "REFUNDED", rawEventId: eventId },
    });
    // Do not auto-revoke seats (may be in use) — Admin revoke remains.
    return { refunded: true, paymentId: payment.id };
  }

  return { ignored: true, reason: `unhandled event ${event}` };
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
      : { razorpayOrderId: input.orderId!, userId },
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
      subscription: { select: { plan: true, expiresAt: true } },
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
  } = {};
  try {
    meta = payment.metadataJson ? JSON.parse(payment.metadataJson) : {};
  } catch {
    meta = {};
  }
  const total = payment.amountCents;
  const tax = Number(meta.taxPaise) || 0;
  return {
    receiptNumber: payment.receiptNumber,
    paidAt: payment.paidAt,
    parentName: payment.user.name,
    parentEmail: payment.user.email,
    planName: meta.planName ?? payment.planCode ?? payment.purpose,
    durationMonths: meta.durationMonths ?? null,
    seatsPurchased: payment.seatsPurchased,
    amountPaise: Number(meta.amountPaise) || total - tax,
    taxPaise: tax,
    totalPaise: total,
    currency: payment.currency,
    razorpayOrderId: payment.razorpayOrderId,
    razorpayPaymentId: payment.razorpayPaymentId,
    validUntil: payment.subscription?.expiresAt ?? null,
  };
}

export async function listMyPayments(userId: string) {
  return prisma.payment.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
}

export async function listPaymentsForAdmin(take = 100) {
  return prisma.payment.findMany({
    orderBy: { createdAt: "desc" },
    take: Math.min(take, 200),
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
