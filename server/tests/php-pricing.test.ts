import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { prisma } from "../src/lib/prisma.js";
import { resetCashfreeStub, stubCashfreePayment } from "../src/payments/cashfree.js";
import { normalisePhilippineMobile } from "../src/payments/cashfree.service.js";
import { resetRazorpayStub, signCheckout, stubMarkOrderPaid } from "../src/payments/razorpay.js";
import { regionFromMobile } from "../src/payments/region.js";

const app = createApp();
const hasDb = Boolean(process.env.DATABASE_URL);
const stamp = Date.now();

describe("Philippine pricing helpers", () => {
  it("suggests PH only for +63 mobiles", () => {
    expect(regionFromMobile("+639776605514")).toBe("PH");
    expect(regionFromMobile("+919876543210")).toBe("IN");
    expect(regionFromMobile(null)).toBe("IN");
  });

  it("normalises Philippine mobiles to +63 form", () => {
    expect(normalisePhilippineMobile("09776605514")).toBe("+639776605514");
    expect(normalisePhilippineMobile("+63 977 660 5514")).toBe("+639776605514");
    expect(normalisePhilippineMobile("9776605514")).toBe("+639776605514");
    expect(normalisePhilippineMobile("8876543210")).toBe(null);
    expect(normalisePhilippineMobile("12345")).toBe(null);
  });
});

async function registerParent(tag: string) {
  const reg = await request(app).post("/api/auth/register").send({
    name: `Php ${tag}`,
    email: `php_${tag}_${stamp}@test.local`,
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
    .send({ displayName: `Php ${tag}`, birthDate: "10/02/2023", level: "LEVEL_1" });
  expect(child.status).toBe(201);
  return { token, id: reg.body.data.user.id as string, childId: child.body.data.id as string };
}

describe.skipIf(!hasDb)("Philippine (PHP) plan pricing", () => {
  let adminToken = "";
  let phpPlanId = "";
  let inrOnlyPlanId = "";

  beforeAll(async () => {
    process.env.JWT_SECRET = process.env.JWT_SECRET ?? "dev_only_change_me_to_a_long_random_secret_value";
    process.env.PAYMENT_ENABLED = "true";
    process.env.CASHFREE_ENABLED = "true";
    process.env.CASHFREE_USE_STUB = "1";
    delete process.env.CASHFREE_ENV;
    delete process.env.CASHFREE_LIVE_ENABLED;
    process.env.RAZORPAY_ENABLED = "true";
    process.env.RAZORPAY_USE_STUB = "1";
    process.env.RAZORPAY_KEY_ID = "rzp_test_stub";
    process.env.RAZORPAY_KEY_SECRET = "stub_secret_for_hmac_tests_only";
    process.env.RAZORPAY_WEBHOOK_SECRET = "whsec_stub_tests";
    const admin = await request(app).post("/api/auth/login").send({
      email: "admin@littlereaders.test",
      password: "AdminDemo1",
    });
    expect(admin.status).toBe(200);
    adminToken = admin.body.data.tokens.accessToken;

    const php = await request(app)
      .post("/api/admin/academic/subscription-plans")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        name: "Monthly",
        code: `PHP_M_${stamp}`,
        durationMonths: 1,
        amountPaise: 14900,
        amountPhpCentavos: 14900,
        isPublished: true,
      });
    expect(php.status).toBe(201);
    expect(php.body.data.amountPhpCentavos).toBe(14900);
    phpPlanId = php.body.data.id;

    const inrOnly = await request(app)
      .post("/api/admin/academic/subscription-plans")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ name: "3 Months", code: `PHP_Q_${stamp}`, durationMonths: 3, amountPaise: 39900, isPublished: true });
    expect(inrOnly.status).toBe(201);
    inrOnlyPlanId = inrOnly.body.data.id;
  });

  afterAll(async () => {
    for (const id of [phpPlanId, inrOnlyPlanId].filter(Boolean)) {
      await prisma.subscriptionPlan.update({ where: { id }, data: { isActive: false, isPublished: false } });
    }
    process.env.CASHFREE_ENABLED = "false";
    delete process.env.CASHFREE_USE_STUB;
  });

  beforeEach(() => {
    resetCashfreeStub();
    resetRazorpayStub();
  });

  function plans(token: string, region?: string) {
    return request(app)
      .get(`/api/payments/plans${region ? `?region=${region}` : ""}`)
      .set("Authorization", `Bearer ${token}`);
  }

  it("keeps INR by default and shows the PHP price only when PH is asked for", async () => {
    const p = await registerParent("catalog");

    const inr = await plans(p.token);
    expect(inr.body.data.region).toBe("IN");
    expect(inr.body.data.suggestedRegion).toBe("IN");
    const inrPlan = inr.body.data.plans.find((x: { planId?: string }) => x.planId === phpPlanId);
    expect(inrPlan).toMatchObject({ currency: "INR", amountPaise: 14900 });
    expect(inrPlan.totalPaise).toBe(14900 + inrPlan.taxPaise);

    const ph = await plans(p.token, "PH");
    expect(ph.body.data.region).toBe("PH");
    const phPlan = ph.body.data.plans.find((x: { planId?: string }) => x.planId === phpPlanId);
    expect(phPlan).toMatchObject({ currency: "PHP", amountPaise: 14900, taxPaise: 0, totalPaise: 14900 });
    // A plan without a PHP price still sells in INR.
    const fallback = ph.body.data.plans.find((x: { planId?: string }) => x.planId === inrOnlyPlanId);
    expect(fallback.currency).toBe("INR");
    // Extra-seat add-ons are INR only.
    expect(ph.body.data.plans.some((x: { purpose: string }) => x.purpose === "EXTRA_SEATS")).toBe(false);

    // Unknown regions fall back to INR rather than failing.
    expect((await plans(p.token, "XX")).body.data.region).toBe("IN");
  });

  it("suggests PH for a parent with a +63 mobile", async () => {
    const p = await registerParent("suggest");
    await prisma.user.update({ where: { id: p.id }, data: { mobileE164: `+6397${String(stamp).slice(-8)}` } });
    const res = await plans(p.token);
    expect(res.body.data.suggestedRegion).toBe("PH");
    // Prices still follow the requested region, so older app builds keep seeing INR.
    expect(res.body.data.region).toBe("IN");
  });

  it("creates and verifies a Razorpay order in PHP for ₱149", async () => {
    const p = await registerParent("rzp");
    const created = await request(app)
      .post("/api/payments/orders")
      .set("Authorization", `Bearer ${p.token}`)
      .send({ planId: phpPlanId, childId: p.childId, region: "PH" });
    expect(created.status).toBe(201);
    expect(created.body.data).toMatchObject({ amountPaise: 14900, currency: "PHP" });

    const row = await prisma.payment.findUniqueOrThrow({ where: { id: created.body.data.paymentId } });
    expect(row).toMatchObject({ amountCents: 14900, currency: "PHP", status: "PENDING" });

    const orderId = created.body.data.orderId as string;
    const paid = stubMarkOrderPaid(orderId);
    const verified = await request(app)
      .post("/api/payments/verify")
      .set("Authorization", `Bearer ${p.token}`)
      .send({ orderId, paymentId: paid.id, signature: signCheckout(orderId, paid.id) });
    expect(verified.status).toBe(200);

    const receipt = await request(app)
      .get(`/api/payments/${row.id}/receipt`)
      .set("Authorization", `Bearer ${p.token}`);
    expect(receipt.status).toBe(200);
    expect(receipt.body.data).toMatchObject({ currency: "PHP", totalPaise: 14900, taxPaise: 0 });
  });

  it("refuses extra seats in PHP", async () => {
    const p = await registerParent("seats");
    const res = await request(app)
      .post("/api/payments/orders")
      .set("Authorization", `Bearer ${p.token}`)
      .send({ purpose: "EXTRA_SEATS", seats: 1, region: "PH" });
    expect(res.status).toBe(400);
  });

  it("creates a Cashfree order in PHP with a +63 phone and verifies it", async () => {
    const p = await registerParent("cf");

    const noPhone = await request(app)
      .post("/api/payments/cashfree/orders")
      .set("Authorization", `Bearer ${p.token}`)
      .send({ planId: phpPlanId, childId: p.childId, region: "PH", phone: "8876543210" });
    expect(noPhone.status).toBe(400);
    expect(noPhone.body.code).toBe("PHONE_REQUIRED");

    const created = await request(app)
      .post("/api/payments/cashfree/orders")
      .set("Authorization", `Bearer ${p.token}`)
      .send({ planId: phpPlanId, childId: p.childId, region: "PH", phone: "09776605514" });
    expect(created.status).toBe(201);
    expect(created.body.data).toMatchObject({ amountPaise: 14900, currency: "PHP" });

    const orderId = created.body.data.orderId as string;
    stubCashfreePayment(orderId, "SUCCESS");
    const verified = await request(app)
      .post("/api/payments/cashfree/verify")
      .set("Authorization", `Bearer ${p.token}`)
      .send({ orderId });
    expect(verified.status).toBe(200);
    const row = await prisma.payment.findUniqueOrThrow({ where: { id: created.body.data.paymentId } });
    expect(row).toMatchObject({ status: "SUCCEEDED", currency: "PHP", amountCents: 14900 });
  });

  it("lets admin clear the PHP price, after which PH parents pay INR", async () => {
    const cleared = await request(app)
      .patch(`/api/admin/academic/subscription-plans/${phpPlanId}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ amountPhpCentavos: null });
    expect(cleared.status).toBe(200);
    expect(cleared.body.data.amountPhpCentavos).toBe(null);

    const p = await registerParent("cleared");
    const ph = await plans(p.token, "PH");
    const plan = ph.body.data.plans.find((x: { planId?: string }) => x.planId === phpPlanId);
    expect(plan.currency).toBe("INR");
  });
});
