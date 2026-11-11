import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { prisma } from "../src/lib/prisma.js";
import { hashPassword } from "../src/lib/password.js";
import { categoryAchievementCode, certificateAchievementCode } from "../src/learning/grade-access.js";

const app = createApp();
const hasDb = Boolean(process.env.DATABASE_URL);
const TAG = `gradetest_${Date.now()}`;

type Snapshot = { categories: number; words: number; lessons: number };

async function grade1Snapshot(): Promise<Snapshot> {
  const [categories, words, lessons] = await Promise.all([
    prisma.learningCategory.count({ where: { isPublished: true, group: { level: { code: "LEVEL_1" } } } }),
    prisma.vocabularyWord.count({
      where: {
        isActive: true,
        category: { isPublished: true, group: { level: { code: "LEVEL_1" } } },
        NOT: [{ text: { startsWith: "playfix_" } }, { text: { startsWith: "seatfix_" } }],
      },
    }),
    prisma.lesson.count({ where: { level: { code: "LEVEL_1" } } }),
  ]);
  return { categories, words, lessons };
}

describe.skipIf(!hasDb)("Learn Wise grade-wise access (Grade 1 vs Grade 2)", () => {
  let parentId = "";
  let parentToken = "";
  let adminToken = "";
  let level1Id = "";
  let level2Id = "";
  let g1ChildId = "";
  let g2ChildId = "";
  let g1CategoryId = "";
  let g2CategoryId = "";
  let g2LessonId = "";
  let g1GradeSubId = "";
  let g2GradeSubId = "";
  let before: Snapshot;
  const wordIds: string[] = [];

  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });
  const startCategory = (childId: string, categoryId: string) =>
    request(app).post("/api/learning/sessions").set(auth(parentToken)).send({ childId, categoryId, questionCount: 5 });

  beforeAll(async () => {
    process.env.JWT_SECRET =
      process.env.JWT_SECRET ?? "dev_only_change_me_to_a_long_random_secret_value";
    before = await grade1Snapshot();

    const [l1, l2] = await Promise.all([
      prisma.learningLevel.findUniqueOrThrow({ where: { code: "LEVEL_1" } }),
      prisma.learningLevel.findUniqueOrThrow({ where: { code: "LEVEL_2" } }),
    ]);
    level1Id = l1.id;
    level2Id = l2.id;
    expect(l2.isPublished).toBe(true);

    const email = `${TAG}@example.com`;
    const user = await prisma.user.create({
      data: { name: "Grade Test Parent", email, passwordHash: await hashPassword("ParentPass1"), role: "PARENT", isActive: true },
    });
    parentId = user.id;
    const login = await request(app).post("/api/auth/login").send({ email, password: "ParentPass1" });
    expect(login.status).toBe(200);
    parentToken = login.body.data.tokens.accessToken;

    const adminLogin = await request(app)
      .post("/api/auth/login")
      .send({ email: "admin@littlereaders.test", password: "AdminDemo1" });
    expect(adminLogin.status).toBe(200);
    adminToken = adminLogin.body.data.tokens.accessToken;

    const g1Cat = await prisma.learningCategory.findFirstOrThrow({
      where: { isPublished: true, group: { levelId: level1Id }, words: { some: { isActive: true } } },
      orderBy: { unlockOrder: "asc" },
    });
    g1CategoryId = g1Cat.id;

    // Temporary Grade 2 fixture (removed in afterAll); real Grade 2 categories stay untouched.
    const groupC = await prisma.learningGroup.findFirstOrThrow({ where: { levelId: level2Id, code: "C" } });
    const g2Cat = await prisma.learningCategory.create({
      data: { groupId: groupC.id, code: TAG, label: `Test ${TAG}`, emoji: "🧪", sortOrder: 999, unlockOrder: 0, isPublished: true },
    });
    g2CategoryId = g2Cat.id;
    for (let i = 0; i < 8; i++) {
      const w = await prisma.vocabularyWord.create({
        data: { categoryId: g2CategoryId, text: `${TAG}w${i}`, meaning: `grade two word ${i}`, emoji: "⭐", firstLetter: "G", sortOrder: i + 1, isActive: true },
      });
      wordIds.push(w.id);
    }
    const lesson = await prisma.lesson.create({
      data: {
        title: `Grade 2 lesson ${TAG}`,
        category: "test",
        levelId: level2Id,
        status: "PUBLISHED",
        isPublished: true,
        isActive: true,
        vocabItems: { create: wordIds.map((vocabularyWordId, i) => ({ vocabularyWordId, sortOrder: i })) },
      },
    });
    g2LessonId = lesson.id;
  });

  afterAll(async () => {
    const children = await prisma.child.findMany({ where: { parentId }, select: { id: true } });
    const childIds = children.map((c) => c.id);
    await prisma.questionAttempt.deleteMany({ where: { session: { childId: { in: childIds } } } });
    await prisma.pointsTransaction.deleteMany({ where: { childId: { in: childIds } } });
    await prisma.learningSession.deleteMany({ where: { childId: { in: childIds } } });
    await prisma.lesson.deleteMany({ where: { id: g2LessonId } });
    await prisma.vocabularyWord.deleteMany({ where: { categoryId: g2CategoryId } });
    await prisma.learningCategory.deleteMany({ where: { id: g2CategoryId } });
    await prisma.subscriptionAuditEvent.deleteMany({ where: { userId: parentId } });
    await prisma.payment.deleteMany({ where: { userId: parentId } });
    await prisma.subscription.deleteMany({ where: { userId: parentId } });
    await prisma.child.deleteMany({ where: { parentId } });
    await prisma.user.deleteMany({ where: { id: parentId } });
  });

  it("parent picks the grade explicitly; birthday edits never change it; unpublished grades are refused", async () => {
    const g1 = await request(app).post("/api/children").set(auth(parentToken))
      .send({ displayName: "Gina One", birthDate: "10/02/2019", level: "LEVEL_1" });
    expect(g1.status, JSON.stringify(g1.body)).toBe(201);
    g1ChildId = g1.body.data.id;
    expect(g1.body.data.level).toBe("LEVEL_1");

    const g2 = await request(app).post("/api/children").set(auth(parentToken))
      .send({ displayName: "Theo Two", birthDate: "10/02/2023", level: "LEVEL_2" });
    expect(g2.status).toBe(201);
    g2ChildId = g2.body.data.id;
    expect(g2.body.data.level).toBe("LEVEL_2");

    const edit = await request(app).patch(`/api/children/${g2ChildId}`).set(auth(parentToken))
      .send({ birthDate: "10/02/2016" });
    expect(edit.status).toBe(200);
    expect(edit.body.data.level).toBe("LEVEL_2");

    const comingSoon = await request(app).post("/api/children").set(auth(parentToken))
      .send({ displayName: "Future", birthDate: "10/02/2016", level: "LEVEL_3" });
    expect(comingSoon.status).toBe(400);
    expect(comingSoon.body.details?.code).toBe("GRADE_COMING_SOON");

    const list = await request(app).get("/api/children").set(auth(parentToken));
    const byId = new Map((list.body.data as { id: string; learnWiseGrade: { levelCode: string; gradeLabel: string } }[]).map((c) => [c.id, c]));
    expect(byId.get(g1ChildId)?.learnWiseGrade.gradeLabel).toMatch(/^Grade 1/);
    expect(byId.get(g2ChildId)?.learnWiseGrade.gradeLabel).toMatch(/^Grade 2/);
  });

  it("#12 missing entitlement blocks sessions with a grade-scoped message", async () => {
    const res = await startCategory(g2ChildId, g2CategoryId);
    expect(res.status).toBe(402);
    expect(res.body.details?.code).toBe("SUBSCRIPTION_REQUIRED");
    expect(res.body.details?.scope).toBe("GRADE");
    expect(res.body.details?.levelCode).toBe("LEVEL_2");
  });

  it("#9 a Grade 1 entitlement cannot unlock Grade 2", async () => {
    const grant = await request(app).post("/api/subscriptions/admin/grade-grant").set(auth(adminToken))
      .send({ childId: g2ChildId, levelId: level1Id, months: 1 });
    expect(grant.status).toBe(201);
    const res = await startCategory(g2ChildId, g2CategoryId);
    expect(res.status).toBe(402);
    expect(res.body.details?.scope).toBe("GRADE");
  });

  it("#10 a Grade 2 entitlement cannot unlock Grade 1", async () => {
    const grant = await request(app).post("/api/subscriptions/admin/grade-grant").set(auth(adminToken))
      .send({ childId: g1ChildId, levelId: level2Id, months: 1 });
    expect(grant.status).toBe(201);
    const res = await startCategory(g1ChildId, g1CategoryId);
    expect(res.status).toBe(402);
    expect(res.body.details?.levelCode).toBe("LEVEL_1");
  });

  it("grants each child its own grade (admin test entitlement)", async () => {
    const a = await request(app).post("/api/subscriptions/admin/grade-grant").set(auth(adminToken))
      .send({ childId: g1ChildId, levelId: level1Id, months: 1 });
    expect(a.status).toBe(201);
    expect(a.body.data.subscription.plan).toBe("GRADE_1_1M");
    g1GradeSubId = a.body.data.subscription.id;
    const b = await request(app).post("/api/subscriptions/admin/grade-grant").set(auth(adminToken))
      .send({ childId: g2ChildId, levelId: level2Id, months: 3 });
    expect(b.status).toBe(201);
    expect(b.body.data.subscription.plan).toBe("GRADE_2_3M");
    g2GradeSubId = b.body.data.subscription.id;
  });

  it("#1 the Grade 1 child learns Grade 1 normally", async () => {
    const groups = await request(app).get(`/api/learning/levels/1/groups?childId=${g1ChildId}`).set(auth(parentToken));
    expect(groups.status).toBe(200);
    expect(groups.body.data.level.code).toBe("LEVEL_1");
    expect(groups.body.data.access.entitled).toBe(true);
    expect(groups.body.data.access.via).toBe("GRADE");
    const res = await startCategory(g1ChildId, g1CategoryId);
    expect(res.status).toBe(201);
  });

  it("#2/#3 the Grade 2 child sees only Grade 2 groups and categories", async () => {
    const groups = await request(app).get(`/api/learning/levels/2/groups?childId=${g2ChildId}`).set(auth(parentToken));
    expect(groups.status).toBe(200);
    expect(groups.body.data.level.code).toBe("LEVEL_2");
    const cats = groups.body.data.groups.flatMap((g: { categories: { id: string }[] }) => g.categories);
    const ids = new Set(cats.map((c: { id: string }) => c.id));
    expect(ids.has(g2CategoryId)).toBe(true);
    expect(ids.has(g1CategoryId)).toBe(false);
    const g1Ids = await prisma.learningCategory.findMany({ where: { group: { levelId: level1Id } }, select: { id: true } });
    expect(g1Ids.some((c) => ids.has(c.id))).toBe(false);
    const labels = cats.map((c: { label: string }) => c.label);
    expect(labels).not.toContain("Animals");
    expect(labels).not.toContain("Body Parts");
  });

  it("#7 a Grade 1 child cannot open Grade 2 content", async () => {
    const groups = await request(app).get(`/api/learning/levels/2/groups?childId=${g1ChildId}`).set(auth(parentToken));
    expect(groups.status).toBe(403);
    const res = await startCategory(g1ChildId, g2CategoryId);
    expect(res.status).toBe(403);
    expect(res.body.details?.code).toBe("GRADE_CONTENT_FORBIDDEN");
    const lesson = await request(app).post("/api/learning/sessions").set(auth(parentToken))
      .send({ childId: g1ChildId, lessonId: g2LessonId, questionCount: 5 });
    expect(lesson.status).toBe(403);
    const lessons = await request(app).get(`/api/learning/lessons?childId=${g1ChildId}`).set(auth(parentToken));
    expect(lessons.status).toBe(200);
    expect(lessons.body.data.some((l: { id: string }) => l.id === g2LessonId)).toBe(false);
  });

  it("#8 a Grade 2 child cannot open Grade 1 content", async () => {
    const groups = await request(app).get(`/api/learning/levels/1/groups?childId=${g2ChildId}`).set(auth(parentToken));
    expect(groups.status).toBe(403);
    const res = await startCategory(g2ChildId, g1CategoryId);
    expect(res.status).toBe(403);
    expect(res.body.details?.code).toBe("GRADE_CONTENT_FORBIDDEN");
  });

  it("#4 Grade 2 lessons list and play for the Grade 2 child", async () => {
    const lessons = await request(app).get(`/api/learning/lessons?childId=${g2ChildId}`).set(auth(parentToken));
    expect(lessons.status).toBe(200);
    expect(lessons.body.data.some((l: { id: string }) => l.id === g2LessonId)).toBe(true);
    const start = await request(app).post("/api/learning/sessions").set(auth(parentToken))
      .send({ childId: g2ChildId, lessonId: g2LessonId, questionCount: 5 });
    expect(start.status).toBe(201);
  });

  it("#5/#6 Grade 2 games play and progress saves against Grade 2 only", async () => {
    const start = await request(app).post("/api/learning/sessions").set(auth(parentToken))
      .send({ childId: g2ChildId, categoryId: g2CategoryId, questionCount: 5, activityMode: "MATCHING" });
    expect(start.status).toBe(201);
    const sessionId = start.body.data.sessionId;
    const q0 = start.body.data.questions[0];
    const attempt = await request(app).post(`/api/learning/sessions/${sessionId}/attempts`).set(auth(parentToken))
      .send({ wordId: q0.word.id, round: "MATCHING", isCorrect: true, answerGiven: q0.word.text ?? "x", pointsAwarded: 5 });
    expect(attempt.status).toBe(201);
    const done = await request(app).post(`/api/learning/sessions/${sessionId}/complete`).set(auth(parentToken))
      .send({ durationSec: 30 });
    expect(done.status).toBe(200);

    const progress = await prisma.childCategoryProgress.findMany({
      where: { childId: g2ChildId },
      select: { category: { select: { group: { select: { levelId: true } } } } },
    });
    expect(progress.length).toBeGreaterThan(0);
    expect(progress.every((p) => p.category.group.levelId === level2Id)).toBe(true);
    const g1Progress = await prisma.childCategoryProgress.count({ where: { childId: g1ChildId, categoryId: g2CategoryId } });
    expect(g1Progress).toBe(0);
  });

  it("#11 the parent sees each child's grade and subscription", async () => {
    const res = await request(app).get("/api/subscriptions/children").set(auth(parentToken));
    expect(res.status).toBe(200);
    const rows = res.body.data as { childId: string; gradeLabel: string; entitled: boolean; via: string; gradeSubscriptions: { levelCode: string; eligible: boolean }[] }[];
    const g1 = rows.find((r) => r.childId === g1ChildId)!;
    const g2 = rows.find((r) => r.childId === g2ChildId)!;
    expect(g1.gradeLabel).toMatch(/^Grade 1/);
    expect(g1.entitled).toBe(true);
    expect(g1.via).toBe("GRADE");
    expect(g2.gradeLabel).toMatch(/^Grade 2/);
    expect(g2.entitled).toBe(true);
    expect(g2.gradeSubscriptions.some((s) => s.levelCode === "LEVEL_2" && s.eligible)).toBe(true);
  });

  it("#12 an expired entitlement blocks sessions again", async () => {
    const exp = await request(app).post(`/api/subscriptions/admin/grade-subscriptions/${g2GradeSubId}/expire`).set(auth(adminToken));
    expect(exp.status).toBe(200);
    const res = await startCategory(g2ChildId, g2CategoryId);
    expect(res.status).toBe(402);
    expect(res.body.details?.scope).toBe("GRADE");
    const g1 = await startCategory(g1ChildId, g1CategoryId);
    expect(g1.status).toBe(201);
    expect(g1GradeSubId).toBeTruthy();
  });

  it("grade-specific achievement and certificate codes keep Grade 1 unchanged", () => {
    expect(categoryAchievementCode("LEVEL_1", "animals")).toBe("cat_animals");
    expect(certificateAchievementCode("LEVEL_1", "animals")).toBe("cert_animals");
    expect(categoryAchievementCode("LEVEL_2", "animals")).toBe("cat_LEVEL_2_animals");
    expect(certificateAchievementCode("LEVEL_2", "animals")).toBe("cert_LEVEL_2_animals");
  });

  it("#13 Grade 2 changes leave Grade 1 content untouched", async () => {
    const after = await grade1Snapshot();
    expect(after.categories).toBe(before.categories);
    expect(after.words).toBe(before.words);
    expect(after.lessons).toBe(before.lessons);
    expect(after.categories).toBe(10);
    expect(after.words).toBe(750);
  });
});
