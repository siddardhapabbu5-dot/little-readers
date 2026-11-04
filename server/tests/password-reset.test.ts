import { beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";

const app = createApp();
const hasDb = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDb)("Password reset API", () => {
  const unique = Date.now();
  const email = `reset_${unique}@example.com`;
  const password = "SecurePass1";
  const nextPassword = "SecurePass2";

  beforeAll(() => {
    process.env.JWT_SECRET =
      process.env.JWT_SECRET ?? "test_secret_at_least_thirty_two_chars_long";
  });

  it("registers a parent for reset tests", async () => {
    const res = await request(app).post("/api/auth/register").send({
      name: "Reset Parent",
      email,
      password,
      acceptTerms: true,
      acceptPrivacy: true,
      parentalConsent: true,
    });
    expect(res.status).toBe(201);
  });

  it("does not claim success for unknown emails", async () => {
    const res = await request(app).post("/api/auth/forgot-password").send({
      email: `missing_${unique}@example.com`,
      client: "web",
    });
    expect(res.status).toBe(200);
    expect(res.body.data.accepted).toBe(false);
    expect(res.body.data.message).toMatch(/no account matched/i);
  });

  it("creates a token and returns it in test mode when email exists", async () => {
    const res = await request(app).post("/api/auth/forgot-password").send({
      email,
      client: "mobile",
    });
    expect(res.status).toBe(200);
    expect(res.body.data.accepted).toBe(true);
    expect(res.body.data.devResetToken).toBeTruthy();
  });

  it("rejects mismatched confirm password", async () => {
    const forgot = await request(app).post("/api/auth/forgot-password").send({
      email,
      client: "web",
    });
    const token = forgot.body.data.devResetToken as string;
    const res = await request(app).post("/api/auth/reset-password").send({
      token,
      password: nextPassword,
      confirmPassword: "Different1",
    });
    expect(res.status).toBe(400);
  });

  it("resets password with a valid token then allows login", async () => {
    const forgot = await request(app).post("/api/auth/forgot-password").send({
      email,
      client: "web",
    });
    const token = forgot.body.data.devResetToken as string;
    expect(token).toBeTruthy();

    const reset = await request(app).post("/api/auth/reset-password").send({
      token,
      password: nextPassword,
      confirmPassword: nextPassword,
    });
    expect(reset.status).toBe(200);

    const oldLogin = await request(app).post("/api/auth/login").send({
      email,
      password,
    });
    expect(oldLogin.status).toBe(401);

    const newLogin = await request(app).post("/api/auth/login").send({
      email,
      password: nextPassword,
    });
    expect(newLogin.status).toBe(200);
  });

  it("rejects reused tokens", async () => {
    const forgot = await request(app).post("/api/auth/forgot-password").send({
      email,
      client: "web",
    });
    const token = forgot.body.data.devResetToken as string;
    await request(app).post("/api/auth/reset-password").send({
      token,
      password: "SecurePass3",
      confirmPassword: "SecurePass3",
    });
    const again = await request(app).post("/api/auth/reset-password").send({
      token,
      password: "SecurePass4",
      confirmPassword: "SecurePass4",
    });
    expect(again.status).toBe(400);
  });
});
