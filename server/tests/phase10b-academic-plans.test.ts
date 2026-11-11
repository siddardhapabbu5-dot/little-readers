import { beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { prisma } from "../src/lib/prisma.js";
import { hashPassword } from "../src/lib/password.js";
import { ensureAcademicDefaults } from "../src/academic/academic.service.js";

const app = createApp();
const hasDb = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDb)("Phase 10B Academic + Subscription Plans", () => {
  const unique = Date.now();
  let adminToken = "";
  let parentToken = "";
  let level4Id = "";
  let monthlyId = "";
  let draftId = "";
  let level1Id = "";

  beforeAll(async () => {
    process.env.JWT_SECRET =
      process.env.JWT_SECRET ?? "test_secret_at_least_thirty_two_chars_long";
    await ensureAcademicDefaults({ seedGrades: true });

    const adminLogin = await request(app).post("/api/auth/login").send({
      email: "admin@littlereaders.test",
      password: "AdminDemo1",
    });
    if (adminLogin.status !== 200) {
      await prisma.user.upsert({
        where: { email: "admin@littlereaders.test" },
        update: {
          passwordHash: await hashPassword("AdminDemo1"),
          role: "ADMIN",
          isActive: true,
        },
        create: {
          name: "Demo Admin",
          email: "admin@littlereaders.test",
          passwordHash: await hashPassword("AdminDemo1"),
          role: "ADMIN",
        },
      });
      const retry = await request(app).post("/api/auth/login").send({
        email: "admin@littlereaders.test",
        password: "AdminDemo1",
      });
      adminToken = retry.body.data.tokens.accessToken;
    } else {
      adminToken = adminLogin.body.data.tokens.accessToken;
    }

    const parentLogin = await request(app).post("/api/auth/login").send({
      email: "parent@littlereaders.test",
      password: "ParentDemo1",
    });
    parentToken = parentLogin.body.data.tokens.accessToken;

    const levels = await request(app)
      .get("/api/admin/academic/levels")
      .set("Authorization", `Bearer ${adminToken}`);
    level1Id = levels.body.data.find(
      (l: { code: string }) => l.code === "LEVEL_1"
    )?.id;
  });

  it("1–2) Admin creates and edits Level-4", async () => {
    // Free grade 1 so Level-4 can own 1–1 without conflicting LEVEL_1.
    await request(app)
      .post(`/api/admin/academic/levels/${level1Id}/deactivate`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({});

    const create = await request(app)
      .post("/api/admin/academic/levels")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        code: `LEVEL_4_${unique}`,
        label: `Level-4-${unique}`,
        startGrade: 1,
        endGrade: 1,
        description: "temp",
      });
    expect(create.status).toBe(201);
    level4Id = create.body.data.id;

    const edit = await request(app)
      .patch(`/api/admin/academic/levels/${level4Id}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ label: `Level-4-edited-${unique}`, description: "edited" });
    expect(edit.status).toBe(200);
    expect(edit.body.data.label).toContain("edited");
  });

  it("3) Admin deletes unused Level", async () => {
    expect(level4Id).toBeTruthy();
    const superLogin = await request(app).post("/api/auth/login").send({
      email: "superadmin@littlereaders.test",
      password: "SuperDemo1",
    });
    expect(superLogin.status).toBe(200);
    const del = await request(app)
      .delete(`/api/admin/academic/levels/${level4Id}`)
      .set("Authorization", `Bearer ${superLogin.body.data.tokens.accessToken}`);
    expect(del.status).toBe(200);
    expect(
      del.body.data.deleted === true || del.body.data.archived === true
    ).toBe(true);

    // Restore Level-1 for remaining tests.
    await request(app)
      .patch(`/api/admin/academic/levels/${level1Id}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        isActive: true,
        isPublished: true,
        startGrade: 1,
        endGrade: 3,
      });
  });

  it("4–5) Admin creates Grade 13 rejected; duplicate grade rejected", async () => {
    const bad = await request(app)
      .post("/api/admin/academic/grades")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        code: `G13_${unique}`,
        label: "Grade 13",
        gradeNumber: 13,
        assignedLevelId: level1Id,
      });
    expect(bad.status).toBe(400);

    const dup = await request(app)
      .post("/api/admin/academic/grades")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        code: `G1_DUP_${unique}`,
        label: "Grade 1 Dup",
        gradeNumber: 1,
        assignedLevelId: level1Id,
      });
    expect(dup.status).toBe(409);
  });

  it("6) Conflicting Level grade ranges rejected", async () => {
    const res = await request(app)
      .post("/api/admin/academic/levels")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        code: `CONFLICT_${unique}`,
        label: `Conflict ${unique}`,
        startGrade: 2,
        endGrade: 5,
      });
    expect(res.status).toBe(409);
    expect(res.body.code ?? res.body.details?.code).toBe(
      "LEVEL_RANGE_CONFLICT"
    );
  });

  it("7–9) Admin creates Monthly / 3mo / 6mo / yearly plans with level prices", async () => {
    const monthly = await request(app)
      .post("/api/admin/academic/subscription-plans")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        name: `Monthly L1 ${unique}`,
        code: `M_L1_${unique}`,
        durationMonths: 1,
        amountPaise: 49900,
        applicableLevel: "LEVEL_1",
        levelId: level1Id,
        isPublished: true,
        isActive: true,
      });
    expect(monthly.status).toBe(201);
    monthlyId = monthly.body.data.id;

    for (const months of [3, 6, 12]) {
      const res = await request(app)
        .post("/api/admin/academic/subscription-plans")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({
          name: `${months}mo L1 ${unique}`,
          code: `P_${months}_${unique}`,
          durationMonths: months,
          amountPaise: 10000 * months,
          applicableLevel: "LEVEL_1",
          levelId: level1Id,
          isPublished: true,
          isActive: true,
        });
      expect(res.status).toBe(201);
    }

    const otherLevel = await prisma.learningLevel.findFirst({
      where: { code: "LEVEL_2" },
    });
    const priced = await request(app)
      .post("/api/admin/academic/subscription-plans")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        name: `Monthly L2 ${unique}`,
        code: `M_L2_${unique}`,
        durationMonths: 1,
        amountPaise: 79900,
        applicableLevel: "LEVEL_2",
        levelId: otherLevel!.id,
        isPublished: true,
        isActive: true,
      });
    expect(priced.status).toBe(201);
    expect(priced.body.data.amountPaise).toBe(79900);
  });

  it("10–12) Parent sees published levels/grades/plans; draft hidden", async () => {
    const draft = await request(app)
      .post("/api/admin/academic/subscription-plans")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        name: `Draft ${unique}`,
        code: `DRAFT_${unique}`,
        durationMonths: 1,
        amountPaise: 10000,
        isPublished: false,
        isActive: true,
      });
    expect(draft.status).toBe(201);
    draftId = draft.body.data.id;

    const levels = await request(app)
      .get("/api/parent/catalog/levels")
      .set("Authorization", `Bearer ${parentToken}`);
    expect(levels.status).toBe(200);
    expect(levels.body.data.length).toBeGreaterThan(0);

    const grades = await request(app)
      .get(`/api/parent/catalog/grades?levelId=${level1Id}`)
      .set("Authorization", `Bearer ${parentToken}`);
    expect(grades.status).toBe(200);
    expect(
      grades.body.data.every(
        (g: { gradeNumber: number }) => g.gradeNumber >= 1 && g.gradeNumber <= 3
      )
    ).toBe(true);

    const plans = await request(app)
      .get(`/api/parent/catalog/subscription-plans?levelId=${level1Id}`)
      .set("Authorization", `Bearer ${parentToken}`);
    expect(plans.status).toBe(200);
    expect(
      plans.body.data.some((p: { id: string }) => p.id === monthlyId)
    ).toBe(true);
    expect(
      plans.body.data.some((p: { id: string }) => p.id === draftId)
    ).toBe(false);
  });

  it("13) Deactivated plans cannot be purchased", async () => {
    await request(app)
      .post(`/api/admin/academic/subscription-plans/${monthlyId}/deactivate`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({});

    const order = await request(app)
      .post("/api/payments/orders")
      .set("Authorization", `Bearer ${parentToken}`)
      .send({ planId: monthlyId });
    expect([400, 503]).toContain(order.status);
  });

  it("14) Existing subscription plan string preserved after plan edit", async () => {
    const sub = await prisma.subscription.findFirst({
      where: { user: { email: "parent@littlereaders.test" } },
      orderBy: { createdAt: "desc" },
    });
    expect(sub).toBeTruthy();
    const before = sub!.plan;
    const activePlan = await prisma.subscriptionPlan.findFirst({
      where: { code: { startsWith: `P_12_${unique}` } },
    });
    if (activePlan) {
      await request(app)
        .patch(`/api/admin/academic/subscription-plans/${activePlan.id}`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ name: "Renamed Yearly", amountPaise: 999999 });
    }
    const after = await prisma.subscription.findUnique({
      where: { id: sub!.id },
    });
    expect(after!.plan).toBe(before);
  });
});
