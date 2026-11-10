import { createVerify, generateKeyPairSync } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { prisma } from "../src/lib/prisma.js";
import {
  purchaseTokenRef,
  setGooglePlayApiForTests,
  type GooglePlayApi,
  type PlaySubscriptionV2,
} from "../src/payments/google-play.js";
import {
  resetRazorpayStub,
  setRazorpayClientForTests,
  signCheckout,
  signWebhook,
  stubMarkOrderPaid,
} from "../src/payments/razorpay.js";

const app = createApp();
const hasDb = Boolean(process.env.DATABASE_URL);
const stamp = Date.now();
const RTDN_TOKEN = "local_rtdn_test_token";

/** Mock Google Play Developer API: purchases keyed by token, records acknowledge calls. */
const purchases = new Map<string, PlaySubscriptionV2>();
const acknowledged: string[] = [];
const mockApi: GooglePlayApi = {
  async getSubscriptionV2(_pkg, token) {
    const p = purchases.get(token);
    if (!p) throw Object.assign(new Error("not found"), { status: 404 });
    return structuredClone(p);
  },
  async acknowledge(_pkg, _productId, token) {
    acknowledged.push(token);
    const p = purchases.get(token);
    if (p) p.acknowledgementState = "ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED";
  },
};

function daysFromNow(d: number) {
  return new Date(Date.now() + d * 86_400_000).toISOString();
}

function playPurchase(
  userId: string,
  over: Partial<PlaySubscriptionV2> & { productId?: string; expiry?: string; orderId?: string } = {}
): PlaySubscriptionV2 {
  const { productId = "learnwise_monthly", expiry = daysFromNow(30), orderId = `GPA.${stamp}-${Math.random().toString(36).slice(2, 8)}`, ...rest } = over;
  return {
    subscriptionState: "SUBSCRIPTION_STATE_ACTIVE",
    regionCode: "IN",
    acknowledgementState: "ACKNOWLEDGEMENT_STATE_PENDING",
    testPurchase: {},
    externalAccountIdentifiers: { obfuscatedExternalAccountId: userId },
    lineItems: [
      {
        productId,
        expiryTime: expiry,
        latestSuccessfulOrderId: orderId,
        autoRenewingPlan: {
          autoRenewEnabled: true,
          recurringPrice: { currencyCode: "INR", units: "199", nanos: 0 },
        },
        offerDetails: { basePlanId: "monthly" },
      },
    ],
    ...rest,
  };
}

function rtdnBody(messageId: string, notification: Record<string, unknown>) {
  return {
    message: {
      messageId,
      data: Buffer.from(
        JSON.stringify({ version: "1.0", packageName: "com.littlereaders.app", eventTimeMillis: `${Date.now()}`, ...notification })
      ).toString("base64"),
    },
    subscription: "projects/x/subscriptions/y",
  };
}

async function registerParent(tag: string) {
  const email = `dualpay_${tag}_${stamp}@test.local`;
  const reg = await request(app).post("/api/auth/register").send({
    name: `Dual ${tag}`,
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
  return { token, id: reg.body.data.user.id as string };
}

function verify(token: string, productId: string, purchaseToken: string) {
  return request(app)
    .post("/api/payments/google-play/verify")
    .set("Authorization", `Bearer ${token}`)
    .set("X-Client-Platform", "android")
    .send({ productId, purchaseToken });
}

function rtdn(body: object, token = RTDN_TOKEN) {
  return request(app).post(`/api/payments/google-play/rtdn?token=${encodeURIComponent(token)}`).send(body);
}

describe.skipIf(!hasDb)("Dual payment — Google Play Billing + Razorpay website", () => {
  let adminToken = "";
  let planId = "";
  let monthlyPlanId = "";

  beforeAll(async () => {
    process.env.JWT_SECRET = process.env.JWT_SECRET ?? "dev_only_change_me_to_a_long_random_secret_value";
    process.env.PAYMENT_ENABLED = "true";
    process.env.RAZORPAY_ENABLED = "true";
    process.env.CASHFREE_ENABLED = "false";
    delete process.env.RAZORPAY_LIVE_ENABLED;
    process.env.RAZORPAY_USE_STUB = "1";
    process.env.RAZORPAY_KEY_ID = "rzp_test_stub";
    process.env.RAZORPAY_KEY_SECRET = "stub_secret_for_hmac_tests_only";
    process.env.RAZORPAY_WEBHOOK_SECRET = "whsec_stub_tests";
    process.env.TAX_RATE_BPS = "0";
    process.env.GOOGLE_PLAY_BILLING_ENABLED = "true";
    process.env.GOOGLE_PLAY_RTDN_TOKEN = RTDN_TOKEN;
    delete process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_FILE;
    delete process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON;
    setGooglePlayApiForTests(mockApi);

    const admin = await request(app).post("/api/auth/login").send({
      email: "admin@littlereaders.test",
      password: "AdminDemo1",
    });
    expect(admin.status).toBe(200);
    adminToken = admin.body.data.tokens.accessToken;

    const plan = await request(app)
      .post("/api/admin/academic/subscription-plans")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ name: "Dual Yearly", code: `DUAL_Y_${stamp}`, durationMonths: 12, amountPaise: 49900, includedSeats: 2, isPublished: true });
    expect(plan.status).toBe(201);
    planId = plan.body.data.id;
    const monthly = await request(app)
      .post("/api/admin/academic/subscription-plans")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ name: "Dual Monthly", code: `DUAL_M_${stamp}`, durationMonths: 1, amountPaise: 19900, includedSeats: 3, isPublished: true, sortOrder: -1000 });
    expect(monthly.status).toBe(201);
    monthlyPlanId = monthly.body.data.id;
  });

  afterAll(async () => {
    setGooglePlayApiForTests(null);
    setRazorpayClientForTests(null);
    for (const id of [planId, monthlyPlanId]) {
      if (id) await prisma.subscriptionPlan.update({ where: { id }, data: { isActive: false, isPublished: false } });
    }
  });

  beforeEach(() => {
    resetRazorpayStub();
    process.env.GOOGLE_PLAY_BILLING_ENABLED = "true";
    process.env.RAZORPAY_ENABLED = "true";
  });

  // I.1 / I.2 flags
  it("keeps Google Play and Razorpay closed when their flags are off", async () => {
    const p = await registerParent("flags");
    process.env.GOOGLE_PLAY_BILLING_ENABLED = "false";
    const cfg = await request(app).get("/api/payments/google-play/config").set("Authorization", `Bearer ${p.token}`);
    expect(cfg.status).toBe(200);
    expect(cfg.body.data.enabled).toBe(false);
    expect(cfg.body.data.canPurchase).toBe(false);
    const token = `tok_flags_${stamp}_aaaaaaaa`;
    purchases.set(token, playPurchase(p.id));
    const v = await verify(p.token, "learnwise_monthly", token);
    expect(v.status).toBe(503);
    expect(v.body.code).toBe("GOOGLE_PLAY_DISABLED");

    process.env.RAZORPAY_ENABLED = "false";
    const plans = await request(app).get("/api/payments/plans").set("Authorization", `Bearer ${p.token}`);
    expect(plans.body.data.enabled).toBe(false);
    expect(plans.body.data.keyId).toBeNull();
    const order = await request(app).post("/api/payments/orders").set("Authorization", `Bearer ${p.token}`).send({ planId });
    expect(order.status).toBe(503);
    expect(await prisma.subscription.count({ where: { userId: p.id } })).toBe(0);
  });

  // I.3 / I.4 / I.5 / I.6 valid purchase, idempotent, acknowledged, entitlement + seats
  it("verifies a Google Play purchase server-side, acknowledges once and grants access idempotently", async () => {
    const p = await registerParent("gp");
    const cfg = await request(app).get("/api/payments/google-play/config").set("Authorization", `Bearer ${p.token}`);
    expect(cfg.body.data).toMatchObject({ enabled: true, canPurchase: true, obfuscatedAccountId: p.id });
    expect(cfg.body.data.products.map((x: { productId: string }) => x.productId)).toEqual(["learnwise_monthly", "learnwise_yearly"]);

    const token = `tok_gp_${stamp}_aaaaaaaa`;
    purchases.set(token, playPurchase(p.id, { orderId: `GPA.${stamp}-gp-0` }));
    const first = await verify(p.token, "learnwise_monthly", token);
    expect(first.status).toBe(200);
    expect(first.body.data).toMatchObject({ status: "ACTIVE", eligible: true, acknowledged: true, pending: false });
    expect(JSON.stringify(first.body)).not.toContain(token);
    expect(acknowledged.filter((t) => t === token)).toHaveLength(1);

    const second = await verify(p.token, "learnwise_monthly", token);
    expect(second.status).toBe(200);
    expect(acknowledged.filter((t) => t === token)).toHaveLength(1);
    expect(await prisma.subscription.count({ where: { userId: p.id } })).toBe(1);
    expect(await prisma.payment.count({ where: { userId: p.id, provider: "google_play" } })).toBe(1);

    const sub = await prisma.subscription.findFirst({ where: { userId: p.id } });
    expect(sub).toMatchObject({ provider: "google_play", providerRef: purchaseTokenRef(token), verificationStatus: "VERIFIED_TEST", includedSeats: 3 });
    expect(sub?.acknowledgedAt).not.toBeNull();

    const me = await request(app).get("/api/subscriptions/me").set("Authorization", `Bearer ${p.token}`);
    expect(me.body.data.eligible).toBe(true);
    expect(me.body.data.subscription.provider).toBe("google_play");
    expect(me.body.data.subscription.management.canCancelHere).toBe(false);
    expect(JSON.stringify(me.body)).not.toContain(token);
    expect(me.body.data.seats.capacity).toBe(3);

    const cancel = await request(app).post("/api/subscriptions/cancel").set("Authorization", `Bearer ${p.token}`).send({});
    expect(cancel.status).toBe(409);
    expect(cancel.body.code).toBe("MANAGED_BY_GOOGLE_PLAY");

    // Website checkout must not double-charge a Google Play subscriber.
    const web = await request(app).post("/api/payments/orders").set("Authorization", `Bearer ${p.token}`).send({ planId });
    expect(web.status).toBe(409);
    expect(web.body.code).toBe("MANAGED_BY_GOOGLE_PLAY");
  });

  // I.7 invalid token, wrong product, account mismatch, reused token
  it("rejects invalid, mismatched and reused purchase tokens without granting access", async () => {
    const a = await registerParent("tokA");
    const b = await registerParent("tokB");

    const missing = await verify(a.token, "learnwise_monthly", `tok_missing_${stamp}_aaaa`);
    expect(missing.status).toBe(400);
    expect(missing.body.code).toBe("INVALID_PURCHASE_TOKEN");

    const unknown = await verify(a.token, "learnwise_lifetime", `tok_unknown_${stamp}_aaaa`);
    expect(unknown.status).toBe(400);
    expect(unknown.body.code).toBe("UNKNOWN_PRODUCT");

    const wrongProduct = `tok_wrongprod_${stamp}_aaaa`;
    purchases.set(wrongProduct, playPurchase(a.id, { productId: "learnwise_yearly", expiry: daysFromNow(365) }));
    const mismatch = await verify(a.token, "learnwise_monthly", wrongProduct);
    expect(mismatch.status).toBe(400);

    const foreign = `tok_foreign_${stamp}_aaaa`;
    purchases.set(foreign, playPurchase(b.id));
    const stolen = await verify(a.token, "learnwise_monthly", foreign);
    expect(stolen.status).toBe(403);
    expect(stolen.body.code).toBe("PURCHASE_ACCOUNT_MISMATCH");

    const ok = await verify(b.token, "learnwise_monthly", foreign);
    expect(ok.status).toBe(200);
    const reuse = await verify(a.token, "learnwise_monthly", foreign);
    expect(reuse.status).toBe(403);

    const aSubs = await prisma.subscription.findMany({ where: { userId: a.id, provider: "google_play", status: "ACTIVE", productId: "learnwise_monthly" } });
    expect(aSubs).toHaveLength(0);
  });

  // I.8 pending purchase
  it("does not grant access or acknowledge while a purchase is pending", async () => {
    const p = await registerParent("pending");
    const token = `tok_pending_${stamp}_aaaa`;
    purchases.set(token, playPurchase(p.id, { subscriptionState: "SUBSCRIPTION_STATE_PENDING" }));
    const res = await verify(p.token, "learnwise_monthly", token);
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ status: "PENDING", eligible: false, pending: true, acknowledged: false });
    expect(acknowledged).not.toContain(token);
    expect(await prisma.payment.count({ where: { userId: p.id } })).toBe(0);
    const me = await request(app).get("/api/subscriptions/me").set("Authorization", `Bearer ${p.token}`);
    expect(me.body.data.eligible).toBe(false);
  });

  // I.9 – I.14 RTDN lifecycle
  it("applies RTDN renewals, cancellation, grace, hold, expiry, revoke and voided refunds", async () => {
    const p = await registerParent("rtdn");
    const token = `tok_rtdn_${stamp}_aaaa`;
    purchases.set(token, playPurchase(p.id, { orderId: `GPA.${stamp}-r-0` }));
    expect((await verify(p.token, "learnwise_monthly", token)).status).toBe(200);
    const subNote = (type: number) => ({ subscriptionNotification: { version: "1.0", notificationType: type, purchaseToken: token, subscriptionId: "learnwise_monthly" } });
    const subRow = () => prisma.subscription.findUniqueOrThrow({ where: { providerRef: purchaseTokenRef(token) } });

    expect((await rtdn(rtdnBody(`m-bad-${stamp}`, subNote(2)), "wrong")).status).toBe(401);

    // Renewal: new order id + later expiry.
    purchases.set(token, { ...playPurchase(p.id, { orderId: `GPA.${stamp}-r-1`, expiry: daysFromNow(60) }), acknowledgementState: "ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED" });
    const renew = await rtdn(rtdnBody(`m-renew-${stamp}`, subNote(2)));
    expect(renew.status).toBe(200);
    expect((await subRow()).expiresAt.getTime()).toBeGreaterThan(Date.now() + 55 * 86_400_000);
    expect(await prisma.payment.count({ where: { userId: p.id, provider: "google_play" } })).toBe(2);

    // Duplicate delivery of the same Pub/Sub message.
    const dup = await rtdn(rtdnBody(`m-renew-${stamp}`, subNote(2)));
    expect(dup.body.data.duplicate).toBe(true);
    expect(await prisma.payment.count({ where: { userId: p.id, provider: "google_play" } })).toBe(2);

    // Cancelled: access continues until expiry.
    purchases.get(token)!.subscriptionState = "SUBSCRIPTION_STATE_CANCELED";
    purchases.get(token)!.lineItems![0].autoRenewingPlan!.autoRenewEnabled = false;
    await rtdn(rtdnBody(`m-cancel-${stamp}`, subNote(3)));
    expect((await subRow()).status).toBe("CANCELLED");
    let me = await request(app).get("/api/subscriptions/me").set("Authorization", `Bearer ${p.token}`);
    expect(me.body.data.eligible).toBe(true);
    expect(me.body.data.subscription.autoRenewing).toBe(false);

    // Grace period keeps access.
    purchases.get(token)!.subscriptionState = "SUBSCRIPTION_STATE_IN_GRACE_PERIOD";
    await rtdn(rtdnBody(`m-grace-${stamp}`, subNote(6)));
    expect((await subRow()).status).toBe("GRACE");
    me = await request(app).get("/api/subscriptions/me").set("Authorization", `Bearer ${p.token}`);
    expect(me.body.data.eligible).toBe(true);

    // Account hold removes access.
    purchases.get(token)!.subscriptionState = "SUBSCRIPTION_STATE_ON_HOLD";
    purchases.get(token)!.lineItems![0].expiryTime = new Date(Date.now() - 1000).toISOString();
    await rtdn(rtdnBody(`m-hold-${stamp}`, subNote(5)));
    expect((await subRow()).status).toBe("SUSPENDED");
    me = await request(app).get("/api/subscriptions/me").set("Authorization", `Bearer ${p.token}`);
    expect(me.body.data.eligible).toBe(false);

    // Recovered, then revoked by Google (refund + revoke).
    purchases.get(token)!.subscriptionState = "SUBSCRIPTION_STATE_ACTIVE";
    purchases.get(token)!.lineItems![0].expiryTime = daysFromNow(30);
    await rtdn(rtdnBody(`m-recover-${stamp}`, subNote(1)));
    expect((await subRow()).status).toBe("ACTIVE");
    await rtdn(rtdnBody(`m-revoke-${stamp}`, subNote(12)));
    const revoked = await subRow();
    expect(revoked.status).toBe("EXPIRED");
    expect(revoked.expiresAt.getTime()).toBeLessThanOrEqual(Date.now());

    // Expired notification on a fresh token.
    const t2 = `tok_rtdn2_${stamp}_aaaa`;
    purchases.set(t2, playPurchase(p.id, { orderId: `GPA.${stamp}-v-0` }));
    expect((await verify(p.token, "learnwise_monthly", t2)).status).toBe(200);
    purchases.get(t2)!.subscriptionState = "SUBSCRIPTION_STATE_EXPIRED";
    purchases.get(t2)!.lineItems![0].expiryTime = new Date(Date.now() - 1000).toISOString();
    await rtdn(rtdnBody(`m-expired-${stamp}`, { subscriptionNotification: { notificationType: 13, purchaseToken: t2, subscriptionId: "learnwise_monthly" } }));
    expect((await prisma.subscription.findUniqueOrThrow({ where: { providerRef: purchaseTokenRef(t2) } })).status).toBe("EXPIRED");

    // Voided purchase (refund) on a third token.
    const t3 = `tok_rtdn3_${stamp}_aaaa`;
    purchases.set(t3, playPurchase(p.id, { orderId: `GPA.${stamp}-w-0` }));
    expect((await verify(p.token, "learnwise_monthly", t3)).status).toBe(200);
    const voided = await rtdn(rtdnBody(`m-void-${stamp}`, { voidedPurchaseNotification: { purchaseToken: t3, orderId: `GPA.${stamp}-w-0`, productType: 1 } }));
    expect(voided.body.data.voided).toBe(true);
    expect((await prisma.subscription.findUniqueOrThrow({ where: { providerRef: purchaseTokenRef(t3) } })).status).toBe("EXPIRED");
    expect((await prisma.payment.findUniqueOrThrow({ where: { providerRef: `gp_order:GPA.${stamp}-w-0` } })).status).toBe("REFUNDED");
    me = await request(app).get("/api/subscriptions/me").set("Authorization", `Bearer ${p.token}`);
    expect(me.body.data.eligible).toBe(false);

    const events = await prisma.subscriptionAuditEvent.findMany({ where: { userId: p.id, provider: "google_play" } });
    expect(events.length).toBeGreaterThanOrEqual(8);
    expect(JSON.stringify(events)).not.toContain(token);
  });

  // I.15 upgrade / linked purchase token
  it("expires the old row when Google links a new purchase token (plan change)", async () => {
    const p = await registerParent("upgrade");
    const oldToken = `tok_old_${stamp}_aaaa`;
    purchases.set(oldToken, playPurchase(p.id));
    expect((await verify(p.token, "learnwise_monthly", oldToken)).status).toBe(200);
    const newToken = `tok_new_${stamp}_aaaa`;
    purchases.set(newToken, playPurchase(p.id, { productId: "learnwise_yearly", expiry: daysFromNow(365), linkedPurchaseToken: oldToken }));
    const res = await verify(p.token, "learnwise_yearly", newToken);
    expect(res.status).toBe(200);
    expect((await prisma.subscription.findUniqueOrThrow({ where: { providerRef: purchaseTokenRef(oldToken) } })).status).toBe("EXPIRED");
    const me = await request(app).get("/api/subscriptions/me").set("Authorization", `Bearer ${p.token}`);
    expect(me.body.data.subscription.productId).toBe("learnwise_yearly");
  });

  it("real Google client: signs a service-account JWT, calls subscriptionsv2 and acknowledges (fetch stubbed, offline)", async () => {
    const p = await registerParent("jwt");
    const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
    process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON = JSON.stringify({
      client_email: "svc@learnwise-test.iam.gserviceaccount.com",
      private_key: privateKey.export({ type: "pkcs8", format: "pem" }),
      token_uri: "https://oauth2.googleapis.com/token",
    });
    const token = `tok_jwt_${stamp}/with+chars`;
    const seen: string[] = [];
    const realFetch = globalThis.fetch;
    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      seen.push(`${init?.method ?? "GET"} ${url}`);
      if (url === "https://oauth2.googleapis.com/token") {
        const assertion = new URLSearchParams(String(init?.body)).get("assertion")!;
        const [h, c, s] = assertion.split(".");
        const ok = createVerify("RSA-SHA256").update(`${h}.${c}`).verify(publicKey, Buffer.from(s, "base64url"));
        const claims = JSON.parse(Buffer.from(c, "base64url").toString());
        if (!ok || claims.scope !== "https://www.googleapis.com/auth/androidpublisher") {
          return new Response("{}", { status: 401 });
        }
        return new Response(JSON.stringify({ access_token: "ya29.local-test", expires_in: 3600 }), { status: 200 });
      }
      if ((init?.headers as Record<string, string>)?.authorization !== "Bearer ya29.local-test") {
        return new Response("{}", { status: 401 });
      }
      if (url.endsWith(`/applications/com.littlereaders.app/purchases/subscriptionsv2/tokens/${encodeURIComponent(token)}`)) {
        return new Response(JSON.stringify(playPurchase(p.id)), { status: 200 });
      }
      if (url.endsWith(`/purchases/subscriptions/learnwise_monthly/tokens/${encodeURIComponent(token)}:acknowledge`)) {
        return new Response(null, { status: 204 });
      }
      return new Response("{}", { status: 404 });
    }) as typeof fetch;
    setGooglePlayApiForTests(null);
    try {
      const res = await verify(p.token, "learnwise_monthly", token);
      expect(res.status).toBe(200);
      expect(res.body.data).toMatchObject({ status: "ACTIVE", eligible: true, acknowledged: true });
      expect(seen[0]).toBe("POST https://oauth2.googleapis.com/token");
      expect(seen.some((s) => s.startsWith("GET ") && s.includes("/subscriptionsv2/tokens/"))).toBe(true);
      expect(seen.some((s) => s.startsWith("POST ") && s.endsWith(":acknowledge"))).toBe(true);
    } finally {
      globalThis.fetch = realFetch;
      delete process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON;
      setGooglePlayApiForTests(mockApi);
    }
  });

  // I.13 / I.14 / I.15 / I.16 / I.17 cross-provider entitlement, seats, expiry, privacy
  it("shares one entitlement across app and website, seats two children, and keeps payments private", async () => {
    // Website (Razorpay) subscriber opens the Android app.
    const web = await registerParent("websub");
    const order = await request(app).post("/api/payments/orders").set("Authorization", `Bearer ${web.token}`).send({ planId });
    const orderId = order.body.data.orderId as string;
    const paid = stubMarkOrderPaid(orderId, `pay_websub_${stamp}`);
    expect(
      (await request(app).post("/api/payments/verify").set("Authorization", `Bearer ${web.token}`).send({ orderId, paymentId: paid.id, signature: signCheckout(orderId, paid.id) })).status
    ).toBe(200);
    const onAndroid = await request(app).get("/api/subscriptions/me").set("Authorization", `Bearer ${web.token}`).set("X-Client-Platform", "android");
    expect(onAndroid.body.data.eligible).toBe(true);
    expect(onAndroid.body.data.subscription.provider).toBe("razorpay");
    const cfg = await request(app).get("/api/payments/google-play/config").set("Authorization", `Bearer ${web.token}`).set("X-Client-Platform", "android");
    expect(cfg.body.data).toMatchObject({ canPurchase: false, blockedReason: "ACTIVE_SUBSCRIPTION_OTHER_PROVIDER" });

    // Google Play subscriber opens the website.
    const gp = await registerParent("gpweb");
    const token = `tok_gpweb_${stamp}_aaaa`;
    purchases.set(token, playPurchase(gp.id, { productId: "learnwise_yearly", expiry: daysFromNow(365) }));
    expect((await verify(gp.token, "learnwise_yearly", token)).status).toBe(200);
    const onWeb = await request(app).get("/api/subscriptions/me").set("Authorization", `Bearer ${gp.token}`).set("X-Client-Platform", "web");
    expect(onWeb.body.data.eligible).toBe(true);
    expect(onWeb.body.data.subscription.provider).toBe("google_play");

    // Two children share the included seats; a third waits.
    const mk = async (name: string) => {
      const res = await request(app).post("/api/children").set("Authorization", `Bearer ${gp.token}`).send({ displayName: name, birthDate: "15/03/2021" });
      expect(res.status).toBe(201);
      return res.body.data as { id: string; hasLearningSeat: boolean };
    };
    const kids = [await mk(`GpKidA${stamp}`), await mk(`GpKidB${stamp}`), await mk(`GpKidC${stamp}`)];
    const capacity = onWeb.body.data.seats.capacity as number;
    expect(capacity).toBeGreaterThanOrEqual(2);
    expect(kids.filter((k) => k.hasLearningSeat)).toHaveLength(Math.min(3, capacity));

    // Expiry removes access but keeps the children and their records.
    purchases.get(token)!.subscriptionState = "SUBSCRIPTION_STATE_EXPIRED";
    purchases.get(token)!.lineItems![0].expiryTime = new Date(Date.now() - 1000).toISOString();
    await rtdn(rtdnBody(`m-gpweb-exp-${stamp}`, { subscriptionNotification: { notificationType: 13, purchaseToken: token, subscriptionId: "learnwise_yearly" } }));
    const expired = await request(app).get("/api/subscriptions/me").set("Authorization", `Bearer ${gp.token}`);
    expect(expired.body.data.eligible).toBe(false);
    expect(expired.body.data.seats.capacity).toBe(0);
    expect(await prisma.child.count({ where: { parentId: gp.id, isActive: true } })).toBe(3);

    // One parent cannot read another parent's payments.
    const webPayment = await prisma.payment.findFirstOrThrow({ where: { razorpayOrderId: orderId } });
    const peek = await request(app).get(`/api/payments/${webPayment.id}/receipt`).set("Authorization", `Bearer ${gp.token}`);
    expect([403, 404]).toContain(peek.status);
    const mine = await request(app).get("/api/payments/me").set("Authorization", `Bearer ${gp.token}`);
    expect((mine.body.data as { id: string }[]).some((x) => x.id === webPayment.id)).toBe(false);
    const history = await request(app).get(`/api/subscriptions/admin/${web.id}/history`).set("Authorization", `Bearer ${gp.token}`);
    expect(history.status).toBe(403);
  });

  it("allows Razorpay checkout from Android and refuses it from iOS", async () => {
    const p = await registerParent("native");
    const ios = await request(app)
      .post("/api/payments/orders")
      .set("Authorization", `Bearer ${p.token}`)
      .set("X-Client-Platform", "ios")
      .send({ planId });
    expect(ios.status).toBe(403);
    expect(ios.body.code).toBe("USE_STORE_BILLING");
    const android = await request(app)
      .post("/api/payments/orders")
      .set("Authorization", `Bearer ${p.token}`)
      .set("X-Client-Platform", "android")
      .send({ planId });
    expect(android.status).toBe(201);
    const web = await request(app)
      .post("/api/payments/orders")
      .set("Authorization", `Bearer ${p.token}`)
      .set("X-Client-Platform", "web")
      .send({ planId });
    expect(web.status).toBe(201);
  });

  // I.17 authorized-only payment does not activate
  it("does not activate a Razorpay payment that is only authorized", async () => {
    const p = await registerParent("authz");
    const order = await request(app).post("/api/payments/orders").set("Authorization", `Bearer ${p.token}`).send({ planId });
    expect(order.status).toBe(201);
    const orderId = order.body.data.orderId as string;
    const payId = `pay_authz_${stamp}`;
    setRazorpayClientForTests({
      async createOrder() {
        throw new Error("unused");
      },
      async fetchPayment(id) {
        return { id, order_id: orderId, amount: 49900, currency: "INR", status: "authorized" };
      },
    });
    try {
      const res = await request(app)
        .post("/api/payments/verify")
        .set("Authorization", `Bearer ${p.token}`)
        .send({ orderId, paymentId: payId, signature: signCheckout(orderId, payId) });
      expect(res.status).toBe(200);
      expect(res.body.data).toMatchObject({ processing: true, code: "PAYMENT_PROCESSING" });
    } finally {
      setRazorpayClientForTests(null);
    }
    const me = await request(app).get("/api/subscriptions/me").set("Authorization", `Bearer ${p.token}`);
    expect(me.body.data.eligible).toBe(false);
    const row = await prisma.payment.findFirstOrThrow({ where: { razorpayOrderId: orderId } });
    expect(row.status).toBe("PENDING");
  });

  // I.18 Razorpay refunds + audit history in Admin
  it("revokes the paid period on a full Razorpay refund, records partial refunds, and shows history to Admin", async () => {
    const p = await registerParent("refund");
    const order = await request(app).post("/api/payments/orders").set("Authorization", `Bearer ${p.token}`).send({ planId });
    const orderId = order.body.data.orderId as string;
    const paid = stubMarkOrderPaid(orderId, `pay_refund_${stamp}`);
    const ok = await request(app)
      .post("/api/payments/verify")
      .set("Authorization", `Bearer ${p.token}`)
      .send({ orderId, paymentId: paid.id, signature: signCheckout(orderId, paid.id) });
    expect(ok.status).toBe(200);
    let me = await request(app).get("/api/subscriptions/me").set("Authorization", `Bearer ${p.token}`);
    expect(me.body.data.eligible).toBe(true);

    const refundEvent = (id: string, amount: number) =>
      JSON.stringify({ id, event: "refund.processed", payload: { refund: { entity: { id: `rfnd_${id}`, payment_id: paid.id, amount } } } });

    const partial = refundEvent(`evt_partial_${stamp}`, 1000);
    const partialRes = await request(app).post("/api/payments/webhook").set("Content-Type", "application/json").set("X-Razorpay-Signature", signWebhook(partial)).send(partial);
    expect(partialRes.status).toBe(200);
    expect(partialRes.body.data.partial).toBe(true);
    me = await request(app).get("/api/subscriptions/me").set("Authorization", `Bearer ${p.token}`);
    expect(me.body.data.eligible).toBe(true);

    const full = refundEvent(`evt_full_${stamp}`, 48900);
    const fullRes = await request(app).post("/api/payments/webhook").set("Content-Type", "application/json").set("X-Razorpay-Signature", signWebhook(full)).send(full);
    expect(fullRes.status).toBe(200);
    expect(fullRes.body.data.refunded).toBe(true);
    expect(fullRes.body.data.accessRevoked).toBe(true);
    const again = await request(app).post("/api/payments/webhook").set("Content-Type", "application/json").set("X-Razorpay-Signature", signWebhook(full)).send(full);
    expect(again.status).toBe(200);
    expect(again.body.data.alreadyProcessed).toBe(true);
    me = await request(app).get("/api/subscriptions/me").set("Authorization", `Bearer ${p.token}`);
    expect(me.body.data.eligible).toBe(false);
    expect((await prisma.payment.findFirstOrThrow({ where: { razorpayOrderId: orderId } })).status).toBe("REFUNDED");

    const history = await request(app).get(`/api/subscriptions/admin/${p.id}/history`).set("Authorization", `Bearer ${adminToken}`);
    expect(history.status).toBe(200);
    const types = history.body.data.events.map((e: { eventType: string }) => e.eventType);
    expect(types).toEqual(expect.arrayContaining(["PARTIAL_REFUND", "REFUND_PROCESSED"]));
    expect(JSON.stringify(history.body)).not.toMatch(/providerToken|stub_secret|card/i);

    const list = await request(app).get(`/api/subscriptions/admin?q=${encodeURIComponent(`dualpay_refund_${stamp}`)}`).set("Authorization", `Bearer ${adminToken}`);
    expect(list.status).toBe(200);
    expect(JSON.stringify(list.body)).not.toContain("providerToken");
  });
});
