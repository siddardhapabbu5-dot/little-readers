import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { prisma } from "../src/lib/prisma.js";
import { setGooglePlayApiForTests, type PlaySubscriptionV2 } from "../src/payments/google-play.js";
import { resetRazorpayStub, signCheckout, stubMarkOrderPaid } from "../src/payments/razorpay.js";

const app = createApp();
const stamp = Date.now();

type Access = { childId: string; entitled: boolean; via: string | null; level: { code: string } };

async function registerParent(tag: string) {
  const reg = await request(app).post("/api/auth/register").send({
    name: `GradeBuy ${tag}`,
    email: `gradebuy_${tag}_${stamp}@test.local`,
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
    .send({ versionIds: status.body.data.documents.map((d: { current: { id: string } }) => d.current.id) });
  return { token, id: reg.body.data.user.id as string };
}

async function addChild(token: string, name: string, level: string) {
  const res = await request(app)
    .post("/api/children")
    .set("Authorization", `Bearer ${token}`)
    .send({ displayName: name, birthDate: "10/02/2020", level });
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  return res.body.data.id as string;
}

async function access(token: string) {
  const res = await request(app).get("/api/subscriptions/children").set("Authorization", `Bearer ${token}`);
  expect(res.status).toBe(200);
  return Object.fromEntries((res.body.data as Access[]).map((a) => [a.childId, a]));
}

async function buy(token: string, body: Record<string, unknown>) {
  const order = await request(app).post("/api/payments/orders").set("Authorization", `Bearer ${token}`).send(body);
  if (order.status !== 201) return order;
  const orderId = order.body.data.orderId as string;
  const paid = stubMarkOrderPaid(orderId);
  return request(app)
    .post("/api/payments/verify")
    .set("Authorization", `Bearer ${token}`)
    .send({ orderId, paymentId: paid.id, signature: signCheckout(orderId, paid.id) });
}

describe("T-PAY-01 — a purchase grants exactly one child one grade", () => {
  let adminToken = "";
  let anyGradePlanId = "";
  let grade2PlanId = "";
  let level1Id = "";
  let level2Id = "";
  const savedCutoff = process.env.LEGACY_FAMILY_CUTOFF;

  beforeAll(async () => {
    process.env.PAYMENT_ENABLED = "true";
    process.env.RAZORPAY_ENABLED = "true";
    process.env.CASHFREE_ENABLED = "false";
    delete process.env.RAZORPAY_LIVE_ENABLED;
    process.env.RAZORPAY_USE_STUB = "1";
    process.env.RAZORPAY_KEY_ID = "rzp_test_stub";
    process.env.RAZORPAY_KEY_SECRET = "stub_secret_for_hmac_tests_only";
    process.env.RAZORPAY_WEBHOOK_SECRET = "whsec_stub_tests";
    process.env.TAX_RATE_BPS = "0";
    resetRazorpayStub();

    level1Id = (await prisma.learningLevel.findUniqueOrThrow({ where: { code: "LEVEL_1" } })).id;
    level2Id = (await prisma.learningLevel.findUniqueOrThrow({ where: { code: "LEVEL_2" } })).id;

    const admin = await request(app).post("/api/auth/login").send({ email: "admin@littlereaders.test", password: "AdminDemo1" });
    expect(admin.status).toBe(200);
    adminToken = admin.body.data.tokens.accessToken;
    const anyGrade = await request(app)
      .post("/api/admin/academic/subscription-plans")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ name: "Grade Yearly", code: `GB_Y_${stamp}`, durationMonths: 12, amountPaise: 49900, isPublished: true });
    expect(anyGrade.status).toBe(201);
    anyGradePlanId = anyGrade.body.data.id;
    const g2 = await request(app)
      .post("/api/admin/academic/subscription-plans")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ name: "Grade 2 Monthly", code: `GB_G2_${stamp}`, durationMonths: 1, amountPaise: 19900, levelId: level2Id, isPublished: true });
    expect(g2.status).toBe(201);
    grade2PlanId = g2.body.data.id;
  });

  afterAll(async () => {
    process.env.LEGACY_FAMILY_CUTOFF = savedCutoff;
    setGooglePlayApiForTests(null);
    for (const id of [anyGradePlanId, grade2PlanId].filter(Boolean)) {
      await prisma.subscriptionPlan.update({ where: { id }, data: { isActive: false, isPublished: false } });
    }
  });

  it("unlocks only the chosen child, only for that child's grade", async () => {
    const p = await registerParent("one");
    const ava = await addChild(p.token, "Ava G1", "LEVEL_1");
    const ben = await addChild(p.token, "Ben G2", "LEVEL_2");

    const res = await buy(p.token, { planId: anyGradePlanId, childId: ava });
    expect(res.status).toBe(200);

    const rows = await prisma.subscription.findMany({ where: { userId: p.id } });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ childId: ava, levelId: level1Id, status: "ACTIVE", includedSeats: 1 });

    const a = await access(p.token);
    expect(a[ava]).toMatchObject({ entitled: true, via: "GRADE" });
    expect(a[ben].entitled).toBe(false);

    // Moving the child to another grade does not carry the purchase over.
    await prisma.child.update({ where: { id: ava }, data: { levelId: level2Id } });
    expect((await access(p.token))[ava].entitled).toBe(false);
    await prisma.child.update({ where: { id: ava }, data: { levelId: level1Id } });
    expect((await access(p.token))[ava].entitled).toBe(true);
  });

  it("refuses orders without a child, for another family's child, or for the wrong grade", async () => {
    const p = await registerParent("guards");
    const other = await registerParent("other");
    const mine = await addChild(p.token, "Mine G1", "LEVEL_1");
    const theirs = await addChild(other.token, "Theirs G1", "LEVEL_1");

    const noChild = await request(app).post("/api/payments/orders").set("Authorization", `Bearer ${p.token}`).send({ planId: anyGradePlanId });
    expect(noChild.status).toBe(400);
    expect(noChild.body.code).toBe("CHILD_REQUIRED");

    const foreign = await request(app)
      .post("/api/payments/orders")
      .set("Authorization", `Bearer ${p.token}`)
      .send({ planId: anyGradePlanId, childId: theirs });
    expect(foreign.status).toBe(404);

    const wrongGrade = await request(app)
      .post("/api/payments/orders")
      .set("Authorization", `Bearer ${p.token}`)
      .send({ planId: grade2PlanId, childId: mine });
    expect(wrongGrade.status).toBe(400);
    expect(wrongGrade.body.code).toBe("PLAN_GRADE_MISMATCH");

    expect(await prisma.payment.count({ where: { userId: p.id } })).toBe(0);
    expect(await prisma.subscription.count({ where: { userId: p.id } })).toBe(0);
  });

  it("family subscriptions created after the cutoff no longer unlock learning", async () => {
    const p = await registerParent("legacy");
    const kid = await addChild(p.token, "Legacy G1", "LEVEL_1");
    await prisma.child.update({ where: { id: kid }, data: { hasLearningSeat: true } });
    await prisma.subscription.create({
      data: {
        userId: p.id,
        plan: "YEARLY",
        status: "ACTIVE",
        startedAt: new Date(),
        expiresAt: new Date(Date.now() + 30 * 86_400_000),
        provider: "manual_admin",
        providerRef: `legacy_cutoff_${stamp}`,
      },
    });

    process.env.LEGACY_FAMILY_CUTOFF = new Date(Date.now() + 86_400_000).toISOString();
    expect((await access(p.token))[kid]).toMatchObject({ entitled: true, via: "LEGACY_FAMILY" });

    process.env.LEGACY_FAMILY_CUTOFF = new Date(Date.now() - 86_400_000).toISOString();
    expect((await access(p.token))[kid].entitled).toBe(false);
    process.env.LEGACY_FAMILY_CUTOFF = savedCutoff;
  });

  it("a Google Play purchase verified for a child unlocks only that child's grade", async () => {
    process.env.GOOGLE_PLAY_BILLING_ENABLED = "true";
    const p = await registerParent("play");
    const ava = await addChild(p.token, "Play G1", "LEVEL_1");
    const ben = await addChild(p.token, "Play G2", "LEVEL_2");
    const token = `tok_gradebuy_${stamp}_aaaaaaaa`;
    const purchase: PlaySubscriptionV2 = {
      subscriptionState: "SUBSCRIPTION_STATE_ACTIVE",
      acknowledgementState: "ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED",
      externalAccountIdentifiers: { obfuscatedExternalAccountId: p.id },
      lineItems: [
        {
          productId: "learnwise_monthly",
          expiryTime: new Date(Date.now() + 30 * 86_400_000).toISOString(),
          latestSuccessfulOrderId: `GPA.gradebuy-${stamp}`,
        },
      ],
    };
    setGooglePlayApiForTests({
      async getSubscriptionV2() {
        return structuredClone(purchase);
      },
      async acknowledge() {},
    });

    const res = await request(app)
      .post("/api/payments/google-play/verify")
      .set("Authorization", `Bearer ${p.token}`)
      .set("X-Client-Platform", "android")
      .send({ productId: "learnwise_monthly", purchaseToken: token, childId: ben });
    expect(res.status, JSON.stringify(res.body)).toBe(200);

    const rows = await prisma.subscription.findMany({ where: { userId: p.id } });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ provider: "google_play", childId: ben, levelId: level2Id });
    const a = await access(p.token);
    expect(a[ben]).toMatchObject({ entitled: true, via: "GRADE" });
    expect(a[ava].entitled).toBe(false);
  });
});
