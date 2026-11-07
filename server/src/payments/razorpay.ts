import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "../config/env.js";
import { AppError } from "../lib/errors.js";

export type RazorpayOrder = {
  id: string;
  amount: number;
  currency: string;
  status: string;
  receipt?: string;
};

export type RazorpayPayment = {
  id: string;
  order_id: string;
  amount: number;
  currency: string;
  status: string;
};

export interface RazorpayClient {
  createOrder(input: {
    amountPaise: number;
    currency: string;
    receipt: string;
    notes?: Record<string, string>;
  }): Promise<RazorpayOrder>;
  fetchPayment(paymentId: string): Promise<RazorpayPayment>;
}

/** In-memory stub for tests when PAYMENT_ENABLED uses stub mode. */
const stubOrders = new Map<string, RazorpayOrder & { paid?: boolean }>();
const stubPayments = new Map<string, RazorpayPayment>();

export function resetRazorpayStub() {
  stubOrders.clear();
  stubPayments.clear();
}

export function stubMarkOrderPaid(orderId: string, paymentId = `pay_stub_${orderId}`) {
  const order = stubOrders.get(orderId);
  if (!order) throw new Error("unknown stub order");
  order.paid = true;
  const payment: RazorpayPayment = {
    id: paymentId,
    order_id: orderId,
    amount: order.amount,
    currency: order.currency,
    status: "captured",
  };
  stubPayments.set(paymentId, payment);
  return payment;
}

function keyId() {
  return process.env.RAZORPAY_KEY_ID || env.RAZORPAY_KEY_ID;
}
function keySecret() {
  return process.env.RAZORPAY_KEY_SECRET || env.RAZORPAY_KEY_SECRET;
}
function webhookSecret() {
  return process.env.RAZORPAY_WEBHOOK_SECRET || env.RAZORPAY_WEBHOOK_SECRET;
}

/** Live keys stay blocked until the owner explicitly sets RAZORPAY_ALLOW_LIVE=true. */
export function liveKeyBlocked() {
  const id = keyId() ?? "";
  return id.startsWith("rzp_live_") && process.env.RAZORPAY_ALLOW_LIVE !== "true";
}

function assertKeyModeAllowed() {
  if (liveKeyBlocked()) {
    throw new AppError(
      "Live Razorpay keys are not allowed yet — use rzp_test_ keys",
      503,
      { code: "LIVE_KEYS_BLOCKED" }
    );
  }
}

function authHeader() {
  const id = keyId();
  const secret = keySecret();
  if (!id || !secret) throw new AppError("Razorpay is not configured", 503);
  return `Basic ${Buffer.from(`${id}:${secret}`).toString("base64")}`;
}

const liveClient: RazorpayClient = {
  async createOrder(input) {
    const res = await fetch("https://api.razorpay.com/v1/orders", {
      method: "POST",
      headers: {
        Authorization: authHeader(),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        amount: input.amountPaise,
        currency: input.currency,
        receipt: input.receipt.slice(0, 40),
        notes: input.notes ?? {},
        payment_capture: 1,
      }),
    });
    const body = (await res.json()) as RazorpayOrder & { error?: { description?: string } };
    if (!res.ok) {
      throw new AppError(
        body.error?.description ?? "Failed to create Razorpay order",
        502
      );
    }
    return body;
  },
  async fetchPayment(paymentId) {
    const res = await fetch(`https://api.razorpay.com/v1/payments/${paymentId}`, {
      headers: { Authorization: authHeader() },
    });
    const body = (await res.json()) as RazorpayPayment & {
      error?: { description?: string };
    };
    if (!res.ok) {
      throw new AppError(
        body.error?.description ?? "Failed to fetch Razorpay payment",
        502
      );
    }
    return body;
  },
};

const stubClient: RazorpayClient = {
  async createOrder(input) {
    const id = `order_stub_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const order: RazorpayOrder = {
      id,
      amount: input.amountPaise,
      currency: input.currency,
      status: "created",
      receipt: input.receipt,
    };
    stubOrders.set(id, order);
    return order;
  },
  async fetchPayment(paymentId) {
    const p = stubPayments.get(paymentId);
    if (!p) throw new AppError("Stub payment not found", 404);
    return p;
  },
};

let override: RazorpayClient | null = null;

export function setRazorpayClientForTests(client: RazorpayClient | null) {
  override = client;
}

export function getRazorpayClient(): RazorpayClient {
  if (override) return override;
  assertKeyModeAllowed();
  if (keyId() === "rzp_test_stub" || process.env.RAZORPAY_USE_STUB === "1") {
    return stubClient;
  }
  return liveClient;
}

export function verifyCheckoutSignature(input: {
  orderId: string;
  paymentId: string;
  signature: string;
}) {
  const secret = keySecret();
  if (!secret) throw new AppError("Razorpay is not configured", 503);
  const expected = createHmac("sha256", secret)
    .update(`${input.orderId}|${input.paymentId}`)
    .digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(input.signature);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    throw new AppError("Invalid payment signature", 400, { code: "INVALID_SIGNATURE" });
  }
}

export function verifyWebhookSignature(rawBody: string, signatureHeader: string | undefined) {
  const secret = webhookSecret();
  if (!secret) throw new AppError("Webhook secret not configured", 503);
  if (!signatureHeader) throw new AppError("Missing webhook signature", 400);
  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(signatureHeader);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    throw new AppError("Invalid webhook signature", 400, { code: "INVALID_WEBHOOK_SIGNATURE" });
  }
}

/** Test helper: sign checkout payload with current secret. */
export function signCheckout(orderId: string, paymentId: string) {
  const secret = keySecret() ?? "test_secret";
  return createHmac("sha256", secret).update(`${orderId}|${paymentId}`).digest("hex");
}

export function signWebhook(rawBody: string) {
  const secret = webhookSecret() ?? "whsec_test";
  return createHmac("sha256", secret).update(rawBody).digest("hex");
}
