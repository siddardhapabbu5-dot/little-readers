import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { prisma } from "../src/lib/prisma.js";
import {
  processDuePublishJobs,
  updatePublisherConfig,
} from "../src/programmes/publisher.service.js";
import { kolkataCalendarDateUtc, startOfUtcDay } from "../src/programmes/kolkata-time.js";

const app = createApp();
const hasDb = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDb)("Vocab programme publisher (Kolkata worker)", () => {
  let adminToken = "";
  let parentToken = "";
  let childId = "";
  let gradeId = "";
  let programmeId = "";
  let categoryId = "";
  const wordIds: string[] = [];
  const stamp = `pub_${Date.now()}`;

  beforeAll(async () => {
    process.env.JWT_SECRET =
      process.env.JWT_SECRET ?? "dev_only_change_me_to_a_long_random_secret_value";

    const admin = await request(app).post("/api/auth/login").send({
      email: "admin@littlereaders.test",
      password: "AdminDemo1",
    });
    expect(admin.status).toBe(200);
    adminToken = admin.body.data.tokens.accessToken;

    const parent = await request(app).post("/api/auth/login").send({
      email: "parent@littlereaders.test",
      password: "ParentDemo1",
    });
    expect(parent.status).toBe(200);
    parentToken = parent.body.data.tokens.accessToken;

    const grade = await prisma.learningGrade.findFirst({ where: { code: "GRADE_1" } });
    expect(grade).toBeTruthy();
    gradeId = grade!.id;

    const cat = await prisma.learningCategory.findFirst({
      where: { isPublished: true, group: { level: { gradeId } } },
      orderBy: { sortOrder: "asc" },
    });
    expect(cat).toBeTruthy();
    categoryId = cat!.id;

    for (let i = 0; i < 6; i++) {
      const w = await prisma.vocabularyWord.create({
        data: {
          categoryId,
          text: `${stamp}_w${i}`,
          meaning: `publisher fixture ${i}`,
          emoji: "📘",
          firstLetter: "P",
          sortOrder: 800 + i,
          isActive: true,
        },
      });
      wordIds.push(w.id);
    }

    const children = await request(app)
      .get("/api/children")
      .set("Authorization", `Bearer ${parentToken}`);
    expect(children.status).toBe(200);
    const existing = children.body.data?.[0];
    if (existing) {
      childId = existing.id;
    } else {
      const created = await request(app)
        .post("/api/children")
        .set("Authorization", `Bearer ${parentToken}`)
        .send({ displayName: `PubChild_${Date.now()}`, birthDate: "15/03/2021" });
      expect(created.status).toBe(201);
      childId = created.body.data.id;
    }

    await updatePublisherConfig({ status: "RUNNING", publishHour: 0, publishMinute: 0 });
  });

  afterAll(async () => {
    if (programmeId) {
      const linked = await prisma.vocabProgrammeItem.findMany({
        where: { day: { programmeId } },
        select: { vocabularyWordId: true },
      });
      await prisma.vocabPublishJob.deleteMany({ where: { programmeId } });
      await prisma.vocabProgrammePublishLog.deleteMany({
        where: { day: { programmeId } },
      });
      await prisma.vocabProgrammeItem.deleteMany({
        where: { day: { programmeId } },
      });
      await prisma.vocabProgrammeDay.deleteMany({ where: { programmeId } });
      await prisma.vocabProgramme.deleteMany({ where: { id: programmeId } });
      const restore = [...new Set(linked.map((l) => l.vocabularyWordId))];
      if (restore.length) {
        await prisma.vocabularyWord.updateMany({
          where: { id: { in: restore }, NOT: { id: { in: wordIds } } },
          data: { isActive: true },
        });
      }
    }
    if (wordIds.length) {
      await prisma.vocabularyWord.deleteMany({ where: { id: { in: wordIds } } });
    }
    await updatePublisherConfig({ status: "RUNNING", publishHour: 6, publishMinute: 0 });
  });

  it("creates short programme, hides future words, publishes due day, supports pause/retry", async () => {
    // Cancel other ACTIVE programmes for this grade so activate succeeds
    await prisma.vocabProgramme.updateMany({
      where: { gradeId, status: "ACTIVE" },
      data: { status: "CANCELLED" },
    });

    const today = kolkataCalendarDateUtc();
    const start = today.toISOString().slice(0, 10);
    const endDate = new Date(today.getTime() + 2 * 86400000);
    const end = endDate.toISOString().slice(0, 10);

    const created = await request(app)
      .post("/api/admin/programmes")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        title: `Publisher test ${stamp}`,
        gradeId,
        startDate: start,
        endDate: end,
        dailyTarget: 1,
      });
    expect(created.status).toBe(201);
    programmeId = created.body.data.id;

    const generated = await request(app)
      .post(`/api/admin/programmes/${programmeId}/generate`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({});
    expect(generated.status).toBe(200);
    expect(generated.body.data.days.length).toBeGreaterThanOrEqual(3);

    // Replace first day with known fixture word
    const day0 = generated.body.data.days[0];
    const day1 = generated.body.data.days[1];
    const replaced = await request(app)
      .put(`/api/admin/programmes/days/${day0.id}/words`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ vocabularyWordIds: [wordIds[0]] });
    expect(replaced.status).toBe(200);

    const replaced1 = await request(app)
      .put(`/api/admin/programmes/days/${day1.id}/words`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ vocabularyWordIds: [wordIds[1]] });
    expect(replaced1.status).toBe(200);

    const approved = await request(app)
      .post(`/api/admin/programmes/${programmeId}/approve`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({});
    expect(approved.status).toBe(200);

    const activated = await request(app)
      .post(`/api/admin/programmes/${programmeId}/activate`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({});
    expect(activated.status).toBe(200);

    const w0 = await prisma.vocabularyWord.findUnique({ where: { id: wordIds[0] } });
    const w1 = await prisma.vocabularyWord.findUnique({ where: { id: wordIds[1] } });
    expect(w0?.isActive).toBe(false);
    expect(w1?.isActive).toBe(false);

    const jobs = await prisma.vocabPublishJob.count({ where: { programmeId } });
    expect(jobs).toBeGreaterThanOrEqual(3);

    // Pause — no publish
    await updatePublisherConfig({ status: "PAUSED" });
    const pausedRun = await processDuePublishJobs();
    expect(pausedRun.skipped).toBe(true);

    await updatePublisherConfig({ status: "RUNNING", publishHour: 0, publishMinute: 0 });
    const run = await processDuePublishJobs();
    expect(run.skipped).toBe(false);
    expect(run.processed).toBeGreaterThanOrEqual(1);

    const w0After = await prisma.vocabularyWord.findUnique({ where: { id: wordIds[0] } });
    const w1After = await prisma.vocabularyWord.findUnique({ where: { id: wordIds[1] } });
    expect(w0After?.isActive).toBe(true);
    // Future day word still hidden
    expect(w1After?.isActive).toBe(false);

    const day0Row = await prisma.vocabProgrammeDay.findUnique({ where: { id: day0.id } });
    expect(day0Row?.status).toBe("PUBLISHED");
    const day1Row = await prisma.vocabProgrammeDay.findUnique({ where: { id: day1.id } });
    expect(day1Row?.status).toBe("SCHEDULED");

    // Duplicate prevention
    const again = await processDuePublishJobs();
    expect(again.processed).toBe(0);
    const logs = await prisma.vocabProgrammePublishLog.count({
      where: { dayId: day0.id, result: "PUBLISHED" },
    });
    expect(logs).toBe(1);

    // Student category listing must not include future scheduled word
    const catWords = await request(app)
      .get(`/api/learning/categories/${categoryId}/words`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(catWords.status).toBe(200);
    const texts: string[] = (catWords.body.data.words ?? []).map(
      (w: { word?: string; text?: string }) => w.word ?? w.text
    );
    expect(texts).toContain(`${stamp}_w0`);
    expect(texts).not.toContain(`${stamp}_w1`);

    // Missed-job recovery: overdue dueDate on job (without colliding calendar unique dates)
    await prisma.vocabPublishJob.updateMany({
      where: { dayId: day1.id },
      data: {
        dueDate: startOfUtcDay(new Date(today.getTime() - 86400000)),
        status: "PENDING",
        nextAttemptAt: new Date(0),
        attempts: 0,
      },
    });
    await prisma.vocabProgrammeDay.update({
      where: { id: day1.id },
      data: { status: "SCHEDULED" },
    });
    const recovered = await processDuePublishJobs();
    expect(recovered.processed).toBeGreaterThanOrEqual(1);
    const w1Recovered = await prisma.vocabularyWord.findUnique({ where: { id: wordIds[1] } });
    expect(w1Recovered?.isActive).toBe(true);
  });
});
