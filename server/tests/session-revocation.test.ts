import { describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { prisma } from "../src/lib/prisma.js";
import { activateParentDeviceSession } from "../src/parent-auth/session.service.js";

const app = createApp();
const stamp = Date.now();
async function registerParent(tag: string, password: string) {
  const email = `revoke_${tag}_${stamp}@test.local`;
  const reg = await request(app).post("/api/auth/register").send({
    name: `Revoke ${tag}`,
    email,
    password,
    acceptTerms: true,
    acceptPrivacy: true,
    parentalConsent: true,
  });
  expect(reg.status).toBe(201);
  return { email, id: reg.body.data.user.id as string, token: reg.body.data.tokens.accessToken as string };
}

async function deviceSession(userId: string) {
  const parent = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  const out = await activateParentDeviceSession({
    parent,
    deviceId: `device_${userId}_abcdefgh`,
    platform: "android",
  });
  return { access: out.tokens.accessToken, refresh: out.tokens.refreshToken, deviceId: `device_${userId}_abcdefgh` };
}

const me = (token: string) => request(app).get("/api/children").set("Authorization", `Bearer ${token}`);

describe("T-SEC-03 — a password reset signs the account out everywhere", () => {
  it("email-link reset revokes earlier JWTs, device sessions and refresh tokens", async () => {
    const p = await registerParent("link", "SecurePass1");
    const device = await deviceSession(p.id);
    expect((await me(p.token)).status).toBe(200);
    expect((await me(device.access)).status).toBe(200);

    const forgot = await request(app).post("/api/auth/forgot-password").send({ email: p.email, client: "web" });
    const reset = await request(app)
      .post("/api/auth/reset-password")
      .send({ token: forgot.body.data.devResetToken, password: "SecurePass2", confirmPassword: "SecurePass2" });
    expect(reset.status).toBe(200);

    const oldJwt = await me(p.token);
    expect(oldJwt.status).toBe(401);
    expect(oldJwt.body.code).toBe("SESSION_REVOKED");
    expect((await me(device.access)).status).toBe(401);
    const refreshed = await request(app)
      .post("/api/parent/auth/refresh")
      .send({ refreshToken: device.refresh, deviceId: device.deviceId });
    expect(refreshed.status).toBe(401);
    const row = await prisma.parentDeviceSession.findFirstOrThrow({ where: { parentId: p.id } });
    expect(row).toMatchObject({ status: "REVOKED", revokedReason: "PASSWORD_RESET" });

    const login = await request(app).post("/api/auth/login").send({ email: p.email, password: "SecurePass2" });
    expect(login.status).toBe(200);
    expect((await me(login.body.data.tokens.accessToken)).status).toBe(200);
  });

  it("signed-in password change also revokes device sessions", async () => {
    const p = await registerParent("change", "SecurePass1");
    const device = await deviceSession(p.id);

    const changed = await request(app)
      .post("/api/auth/change-password")
      .set("Authorization", `Bearer ${p.token}`)
      .send({ currentPassword: "SecurePass1", newPassword: "SecurePass3", confirmPassword: "SecurePass3" });
    expect(changed.status, JSON.stringify(changed.body)).toBe(200);

    expect((await me(p.token)).status).toBe(401);
    expect((await me(device.access)).status).toBe(401);
    const row = await prisma.parentDeviceSession.findFirstOrThrow({ where: { parentId: p.id } });
    expect(row.revokedReason).toBe("PASSWORD_CHANGED");
  });
});
