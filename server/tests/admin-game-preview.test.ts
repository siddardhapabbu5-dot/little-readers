import { describe, expect, it, beforeAll } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { prisma } from "../src/lib/prisma.js";

const app = createApp();
const hasDb = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDb)("Admin game preview", () => {
  let adminToken = "";
  let parentToken = "";
  let categoryId = "";

  beforeAll(async () => {
    process.env.JWT_SECRET =
      process.env.JWT_SECRET ?? "dev_only_change_me_to_a_long_random_secret_value";
    const admin = await request(app)
      .post("/api/auth/login")
      .send({ email: "superadmin@littlereaders.test", password: "SuperDemo1" });
    expect(admin.status).toBe(200);
    adminToken = admin.body.data.tokens.accessToken;
    const parent = await request(app)
      .post("/api/auth/login")
      .send({ email: "parent@littlereaders.test", password: "ParentDemo1" });
    expect(parent.status).toBe(200);
    parentToken = parent.body.data.tokens.accessToken;

    const cat = await prisma.learningCategory.findFirst({
      where: { words: { some: { isActive: true } } },
    });
    expect(cat).toBeTruthy();
    categoryId = cat!.id;
  });

  it("returns game questions for every mode without saving a session", async () => {
    const before = await prisma.learningSession.count();
    for (const activityMode of ["LISTEN_SPELL", "MATCHING", "QUIZ", "REVISION"]) {
      const res = await request(app)
        .post("/api/learning/preview-session")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ categoryId, activityMode });
      expect(res.status).toBe(200);
      expect(res.body.data.sessionId).toMatch(/^preview-/);
      expect(res.body.data.activityMode).toBe(activityMode);
      expect(res.body.data.questions.length).toBeGreaterThan(0);
      expect(res.body.data.questions[0].listenOptions.length).toBeGreaterThan(0);
    }
    expect(await prisma.learningSession.count()).toBe(before);
  });

  it("is not available to parents", async () => {
    const res = await request(app)
      .post("/api/learning/preview-session")
      .set("Authorization", `Bearer ${parentToken}`)
      .send({ categoryId, activityMode: "QUIZ" });
    expect(res.status).toBe(403);
  });
});
