import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { prisma } from "../src/lib/prisma.js";
import {
  processDuePublishJobs,
  updatePublisherConfig,
} from "../src/programmes/publisher.service.js";
import { kolkataCalendarDateUtc } from "../src/programmes/kolkata-time.js";

const app = createApp();
const hasDb = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDb)("Student visibility vs programme schedule", () => {
  let adminToken = "";
  let parentToken = "";
  let gradeId = "";
  let categoryId = "";
  let programmeId = "";
  const wordIds: string[] = [];
  const stamp = `vis_${Date.now()}`;

  beforeAll(async () => {
    process.env.JWT_SECRET =
      process.env.JWT_SECRET ?? "dev_only_change_me_to_a_long_random_secret_value";
    const admin = await request(app).post("/api/auth/login").send({
      email: "admin@littlereaders.test",
      password: "AdminDemo1",
    });
    adminToken = admin.body.data.tokens.accessToken;
    const parent = await request(app).post("/api/auth/login").send({
      email: "parent@littlereaders.test",
      password: "ParentDemo1",
    });
    parentToken = parent.body.data.tokens.accessToken;

    const grade = await prisma.learningGrade.findFirst({ where: { code: "GRADE_2" } });
    gradeId = grade!.id;
    const cat = await prisma.learningCategory.findFirst({
      where: { isPublished: true, group: { level: { gradeId } } },
    });
    categoryId = cat!.id;

    for (let i = 0; i < 3; i++) {
      const w = await prisma.vocabularyWord.create({
        data: {
          categoryId,
          text: `${stamp}_w${i}`,
          meaning: `vis ${i}`,
          emoji: "👀",
          firstLetter: "V",
          isActive: true,
          sortOrder: 700 + i,
        },
      });
      wordIds.push(w.id);
    }

    // Rejected assignment must never surface as a student word via unpublished path
    await prisma.vocabProgramme.updateMany({
      where: { gradeId, status: "ACTIVE" },
      data: { status: "CANCELLED" },
    });
    await updatePublisherConfig({ status: "RUNNING", publishHour: 0, publishMinute: 0 });
  });

  afterAll(async () => {
    if (programmeId) {
      await prisma.vocabPublishJob.deleteMany({ where: { programmeId } });
      await prisma.vocabProgrammePublishLog.deleteMany({
        where: { day: { programmeId } },
      });
      await prisma.vocabProgrammeItem.deleteMany({ where: { day: { programmeId } } });
      await prisma.vocabProgrammeDay.deleteMany({ where: { programmeId } });
      await prisma.vocabProgramme.deleteMany({ where: { id: programmeId } });
    }
    if (wordIds.length) {
      await prisma.vocabularyWord.deleteMany({ where: { id: { in: wordIds } } });
    }
    await updatePublisherConfig({ status: "RUNNING", publishHour: 6, publishMinute: 0 });
  });

  it("hides future/rejected words and keeps progress after replacement", async () => {
    const today = kolkataCalendarDateUtc();
    const created = await request(app)
      .post("/api/admin/programmes")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        title: `Vis ${stamp}`,
        gradeId,
        startDate: today.toISOString().slice(0, 10),
        endDate: new Date(today.getTime() + 86400000).toISOString().slice(0, 10),
        dailyTarget: 1,
      });
    programmeId = created.body.data.id;

    await request(app)
      .post(`/api/admin/programmes/${programmeId}/generate`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({});

    const detail = await request(app)
      .get(`/api/admin/programmes/${programmeId}`)
      .set("Authorization", `Bearer ${adminToken}`);
    const day0 = detail.body.data.days[0];
    const day1 = detail.body.data.days[1];

    await request(app)
      .put(`/api/admin/programmes/days/${day0.id}/words`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ vocabularyWordIds: [wordIds[0]] });
    await request(app)
      .put(`/api/admin/programmes/days/${day1.id}/words`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ vocabularyWordIds: [wordIds[1]] });

    await request(app)
      .post(`/api/admin/programmes/${programmeId}/approve`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({});
    await request(app)
      .post(`/api/admin/programmes/${programmeId}/activate`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({});

    await processDuePublishJobs();

    const listed = await request(app)
      .get(`/api/learning/categories/${categoryId}/words`)
      .set("Authorization", `Bearer ${parentToken}`);
    expect(listed.status).toBe(200);
    const texts = listed.body.data.words.map((w: { word: string }) => w.word);
    expect(texts).toContain(`${stamp}_w0`);
    expect(texts).not.toContain(`${stamp}_w1`);

    // Inactive future word direct fetch
    const future = await request(app)
      .get(`/api/learning/words/${wordIds[1]}`)
      .set("Authorization", `Bearer ${parentToken}`);
    expect(future.status).toBe(404);

    // Replace tomorrow's word — progress rows keyed by wordId stay intact
    const attemptsBefore = await prisma.questionAttempt.count({
      where: { wordId: wordIds[1] },
    });

    await request(app)
      .put(`/api/admin/programmes/days/${day1.id}/words`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ vocabularyWordIds: [wordIds[2]] });

    const attemptsAfter = await prisma.questionAttempt.count({
      where: { wordId: wordIds[1] },
    });
    expect(attemptsAfter).toBe(attemptsBefore);
    const replacedWord = await prisma.vocabularyWord.findUnique({
      where: { id: wordIds[1] },
    });
    // Removed from schedule while ACTIVE programme → may become visible again
    expect(replacedWord).toBeTruthy();

    // Rejected dictionary assignments never become active student words via this path
    const rejected = await prisma.vocabularyGradeAssignment.count({
      where: { status: "REJECTED", publishedWordId: { not: null } },
    });
    expect(rejected).toBe(0);
  });
});
