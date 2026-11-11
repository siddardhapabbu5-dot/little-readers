import { describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { prisma } from "../src/lib/prisma.js";
import { takeTestOtpEmail } from "../src/lib/email.js";
import { MAX_FAILED_ATTEMPTS } from "../src/lib/lockout.js";

const app = createApp();
const stamp = Date.now();

async function registerParent(tag: string) {
  const email = `lock_${tag}_${stamp}@test.local`;
  const reg = await request(app).post("/api/auth/register").send({
    name: `Lock ${tag}`,
    email,
    password: "SecurePass1",
    acceptTerms: true,
    acceptPrivacy: true,
    parentalConsent: true,
  });
  expect(reg.status).toBe(201);
  return { email, id: reg.body.data.user.id as string, token: reg.body.data.tokens.accessToken as string };
}

const login = (email: string, password: string) => request(app).post("/api/auth/login").send({ email, password });

describe("T-SEC-04 — password login lockout", () => {
  it("locks the account after repeated wrong passwords, even for the right password", async () => {
    const p = await registerParent("login");
    for (let i = 1; i < MAX_FAILED_ATTEMPTS; i++) {
      expect((await login(p.email, "WrongPass1")).status).toBe(401);
    }
    const locking = await login(p.email, "WrongPass1");
    expect(locking.status).toBe(429);
    expect(locking.body.code).toBe("ACCOUNT_LOCKED");

    const correct = await login(p.email, "SecurePass1");
    expect(correct.status).toBe(429);
    expect(correct.body.code).toBe("ACCOUNT_LOCKED");

    await prisma.user.update({ where: { id: p.id }, data: { loginLockedUntil: new Date(Date.now() - 1000) } });
    expect((await login(p.email, "SecurePass1")).status).toBe(200);
  });

  it("a successful login resets the failure counter", async () => {
    const p = await registerParent("reset");
    for (let i = 1; i < MAX_FAILED_ATTEMPTS; i++) await login(p.email, "WrongPass1");
    expect((await login(p.email, "SecurePass1")).status).toBe(200);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: p.id } })).failedLoginCount).toBe(0);
    expect((await login(p.email, "WrongPass1")).status).toBe(401);
  });

  it("a password reset clears the lock", async () => {
    const p = await registerParent("unlock");
    for (let i = 0; i < MAX_FAILED_ATTEMPTS; i++) await login(p.email, "WrongPass1");
    expect((await login(p.email, "SecurePass1")).status).toBe(429);
    const forgot = await request(app).post("/api/auth/forgot-password").send({ email: p.email, client: "web" });
    const reset = await request(app)
      .post("/api/auth/reset-password")
      .send({ token: forgot.body.data.devResetToken, password: "SecurePass2", confirmPassword: "SecurePass2" });
    expect(reset.status).toBe(200);
    expect((await login(p.email, "SecurePass2")).status).toBe(200);
  });
});

describe("T-SEC-06 — server-side Parent PIN attempts and forgot-PIN", () => {
  const gate = (token: string, path: string, body: Record<string, string>) =>
    request(app).post(`/api/parent/auth/gate/${path}`).set("Authorization", `Bearer ${token}`).send(body);

  it("locks the PIN after repeated wrong entries and resets it with the account password", async () => {
    const p = await registerParent("pin");
    expect((await gate(p.token, "set-pin", { pin: "1234" })).status).toBe(200);

    for (let i = 1; i < MAX_FAILED_ATTEMPTS; i++) {
      const wrong = await gate(p.token, "verify-pin", { pin: "9999" });
      expect(wrong.status).toBe(401);
      expect(wrong.body.code).toBe("PIN_INVALID");
    }
    const locking = await gate(p.token, "verify-pin", { pin: "9999" });
    expect(locking.status).toBe(429);
    expect(locking.body.code).toBe("PIN_LOCKED");
    const stillLocked = await gate(p.token, "verify-pin", { pin: "1234" });
    expect(stillLocked.status).toBe(429);

    const status = await request(app).get("/api/parent/auth/gate/status").set("Authorization", `Bearer ${p.token}`);
    expect(status.body.data.lockedUntil).toBeTruthy();

    const badReset = await gate(p.token, "reset-pin", { password: "NotMyPass1", pin: "4321" });
    expect(badReset.status).toBe(401);
    expect(badReset.body.code).toBe("PASSWORD_INVALID");

    const reset = await gate(p.token, "reset-pin", { password: "SecurePass1", pin: "4321" });
    expect(reset.status).toBe(200);
    expect((await gate(p.token, "verify-pin", { pin: "1234" })).status).toBe(401);
    const ok = await gate(p.token, "verify-pin", { pin: "4321" });
    expect(ok.status).toBe(200);
    expect(ok.body.data.verified).toBe(true);
  });

  it("forgot PIN via an emailed RESET_PIN code; a password-reset code is not accepted", async () => {
    const p = await registerParent("pinmail");
    expect((await gate(p.token, "set-pin", { pin: "1234" })).status).toBe(200);

    const codeFor = async (purpose: "RESET_PIN" | "RESET_PASSWORD") => {
      const sent = await request(app).post("/api/auth/email-otp/send").send({ email: p.email, purpose });
      expect(sent.status, JSON.stringify(sent.body)).toBe(200);
      const otp = takeTestOtpEmail(p.email, purpose);
      expect(otp).toBeTruthy();
      const verified = await request(app).post("/api/auth/email-otp/verify").send({ email: p.email, purpose, otp });
      expect(verified.status).toBe(200);
      return verified.body.data.verificationToken as string;
    };

    const wrongPurpose = await gate(p.token, "reset-pin", { pin: "5678", verificationToken: await codeFor("RESET_PASSWORD") });
    expect(wrongPurpose.status).toBe(400);
    expect(wrongPurpose.body.code).toBe("EMAIL_NOT_VERIFIED");

    const token = await codeFor("RESET_PIN");
    expect((await gate(p.token, "reset-pin", { pin: "5678", verificationToken: token })).status).toBe(200);
    expect((await gate(p.token, "verify-pin", { pin: "5678" })).status).toBe(200);
    const reused = await gate(p.token, "reset-pin", { pin: "1111", verificationToken: token });
    expect(reused.status).toBe(400);
  });
});
