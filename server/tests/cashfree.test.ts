import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { prisma } from "../src/lib/prisma.js";
import {
  resetCashfreeStub,
  signCashfreeWebhook,
  stubCashfreePayment,
} from "../src/payments/cashfree.js";
import { resetRazorpayStub, signCheckout, stubMarkOrderPaid } from "../src/payments/razorpay.js";

const app = createApp();
const hasDb = Boolean(process.env.DATABASE_URL);
const stamp = Date.now();
const PHONE = "9876543210";

type Parent = { token: string; id: string; email: string; childId: string };

async function registerParent(tag: string): Promise<Parent> {
  const email = `cashfree_${tag}_${stamp}@test.local`;
  const reg = await request(app).post("/api/auth/register").send({
    name: `Cashfree ${tag}`,
    email,
    password: "ParentDemo1",
    acceptTerms: true,
    acceptPrivacy: true,
    parentalConsent: true,
  });
  expect(reg.status).toBe(201);
  const token = reg.body.data.tokens.accessToken as string;
  const status = await request(app).get("/api/agreements").set("Authorization", `Bearer ${token}`);
  await request(app)
    .post("/api/agreements/accept")
    .set("Authorization", `Bearer ${token}`)
    .send({
      versionIds: status.body.data.documents.map((d: { current: { id: string } }) => d.current.id),
    });
  const child = await request(app)
    .post("/api/children")
    .set("Authorization", `Bearer ${token}`)
    .send({ displayName: `CF ${tag}`, birthDate: "10/02/2023", level: "LEVEL_1" });
  expect(child.status).toBe(201);
  return { token, id: reg.body.data.user.id as string, email, childId: child.body.data.id as string };
}

/** The purchased child's grade access (grade-wise purchases never touch the family subscription). */
async function childAccess(p: Parent) {
  const res = await request(app).get("/api/subscriptions/children").set("Authorization", `Bearer ${p.token}`);
  expect(res.status).toBe(200);
  const row = (res.body.data as Array<{
    childId: string;
    entitled: boolean;
    via: string | null;
    expiresAt: string | null;
    gradeSubscriptions: Array<{ provider: string }>;
  }>).find((c) => c.childId === p.childId)!;
  return row;
}

function webhook(body: object, opts: { badSignature?: boolean } = {}) {
  const raw = JSON.stringify(body);
  const ts = String(Date.now());
  const sig = opts.badSignature ? "AAAA" + signCashfreeWebhook(raw, ts).slice(4) : signCashfreeWebhook(raw, ts);
  return request(app)
    .post("/api/payments/cashfree/webhook")
    .set("Content-Type", "application/json")
    .set("x-webhook-timestamp", ts)
    .set("x-webhook-signature", sig)
    .send(raw);
}

function successEvent(orderId: string, cfPaymentId: string, rupees: number) {
  return {
    type: "PAYMENT_SUCCESS_WEBHOOK",
    event_time: new Date().toISOString(),
    data: {
      order: { order_id: orderId, order_amount: rupees },
      payment: { cf_payment_id: cfPaymentId, payment_status: "SUCCESS", payment_amount: rupees },
    },
  };
}

describe.skipIf(!hasDb)("Cashfree website checkout", () => {
  let adminToken = "";
  let planId = "";

  beforeAll(async () => {
    process.env.JWT_SECRET = process.env.JWT_SECRET ?? "dev_only_change_me_to_a_long_random_secret_value";
    process.env.PAYMENT_ENABLED = "true";
    process.env.CASHFREE_ENABLED = "true";
    process.env.CASHFREE_USE_STUB = "1";
    delete process.env.CASHFREE_ENV;
    delete process.env.CASHFREE_LIVE_ENABLED;
    delete process.env.CASHFREE_APP_ID;
    delete process.env.CASHFREE_SECRET_KEY;
    process.env.RAZORPAY_ENABLED = "true";
    process.env.RAZORPAY_USE_STUB = "1";
    process.env.RAZORPAY_KEY_ID = "rzp_test_stub";
    process.env.RAZORPAY_KEY_SECRET = "stub_secret_for_hmac_tests_only";
    process.env.RAZORPAY_WEBHOOK_SECRET = "whsec_stub_tests";
    process.env.TAX_RATE_BPS = "0";

    const admin = await request(app).post("/api/auth/login").send({
      email: "admin@littlereaders.test",
      password: "AdminDemo1",
    });
    expect(admin.status).toBe(200);
    adminToken = admin.body.data.tokens.accessToken;

    const plan = await request(app)
      .post("/api/admin/academic/subscription-plans")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ name: "Cashfree Yearly", code: `CF_Y_${stamp}`, durationMonths: 12, amountPaise: 79900, includedSeats: 2, isPublished: true });
    expect(plan.status).toBe(201);
    planId = plan.body.data.id;
  });

  afterAll(async () => {
    if (planId) await prisma.subscriptionPlan.update({ where: { id: planId }, data: { isActive: false, isPublished: false } });
    process.env.CASHFREE_ENABLED = "false";
    delete process.env.CASHFREE_USE_STUB;
  });

  beforeEach(() => {
    resetCashfreeStub();
    resetRazorpayStub();
    process.env.CASHFREE_ENABLED = "true";
    process.env.RAZORPAY_ENABLED = "true";
    delete process.env.CASHFREE_ENV;
    delete process.env.CASHFREE_LIVE_ENABLED;
  });

  async function order(p: Parent, body: Record<string, unknown> = { planId, phone: PHONE }) {
    return request(app)
      .post("/api/payments/cashfree/orders")
      .set("Authorization", `Bearer ${p.token}`)
      .send({ childId: p.childId, ...body });
  }

  it("stays closed when the flag is off or production mode is not approved", async () => {
    const p = await registerParent("flags");
    process.env.CASHFREE_ENABLED = "false";
    let plans = await request(app).get("/api/payments/plans").set("Authorization", `Bearer ${p.token}`);
    expect(plans.body.data.gateways.cashfree).toBe(false);
    expect((await order(p)).status).toBe(503);

    process.env.CASHFREE_ENABLED = "true";
    process.env.CASHFREE_ENV = "production";
    plans = await request(app).get("/api/payments/plans").set("Authorization", `Bearer ${p.token}`);
    expect(plans.body.data.gateways.cashfree).toBe(false);
    expect((await order(p)).status).toBe(503);

    delete process.env.CASHFREE_ENV;
    plans = await request(app).get("/api/payments/plans").set("Authorization", `Bearer ${p.token}`);
    expect(plans.body.data.gateways).toEqual({ razorpay: true, cashfree: true });
    expect(plans.body.data.cashfreeMode).toBe("sandbox");
    expect(await prisma.payment.count({ where: { userId: p.id } })).toBe(0);
  });

  it("refuses Cashfree in the iOS app, allows Android, and asks for a phone when none is on file", async () => {
    const p = await registerParent("native");
    const res = await request(app)
      .post("/api/payments/cashfree/orders")
      .set("Authorization", `Bearer ${p.token}`)
      .set("X-Client-Platform", "ios")
      .send({ planId, childId: p.childId, phone: PHONE });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe("USE_STORE_BILLING");
    const android = await request(app)
      .post("/api/payments/cashfree/orders")
      .set("Authorization", `Bearer ${p.token}`)
      .set("X-Client-Platform", "android")
      .send({ planId, childId: p.childId, phone: PHONE, returnTo: "sdk" });
    expect(android.status).toBe(201);
    expect(android.body.data.paymentSessionId).toBeTruthy();
    const noPhone = await order(p, { planId });
    expect(noPhone.status).toBe(400);
    expect(noPhone.body.code).toBe("PHONE_REQUIRED");
    expect((await order(p, { planId, phone: "12345" })).status).toBe(400);
  });

  it("activates only after Cashfree confirms the payment, and is idempotent", async () => {
    const p = await registerParent("verify");
    const res = await order(p);
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ mode: "sandbox", amountPaise: 79900 });
    expect(res.body.data.paymentSessionId).toBeTruthy();
    expect(JSON.stringify(res.body)).not.toMatch(/secret|x-client/i);
    const orderId = res.body.data.orderId as string;

    const early = await request(app).post("/api/payments/cashfree/verify").set("Authorization", `Bearer ${p.token}`).send({ orderId });
    expect(early.status).toBe(402);
    expect(early.body.code).toBe("PAYMENT_NOT_COMPLETED");
    expect((await childAccess(p)).entitled).toBe(false);

    stubCashfreePayment(orderId, "PENDING");
    const pending = await request(app).post("/api/payments/cashfree/verify").set("Authorization", `Bearer ${p.token}`).send({ orderId });
    expect(pending.status).toBe(200);
    expect(pending.body.data).toMatchObject({ processing: true, code: "PAYMENT_PROCESSING" });

    stubCashfreePayment(orderId, "SUCCESS");
    const ok = await request(app).post("/api/payments/cashfree/verify").set("Authorization", `Bearer ${p.token}`).send({ orderId });
    expect(ok.status).toBe(200);
    expect(ok.body.data.status).toBe("SUCCEEDED");
    let access = await childAccess(p);
    expect(access).toMatchObject({ entitled: true, via: "GRADE" });
    expect(access.gradeSubscriptions[0].provider).toBe("cashfree");
    const expiry = access.expiresAt;

    const again = await request(app).post("/api/payments/cashfree/verify").set("Authorization", `Bearer ${p.token}`).send({ orderId });
    expect(again.body.data.alreadyProcessed).toBe(true);
    access = await childAccess(p);
    expect(access.expiresAt).toBe(expiry);

    const row = await prisma.payment.findFirstOrThrow({ where: { provider: "cashfree", providerRef: orderId } });
    const receipt = await request(app).get(`/api/payments/${row.id}/receipt`).set("Authorization", `Bearer ${p.token}`);
    expect(receipt.status).toBe(200);
    expect(receipt.body.data).toMatchObject({ provider: "cashfree", gatewayOrderId: orderId, totalPaise: 79900 });
    expect(receipt.body.data.gatewayPaymentId).toBeTruthy();

    const other = await registerParent("peek");
    const peek = await request(app).post("/api/payments/cashfree/verify").set("Authorization", `Bearer ${other.token}`).send({ orderId });
    expect(peek.status).toBe(404);
  });

  it("does not activate when Cashfree reports less money than the order", async () => {
    const p = await registerParent("short");
    const orderId = (await order(p)).body.data.orderId as string;
    stubCashfreePayment(orderId, "SUCCESS", 100);
    const res = await request(app).post("/api/payments/cashfree/verify").set("Authorization", `Bearer ${p.token}`).send({ orderId });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("AMOUNT_MISMATCH");
    expect((await childAccess(p)).entitled).toBe(false);
  });

  it("accepts only signed webhooks, ignores duplicates and rejects amount mismatches", async () => {
    const p = await registerParent("hook");
    const orderId = (await order(p)).body.data.orderId as string;
    const cfPay = `55${stamp}`;

    expect((await webhook(successEvent(orderId, cfPay, 799), { badSignature: true })).status).toBe(400);
    const unsigned = await request(app).post("/api/payments/cashfree/webhook").send(successEvent(orderId, cfPay, 799));
    expect(unsigned.status).toBe(400);
    expect((await webhook(successEvent(orderId, cfPay, 1))).status).toBe(400);
    expect((await childAccess(p)).entitled).toBe(false);

    expect((await webhook(successEvent(orderId, cfPay, 799))).status).toBe(200);
    let access = await childAccess(p);
    expect(access.entitled).toBe(true);
    const expiry = access.expiresAt;
    const dup = await webhook(successEvent(orderId, cfPay, 799));
    expect(dup.status).toBe(200);
    expect(dup.body.data.alreadyProcessed).toBe(true);
    access = await childAccess(p);
    expect(access.expiresAt).toBe(expiry);
    expect(await prisma.payment.count({ where: { userId: p.id, status: "SUCCEEDED" } })).toBe(1);
  });

  it("marks failed / dropped payments without granting access", async () => {
    const p = await registerParent("fail");
    const orderId = (await order(p)).body.data.orderId as string;
    const res = await webhook({
      type: "PAYMENT_FAILED_WEBHOOK",
      data: { order: { order_id: orderId }, payment: { cf_payment_id: "1", payment_status: "FAILED" } },
    });
    expect(res.status).toBe(200);
    expect((await prisma.payment.findFirstOrThrow({ where: { providerRef: orderId } })).status).toBe("FAILED");
    expect((await childAccess(p)).entitled).toBe(false);
  });

  it("a full Cashfree refund removes the paid period; partial refunds keep access", async () => {
    const p = await registerParent("refund");
    const orderId = (await order(p)).body.data.orderId as string;
    expect((await webhook(successEvent(orderId, `66${stamp}`, 799))).status).toBe(200);

    const refund = (id: string, rupees: number, status = "SUCCESS") => ({
      type: "REFUND_STATUS_WEBHOOK",
      data: { refund: { cf_refund_id: id, order_id: orderId, refund_amount: rupees, refund_status: status } },
    });
    expect((await webhook(refund(`r_pending_${stamp}`, 799, "PENDING"))).body.data.ignored).toBe(true);
    const partial = await webhook(refund(`r_part_${stamp}`, 10));
    expect(partial.body.data.partial).toBe(true);
    expect((await childAccess(p)).entitled).toBe(true);

    const full = await webhook(refund(`r_full_${stamp}`, 789));
    expect(full.status).toBe(200);
    expect(full.body.data).toMatchObject({ refunded: true, accessRevoked: true });
    expect((await childAccess(p)).entitled).toBe(false);
    expect((await prisma.payment.findFirstOrThrow({ where: { providerRef: orderId } })).status).toBe("REFUNDED");

    const history = await request(app).get(`/api/subscriptions/admin/${p.id}/history`).set("Authorization", `Bearer ${adminToken}`);
    const events = history.body.data.events as { eventType: string; provider: string }[];
    expect(events.filter((e) => e.provider === "cashfree").map((e) => e.eventType)).toEqual(
      expect.arrayContaining(["PAYMENT_CAPTURED", "PARTIAL_REFUND", "REFUND_PROCESSED"])
    );
  });

  it("a Cashfree purchase extends an active Razorpay plan instead of replacing it", async () => {
    const p = await registerParent("stack");
    const rzp = await request(app)
      .post("/api/payments/orders")
      .set("Authorization", `Bearer ${p.token}`)
      .send({ planId, childId: p.childId });
    const rzpOrder = rzp.body.data.orderId as string;
    const paid = stubMarkOrderPaid(rzpOrder, `pay_cfstack_${stamp}`);
    await request(app)
      .post("/api/payments/verify")
      .set("Authorization", `Bearer ${p.token}`)
      .send({ orderId: rzpOrder, paymentId: paid.id, signature: signCheckout(rzpOrder, paid.id) });
    const first = new Date((await childAccess(p)).expiresAt!).getTime();

    const orderId = (await order(p)).body.data.orderId as string;
    expect((await webhook(successEvent(orderId, `77${stamp}`, 799))).status).toBe(200);
    const second = new Date((await childAccess(p)).expiresAt!).getTime();
    expect(second - first).toBeGreaterThan(360 * 86_400_000);
    expect(await prisma.subscription.count({ where: { userId: p.id } })).toBe(1);
  });
});
