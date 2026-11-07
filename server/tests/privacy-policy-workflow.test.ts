import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import type { PrivacyPolicy } from "@prisma/client";
import { createApp } from "../src/app.js";
import { prisma } from "../src/lib/prisma.js";
import { hashPassword } from "../src/lib/password.js";
import { takeTestOtpEmail } from "../src/lib/email.js";

const app = createApp();
const hasDb = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDb)("Privacy policy draft → publish → parent registration", () => {
  const unique = Date.now();
  const version = `t${unique}`;
  const parentEmail = `privacy_parent_${unique}@example.com`;
  const existingParentEmail = `privacy_existing_${unique}@example.com`;
  const password = "SecurePass1";
  let adminToken = "";
  let parentToken = "";
  let snapshot: PrivacyPolicy[] = [];

  const withoutVitestBypass = async <T>(fn: () => Promise<T>) => {
    process.env.VITEST = "false";
    try {
      return await fn();
    } finally {
      process.env.VITEST = "true";
    }
  };

  const registerBody = (overrides: Record<string, unknown> = {}) => ({
    name: "Privacy Flow Parent",
    email: parentEmail,
    password,
    acceptTerms: true,
    acceptPrivacy: true,
    parentalConsent: true,
    ...overrides,
  });

  beforeAll(async () => {
    process.env.JWT_SECRET =
      process.env.JWT_SECRET ?? "test_secret_at_least_thirty_two_chars_long";

    snapshot = await prisma.privacyPolicy.findMany();
    await prisma.privacyPolicy.deleteMany({});

    const adminHash = await hashPassword("AdminDemo1");
    await prisma.user.upsert({
      where: { email: "admin@littlereaders.test" },
      update: { passwordHash: adminHash, role: "ADMIN", isActive: true },
      create: {
        name: "Demo Admin",
        email: "admin@littlereaders.test",
        passwordHash: adminHash,
        role: "ADMIN",
        isActive: true,
      },
    });
    const adminLogin = await request(app)
      .post("/api/auth/login")
      .send({ email: "admin@littlereaders.test", password: "AdminDemo1" });
    expect(adminLogin.status).toBe(200);
    adminToken = adminLogin.body.data.tokens.accessToken;

    await prisma.user.create({
      data: {
        name: "Existing Parent",
        email: existingParentEmail,
        passwordHash: await hashPassword(password),
        role: "PARENT",
        isActive: true,
      },
    });
  });

  afterAll(async () => {
    await prisma.user.deleteMany({
      where: { email: { in: [parentEmail, existingParentEmail] } },
    });
    await prisma.privacyPolicy.deleteMany({});
    if (snapshot.length) {
      await prisma.privacyPolicy.createMany({ data: snapshot });
    }
  });

  it("blocks registration with 503 while no policy is published", async () => {
    const pub = await request(app).get("/api/privacy/policy");
    expect(pub.status).toBe(200);
    expect(pub.body.data.published).toBe(false);

    const res = await withoutVitestBypass(() =>
      request(app).post("/api/auth/register").send(registerBody())
    );
    expect(res.status).toBe(503);
    expect(res.body.details?.code ?? res.body.code).toBe("PRIVACY_POLICY_UNPUBLISHED");
  });

  it("keeps existing parent login working before publish", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: existingParentEmail, password });
    expect(res.status).toBe(200);
    parentToken = res.body.data.tokens.accessToken;
  });

  it("allows only ADMIN / SUPER_ADMIN to edit the policy", async () => {
    const res = await request(app)
      .put("/api/admin/privacy/policy")
      .set("Authorization", `Bearer ${parentToken}`)
      .send({ title: "Not allowed" });
    expect(res.status).toBe(403);
  });

  it("saves a draft without exposing it publicly", async () => {
    const save = await request(app)
      .put("/api/admin/privacy/policy")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ version, title: "Test Policy", content: "Test policy body" });
    expect(save.status).toBe(200);
    expect(save.body.data.status).toBe("DRAFT");

    const workspace = await request(app)
      .get("/api/admin/privacy/policy")
      .set("Authorization", `Bearer ${adminToken}`);
    expect(workspace.status).toBe(200);
    expect(workspace.body.data.draft.content).toBe("Test policy body");
    expect(workspace.body.data.published).toBeNull();

    const pub = await request(app).get("/api/privacy/policy");
    expect(pub.body.data.published).toBe(false);
    expect(pub.body.data.policy).toBeNull();
  });

  it("refuses to publish until all admin-provided details are present", async () => {
    const res = await request(app)
      .post("/api/admin/privacy/policy/publish")
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(400);
    const missing: string[] = res.body.details?.missing ?? [];
    for (const field of [
      "legal business name",
      "business address",
      "support email",
      "support phone",
      "data retention information",
      "parental consent explanation",
      "child data disclosure",
      "deletion request contact",
    ]) {
      expect(missing).toContain(field);
    }
  });

  it("publishes the completed draft and shows it on the public endpoint", async () => {
    const save = await request(app)
      .put("/api/admin/privacy/policy")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        legalBusinessName: "Test Business",
        businessAddress: "Test Address",
        supportEmail: "privacy-test@example.com",
        supportPhone: "+910000000000",
        dataRetentionInfo: "Test retention",
        parentalConsentExplanation: "Test consent",
        childDataDisclosure: "Test child data",
        deletionRequestContact: "privacy-test@example.com",
      });
    expect(save.status).toBe(200);

    const publish = await request(app)
      .post("/api/admin/privacy/policy/publish")
      .set("Authorization", `Bearer ${adminToken}`);
    expect(publish.status).toBe(200);
    expect(publish.body.data.version).toBe(version);

    const pub = await request(app).get("/api/privacy/policy");
    expect(pub.body.data.published).toBe(true);
    expect(pub.body.data.policy.version).toBe(version);
    expect(pub.body.data.policy.content).toBe("Test policy body");
    expect(pub.body.data.policy.legalBusinessName).toBe("Test Business");
  });

  it("rejects re-publishing an already published version", async () => {
    await request(app)
      .put("/api/admin/privacy/policy")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        version,
        title: "Test Policy",
        content: "Changed body",
        legalBusinessName: "Test Business",
        businessAddress: "Test Address",
        supportEmail: "privacy-test@example.com",
        supportPhone: "+910000000000",
        dataRetentionInfo: "Test retention",
        parentalConsentExplanation: "Test consent",
        childDataDisclosure: "Test child data",
        deletionRequestContact: "privacy-test@example.com",
      });
    const res = await request(app)
      .post("/api/admin/privacy/policy/publish")
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(409);
  });

  it("requires parent consent after publish", async () => {
    const res = await withoutVitestBypass(() =>
      request(app)
        .post("/api/auth/register")
        .send(registerBody({ acceptPrivacy: false, privacyPolicyVersion: version }))
    );
    expect(res.status).toBe(400);
  });

  it("rejects consent against an outdated policy version", async () => {
    const res = await withoutVitestBypass(() =>
      request(app)
        .post("/api/auth/register")
        .send(registerBody({ privacyPolicyVersion: "0.0.1-old" }))
    );
    expect(res.status).toBe(409);
  });

  it("refuses registration when the email has not been verified", async () => {
    const res = await withoutVitestBypass(() =>
      request(app)
        .post("/api/auth/register")
        .send(registerBody({ privacyPolicyVersion: version }))
    );
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("EMAIL_NOT_VERIFIED");
  });

  it("registers a parent and records consent with the published version and timestamp", async () => {
    const before = Date.now();
    await request(app)
      .post("/api/auth/email-otp/send")
      .send({ email: parentEmail, purpose: "REGISTER" });
    const verified = await request(app).post("/api/auth/email-otp/verify").send({
      email: parentEmail,
      purpose: "REGISTER",
      otp: takeTestOtpEmail(parentEmail, "REGISTER"),
    });
    expect(verified.status).toBe(200);
    const res = await withoutVitestBypass(() =>
      request(app)
        .post("/api/auth/register")
        .send(
          registerBody({
            privacyPolicyVersion: version,
            emailVerificationToken: verified.body.data.verificationToken,
          })
        )
    );
    expect(res.status).toBe(201);

    const consents = await prisma.parentalConsent.findMany({
      where: { userId: res.body.data.user.id },
    });
    expect(consents.map((c) => c.consentType).sort()).toEqual([
      "PARENTAL",
      "PRIVACY",
      "TERMS",
    ]);
    for (const c of consents) {
      expect(c.version).toBe(version);
      expect(c.acceptedAt.getTime()).toBeGreaterThanOrEqual(before - 1000);
      expect(c.acceptedAt.getTime()).toBeLessThanOrEqual(Date.now() + 1000);
    }
  });

  it("keeps existing parent login working after publish", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: existingParentEmail, password });
    expect(res.status).toBe(200);
  });
});
