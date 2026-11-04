import type { PaymentPurpose, Prisma } from "@prisma/client";
import { AppError } from "../lib/errors.js";
import { prisma } from "../lib/prisma.js";
import { seatCapacity } from "../subscriptions/subscription.service.js";
import {
  getPlan,
  listConfiguredPlans,
  paymentsEnabled,
  publicKeyId,
  type PlanPurpose,
} from "./plans.js";
import {
  getRazorpayClient,
  verifyCheckoutSignature,
  verifyWebhookSignature,
} from "./razorpay.js";

const BASE_INCLUDED = 2;

function addPeriod(from: Date, purpose: PlanPurpose) {
  const d = new Date(from);
  if (purpose === "FAMILY_MONTHLY") {
    d.setUTCDate(d.getUTCDate() + 30);
  } else if (purpose === "FAMILY_YEARLY") {
    d.setUTCDate(d.getUTCDate() + 365);
  }
  return d;
}

export function getPlansCatalog() {
  const plans = listConfiguredPlans();
  return {
    enabled: paymentsEnabled(),
    currency: plans[0]?.currency ?? "INR",
    keyId: paymentsEnabled() ? publicKeyId() : null,
    plans,
    note: paymentsEnabled()
      ? null
      : "Checkout unavailable until PAYMENT_ENABLED, Razorpay keys, and plan amounts are configured.",
  };
}

export async function createCheckoutOrder(
  userId: string,
  input: { purpose: PlanPurpose; seats?: number }
) {
  if (!paymentsEnabled()) {
    throw new AppError(
      "Checkout is not configured",
      503,
      { code: "PLAN_PRICES_NOT_CONFIGURED" }
    );
  }

  const plan = getPlan(input.purpose, input.seats ?? 1);
  if (!plan) {
    throw new AppError("Selected plan is not available", 400);
  }

  if (input.purpose === "EXTRA_SEATS") {
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
        receipt,
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

    if (purpose === "FAMILY_MONTHLY" || purpose === "FAMILY_YEARLY") {
      const base = subscription?.expiresAt && subscription.expiresAt > now
        ? subscription.expiresAt
        : now;
      const expiresAt = addPeriod(base, purpose);
      const planLabel = purpose === "FAMILY_MONTHLY" ? "MONTHLY" : "YEARLY";

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
            includedSeats: BASE_INCLUDED,
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
            includedSeats: BASE_INCLUDED,
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
