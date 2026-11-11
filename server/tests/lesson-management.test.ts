import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { prisma } from "../src/lib/prisma.js";

const app = createApp();
const hasDb = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDb)("Admin lesson management", () => {
  let adminToken = "";
  let parentToken = "";
  const stamp = Date.now();
  let categoryId = "";
  let wordIds: string[] = [];
  let childA = "";
  let childB = "";
  let otherCategoryId = "";

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

    const cats = await request(app)
      .get("/api/admin/content/categories")
      .set("Authorization", `Bearer ${adminToken}`);
    expect(cats.status).toBe(200);
    const rows = cats.body.data as Array<{ id: string; isPublished: boolean }>;
    const grade1Ids = new Set(
      (
        await prisma.learningCategory.findMany({
          where: { group: { level: { code: "LEVEL_1" } } },
          select: { id: true },
        })
      ).map((c) => c.id)
    );
    const published = rows.filter((c) => c.isPublished && grade1Ids.has(c.id));
    expect(published.length).toBeGreaterThan(0);
    categoryId = published[0].id;
    otherCategoryId = published[1]?.id ?? rows.find((c) => c.id !== categoryId)?.id ?? categoryId;
    // Ensure selected category stays published for kids Listen/Spell
    await request(app)
      .patch(`/api/admin/content/categories/${categoryId}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ isPublished: true });

    // Ensure at least 3 active words in category
    for (let i = 0; i < 3; i++) {
      // Shift by position so repeated digits never become 4+ identical letters (WORD_QUALITY rule).
      const text = `lsn${String(stamp + i).replace(/\d/g, (d, at: number) => (at % 2 ? "klmnopqrst" : "abcdefghij")[Number(d)])}`;
      const created = await request(app)
        .post("/api/admin/vocabulary/words")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({
          categoryId,
          text,
          meaning: `Meaning ${i} for lesson tests.`,
          emoji: "📘",
        });
      expect(created.status).toBe(201);
      wordIds.push(created.body.data.id);
    }

    const children = await prisma.child.findMany({
      where: { parent: { email: "parent@littlereaders.test" }, isActive: true },
      take: 2,
      orderBy: { createdAt: "asc" },
    });
    expect(children.length).toBeGreaterThanOrEqual(1);
    childA = children[0].id;
    childB = children[1]?.id ?? children[0].id;
  });

  it("blocks PARENT from admin lesson APIs", async () => {
    const res = await request(app)
      .get("/api/admin/lessons")
      .set("Authorization", `Bearer ${parentToken}`);
    expect(res.status).toBe(403);
  });

  it("creates, updates, assigns words, publishes, unpublishes, deactivates", async () => {
    const created = await request(app)
      .post("/api/admin/lessons")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        title: `Lesson ${stamp}`,
        description: "Batch 7 lesson",
        instructions: "Listen then spell.",
        learningCategoryId: categoryId,
        activities: ["LISTEN", "SPELL"],
      });
    expect(created.status).toBe(201);
    const id = created.body.data.id as string;
    expect(created.body.data.isPublished).toBe(false);

    const badPlace = await request(app)
      .patch(`/api/admin/lessons/${id}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        learningCategoryId: otherCategoryId,
        gradeId: "nonexistent-grade",
      });
    // nonexistent grade with category that resolves its own grade → gradeId overridden by category
    // Force invalid: wrong grade vs category
    const cat = await prisma.learningCategory.findUnique({
      where: { id: categoryId },
      include: { group: { include: { level: true } } },
    });
    const wrongGrade = await prisma.learningGrade.findFirst({
      where: { id: { not: cat?.group.level.gradeId ?? undefined } },
    });
    if (wrongGrade && cat) {
      const invalid = await request(app)
        .patch(`/api/admin/lessons/${id}`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({
          learningCategoryId: categoryId,
          gradeId: wrongGrade.id,
        });
      expect(invalid.status).toBe(400);
    }
    void badPlace;

    const words = await request(app)
      .put(`/api/admin/lessons/${id}/words`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ vocabularyWordIds: wordIds });
    expect(words.status).toBe(200);
    expect(words.body.data.vocabItems).toHaveLength(3);

    const dup = await request(app)
      .put(`/api/admin/lessons/${id}/words`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ vocabularyWordIds: [wordIds[0], wordIds[0]] });
    expect(dup.status).toBe(400);

    // inactive word rejected
    await request(app)
      .post(`/api/admin/vocabulary/words/${wordIds[2]}/deactivate`)
      .set("Authorization", `Bearer ${adminToken}`);
    const inactiveAdd = await request(app)
      .put(`/api/admin/lessons/${id}/words`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ vocabularyWordIds: wordIds });
    expect(inactiveAdd.status).toBe(400);

    await request(app)
      .patch(`/api/admin/vocabulary/words/${wordIds[2]}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ isActive: true });

    await request(app)
      .put(`/api/admin/lessons/${id}/words`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ vocabularyWordIds: wordIds });

    const preview = await request(app)
      .get(`/api/admin/lessons/${id}/preview`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(preview.status).toBe(200);
    expect(preview.body.data.wordCount).toBe(3);

    const publish = await request(app)
      .post(`/api/admin/lessons/${id}/publish`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(publish.status).toBe(200);
    expect(publish.body.data.isPublished).toBe(true);

    const unpub = await request(app)
      .post(`/api/admin/lessons/${id}/unpublish`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(unpub.status).toBe(200);
    expect(unpub.body.data.isPublished).toBe(false);

    await request(app)
      .post(`/api/admin/lessons/${id}/publish`)
      .set("Authorization", `Bearer ${adminToken}`);

    const deact = await request(app)
      .post(`/api/admin/lessons/${id}/deactivate`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(deact.status).toBe(200);
    expect(deact.body.data.isActive).toBe(false);
  });

  it("keeps independent progress for two children and supports resume + idempotent scoring", async () => {
    const created = await request(app)
      .post("/api/admin/lessons")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        title: `Play Lesson ${stamp}`,
        learningCategoryId: categoryId,
        activities: ["LISTEN", "SPELL"],
      });
    const lessonId = created.body.data.id as string;
    await request(app)
      .put(`/api/admin/lessons/${lessonId}/words`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ vocabularyWordIds: wordIds });
    await request(app)
      .post(`/api/admin/lessons/${lessonId}/publish`)
      .set("Authorization", `Bearer ${adminToken}`);

    const startA = await request(app)
      .post("/api/learning/sessions")
      .set("Authorization", `Bearer ${parentToken}`)
      .send({ childId: childA, lessonId });
    expect([200, 201]).toContain(startA.status);
    const sessionA = startA.body.data.sessionId as string;
    const wordId = startA.body.data.questions[0].word.id as string;

    const attempt1 = await request(app)
      .post(`/api/learning/sessions/${sessionA}/attempts`)
      .set("Authorization", `Bearer ${parentToken}`)
      .send({
        wordId,
        round: "LISTEN",
        isCorrect: true,
        answerGiven: "ok",
      });
    expect(attempt1.status).toBe(201);
    expect(attempt1.body.data.duplicate).toBe(false);

    const attempt2 = await request(app)
      .post(`/api/learning/sessions/${sessionA}/attempts`)
      .set("Authorization", `Bearer ${parentToken}`)
      .send({
        wordId,
        round: "LISTEN",
        isCorrect: true,
        answerGiven: "ok",
      });
    expect(attempt2.status).toBe(201);
    expect(attempt2.body.data.duplicate).toBe(true);
    expect(attempt2.body.data.pointsAwarded).toBe(attempt1.body.data.pointsAwarded);

    const resume = await request(app)
      .post("/api/learning/sessions")
      .set("Authorization", `Bearer ${parentToken}`)
      .send({ childId: childA, lessonId, resume: true });
    expect(resume.status).toBe(200);
    expect(resume.body.data.sessionId).toBe(sessionA);
    expect(resume.body.data.resumed).toBe(true);

    // Child B gets a separate session
    if (childB !== childA) {
      const startB = await request(app)
        .post("/api/learning/sessions")
        .set("Authorization", `Bearer ${parentToken}`)
        .send({ childId: childB, lessonId });
      expect([200, 201]).toContain(startB.status);
      expect(startB.body.data.sessionId).not.toBe(sessionA);
    }

    const complete = await request(app)
      .post(`/api/learning/sessions/${sessionA}/complete`)
      .set("Authorization", `Bearer ${parentToken}`)
      .send({ durationSec: 30 });
    expect(complete.status).toBe(200);

    const progress = await prisma.childLessonProgress.findUnique({
      where: { childId_lessonId: { childId: childA, lessonId } },
    });
    expect(progress?.completed).toBe(true);

    // Category Listen still works
    await prisma.learningCategory.update({
      where: { id: categoryId },
      data: { isPublished: true },
    });
    const catSession = await request(app)
      .post("/api/learning/sessions")
      .set("Authorization", `Bearer ${parentToken}`)
      .send({
        childId: childA,
        categoryId,
        questionCount: 5,
      });
    expect([200, 201]).toContain(catSession.status);
  });

  afterAll(async () => {
    const testLessons = await prisma.lesson.findMany({
      where: {
        OR: [
          { title: `Lesson ${stamp}` },
          { title: `Play Lesson ${stamp}` },
        ],
      },
      select: { id: true },
    });
    const ids = testLessons.map((l) => l.id);
    if (ids.length) {
      await prisma.questionAttempt.deleteMany({
        where: { session: { lessonId: { in: ids } } },
      });
      await prisma.learningSession.deleteMany({
        where: { lessonId: { in: ids } },
      });
      await prisma.childLessonProgress.deleteMany({
        where: { lessonId: { in: ids } },
      });
      await prisma.classroomLessonAssignment.deleteMany({
        where: { lessonId: { in: ids } },
      });
      await prisma.lessonVocabItem.deleteMany({
        where: { lessonId: { in: ids } },
      });
      await prisma.lesson.deleteMany({ where: { id: { in: ids } } });
    }
    if (wordIds.length) {
      await prisma.vocabularyWord.deleteMany({
        where: { id: { in: wordIds } },
      });
    }
  });
});


