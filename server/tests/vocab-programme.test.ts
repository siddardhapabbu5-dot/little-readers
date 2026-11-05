import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { prisma } from "../src/lib/prisma.js";

const app = createApp();
const hasDb = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDb)("Vocab programme (UI+DB stub)", () => {
  let adminToken = "";
  let gradeId = "";
  let programmeId = "";
  let categoryId = "";
  const seededWordIds: string[] = [];

  beforeAll(async () => {
    process.env.JWT_SECRET =
      process.env.JWT_SECRET ?? "dev_only_change_me_to_a_long_random_secret_value";
    const admin = await request(app).post("/api/auth/login").send({
      email: "admin@littlereaders.test",
      password: "AdminDemo1",
    });
    expect(admin.status).toBe(200);
    adminToken = admin.body.data.tokens.accessToken;

    const grade = await prisma.learningGrade.findFirst({
      where: { code: "GRADE_1" },
    });
    expect(grade).toBeTruthy();
    gradeId = grade!.id;

    const category = await prisma.learningCategory.findFirst({
      where: {
        isPublished: true,
        group: { level: { gradeId } },
      },
      orderBy: { sortOrder: "asc" },
    });
    expect(category).toBeTruthy();
    categoryId = category!.id;

    const stamp = `prog_${Date.now()}`;
    for (let i = 0; i < 4; i++) {
      const word = await prisma.vocabularyWord.create({
        data: {
          categoryId,
          text: `${stamp}_w${i}`,
          meaning: `programme fixture ${i}`,
          emoji: "📗",
          firstLetter: "P",
          sortOrder: 900 + i,
          isActive: true,
        },
      });
      seededWordIds.push(word.id);
    }
  });

  afterAll(async () => {
    if (!seededWordIds.length) return;
    await prisma.vocabProgrammeItem.deleteMany({
      where: { vocabularyWordId: { in: seededWordIds } },
    });
    if (programmeId) {
      await prisma.vocabProgrammePublishLog.deleteMany({
        where: { day: { programmeId } },
      });
      await prisma.vocabProgrammeDay.deleteMany({ where: { programmeId } });
      await prisma.vocabProgramme.deleteMany({ where: { id: programmeId } });
    }
    await prisma.vocabularyWord.deleteMany({
      where: { id: { in: seededWordIds } },
    });
  });

  it("creates, generates, approves and activates without auto-publishing", async () => {
    const start = new Date();
    const end = new Date(start.getTime() + 3 * 86400000);
    const created = await request(app)
      .post("/api/admin/programmes")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        title: `Programme test ${Date.now()}`,
        gradeId,
        startDate: start.toISOString().slice(0, 10),
        endDate: end.toISOString().slice(0, 10),
        dailyTarget: 1,
      });
    expect(created.status).toBe(201);
    expect(created.body.data.status).toBe("DRAFT");
    expect(created.body.data.timezone).toBe("Asia/Kolkata");
    programmeId = created.body.data.id;

    const generated = await request(app)
      .post(`/api/admin/programmes/${programmeId}/generate`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({});
    expect(generated.status).toBe(200);
    expect(generated.body.data.days.length).toBeGreaterThan(0);
    expect(
      generated.body.data.days.every((d: { status: string }) => d.status === "SCHEDULED")
    ).toBe(true);
    expect(
      generated.body.data.days.every(
        (d: { items: unknown[] }) => Array.isArray(d.items) && d.items.length >= 1
      )
    ).toBe(true);

    const approved = await request(app)
      .post(`/api/admin/programmes/${programmeId}/approve`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({});
    expect(approved.status).toBe(200);
    expect(approved.body.data.status).toBe("APPROVED");
    expect(approved.body.data.approvedById).toBeTruthy();

    const activated = await request(app)
      .post(`/api/admin/programmes/${programmeId}/activate`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({});
    expect(activated.status).toBe(200);
    expect(activated.body.data.status).toBe("ACTIVE");
    expect(activated.body.data.activatedById).toBeTruthy();

    const detail = await request(app)
      .get(`/api/admin/programmes/${programmeId}`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(detail.status).toBe(200);
    expect(
      detail.body.data.days.every((d: { status: string }) => d.status === "SCHEDULED")
    ).toBe(true);
    // Activate must not auto-publish days (scheduler is a follow-up)
    expect(
      detail.body.data.days.every((d: { status: string }) => d.status !== "PUBLISHED")
    ).toBe(true);
  });
});
