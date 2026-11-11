import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { prisma } from "../src/lib/prisma.js";

const app = createApp();
const hasDb = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDb)("Batch 8 — kids lessons + seat revoke", () => {
  let adminToken = "";
  let parentToken = "";
  let parentUserId = "";
  const stamp = Date.now();
  let childA = "";
  let childB = "";
  let categoryId = "";
  let wordIds: string[] = [];
  let lessonId = "";
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
    parentUserId = parent.body.data.user.id as string;

    const kids = await prisma.child.findMany({
      where: { parentId: parentUserId, isActive: true },
      orderBy: { createdAt: "asc" },
      take: 2,
    });
    expect(kids.length).toBeGreaterThanOrEqual(1);
    childA = kids[0].id;
    childB = kids[1]?.id ?? kids[0].id;

    const cat = await prisma.learningCategory.findFirst({
      where: {
        isPublished: true,
        ...(kids[0].levelId ? { group: { levelId: kids[0].levelId } } : {}),
      },
      include: { group: { include: { level: true } } },
    });
    expect(cat).toBeTruthy();
    categoryId = cat!.id;

    for (let i = 0; i < 2; i++) {
      const w = await request(app)
        .post("/api/admin/vocabulary/words")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({
          categoryId,
          text: `bew${String(stamp + i).replace(/\d/g, (d, at: number) => (at % 2 ? "klmnopqrst" : "abcdefghij")[Number(d)])}`,
          meaning: `Batch 8 meaning ${i}`,
          emoji: "📗",
        });
      expect(w.status).toBe(201);
      wordIds.push(w.body.data.id);
    }

    const lesson = await request(app)
      .post("/api/admin/lessons")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        title: `B8 Lesson ${stamp}`,
        learningCategoryId: categoryId,
        activities: ["LISTEN", "SPELL"],
      });
    expect(lesson.status).toBe(201);
    lessonId = lesson.body.data.id;
    await request(app)
      .put(`/api/admin/lessons/${lessonId}/words`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ vocabularyWordIds: wordIds });
    await request(app)
      .post(`/api/admin/lessons/${lessonId}/publish`)
      .set("Authorization", `Bearer ${adminToken}`);

  });

  it("lists published lessons with playStatus and hides unpublished", async () => {
    const list = await request(app)
      .get(`/api/learning/lessons?childId=${childA}`)
      .set("Authorization", `Bearer ${parentToken}`);
    expect(list.status).toBe(200);
    const rows = list.body.data as Array<{
      id: string;
      playStatus: string;
    }>;
    const mine = rows.find((r) => r.id === lessonId);
    expect(mine).toBeTruthy();
    expect(["NOT_STARTED", "IN_PROGRESS", "COMPLETED"]).toContain(mine!.playStatus);

    await request(app)
      .post(`/api/admin/lessons/${lessonId}/unpublish`)
      .set("Authorization", `Bearer ${adminToken}`);
    const after = await request(app)
      .get(`/api/learning/lessons?childId=${childA}`)
      .set("Authorization", `Bearer ${parentToken}`);
    expect(after.body.data.some((r: { id: string }) => r.id === lessonId)).toBe(
      false
    );
    await request(app)
      .post(`/api/admin/lessons/${lessonId}/publish`)
      .set("Authorization", `Bearer ${adminToken}`);
  });

  it("starts and resumes lesson for one child without sharing session", async () => {
    const start = await request(app)
      .post("/api/learning/sessions")
      .set("Authorization", `Bearer ${parentToken}`)
      .send({ childId: childA, lessonId });
    expect([200, 201]).toContain(start.status);
    const sessionA = start.body.data.sessionId as string;

    const resume = await request(app)
      .post("/api/learning/sessions")
      .set("Authorization", `Bearer ${parentToken}`)
      .send({ childId: childA, lessonId, resume: true });
    expect(resume.status).toBe(200);
    expect(resume.body.data.sessionId).toBe(sessionA);
    expect(resume.body.data.resumed).toBe(true);

    if (childB !== childA) {
      const startB = await request(app)
        .post("/api/learning/sessions")
        .set("Authorization", `Bearer ${parentToken}`)
        .send({ childId: childB, lessonId });
      expect([200, 201]).toContain(startB.status);
      expect(startB.body.data.sessionId).not.toBe(sessionA);
    }
  });

  it("blocks parent from revoke; admin revoke respects occupied seats", async () => {
    const denied = await request(app)
      .post("/api/subscriptions/seats/revoke")
      .set("Authorization", `Bearer ${parentToken}`)
      .send({ parentUserId, seats: 1 });
    expect(denied.status).toBe(403);

    // Ensure at least one extra seat exists
    await request(app)
      .post("/api/subscriptions/seats/grant")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        parentUserId,
        seats: 1,
        amountCents: 0,
        provider: "manual_admin",
      });

    const snap = await request(app)
      .get("/api/subscriptions/me")
      .set("Authorization", `Bearer ${parentToken}`);
    expect(snap.status).toBe(200);
    const assigned = snap.body.data.seats.assigned as number;
    const included = snap.body.data.seats.included as number;
    const extra = snap.body.data.seats.extra as number;

    // Try to revoke more than would leave capacity >= assigned
    const overRevoke = Math.max(1, extra - Math.max(0, assigned - included) + 1);
    if (overRevoke <= extra && included + (extra - overRevoke) < assigned) {
      const blocked = await request(app)
        .post("/api/subscriptions/seats/revoke")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ parentUserId, seats: overRevoke });
      expect(blocked.status).toBe(409);
    }

    // Safe revoke of 1 when capacity allows
    if (included + extra - 1 >= assigned && extra >= 1) {
      const ok = await request(app)
        .post("/api/subscriptions/seats/revoke")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ parentUserId, seats: 1 });
      expect(ok.status).toBe(200);
      expect(ok.body.data.seatsRevoked).toBe(1);
    }

    const adminList = await request(app)
      .get("/api/subscriptions/admin")
      .set("Authorization", `Bearer ${adminToken}`);
    expect(adminList.status).toBe(200);
    expect(adminList.body.data[0].seats).toBeTruthy();
  });

  afterAll(async () => {
    if (!lessonId) return;
    await prisma.questionAttempt.deleteMany({
      where: { session: { lessonId } },
    });
    await prisma.learningSession.deleteMany({ where: { lessonId } });
    await prisma.childLessonProgress.deleteMany({ where: { lessonId } });
    await prisma.classroomLessonAssignment.deleteMany({ where: { lessonId } });
    await prisma.lessonVocabItem.deleteMany({ where: { lessonId } });
    await prisma.lesson.deleteMany({ where: { id: lessonId } });
    if (wordIds.length) {
      await prisma.vocabularyWord.deleteMany({
        where: { id: { in: wordIds } },
      });
    }
  });
});
