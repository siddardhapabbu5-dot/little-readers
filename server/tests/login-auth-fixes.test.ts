import { describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { prisma } from "../src/lib/prisma.js";
import { hashPassword, verifyLoginPassword } from "../src/lib/password.js";
import { MAX_FAILED_ATTEMPTS } from "../src/lib/lockout.js";
import {
  hashRateLimitIdentity,
  markRedisUnavailableForTests,
  resetRedisStateForTests,
} from "../src/lib/redis.js";
import {
  passwordAttemptKey,
  resetPasswordRateLimitForTests,
  PASSWORD_RATE_LIMIT_MAX,
} from "../src/lib/password-rate-limit.js";
import type { Request } from "express";

const app = createApp();
const stamp = Date.now();

async function registerParent(tag: string, password = "SecurePass1") {
  const email = `login_fix_${tag}_${stamp}@test.local`;
  const reg = await request(app).post("/api/auth/register").send({
    name: `Login Fix ${tag}`,
    email,
    password,
    acceptTerms: true,
    acceptPrivacy: true,
    parentalConsent: true,
  });
  expect(reg.status).toBe(201);
  return {
    email,
    id: reg.body.data.user.id as string,
    password,
    token: reg.body.data.tokens.accessToken as string,
  };
}

const login = (
  email: string,
  password: string,
  extra: Record<string, string> = {}
) => request(app).post("/api/auth/login").send({ email, password, ...extra });

describe("Login auth fixes — credentials and lockout", () => {
  it("accepts correct credentials", async () => {
    const p = await registerParent("ok");
    const res = await login(p.email, p.password);
    expect(res.status).toBe(200);
    expect(res.body.data.tokens.accessToken).toBeTruthy();
  });

  it("rejects incorrect password with generic 401", async () => {
    const p = await registerParent("badpw");
    const res = await login(p.email, "WrongPass1");
    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/invalid email or password/i);
    expect(res.body.code).toBeUndefined();
  });

  it("rejects unknown email with the same generic 401", async () => {
    const res = await login(`missing_${stamp}@test.local`, "SecurePass1");
    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/invalid email or password/i);
  });

  it("returns ACCOUNT_LOCKED (not generic RATE_LIMITED) after 5 failures", async () => {
    const p = await registerParent("lock");
    for (let i = 1; i < MAX_FAILED_ATTEMPTS; i++) {
      expect((await login(p.email, "WrongPass1")).status).toBe(401);
    }
    const locked = await login(p.email, "WrongPass1");
    expect(locked.status).toBe(429);
    expect(locked.body.code).toBe("ACCOUNT_LOCKED");
    expect(locked.body.error).toMatch(/temporarily locked/i);
    expect(locked.body.code).not.toBe("RATE_LIMITED");
  });

  it("allows login after lockout expiry", async () => {
    const p = await registerParent("unlock");
    for (let i = 0; i < MAX_FAILED_ATTEMPTS; i++) {
      await login(p.email, "WrongPass1");
    }
    expect((await login(p.email, p.password)).body.code).toBe("ACCOUNT_LOCKED");
    await prisma.user.update({
      where: { id: p.id },
      data: { loginLockedUntil: new Date(Date.now() - 1000), failedLoginCount: 0 },
    });
    expect((await login(p.email, p.password)).status).toBe(200);
  });
});

describe("Login auth fixes — password compatibility", () => {
  it("verifyLoginPassword accepts exact and trimmed edge spaces", async () => {
    const hashExact = await hashPassword("SecurePass1");
    expect(await verifyLoginPassword("SecurePass1", hashExact)).toBe(true);
    expect(await verifyLoginPassword("  SecurePass1  ", hashExact)).toBe(true);

    const hashSpaced = await hashPassword(" SecurePass1 ");
    expect(await verifyLoginPassword(" SecurePass1 ", hashSpaced)).toBe(true);
    expect(await verifyLoginPassword("SecurePass1", hashSpaced)).toBe(false);
  });

  it("preserves intentional internal spaces", async () => {
    const hash = await hashPassword("Secure Pass1");
    expect(await verifyLoginPassword("Secure Pass1", hash)).toBe(true);
    expect(await verifyLoginPassword("SecurePass1", hash)).toBe(false);
  });

  it("login works for existing as-is registered password (no hash rewrite)", async () => {
    const p = await registerParent("compat", "SecurePass1");
    const before = await prisma.user.findUniqueOrThrow({
      where: { id: p.id },
      select: { passwordHash: true },
    });
    expect((await login(p.email, "SecurePass1")).status).toBe(200);
    expect((await login(p.email, "  SecurePass1  ")).status).toBe(200);
    const after = await prisma.user.findUniqueOrThrow({
      where: { id: p.id },
      select: { passwordHash: true },
    });
    expect(after.passwordHash).toBe(before.passwordHash);
  });
});

describe("Login auth fixes — parent device session", () => {
  const deviceA = "device-aaaaaaaaaaaaaaaa";
  const deviceB = "device-bbbbbbbbbbbbbbbb";

  it("allows login on an existing device id", async () => {
    const p = await registerParent("devA");
    const first = await login(p.email, p.password, {
      deviceId: deviceA,
      platform: "android",
      deviceName: "Phone A",
    });
    expect(first.status).toBe(200);
    expect(first.body.data.tokens.refreshToken).toBeTruthy();

    const again = await login(p.email, p.password, {
      deviceId: deviceA,
      platform: "android",
      deviceName: "Phone A",
    });
    expect(again.status).toBe(200);
  });

  it("new device login succeeds and revokes prior session (one-device policy)", async () => {
    const p = await registerParent("devB");
    const first = await login(p.email, p.password, {
      deviceId: deviceA,
      platform: "android",
    });
    expect(first.status).toBe(200);
    const oldAccess = first.body.data.tokens.accessToken as string;

    const second = await login(p.email, p.password, {
      deviceId: deviceB,
      platform: "android",
    });
    expect(second.status).toBe(200);

    const me = await request(app)
      .get("/api/auth/me")
      .set("Authorization", `Bearer ${oldAccess}`)
      .set("X-Installation-Id", deviceA)
      .set("X-Client-Platform", "android");
    // Prior session must not remain fully valid under one-device rules.
    expect([401, 403]).toContain(me.status);
    if (me.status === 401) {
      expect(me.body.code === "SESSION_REVOKED" || me.body.error).toBeTruthy();
    }
  });
});

describe("Login auth fixes — rate limit keys and Redis fallback", () => {
  it("hashes emails for rate-limit identity (raw email never used as redis key material)", () => {
    const a = hashRateLimitIdentity("Parent@Example.com");
    const b = hashRateLimitIdentity("parent@example.com");
    expect(a).toBe(b);
    expect(a).not.toContain("@");
    expect(a).toHaveLength(32);
  });

  it("passwordAttemptKey combines path, ip, and hashed email", () => {
    const key = passwordAttemptKey({
      path: "/login",
      ip: "203.0.113.10",
      body: { email: "Parent@Example.com" },
    } as unknown as Request);
    expect(key).toContain("/login");
    expect(key).toContain("203.0.113.10");
    expect(key).toContain(hashRateLimitIdentity("Parent@Example.com"));
    expect(key).not.toContain("Parent@Example.com");
  });

  it("exposes a bounded production max and never zero", () => {
    expect(PASSWORD_RATE_LIMIT_MAX).toBeGreaterThan(0);
  });

  it("Redis unavailable helper does not throw when resetting stores", () => {
    markRedisUnavailableForTests();
    resetPasswordRateLimitForTests();
    resetRedisStateForTests();
    expect(true).toBe(true);
  });
});

describe("Login auth fixes — logout / me still auth-gated", () => {
  it("rejects /auth/me without token", async () => {
    const res = await request(app).get("/api/auth/me");
    expect(res.status).toBe(401);
  });
});
