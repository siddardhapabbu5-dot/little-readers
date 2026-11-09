import { randomBytes } from "node:crypto";
import type { PaymentPurpose } from "@prisma/client";
import { env } from "../config/env.js";
import { AppError } from "../lib/errors.js";
import { prisma } from "../lib/prisma.js";
import { recordSubscriptionAudit } from "../subscriptions/audit.js";
import {
  cashfreeEnabled,
  cashfreeMode,
  getCashfreeClient,
  toPaise,
  verifyCashfreeWebhookSignature,
  type CashfreePayment,
} from "./cashfree.js";
import {
  activateVerifiedPayment,
  applyGatewayRefund,
  resolveCheckoutPlan,
  type CheckoutInput,
} from "./payment.service.js";

/** Cashfree requires a 10-digit Indian mobile for every order. */
export function normaliseIndianMobile(raw: string | null | undefined) {
  if (!raw) return null;
  let digits = raw.replace(/\D/g, "");
  if (digits.length === 12 && digits.startsWith("91")) digits = digits.slice(2);
  if (digits.length === 11 && digits.startsWith("0")) digits = digits.slice(1);
  return /^[6-9]\d{9}$/.test(digits) ? digits : null;
}

function httpsUrl(url: string) {
  return /^https:\/\//i.test(url) ? url : undefined;
}

/**
 * Cashfree substitutes {order_id}; it only accepts https return URLs, so local runs rely on the modal
 * result. The phone web app is served under /app on the website origin.
 */
function returnUrlFor(returnTo: "web" | "app") {
  const base = (process.env.APP_PUBLIC_URL || env.APP_PUBLIC_URL).replace(/\/$/, "");
  const path = returnTo === "app" ? "/app/payment-return" : "/parent/checkout";
  return httpsUrl(`${base}${path}?cf_order_id={order_id}`);
}

export async function createCashfreeOrder(
  userId: string,
  input: CheckoutInput & { phone?: string; returnTo?: "web" | "app" },
  clientPlatform?: string
) {
  const { plan, durationMonths, snapshot } = await resolveCheckoutPlan(
    userId,
    input,
    clientPlatform,
    cashfreeEnabled()
  );

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, name: true, email: true, mobileE164: true },
  });
  if (!user) throw new AppError("Account not found", 404);
  const phone = normaliseIndianMobile(input.phone) ?? normaliseIndianMobile(user.mobileE164);
  if (!phone) {
    throw new AppError("Enter a 10-digit mobile number to pay with Cashfree", 400, {
      code: "PHONE_REQUIRED",
    });
  }

  const orderId = `lw_${userId.slice(-8)}_${Date.now()}_${randomBytes(3).toString("hex")}`;
  const order = await getCashfreeClient().createOrder({
    orderId,
    amountPaise: plan.totalPaise,
    currency: plan.currency,
    customer: { id: user.id, email: user.email, phone, name: user.name },
    returnUrl: returnUrlFor(input.returnTo ?? "web"),
    notifyUrl: httpsUrl(process.env.CASHFREE_NOTIFY_URL ?? ""),
    note: plan.label.slice(0, 200),
    tags: { purpose: plan.purpose, planId: plan.planId ?? "" },
  });
  if (!order.payment_session_id) {
    throw new AppError("Cashfree did not return a payment session", 502, { code: "CASHFREE_ERROR" });
  }
  if (toPaise(order.order_amount) !== plan.totalPaise) {
    throw new AppError("Cashfree order amount mismatch", 502, { code: "AMOUNT_MISMATCH" });
  }

  const payment = await prisma.payment.create({
    data: {
      userId,
      amountCents: plan.totalPaise,
      currency: plan.currency,
      status: "PENDING",
      provider: "cashfree",
      providerRef: order.order_id,
      purpose: plan.purpose as PaymentPurpose,
      seatsPurchased: plan.seatsPurchased,
      planCode: plan.code,
      metadataJson: JSON.stringify({
        amountPaise: plan.amountPaise,
        taxPaise: plan.taxPaise,
        totalPaise: plan.totalPaise,
        durationMonths,
        cfOrderId: order.cf_order_id != null ? String(order.cf_order_id) : null,
        ...snapshot,
      }),
    },
  });

  return {
    paymentId: payment.id,
    orderId: order.order_id,
    paymentSessionId: order.payment_session_id,
    mode: cashfreeMode(),
    amountPaise: plan.totalPaise,
    currency: plan.currency,
    purpose: plan.purpose,
    plan,
  };
}

const FAILED_STATES = new Set(["FAILED", "USER_DROPPED", "CANCELLED", "VOID"]);

function pickPayment(payments: CashfreePayment[]) {
  return (
    payments.find((p) => p.payment_status === "SUCCESS") ??
    payments.find((p) => p.payment_status === "PENDING") ??
    payments[payments.length - 1] ??
    null
  );
}

/**
 * Called by the browser after checkout closes or Cashfree redirects back. Access is granted only from
 * Cashfree's own order/payment records, never from anything the browser reports.
 */
export async function verifyCashfreeOrder(userId: string, orderId: string) {
  const payment = await prisma.payment.findFirst({
    where: { userId, provider: "cashfree", providerRef: orderId },
  });
  if (!payment) throw new AppError("Order not found for this account", 404);
  if (payment.status === "SUCCEEDED") {
    return { paymentId: payment.id, alreadyProcessed: true as const, status: "SUCCEEDED" as const };
  }
  if (payment.status === "REFUNDED") throw new AppError("Payment was refunded", 409);

  const client = getCashfreeClient();
  const order = await client.getOrder(orderId);
  const attempt = pickPayment(await client.getOrderPayments(orderId));

  if (attempt?.payment_status === "SUCCESS") {
    if (toPaise(attempt.payment_amount) !== payment.amountCents) {
      throw new AppError("Payment amount mismatch", 400, { code: "AMOUNT_MISMATCH" });
    }
    const result = await activateVerifiedPayment(payment.id, String(attempt.cf_payment_id));
    return { ...result, paymentId: payment.id, status: "SUCCEEDED" as const };
  }

  if (attempt?.payment_status === "PENDING" || order.order_status === "PAID") {
    return {
      processing: true as const,
      code: "PAYMENT_PROCESSING",
      paymentId: payment.id,
      message:
        "Your payment is being confirmed by the bank. Access will start automatically once it completes.",
    };
  }

  const gatewayStatus = attempt?.payment_status ?? order.order_status;
  if (payment.status === "PENDING" && (attempt ? FAILED_STATES.has(attempt.payment_status) : order.order_status !== "ACTIVE")) {
    await prisma.payment.update({ where: { id: payment.id }, data: { status: "FAILED" } });
    await recordSubscriptionAudit({
      userId: payment.userId,
      paymentId: payment.id,
      provider: "cashfree",
      source: "cashfree_verify",
      eventType: "PAYMENT_FAILED",
      fromStatus: "PENDING",
      toStatus: "FAILED",
      details: { orderId, paymentId: attempt ? String(attempt.cf_payment_id) : null, gatewayStatus },
    });
  }
  throw new AppError("Payment was not completed. You have not been charged for access.", 402, {
    code: "PAYMENT_NOT_COMPLETED",
    gatewayStatus,
  });
}

type CashfreeWebhook = {
  type?: string;
  event_time?: string;
  data?: {
    order?: { order_id?: string; order_amount?: number };
    payment?: { cf_payment_id?: string | number; payment_status?: string; payment_amount?: number };
    refund?: {
      cf_refund_id?: string | number;
      refund_id?: string;
      cf_payment_id?: string | number;
      order_id?: string;
      refund_amount?: number;
      refund_status?: string;
    };
  };
};

export async function handleCashfreeWebhook(
  rawBody: string,
  signature: string | undefined,
  timestamp: string | undefined
) {
  verifyCashfreeWebhookSignature(rawBody, signature, timestamp);
  const payload = JSON.parse(rawBody) as CashfreeWebhook;
  const type = payload.type ?? "";

  if (type === "PAYMENT_SUCCESS_WEBHOOK") {
    const orderId = payload.data?.order?.order_id;
    const p = payload.data?.payment;
    if (!orderId || p?.cf_payment_id == null) return { ignored: true, reason: "missing payment" };
    if (p.payment_status && p.payment_status !== "SUCCESS") {
      return { ignored: true, reason: `status ${p.payment_status}` };
    }
    const payment = await prisma.payment.findFirst({
      where: { provider: "cashfree", providerRef: orderId },
    });
    if (!payment) return { ignored: true, reason: "unknown order" };
    if (toPaise(p.payment_amount ?? -1) !== payment.amountCents) {
      throw new AppError("Webhook amount mismatch", 400);
    }
    const cfPaymentId = String(p.cf_payment_id);
    return activateVerifiedPayment(payment.id, cfPaymentId, { eventId: `cf_pay_${cfPaymentId}` });
  }

  if (type === "PAYMENT_FAILED_WEBHOOK" || type === "PAYMENT_USER_DROPPED_WEBHOOK") {
    const orderId = payload.data?.order?.order_id;
    if (!orderId) return { ignored: true };
    const payment = await prisma.payment.findFirst({
      where: { provider: "cashfree", providerRef: orderId },
    });
    if (!payment) return { ignored: true, reason: "unknown order" };
    const updated = await prisma.payment.updateMany({
      where: { id: payment.id, status: "PENDING" },
      data: { status: "FAILED" },
    });
    await recordSubscriptionAudit({
      userId: payment.userId,
      paymentId: payment.id,
      provider: "cashfree",
      source: "cashfree_webhook",
      eventType: "PAYMENT_FAILED",
      fromStatus: payment.status,
      toStatus: updated.count ? "FAILED" : payment.status,
      details: {
        orderId,
        paymentId: payload.data?.payment?.cf_payment_id != null ? String(payload.data.payment.cf_payment_id) : null,
        type,
      },
    });
    return { failed: true };
  }

  if (type === "REFUND_STATUS_WEBHOOK") {
    const refund = payload.data?.refund;
    if (!refund?.order_id) return { ignored: true };
    if (refund.refund_status !== "SUCCESS") {
      return { ignored: true, reason: `refund ${refund.refund_status ?? "unknown"} does not change access` };
    }
    const refundId = String(refund.cf_refund_id ?? refund.refund_id ?? "");
    return applyGatewayRefund({
      provider: "cashfree",
      paymentWhere: { provider: "cashfree", providerRef: refund.order_id },
      refundAmount: typeof refund.refund_amount === "number" ? toPaise(refund.refund_amount) : undefined,
      refundId: refundId || null,
      eventId: `cf_refund_${refundId || refund.order_id}`,
    });
  }

  return { ignored: true, reason: `unhandled event ${type}` };
}
