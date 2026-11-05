import { beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { prisma } from "../src/lib/prisma.js";
import { hashPassword } from "../src/lib/password.js";

const app = createApp();
const hasDb = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDb)("Admin password reset (account recovery)", () => {
  const unique = Date.now();
  const email = `admin_reset_${unique}@example.com`;
  const oldPassword = "AdminOldPass1!";
  const weakPassword = "short1";
  const strongPassword = "AdminNewPass1!";
  let adminId = "";

  beforeAll(async () => {
    process.env.JWT_SECRET =
      process.env.JWT_SECRET ?? "test_secret_at_least_thirty_two_chars_long";
    const passwordHash = await hashPassword(oldPassword);
    const admin = await prisma.user.create({
      data: {
        name: "Reset Admin",
        email,
        passwordHash,
        role: "ADMIN",
        isActive: true,
      },
    });
    adminId = admin.id;
  });

  async function forgot() {
    return request(app).post("/api/admin/auth/forgot-password").send({
      email,
      client: "web",
    });
  }

  it("1) valid Admin email returns generic message + test token", async () => {
    const res = await forgot();
    expect(res.status).toBe(200);
    expect(res.body.data.message).toMatch(/if an admin account exists/i);
    expect(res.body.data.devResetToken).toBeTruthy();
  });

  it("2) unknown Admin email returns same generic message (no enumeration)", async () => {
    const res = await request(app).post("/api/admin/auth/forgot-password").send({
      email: `missing_admin_${unique}@example.com`,
      client: "web",
    });
    expect(res.status).toBe(200);
    expect(res.body.data.message).toMatch(/if an admin account exists/i);
    expect(res.body.data.devResetToken).toBeFalsy();
  });

  it("3) expired reset token rejected", async () => {
    const res = await forgot();
    const token = res.body.data.devResetToken as string;
    await prisma.adminPasswordResetToken.updateMany({
      where: { adminId },
      data: { expiresAt: new Date(Date.now() - 60_000) },
    });
    const reset = await request(app).post("/api/admin/auth/reset-password").send({
      token,
      password: strongPassword,
      confirmPassword: strongPassword,
    });
    expect(reset.status).toBe(400);
  });

  it("4) reused reset token rejected", async () => {
    const res = await forgot();
    const token = res.body.data.devResetToken as string;
    const first = await request(app).post("/api/admin/auth/reset-password").send({
      token,
      password: strongPassword,
      confirmPassword: strongPassword,
    });
    expect(first.status).toBe(200);

    // Restore old password for later tests via a fresh hash
    await prisma.user.update({
      where: { id: adminId },
      data: {
        passwordHash: await hashPassword(oldPassword),
        passwordChangedAt: null,
      },
    });

    const again = await request(app).post("/api/admin/auth/reset-password").send({
      token,
      password: "AdminReusePass1!",
      confirmPassword: "AdminReusePass1!",
    });
    expect(again.status).toBe(400);
  });

  it("5) invalid reset token rejected", async () => {
    const res = await request(app).post("/api/admin/auth/reset-password").send({
      token: "a".repeat(40),
      password: strongPassword,
      confirmPassword: strongPassword,
    });
    expect(res.status).toBe(400);
  });

  it("6) password mismatch rejected", async () => {
    const res = await forgot();
    const token = res.body.data.devResetToken as string;
    const reset = await request(app).post("/api/admin/auth/reset-password").send({
      token,
      password: strongPassword,
      confirmPassword: "DifferentPass1!",
    });
    expect(reset.status).toBe(400);
  });

  it("7) weak password rejected", async () => {
    const res = await forgot();
    const token = res.body.data.devResetToken as string;
    const reset = await request(app).post("/api/admin/auth/reset-password").send({
      token,
      password: weakPassword,
      confirmPassword: weakPassword,
    });
    expect(reset.status).toBe(400);
  });

  it("8–11) successful reset; old rejected; new accepted; prior sessions revoked", async () => {
    const loginOld = await request(app).post("/api/auth/login").send({
      email,
      password: oldPassword,
    });
    expect(loginOld.status).toBe(200);
    const oldToken = loginOld.body.data.tokens.accessToken as string;

    const meBefore = await request(app)
      .get("/api/auth/me")
      .set("Authorization", `Bearer ${oldToken}`);
    expect(meBefore.status).toBe(200);

    const forgotRes = await forgot();
    const token = forgotRes.body.data.devResetToken as string;
    const reset = await request(app).post("/api/admin/auth/reset-password").send({
      token,
      password: strongPassword,
      confirmPassword: strongPassword,
    });
    expect(reset.status).toBe(200);

    const oldLogin = await request(app).post("/api/auth/login").send({
      email,
      password: oldPassword,
    });
    expect(oldLogin.status).toBe(401);

    const newLogin = await request(app).post("/api/auth/login").send({
      email,
      password: strongPassword,
    });
    expect(newLogin.status).toBe(200);

    const meAfter = await request(app)
      .get("/api/auth/me")
      .set("Authorization", `Bearer ${oldToken}`);
    expect(meAfter.status).toBe(401);
    expect(meAfter.body.code ?? meAfter.body.details?.code).toBe(
      "SESSION_REVOKED"
    );
  });

  it("12) Parent OTP login still works", async () => {
    const mobileLocal = `90${String(unique).slice(-8)}`;
    const mobileE164 = `+91${mobileLocal}`;
    await prisma.user.create({
      data: {
        name: "OTP Parent Recovery Check",
        email: `otp_parent_recovery_${unique}@example.com`,
        passwordHash: await hashPassword("ParentPass1"),
        role: "PARENT",
        isActive: true,
        mobileE164,
      },
    });

    process.env.OTP_DEV_MODE = "1";
    const send = await request(app).post("/api/parent/auth/send-otp").send({
      mobile: mobileLocal,
      countryCode: "+91",
    });
    expect(send.status).toBe(200);
    const otp = send.body.data.devOtp as string;
    expect(otp).toMatch(/^\d{6}$/);

    const verify = await request(app)
      .post("/api/parent/auth/verify-otp")
      .send({
        mobile: mobileLocal,
        otp,
        deviceId: `recovery_dev_${unique}_abcdefghij`,
        platform: "ios",
      });
    expect(verify.status).toBe(200);
    expect(verify.body.data.tokens.accessToken).toBeTruthy();
  });
});
