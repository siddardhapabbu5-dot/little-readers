import { createHmac, timingSafeEqual } from "node:crypto";
import { AppError } from "../lib/errors.js";
import { cashfreeCheckoutFlagOn, cashfreeLiveAllowed } from "./flags.js";

/** Cashfree Payment Gateway (PG API 2023-08-01). Amounts are rupees on the wire, paise in our DB. */
export const CASHFREE_API_VERSION = "2023-08-01";

export type CashfreeMode = "sandbox" | "production";

export type CashfreeOrder = {
  cf_order_id?: string | number;
  order_id: string;
  order_amount: number;
  order_currency: string;
  order_status: string;
  payment_session_id?: string;
};

export type CashfreePayment = {
  cf_payment_id: string | number;
  order_id: string;
  payment_status: string;
  payment_amount: number;
  payment_currency?: string;
  payment_group?: string;
};

export interface CashfreeClient {
  createOrder(input: {
    orderId: string;
    amountPaise: number;
    currency: string;
    customer: { id: string; email: string; phone: string; name?: string };
    returnUrl?: string;
    notifyUrl?: string;
    note?: string;
    tags?: Record<string, string>;
  }): Promise<CashfreeOrder>;
  getOrder(orderId: string): Promise<CashfreeOrder>;
  getOrderPayments(orderId: string): Promise<CashfreePayment[]>;
}

function appId() {
  return process.env.CASHFREE_APP_ID || "";
}
function secretKey() {
  return process.env.CASHFREE_SECRET_KEY || "";
}

export function cashfreeMode(): CashfreeMode {
  return process.env.CASHFREE_ENV === "production" ? "production" : "sandbox";
}

/** Production mode stays blocked until the owner explicitly sets CASHFREE_LIVE_ENABLED=true. */
export function cashfreeLiveBlocked() {
  return cashfreeMode() === "production" && !cashfreeLiveAllowed();
}

function usingStub() {
  return process.env.CASHFREE_USE_STUB === "1";
}

/** Website Cashfree checkout: PAYMENT_ENABLED + CASHFREE_ENABLED + credentials, sandbox unless approved. */
export function cashfreeEnabled() {
  const configured = usingStub() || Boolean(appId() && secretKey());
  return Boolean(cashfreeCheckoutFlagOn() && configured && !cashfreeLiveBlocked());
}

export function toPaise(rupees: number) {
  return Math.round(Number(rupees) * 100);
}

function baseUrl() {
  return cashfreeMode() === "production"
    ? "https://api.cashfree.com/pg"
    : "https://sandbox.cashfree.com/pg";
}

async function call<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  if (!appId() || !secretKey()) throw new AppError("Cashfree is not configured", 503);
  const res = await fetch(`${baseUrl()}${path}`, {
    method: init.method ?? "GET",
    headers: {
      "x-client-id": appId(),
      "x-client-secret": secretKey(),
      "x-api-version": CASHFREE_API_VERSION,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
  const body = (await res.json().catch(() => ({}))) as T & { message?: string; code?: string };
  if (!res.ok) {
    throw new AppError(body.message ?? "Cashfree request failed", 502, {
      code: "CASHFREE_ERROR",
      gatewayCode: body.code ?? null,
    });
  }
  return body;
}

const liveClient: CashfreeClient = {
  async createOrder(input) {
    return call<CashfreeOrder>("/orders", {
      method: "POST",
      body: {
        order_id: input.orderId,
        order_amount: Number((input.amountPaise / 100).toFixed(2)),
        order_currency: input.currency,
        customer_details: {
          customer_id: input.customer.id,
          customer_email: input.customer.email,
          customer_phone: input.customer.phone,
          customer_name: input.customer.name,
        },
        order_meta: {
          ...(input.returnUrl ? { return_url: input.returnUrl } : {}),
          ...(input.notifyUrl ? { notify_url: input.notifyUrl } : {}),
        },
        order_note: input.note,
        order_tags: input.tags,
      },
    });
  },
  async getOrder(orderId) {
    return call<CashfreeOrder>(`/orders/${encodeURIComponent(orderId)}`);
  },
  async getOrderPayments(orderId) {
    return call<CashfreePayment[]>(`/orders/${encodeURIComponent(orderId)}/payments`);
  },
};

/** In-memory sandbox stand-in for local runs without Cashfree credentials (never in production). */
const stubOrders = new Map<string, CashfreeOrder>();
const stubPayments = new Map<string, CashfreePayment[]>();

export function resetCashfreeStub() {
  stubOrders.clear();
  stubPayments.clear();
}

export function stubCashfreePayment(orderId: string, status = "SUCCESS", amountPaise?: number) {
  const order = stubOrders.get(orderId);
  if (!order) throw new Error("unknown stub order");
  const payment: CashfreePayment = {
    cf_payment_id: `${Date.now()}${Math.floor(Math.random() * 1000)}`,
    order_id: orderId,
    payment_status: status,
    payment_amount: amountPaise === undefined ? order.order_amount : amountPaise / 100,
    payment_currency: order.order_currency,
  };
  stubPayments.set(orderId, [...(stubPayments.get(orderId) ?? []), payment]);
  if (status === "SUCCESS") order.order_status = "PAID";
  return payment;
}

const stubClient: CashfreeClient = {
  async createOrder(input) {
    const order: CashfreeOrder = {
      cf_order_id: `${Date.now()}`,
      order_id: input.orderId,
      order_amount: input.amountPaise / 100,
      order_currency: input.currency,
      order_status: "ACTIVE",
      payment_session_id: `session_stub_${input.orderId}`,
    };
    stubOrders.set(input.orderId, order);
    return { ...order };
  },
  async getOrder(orderId) {
    const o = stubOrders.get(orderId);
    if (!o) throw new AppError("Stub order not found", 404);
    return { ...o };
  },
  async getOrderPayments(orderId) {
    return [...(stubPayments.get(orderId) ?? [])];
  },
};

let override: CashfreeClient | null = null;

export function setCashfreeClientForTests(client: CashfreeClient | null) {
  override = client;
}

export function getCashfreeClient(): CashfreeClient {
  if (override) return override;
  if (cashfreeLiveBlocked()) {
    throw new AppError("Live Cashfree payments are not approved yet — use the sandbox", 503, {
      code: "LIVE_KEYS_BLOCKED",
    });
  }
  if (usingStub()) {
    if (process.env.NODE_ENV === "production") {
      throw new AppError("Payment stub is not allowed in production", 503, { code: "STUB_NOT_ALLOWED" });
    }
    return stubClient;
  }
  return liveClient;
}

function webhookSecret() {
  return secretKey() || (usingStub() ? "cashfree_stub_secret" : "");
}

/** Cashfree signs webhooks as base64(HMAC-SHA256(timestamp + rawBody, secret key)). */
export function verifyCashfreeWebhookSignature(
  rawBody: string,
  signature: string | undefined,
  timestamp: string | undefined
) {
  const secret = webhookSecret();
  if (!secret) throw new AppError("Cashfree is not configured", 503);
  if (!signature || !timestamp) throw new AppError("Missing webhook signature", 400);
  const expected = createHmac("sha256", secret).update(timestamp + rawBody).digest("base64");
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    throw new AppError("Invalid webhook signature", 400, { code: "INVALID_WEBHOOK_SIGNATURE" });
  }
}

export function signCashfreeWebhook(rawBody: string, timestamp: string) {
  return createHmac("sha256", webhookSecret()).update(timestamp + rawBody).digest("base64");
}
