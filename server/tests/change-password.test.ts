import { describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";

const app = createApp();
const hasDb = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDb)("Signed-in password change", () => {
  it("requires the current password, enforces rules and signs out old sessions", async () => {
    const email = `chpw${Date.now()}@test.local`;
    const reg = await request(app).post("/api/auth/register").send({
      name: "Change Pw Parent",
      email,
      password: "OldPass123",
      acceptTerms: true,
      acceptPrivacy: true,
      parentalConsent: true,
    });
    expect(reg.status).toBe(201);
    const oldToken = reg.body.data.tokens.accessToken as string;
    const change = (body: Record<string, string>) =>
      request(app)
        .post("/api/auth/change-password")
        .set("Authorization", `Bearer ${oldToken}`)
        .send(body);

    const unauth = await request(app)
      .post("/api/auth/change-password")
      .send({ currentPassword: "x", newPassword: "y", confirmPassword: "y" });
    expect(unauth.status).toBe(401);

    const wrong = await change({
      currentPassword: "WrongPass1",
      newPassword: "NewPass456",
      confirmPassword: "NewPass456",
    });
    expect(wrong.status).toBe(400);
    expect(wrong.body.code ?? wrong.body.details?.code).toBe("CURRENT_PASSWORD_INVALID");

    const weak = await change({
      currentPassword: "OldPass123",
      newPassword: "short",
      confirmPassword: "short",
    });
    expect(weak.status).toBe(400);

    const mismatch = await change({
      currentPassword: "OldPass123",
      newPassword: "NewPass456",
      confirmPassword: "NewPass789",
    });
    expect(mismatch.status).toBe(400);

    // JWT iat is whole seconds; make sure the change lands in a later second than the old token.
    await new Promise((r) => setTimeout(r, 1100));
    const ok = await change({
      currentPassword: "OldPass123",
      newPassword: "NewPass456",
      confirmPassword: "NewPass456",
    });
    expect(ok.status).toBe(200);

    const revoked = await request(app)
      .get("/api/auth/me")
      .set("Authorization", `Bearer ${oldToken}`);
    expect(revoked.status).toBe(401);

    const oldLogin = await request(app)
      .post("/api/auth/login")
      .send({ email, password: "OldPass123" });
    expect(oldLogin.status).toBe(401);

    await new Promise((r) => setTimeout(r, 1100));
    const newLogin = await request(app)
      .post("/api/auth/login")
      .send({ email, password: "NewPass456" });
    expect(newLogin.status).toBe(200);
    const me = await request(app)
      .get("/api/auth/me")
      .set("Authorization", `Bearer ${newLogin.body.data.tokens.accessToken}`);
    expect(me.status).toBe(200);
  });

  it("holds Admin accounts to the stronger password rule", async () => {
    const login = await request(app)
      .post("/api/auth/login")
      .send({ email: "admin@littlereaders.test", password: "AdminDemo1" });
    expect(login.status).toBe(200);
    const res = await request(app)
      .post("/api/auth/change-password")
      .set("Authorization", `Bearer ${login.body.data.tokens.accessToken}`)
      .send({
        currentPassword: "AdminDemo1",
        newPassword: "Simple1234",
        confirmPassword: "Simple1234",
      });
    expect(res.status).toBe(400);
    expect(res.body.code ?? res.body.details?.code).toBe("WEAK_PASSWORD");
  });
});
