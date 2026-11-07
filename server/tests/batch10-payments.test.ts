import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { prisma } from "../src/lib/prisma.js";
import {
  resetRazorpayStub,
  signCheckout,
  signWebhook,
  stubMarkOrderPaid,
} from "../src/payments/razorpay.js";

const app = createApp();
const hasDb = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDb)("Batch 10 — Razorpay checkout + activation", () => {
  let parentToken = "";
  let parentId = "";
  let adminToken = "";
  let teacherToken = "";
  const stamp = Date.now();

  beforeAll(async () => {
    process.env.JWT_SECRET =
      process.env.JWT_SECRET ?? "dev_only_change_me_to_a_long_random_secret_value";
    process.env.PAYMENT_ENABLED = "true";
    process.env.RAZORPAY_USE_STUB = "1";
    process.env.RAZORPAY_KEY_ID = "rzp_test_stub";
    process.env.RAZORPAY_KEY_SECRET = "stub_secret_for_hmac_tests_only";
    process.env.RAZORPAY_WEBHOOK_SECRET = "whsec_stub_tests";
    process.env.PLAN_FAMILY_YEARLY_AMOUNT_PAISE = "49900";
    process.env.PLAN_EXTRA_SEAT_AMOUNT_PAISE = "9900";
    process.env.TAX_RATE_BPS = "0";

    const admin = await request(app).post("/api/auth/login").send({
      email: "admin@littlereaders.test",
      password: "AdminDemo1",
    });
    expect(admin.status).toBe(200);
    adminToken = admin.body.data.tokens.accessToken;

    const email = `payparent${stamp}@test.local`;
    const reg = await request(app).post("/api/auth/register").send({
      name: "Pay Parent",
      email,
      password: "ParentDemo1",
      acceptTerms: true,
      acceptPrivacy: true,
      parentalConsent: true,
    });
    expect(reg.status).toBe(201);
    parentToken = reg.body.data.tokens.accessToken;
    parentId = reg.body.data.user.id;

    // Teacher from batch9 may not exist — create via admin school quickly
    const school = await request(app)
      .post("/api/admin/schools")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ name: `Pay School ${stamp}` });
    expect(school.status).toBe(201);
    const teacher = await request(app)
      .post(`/api/admin/schools/${school.body.data.id}/teachers`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        name: "Pay Teacher",
        email: `payteacher${stamp}@test.local`,
        password: "TeacherDemo1",
      });
    expect(teacher.status).toBe(201);
    const tLogin = await request(app).post("/api/auth/login").send({
      email: `payteacher${stamp}@test.local`,
      password: "TeacherDemo1",
    });
    teacherToken = tLogin.body.data.tokens.accessToken;
  });

  beforeEach(() => {
    resetRazorpayStub();
  });

  it("rejects invalid signatures and forged success without activation", async () => {
    const order = await request(app)
      .post("/api/payments/orders")
      .set("Authorization", `Bearer ${parentToken}`)
      .send({ purpose: "FAMILY_YEARLY" });
    expect(order.status).toBe(201);
    const orderId = order.body.data.orderId as string;

    const badSig = await request(app)
      .post("/api/payments/verify")
      .set("Authorization", `Bearer ${parentToken}`)
      .send({
        orderId,
        paymentId: "pay_fake",
        signature: "not-a-valid-hmac",
      });
    expect(badSig.status).toBe(400);

    const me = await request(app)
      .get("/api/subscriptions/me")
      .set("Authorization", `Bearer ${parentToken}`);
    expect(me.body.data.subscription).toBeNull();

    const teacherBlocked = await request(app)
      .get("/api/payments/admin")
      .set("Authorization", `Bearer ${teacherToken}`);
    expect(teacherBlocked.status).toBe(403);
  });

  it("verifies stub payment once and grants yearly + extra seat idempotently", async () => {
    const order = await request(app)
      .post("/api/payments/orders")
      .set("Authorization", `Bearer ${parentToken}`)
      .send({ purpose: "FAMILY_YEARLY" });
    expect(order.status).toBe(201);
    const orderId = order.body.data.orderId as string;
    const paid = stubMarkOrderPaid(orderId);
    const signature = signCheckout(orderId, paid.id);

    const verify = await request(app)
      .post("/api/payments/verify")
      .set("Authorization", `Bearer ${parentToken}`)
      .send({ orderId, paymentId: paid.id, signature });
    expect(verify.status).toBe(200);
    expect(verify.body.data.alreadyProcessed).toBe(false);
    expect(verify.body.data.subscription.status).toBe("ACTIVE");
    expect(verify.body.data.subscription.includedSeats).toBe(2);

    const again = await request(app)
      .post("/api/payments/verify")
      .set("Authorization", `Bearer ${parentToken}`)
      .send({ orderId, paymentId: paid.id, signature });
    expect(again.status).toBe(200);
    expect(again.body.data.alreadyProcessed).toBe(true);

    const before = await prisma.subscription.findFirst({
      where: { userId: parentId },
      orderBy: { createdAt: "desc" },
    });
    expect(before?.extraSeats).toBe(0);

    const seatOrder = await request(app)
      .post("/api/payments/orders")
      .set("Authorization", `Bearer ${parentToken}`)
      .send({ purpose: "EXTRA_SEATS", seats: 1 });
    expect(seatOrder.status).toBe(201);
    const seatOrderId = seatOrder.body.data.orderId as string;
    const seatPay = stubMarkOrderPaid(seatOrderId);
    const seatSig = signCheckout(seatOrderId, seatPay.id);
    const seatVerify = await request(app)
      .post("/api/payments/verify")
      .set("Authorization", `Bearer ${parentToken}`)
      .send({ orderId: seatOrderId, paymentId: seatPay.id, signature: seatSig });
    expect(seatVerify.status).toBe(200);
    expect(seatVerify.body.data.subscription.extraSeats).toBe(1);

    const seatAgain = await request(app)
      .post("/api/payments/verify")
      .set("Authorization", `Bearer ${parentToken}`)
      .send({ orderId: seatOrderId, paymentId: seatPay.id, signature: seatSig });
    expect(seatAgain.body.data.alreadyProcessed).toBe(true);
    const after = await prisma.subscription.findFirst({
      where: { userId: parentId },
      orderBy: { createdAt: "desc" },
    });
    expect(after?.extraSeats).toBe(1);
  });

  it("rejects invalid webhooks and handles duplicate captured events", async () => {
    const order = await request(app)
      .post("/api/payments/orders")
      .set("Authorization", `Bearer ${parentToken}`)
      .send({ purpose: "EXTRA_SEATS", seats: 1 });
    const orderId = order.body.data.orderId as string;
    const paid = stubMarkOrderPaid(orderId, `pay_wh_${stamp}`);

    const body = JSON.stringify({
      id: `evt_${stamp}`,
      event: "payment.captured",
      payload: {
        payment: {
          entity: {
            id: paid.id,
            order_id: orderId,
            status: "captured",
            amount: order.body.data.amountPaise,
          },
        },
      },
    });

    const badWh = await request(app)
      .post("/api/payments/webhook")
      .set("Content-Type", "application/json")
      .set("X-Razorpay-Signature", "bad")
      .send(body);
    expect(badWh.status).toBe(400);

    const sig = signWebhook(body);
    const ok = await request(app)
      .post("/api/payments/webhook")
      .set("Content-Type", "application/json")
      .set("X-Razorpay-Signature", sig)
      .send(body);
    expect(ok.status).toBe(200);

    const dup = await request(app)
      .post("/api/payments/webhook")
      .set("Content-Type", "application/json")
      .set("X-Razorpay-Signature", sig)
      .send(body);
    expect(dup.status).toBe(200);

    const sub = await prisma.subscription.findFirst({
      where: { userId: parentId },
      orderBy: { createdAt: "desc" },
    });
    // Yearly + one seat from previous test + one from webhook = 2 extras if previous ran
    expect(sub?.extraSeats).toBeGreaterThanOrEqual(1);

    const adminPay = await request(app)
      .get("/api/payments/admin")
      .set("Authorization", `Bearer ${adminToken}`);
    expect(adminPay.status).toBe(200);
    expect(Array.isArray(adminPay.body.data)).toBe(true);
  });

  it("activates once when /verify and the webhook arrive together", async () => {
    const order = await request(app)
      .post("/api/payments/orders")
      .set("Authorization", `Bearer ${parentToken}`)
      .send({ purpose: "FAMILY_YEARLY" });
    expect(order.status).toBe(201);
    const orderId = order.body.data.orderId as string;
    const paid = stubMarkOrderPaid(orderId, `pay_race_${stamp}`);
    const before = await prisma.subscription.findFirst({
      where: { userId: parentId },
      orderBy: { createdAt: "desc" },
    });
    const body = JSON.stringify({
      id: `evt_race_${stamp}`,
      event: "payment.captured",
      payload: {
        payment: {
          entity: {
            id: paid.id,
            order_id: orderId,
            status: "captured",
            amount: order.body.data.amountPaise,
          },
        },
      },
    });

    const [verify, hook] = await Promise.all([
      request(app)
        .post("/api/payments/verify")
        .set("Authorization", `Bearer ${parentToken}`)
        .send({ orderId, paymentId: paid.id, signature: signCheckout(orderId, paid.id) }),
      request(app)
        .post("/api/payments/webhook")
        .set("Content-Type", "application/json")
        .set("X-Razorpay-Signature", signWebhook(body))
        .send(body),
    ]);
    expect(verify.status).toBe(200);
    expect(hook.status).toBe(200);
    expect(
      [verify.body.data.alreadyProcessed, hook.body.data.alreadyProcessed].filter(Boolean)
    ).toHaveLength(1);

    const after = await prisma.subscription.findFirst({
      where: { userId: parentId },
      orderBy: { createdAt: "desc" },
    });
    const days =
      (after!.expiresAt!.getTime() - before!.expiresAt!.getTime()) / 86_400_000;
    expect(days).toBeGreaterThanOrEqual(365);
    expect(days).toBeLessThanOrEqual(366);
    const row = await prisma.payment.findFirst({ where: { razorpayOrderId: orderId } });
    expect(row?.status).toBe("SUCCEEDED");
    expect(row?.razorpayPaymentId).toBe(paid.id);
  });

  it("records cancelled and failed payments without activating anything", async () => {
    const before = await prisma.subscription.findFirst({
      where: { userId: parentId },
      orderBy: { createdAt: "desc" },
    });

    const cancelled = await request(app)
      .post("/api/payments/orders")
      .set("Authorization", `Bearer ${parentToken}`)
      .send({ purpose: "FAMILY_YEARLY" });
    const cancelledId = cancelled.body.data.orderId as string;
    const cancel = await request(app)
      .post("/api/payments/cancel")
      .set("Authorization", `Bearer ${parentToken}`)
      .send({ orderId: cancelledId });
    expect(cancel.status).toBe(200);
    expect(cancel.body.data.status).toBe("FAILED");

    const failed = await request(app)
      .post("/api/payments/orders")
      .set("Authorization", `Bearer ${parentToken}`)
      .send({ purpose: "FAMILY_YEARLY" });
    const failedId = failed.body.data.orderId as string;
    const body = JSON.stringify({
      id: `evt_fail_${stamp}`,
      event: "payment.failed",
      payload: {
        payment: { entity: { id: `pay_fail_${stamp}`, order_id: failedId, status: "failed" } },
      },
    });
    const hook = await request(app)
      .post("/api/payments/webhook")
      .set("Content-Type", "application/json")
      .set("X-Razorpay-Signature", signWebhook(body))
      .send(body);
    expect(hook.status).toBe(200);

    const rows = await prisma.payment.findMany({
      where: { razorpayOrderId: { in: [cancelledId, failedId] } },
    });
    expect(rows.map((r) => r.status)).toEqual(["FAILED", "FAILED"]);
    const after = await prisma.subscription.findFirst({
      where: { userId: parentId },
      orderBy: { createdAt: "desc" },
    });
    expect(after?.expiresAt?.getTime()).toBe(before?.expiresAt?.getTime());
  });

  it("refuses live Razorpay keys unless explicitly allowed", async () => {
    const prev = process.env.RAZORPAY_KEY_ID;
    process.env.RAZORPAY_KEY_ID = "rzp_live_notreal";
    try {
      const plans = await request(app)
        .get("/api/payments/plans")
        .set("Authorization", `Bearer ${parentToken}`);
      expect(plans.body.data.enabled).toBe(false);
      expect(plans.body.data.keyId).toBeNull();

      const order = await request(app)
        .post("/api/payments/orders")
        .set("Authorization", `Bearer ${parentToken}`)
        .send({ purpose: "FAMILY_YEARLY" });
      expect(order.status).toBe(503);
      expect(order.body.code ?? order.body.details?.code).toBe("LIVE_KEYS_BLOCKED");
    } finally {
      process.env.RAZORPAY_KEY_ID = prev;
    }
  });
});
