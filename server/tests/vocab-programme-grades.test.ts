import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { prisma } from "../src/lib/prisma.js";

const app = createApp();
const hasDb = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDb)("Real programmes across GRADE_1–4", () => {
  let adminToken = "";
  const programmeIds: string[] = [];

  beforeAll(async () => {
    process.env.JWT_SECRET =
      process.env.JWT_SECRET ?? "dev_only_change_me_to_a_long_random_secret_value";
    const admin = await request(app).post("/api/auth/login").send({
      email: "admin@littlereaders.test",
      password: "AdminDemo1",
    });
    expect(admin.status).toBe(200);
    adminToken = admin.body.data.tokens.accessToken;

    // Free grades from prior ACTIVE programmes so activate can succeed
    await prisma.vocabProgramme.updateMany({
      where: {
        status: "ACTIVE",
        grade: { code: { in: ["GRADE_1", "GRADE_2", "GRADE_3", "GRADE_4"] } },
      },
      data: { status: "CANCELLED" },
    });
    // Prior publisher runs may have left dictionary words inactive — restore for generation
    await prisma.vocabularyWord.updateMany({
      where: { origin: "DICTIONARY" },
      data: { isActive: true },
    });
  });

  afterAll(async () => {
    const wordIds = await prisma.vocabProgrammeItem.findMany({
      where: { day: { programmeId: { in: programmeIds } } },
      select: { vocabularyWordId: true },
    });
    for (const id of programmeIds) {
      await prisma.vocabPublishJob.deleteMany({ where: { programmeId: id } });
      await prisma.vocabProgrammePublishLog.deleteMany({
        where: { day: { programmeId: id } },
      });
      await prisma.vocabProgrammeItem.deleteMany({ where: { day: { programmeId: id } } });
      await prisma.vocabProgrammeDay.deleteMany({ where: { programmeId: id } });
      await prisma.vocabProgramme.deleteMany({ where: { id } });
    }
    const restore = [...new Set(wordIds.map((w) => w.vocabularyWordId))];
    if (restore.length) {
      await prisma.vocabularyWord.updateMany({
        where: { id: { in: restore }, origin: "DICTIONARY" },
        data: { isActive: true },
      });
    }
  });

  it("generates six-month GRADE_1 programme and short calendars for grades 2–4", async () => {
    const grades = await prisma.learningGrade.findMany({
      where: { code: { in: ["GRADE_1", "GRADE_2", "GRADE_3", "GRADE_4"] } },
      orderBy: { sortOrder: "asc" },
    });
    expect(grades).toHaveLength(4);

    const start = new Date();
    const startStr = start.toISOString().slice(0, 10);

    for (const grade of grades) {
      const activeWords = await prisma.vocabularyWord.count({
        where: {
          isActive: true,
          category: { group: { level: { gradeId: grade.id } } },
        },
      });
      expect(activeWords).toBeGreaterThan(0);

      const days =
        grade.code === "GRADE_1"
          ? 180
          : grade.code === "GRADE_2"
            ? 14
            : grade.code === "GRADE_3"
              ? 21
              : 10;
      const end = new Date(start.getTime() + (days - 1) * 86400000);
      const endStr = end.toISOString().slice(0, 10);

      const created = await request(app)
        .post("/api/admin/programmes")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({
          title: `Real ${grade.code} programme ${Date.now()}`,
          gradeId: grade.id,
          startDate: startStr,
          endDate: endStr,
          dailyTarget: grade.code === "GRADE_1" ? 1 : 2,
        });
      expect(created.status).toBe(201);
      expect(created.body.data.timezone).toBe("Asia/Kolkata");
      const programmeId = created.body.data.id as string;
      programmeIds.push(programmeId);

      const generated = await request(app)
        .post(`/api/admin/programmes/${programmeId}/generate`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({});
      expect(generated.status).toBe(200);
      expect(generated.body.data.days).toHaveLength(days);
      expect(
        generated.body.data.days.every((d: { status: string }) => d.status === "SCHEDULED")
      ).toBe(true);
      expect(
        generated.body.data.days.every(
          (d: { items: unknown[] }) => Array.isArray(d.items) && d.items.length > 0
        )
      ).toBe(true);

      // Spot-check word→grade linkage (first/middle/last days)
      const sampleDays = [
        generated.body.data.days[0],
        generated.body.data.days[Math.floor(days / 2)],
        generated.body.data.days[days - 1],
      ];
      for (const day of sampleDays) {
        for (const item of day.items) {
          const word = await prisma.vocabularyWord.findUnique({
            where: { id: item.vocabularyWordId },
            include: {
              category: { include: { group: { include: { level: true } } } },
            },
          });
          expect(word?.category.group.level.gradeId).toBe(grade.id);
        }
      }

      // Edit/replace first day words (keep same grade)
      const firstDay = generated.body.data.days[0];
      const pool = await prisma.vocabularyWord.findMany({
        where: {
          isActive: true,
          category: { group: { level: { gradeId: grade.id } } },
        },
        take: 3,
        select: { id: true },
      });
      const replaceIds = pool.map((w) => w.id);
      const replaced = await request(app)
        .put(`/api/admin/programmes/days/${firstDay.id}/words`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ vocabularyWordIds: replaceIds });
      expect(replaced.status).toBe(200);
      expect(replaced.body.data.days[0].items).toHaveLength(replaceIds.length);

      const approved = await request(app)
        .post(`/api/admin/programmes/${programmeId}/approve`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({});
      expect(approved.status).toBe(200);
      expect(approved.body.data.status).toBe("APPROVED");

      const activated = await request(app)
        .post(`/api/admin/programmes/${programmeId}/activate`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({});
      expect(activated.status).toBe(200);
      expect(activated.body.data.status).toBe("ACTIVE");

      const jobs = await prisma.vocabPublishJob.count({ where: { programmeId } });
      expect(jobs).toBe(days);

      // Future words hidden (scheduled days)
      const scheduledItems = await prisma.vocabProgrammeItem.findMany({
        where: { day: { programmeId, status: "SCHEDULED" } },
        select: { vocabularyWordId: true },
      });
      const hiddenIds = [...new Set(scheduledItems.map((i) => i.vocabularyWordId))];
      if (hiddenIds.length) {
        const stillActive = await prisma.vocabularyWord.count({
          where: { id: { in: hiddenIds }, isActive: true },
        });
        expect(stillActive).toBe(0);
      }
    }
  }, 120_000);
});
