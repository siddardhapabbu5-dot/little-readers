import { describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { prisma } from "../src/lib/prisma.js";
import { takeTestOtpEmail } from "../src/lib/email.js";

const app = createApp();
const hasDb = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDb)("Email OTP — registration + forgot password", () => {
  const stamp = Date.now();
  const regEmail = `emailotp_reg_${stamp}@example.com`;
  const password = "SecurePass1";
  const newPassword = "NewSecure22";

  const send = (email: string, purpose: "REGISTER" | "RESET_PASSWORD") =>
    request(app).post("/api/auth/email-otp/send").send({ email, purpose });
  const verify = (email: string, purpose: "REGISTER" | "RESET_PASSWORD", otp: string) =>
    request(app).post("/api/auth/email-otp/verify").send({ email, purpose, otp });
  /** Lets the next send skip the 60s cooldown. */
  const ageLatestCode = (email: string) =>
    prisma.emailOtp.updateMany({
      where: { email },
      data: { createdAt: new Date(Date.now() - 61_000) },
    });
  const wrong = (otp: string) => (otp === "000000" ? "111111" : "000000");

  const registerBody = (token?: string) => ({
    name: "Email OTP Parent",
    email: regEmail,
    password,
    acceptTerms: true,
    acceptPrivacy: true,
    parentalConsent: true,
    ...(token ? { emailVerificationToken: token } : {}),
  });

  it("rejects an incorrect code, then registers with a valid code and no mobile", async () => {
    const sent = await send(regEmail, "REGISTER");
    expect(sent.status).toBe(200);
    expect(JSON.stringify(sent.body)).not.toMatch(/\b\d{6}\b/);
    const otp = takeTestOtpEmail(regEmail, "REGISTER")!;
    expect(otp).toMatch(/^\d{6}$/);

    const bad = await verify(regEmail, "REGISTER", wrong(otp));
    expect(bad.status).toBe(401);
    expect(bad.body.code).toBe("OTP_INVALID");

    const forged = await request(app)
      .post("/api/auth/register")
      .send(registerBody("f".repeat(64)));
    expect(forged.status).toBe(400);
    expect(forged.body.code).toBe("EMAIL_NOT_VERIFIED");

    const ok = await verify(regEmail, "REGISTER", otp);
    expect(ok.status).toBe(200);
    const token = ok.body.data.verificationToken as string;

    const reused = await verify(regEmail, "REGISTER", otp);
    expect(reused.status).toBe(400);

    const row = await prisma.emailOtp.findFirst({ where: { email: regEmail } });
    expect(row?.otpHash).not.toContain(otp);

    const reg = await request(app).post("/api/auth/register").send(registerBody(token));
    expect(reg.status).toBe(201);
    expect(reg.body.data.user.role).toBe("PARENT");

    const again = await send(regEmail, "REGISTER");
    expect(again.status).toBe(409);
  });

  it("enforces resend cooldown, invalidates the old code, and expires codes", async () => {
    const email = `emailotp_resend_${stamp}@example.com`;
    await send(email, "REGISTER");
    const first = takeTestOtpEmail(email, "REGISTER")!;

    const tooSoon = await send(email, "REGISTER");
    expect(tooSoon.status).toBe(429);
    expect(tooSoon.body.code).toBe("OTP_RESEND_COOLDOWN");

    await ageLatestCode(email);
    expect((await send(email, "REGISTER")).status).toBe(200);
    const second = takeTestOtpEmail(email, "REGISTER")!;

    if (first !== second) {
      expect((await verify(email, "REGISTER", first)).status).toBe(401);
    }

    await prisma.emailOtp.updateMany({
      where: { email, invalidatedAt: null },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    const expired = await verify(email, "REGISTER", second);
    expect(expired.status).toBe(400);
    expect(expired.body.code).toBe("OTP_EXPIRED");
  });

  it("locks a code after five incorrect attempts", async () => {
    const email = `emailotp_brute_${stamp}@example.com`;
    await send(email, "REGISTER");
    const otp = takeTestOtpEmail(email, "REGISTER")!;
    for (let i = 0; i < 4; i++) {
      expect((await verify(email, "REGISTER", wrong(otp))).status).toBe(401);
    }
    const fifth = await verify(email, "REGISTER", wrong(otp));
    expect(fifth.body.code).toBe("OTP_MAX_ATTEMPTS");
    expect((await verify(email, "REGISTER", otp)).status).toBe(400);
  });

  it("resets a password with a valid code and logs in with the new password", async () => {
    const unknown = await send(`nobody_${stamp}@example.com`, "RESET_PASSWORD");
    const known = await send(regEmail, "RESET_PASSWORD");
    expect(unknown.status).toBe(200);
    expect(known.status).toBe(200);
    expect(unknown.body.data.message).toBe(known.body.data.message);
    const otp = takeTestOtpEmail(regEmail, "RESET_PASSWORD")!;

    const bad = await verify(regEmail, "RESET_PASSWORD", wrong(otp));
    expect(bad.status).toBe(401);

    const noToken = await request(app).post("/api/auth/reset-password-otp").send({
      email: regEmail,
      verificationToken: "a".repeat(64),
      password: newPassword,
      confirmPassword: newPassword,
    });
    expect(noToken.status).toBe(400);

    const ok = await verify(regEmail, "RESET_PASSWORD", otp);
    expect(ok.status).toBe(200);
    const reset = await request(app).post("/api/auth/reset-password-otp").send({
      email: regEmail,
      verificationToken: ok.body.data.verificationToken,
      password: newPassword,
      confirmPassword: newPassword,
    });
    expect(reset.status).toBe(200);

    const oldLogin = await request(app)
      .post("/api/auth/login")
      .send({ email: regEmail, password });
    expect(oldLogin.status).toBe(401);

    const login = await request(app)
      .post("/api/auth/login")
      .send({ email: regEmail, password: newPassword });
    expect(login.status).toBe(200);
  });

  it("gives mobile parents a one-device session on email login (no SMS OTP)", async () => {
    const deviceA = `device-a-${stamp}-xxxxxxxx`;
    const deviceB = `device-b-${stamp}-xxxxxxxx`;
    const a = await request(app)
      .post("/api/auth/login")
      .send({ email: regEmail, password: newPassword, deviceId: deviceA, platform: "android" });
    expect(a.status).toBe(200);
    expect(a.body.data.tokens.refreshToken).toBeTruthy();

    const b = await request(app)
      .post("/api/auth/login")
      .send({ email: regEmail, password: newPassword, deviceId: deviceB, platform: "android" });
    expect(b.status).toBe(200);

    const meA = await request(app)
      .get("/api/auth/me")
      .set("Authorization", `Bearer ${a.body.data.tokens.accessToken}`);
    expect(meA.status).toBe(401);
    expect(meA.body.code).toBe("SESSION_REVOKED");
  });
});
