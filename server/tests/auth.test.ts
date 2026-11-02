import { beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";

const app = createApp();

const hasDb = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDb)("Auth API (Phase 1)", () => {
  const unique = Date.now();
  const email = `phase1_${unique}@example.com`;
  const password = "SecurePass1";
  let token = "";

  beforeAll(() => {
    process.env.JWT_SECRET =
      process.env.JWT_SECRET ?? "test_secret_at_least_thirty_two_chars_long";
  });

  it("GET /api/health returns ok", async () => {
    const res = await request(app).get("/api/health");
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe("ok");
    expect(res.body.data.phase).toBe(1);
  });

  it("rejects weak registration payloads", async () => {
    const res = await request(app).post("/api/auth/register").send({
      name: "A",
      email: "bad",
      password: "short",
      acceptTerms: false,
      acceptPrivacy: false,
      parentalConsent: false,
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Validation failed");
  });

  it("registers a parent with consents", async () => {
    const res = await request(app).post("/api/auth/register").send({
      name: "Phase One Parent",
      email,
      password,
      acceptTerms: true,
      acceptPrivacy: true,
      parentalConsent: true,
    });
    expect(res.status).toBe(201);
    expect(res.body.data.user.email).toBe(email);
    expect(res.body.data.user.role).toBe("PARENT");
    expect(res.body.data.tokens.accessToken).toBeTruthy();
    token = res.body.data.tokens.accessToken;
  });

  it("rejects duplicate registration", async () => {
    const res = await request(app).post("/api/auth/register").send({
      name: "Phase One Parent",
      email,
      password,
      acceptTerms: true,
      acceptPrivacy: true,
      parentalConsent: true,
    });
    expect(res.status).toBe(409);
  });

  it("logs in with valid credentials", async () => {
    const res = await request(app).post("/api/auth/login").send({
      email,
      password,
    });
    expect(res.status).toBe(200);
    expect(res.body.data.tokens.accessToken).toBeTruthy();
    token = res.body.data.tokens.accessToken;
  });

  it("rejects invalid login", async () => {
    const res = await request(app).post("/api/auth/login").send({
      email,
      password: "WrongPass1",
    });
    expect(res.status).toBe(401);
  });

  it("returns current user with bearer token", async () => {
    const res = await request(app)
      .get("/api/auth/me")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.email).toBe(email);
  });

  it("creates and lists a child profile", async () => {
    const createRes = await request(app)
      .post("/api/children")
      .set("Authorization", `Bearer ${token}`)
      .send({
        displayName: "Leo",
        birthYear: new Date().getFullYear() - 6,
      });
    expect(createRes.status).toBe(201);
    expect(createRes.body.data.displayName).toBe("Leo");

    const listRes = await request(app)
      .get("/api/children")
      .set("Authorization", `Bearer ${token}`);
    expect(listRes.status).toBe(200);
    expect(listRes.body.data.length).toBeGreaterThanOrEqual(1);

    const childId = createRes.body.data.id;
    const progressRes = await request(app)
      .get(`/api/children/${childId}/progress`)
      .set("Authorization", `Bearer ${token}`);
    expect(progressRes.status).toBe(200);
    expect(progressRes.body.data.progress).toBeTruthy();
  });
});
