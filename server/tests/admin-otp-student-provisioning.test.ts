import { beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { prisma } from "../src/lib/prisma.js";
import { takeTestOtpEmail } from "../src/lib/email.js";
import { env } from "../src/config/env.js";
import { hashPassword, verifyLoginPassword } from "../src/lib/password.js";
import { isAdminDirectSponsorEmail } from "../src/student-auth/admin-direct-sponsor.js";

const app = createApp();
const hasDb = Boolean(process.env.DATABASE_URL);
const TAG = `otpprov_${Date.now()}`;
const INSTALL = `install_${TAG}_abcdefghijklmnop`;

describe.skipIf(!hasDb)("Admin OTP Grade 1 student provisioning + login fix", () => {
  let adminToken = "";
  let parentToken = "";
  let level1Id = "";
  let level2Id = "";
  const mailbox = () => env.ADMIN_SHARED_STUDENT_OTP_EMAIL.trim().toLowerCase();

  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });

  /** Clear cooldown + hourly send budget for this Admin mailbox purpose. */
  const resetAdminOtpBudget = async () => {
    await prisma.emailOtp.deleteMany({
      where: { purpose: "ADMIN_SHARED_STUDENT_CREATE" },
    });
  };

  const ageLatestAdminOtp = async () => {
    await prisma.emailOtp.updateMany({
      where: { purpose: "ADMIN_SHARED_STUDENT_CREATE" },
      data: { createdAt: new Date(Date.now() - 61_000) },
    });
  };

  const sendOtp = (token: string) =>
    request(app)
      .post("/api/student/auth/admin/shared-email-otp/send")
      .set(auth(token))
      .send({});

  const verifyOtp = (token: string, otp: string) =>
    request(app)
      .post("/api/student/auth/admin/shared-email-otp/verify")
      .set(auth(token))
      .send({ otp });

  const createStudent = (
    token: string,
    body: Record<string, unknown>
  ) =>
    request(app)
      .post("/api/student/auth/admin/shared-email-otp/children")
      .set(auth(token))
      .send(body);

  beforeAll(async () => {
    process.env.JWT_SECRET =
      process.env.JWT_SECRET ?? "dev_only_change_me_to_a_long_random_secret_value";

    const [l1, l2] = await Promise.all([
      prisma.learningLevel.findUniqueOrThrow({ where: { code: "LEVEL_1" } }),
      prisma.learningLevel.findUniqueOrThrow({ where: { code: "LEVEL_2" } }),
    ]);
    level1Id = l1.id;
    level2Id = l2.id;

    const adminLogin = await request(app).post("/api/auth/login").send({
      email: "admin@littlereaders.test",
      password: "AdminDemo1",
    });
    expect(adminLogin.status).toBe(200);
    adminToken = adminLogin.body.data.tokens.accessToken;

    const parentEmail = `${TAG}_parent@example.com`;
    await prisma.user.create({
      data: {
        name: "OTP Prov Parent",
        email: parentEmail,
        passwordHash: await hashPassword("ParentPass1"),
        role: "PARENT",
        isActive: true,
      },
    });
    const parentLogin = await request(app)
      .post("/api/auth/login")
      .send({ email: parentEmail, password: "ParentPass1" });
    expect(parentLogin.status).toBe(200);
    parentToken = parentLogin.body.data.tokens.accessToken;
  });

  it("1–2. OTP send/verify; rejects invalid, expired, reused, excessive attempts", async () => {
    await resetAdminOtpBudget();
    const unauth = await sendOtp("not-a-token");
    expect(unauth.status).toBe(401);

    const sent = await sendOtp(adminToken);
    expect(sent.status).toBe(200);
    expect(JSON.stringify(sent.body)).not.toMatch(/\b\d{6}\b/);
    expect(sent.body.data.destinationHint).toBeTruthy();
    const otp = takeTestOtpEmail(mailbox(), "ADMIN_SHARED_STUDENT_CREATE")!;
    expect(otp).toMatch(/^\d{6}$/);

    const bad = await verifyOtp(adminToken, otp === "000000" ? "111111" : "000000");
    expect(bad.status).toBe(401);
    expect(bad.body.code).toBe("OTP_INVALID");

    const ok = await verifyOtp(adminToken, otp);
    expect(ok.status).toBe(200);
    expect(ok.body.data.verificationToken).toMatch(/^[a-f0-9]{64}$/);
    const token1 = ok.body.data.verificationToken as string;

    const reusedOtp = await verifyOtp(adminToken, otp);
    expect([400, 401]).toContain(reusedOtp.status);

    // Expire a fresh OTP
    await ageLatestAdminOtp();
    const sent2 = await sendOtp(adminToken);
    expect(sent2.status).toBe(200);
    const otp2 = takeTestOtpEmail(mailbox(), "ADMIN_SHARED_STUDENT_CREATE")!;
    await prisma.emailOtp.updateMany({
      where: { purpose: "ADMIN_SHARED_STUDENT_CREATE", consumedAt: null },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    const expired = await verifyOtp(adminToken, otp2);
    expect(expired.status).toBe(400);
    expect(expired.body.code).toBe("OTP_EXPIRED");

    // Max attempts
    await ageLatestAdminOtp();
    const sent3 = await sendOtp(adminToken);
    expect(sent3.status).toBe(200);
    const otp3 = takeTestOtpEmail(mailbox(), "ADMIN_SHARED_STUDENT_CREATE")!;
    const wrong = otp3 === "000000" ? "111111" : "000000";
    let last = 0;
    for (let i = 0; i < 6; i++) {
      const r = await verifyOtp(adminToken, wrong);
      last = r.status;
      if (r.body.code === "OTP_MAX_ATTEMPTS") break;
    }
    expect([400, 401]).toContain(last);

    // token1 still single-use for create later — consume path covered in create tests
    expect(token1.length).toBeGreaterThan(20);
  });

  it("3. Only authorized Admin can complete provisioning", async () => {
    await resetAdminOtpBudget();
    const parentSend = await sendOtp(parentToken);
    expect(parentSend.status).toBe(403);

    const forged = await createStudent(adminToken, {
      verificationToken: "f".repeat(64),
      displayName: "Forged",
      birthYear: 2018,
      levelId: level1Id,
      level: "LEVEL_1",
    });
    expect(forged.status).toBe(400);
    expect(forged.body.code).toBe("EMAIL_NOT_VERIFIED");
  });

  it("4–6, 9–10. Multiple creates, editable SID, uniqueness, no seat, Grade 2 locked", async () => {
    async function provision(preferred?: string) {
      await resetAdminOtpBudget();
      const sent = await sendOtp(adminToken);
      expect(sent.status).toBe(200);
      const otp = takeTestOtpEmail(mailbox(), "ADMIN_SHARED_STUDENT_CREATE")!;
      const ver = await verifyOtp(adminToken, otp);
      expect(ver.status).toBe(200);
      const body: Record<string, unknown> = {
        verificationToken: ver.body.data.verificationToken,
        displayName: `Kid ${preferred ?? "auto"} ${TAG}`.slice(0, 50),
        birthYear: 2018,
        levelId: level1Id,
        level: "LEVEL_1",
      };
      if (preferred) body.preferredStudentLoginId = preferred;
      const created = await createStudent(adminToken, body);
      return created;
    }

    const a = await provision(`ARJ${TAG.slice(-5)}`.slice(0, 12));
    expect(a.status).toBe(201);
    expect(a.body.data.credentials.studentLoginId).toBeTruthy();
    expect(a.body.data.credentials.temporaryPassword).toBeTruthy();
    expect(a.body.data.credentials.mustChangePassword).toBe(true);
    expect(a.body.data.child.hasLearningSeat).toBe(false);
    expect(a.body.data.accountCreationMethod).toBe("ADMIN_SHARED_EMAIL_OTP");
    expect(JSON.stringify(a.body)).not.toMatch(/littlereaders\.otp@gmail\.com/i);

    const childA = await prisma.child.findUniqueOrThrow({
      where: { id: a.body.data.child.id },
      include: { parent: { select: { email: true } } },
    });
    expect(isAdminDirectSponsorEmail(childA.parent.email)).toBe(true);
    expect(childA.hasLearningSeat).toBe(false);

    const sidA = a.body.data.credentials.studentLoginId as string;
    const dup = await provision(sidA);
    expect(dup.status).toBe(409);
    expect(dup.body.code).toBe("STUDENT_ID_TAKEN");
    expect(dup.body.details?.suggestions?.length ?? 0).toBeGreaterThan(0);

    const b = await provision(`RIY${TAG.slice(-5)}`.slice(0, 12));
    expect(b.status).toBe(201);
    expect(b.body.data.credentials.studentLoginId).not.toBe(sidA);

    const g2 = await (async () => {
      await resetAdminOtpBudget();
      const sent = await sendOtp(adminToken);
      expect(sent.status).toBe(200);
      const otp = takeTestOtpEmail(mailbox(), "ADMIN_SHARED_STUDENT_CREATE")!;
      const ver = await verifyOtp(adminToken, otp);
      expect(ver.status).toBe(200);
      return createStudent(adminToken, {
        verificationToken: ver.body.data.verificationToken,
        displayName: `G2 ${TAG}`.slice(0, 50),
        birthYear: 2018,
        levelId: level2Id,
        level: "LEVEL_2",
      });
    })();
    expect(g2.status).toBe(400);
    expect(g2.body.code).toBe("GRADE_LOCKED");
  });

  it("5, 7–8. Suggest ID, rename after create, login with updated ID", async () => {
    const suggest = await request(app)
      .post("/api/student/auth/admin/suggest-student-login-id")
      .set(auth(adminToken))
      .send({});
    expect(suggest.status).toBe(200);
    expect(suggest.body.data.studentLoginId).toMatch(/^LW[A-Z0-9]{8}$/);

    await resetAdminOtpBudget();
    const sent = await sendOtp(adminToken);
    expect(sent.status).toBe(200);
    const otp = takeTestOtpEmail(mailbox(), "ADMIN_SHARED_STUDENT_CREATE")!;
    const ver = await verifyOtp(adminToken, otp);
    expect(ver.status).toBe(200);
    const preferred = `SAM${TAG.slice(-6)}`.slice(0, 12);
    const created = await createStudent(adminToken, {
      verificationToken: ver.body.data.verificationToken,
      displayName: `Rename ${TAG}`.slice(0, 50),
      birthYear: 2018,
      levelId: level1Id,
      level: "LEVEL_1",
      preferredStudentLoginId: preferred,
    });
    expect(created.status).toBe(201);
    const childId = created.body.data.credentials.childId as string;
    const tempPw = created.body.data.credentials.temporaryPassword as string;
    const oldSid = created.body.data.credentials.studentLoginId as string;
    const passwordHashBefore = (
      await prisma.childStudentCredential.findUniqueOrThrow({ where: { childId } })
    ).passwordHash;

    const newSid = `NEW${TAG.slice(-6)}`.slice(0, 12);
    const renamed = await request(app)
      .patch(`/api/student/auth/admin/children/${childId}/student-login-id`)
      .set(auth(adminToken))
      .send({ studentLoginId: newSid });
    expect(renamed.status).toBe(200);
    expect(renamed.body.data.studentLoginId).toBe(newSid.toUpperCase());
    expect(renamed.body.data.previousStudentLoginId).toBe(oldSid);

    const after = await prisma.childStudentCredential.findUniqueOrThrow({
      where: { childId },
    });
    expect(after.passwordHash).toBe(passwordHashBefore);
    expect(after.studentLoginId).toBe(newSid.toUpperCase());

    const lookup = await request(app)
      .get(`/api/student/auth/admin/by-student-login-id/${newSid}`)
      .set(auth(adminToken));
    expect(lookup.status).toBe(200);
    expect(lookup.body.data.childId).toBe(childId);

    const oldLogin = await request(app).post("/api/student/auth/login").send({
      studentLoginId: oldSid,
      password: tempPw,
      installationId: INSTALL + "old",
      platform: "android",
    });
    expect(oldLogin.status).toBe(401);

    const newLogin = await request(app).post("/api/student/auth/login").send({
      studentLoginId: newSid,
      password: tempPw,
      installationId: INSTALL + "new",
      platform: "android",
    });
    expect(newLogin.status).toBe(200);
    expect(newLogin.body.data.student.childId).toBe(childId);
  });

  it("11–12. Temporary password change then login with new password + student /me", async () => {
    await resetAdminOtpBudget();
    const sent = await sendOtp(adminToken);
    expect(sent.status).toBe(200);
    const otp = takeTestOtpEmail(mailbox(), "ADMIN_SHARED_STUDENT_CREATE")!;
    const ver = await verifyOtp(adminToken, otp);
    expect(ver.status).toBe(200);
    const sid = `PW${TAG.slice(-7)}`.slice(0, 12);
    const created = await createStudent(adminToken, {
      verificationToken: ver.body.data.verificationToken,
      displayName: `PwChange ${TAG}`.slice(0, 50),
      birthYear: 2018,
      levelId: level1Id,
      level: "LEVEL_1",
      preferredStudentLoginId: sid,
    });
    expect(created.status).toBe(201);
    const tempPw = created.body.data.credentials.temporaryPassword as string;
    const studentLoginId = created.body.data.credentials.studentLoginId as string;

    const login1 = await request(app).post("/api/student/auth/login").send({
      studentLoginId,
      password: tempPw,
      installationId: INSTALL + "pw1",
      platform: "android",
    });
    expect(login1.status).toBe(200);
    expect(login1.body.data.student.mustChangePassword).toBe(true);
    const studentToken = login1.body.data.tokens.accessToken as string;

    // AuthGate bug repro: /auth/me must reject student JWT
    const wrongMe = await request(app)
      .get("/api/auth/me")
      .set(auth(studentToken));
    expect(wrongMe.status).toBe(401);

    const rightMe = await request(app)
      .get("/api/student/auth/me")
      .set(auth(studentToken));
    expect(rightMe.status).toBe(200);
    expect(rightMe.body.data.principal).toBe("CHILD");

    const newPassword = "NewStudent9";
    const change = await request(app)
      .post("/api/student/auth/change-password")
      .set(auth(studentToken))
      .send({
        currentPassword: tempPw,
        newPassword,
        confirmPassword: newPassword,
      });
    expect(change.status).toBe(200);
    expect(change.body.data.mustReLogin).toBe(true);

    const cred = await prisma.childStudentCredential.findFirstOrThrow({
      where: { studentLoginId },
    });
    expect(cred.mustChangePassword).toBe(false);
    expect(await verifyLoginPassword(newPassword, cred.passwordHash)).toBe(true);
    expect(await verifyLoginPassword(tempPw, cred.passwordHash)).toBe(false);

    const staleMe = await request(app)
      .get("/api/student/auth/me")
      .set(auth(studentToken));
    expect(staleMe.status).toBe(401);

    const login2 = await request(app).post("/api/student/auth/login").send({
      studentLoginId,
      password: newPassword,
      installationId: INSTALL + "pw2",
      platform: "android",
    });
    expect(login2.status).toBe(200);
    expect(login2.body.data.student.mustChangePassword).toBe(false);
    const token2 = login2.body.data.tokens.accessToken as string;
    const me2 = await request(app).get("/api/student/auth/me").set(auth(token2));
    expect(me2.status).toBe(200);
  });

  it("13–14. Existing Parent and Admin email+password login still work", async () => {
    const parent = await request(app).post("/api/auth/login").send({
      email: `${TAG}_parent@example.com`,
      password: "ParentPass1",
    });
    expect(parent.status).toBe(200);
    expect(parent.body.data.user.role).toBe("PARENT");

    const admin = await request(app).post("/api/auth/login").send({
      email: "admin@littlereaders.test",
      password: "AdminDemo1",
    });
    expect(admin.status).toBe(200);
    expect(["ADMIN", "SUPER_ADMIN"]).toContain(admin.body.data.user.role);
  });

  it("regression: PRAMEELA-style Student ID + no parentId (VC31 validation failure)", async () => {
    // Unique each run so TEST_DB_SKIP_RESET reuses do not collide on STUDENT_ID_TAKEN.
    const preferred = `PRAM${TAG.slice(-6)}`.replace(/[^A-Za-z0-9]/g, "").slice(0, 12).toUpperCase();
    expect(preferred.length).toBeGreaterThanOrEqual(3);

    // Missing displayName → fieldErrors surfaced (not a bare silent failure).
    const bad = await createStudent(adminToken, {
      verificationToken: "a".repeat(64),
      birthYear: 2015,
      levelId: level1Id,
      level: "LEVEL_1",
      preferredStudentLoginId: preferred,
    });
    expect(bad.status).toBe(400);
    expect(bad.body.code).toBe("VALIDATION_FAILED");
    expect(bad.body.error).toBe("Validation failed");
    expect(bad.body.details?.issues?.fieldErrors?.displayName?.length).toBeGreaterThan(0);
    // Must NOT require parentId on the current OTP sponsor schema.
    expect(bad.body.details?.issues?.fieldErrors?.parentId).toBeUndefined();

    await resetAdminOtpBudget();
    const sent = await sendOtp(adminToken);
    expect(sent.status).toBe(200);
    const otp = takeTestOtpEmail(mailbox(), "ADMIN_SHARED_STUDENT_CREATE")!;
    const ver = await verifyOtp(adminToken, otp);
    expect(ver.status).toBe(200);

    const created = await createStudent(adminToken, {
      verificationToken: ver.body.data.verificationToken,
      displayName: "Prameela",
      birthYear: 2015,
      levelId: level1Id,
      level: "LEVEL_1",
      preferredStudentLoginId: preferred,
      // intentionally omit parentId — VC31 client contract
    });
    expect(created.status).toBe(201);
    expect(created.body.data.credentials.studentLoginId).toBe(preferred);
    expect(created.body.data.child.hasLearningSeat).toBe(false);
    expect(created.body.data.accountCreationMethod).toBe("ADMIN_SHARED_EMAIL_OTP");
  });
});
