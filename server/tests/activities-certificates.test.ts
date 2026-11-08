import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { prisma } from "../src/lib/prisma.js";
import { updateCategory } from "../src/content-structure/content-structure.service.js";

const app = createApp();
const hasDb = Boolean(process.env.DATABASE_URL);
const TAG = `ZZTEST_${Date.now()}`;

describe.skipIf(!hasDb)("Shared activities, mixed sessions and certificates", () => {
  let adminToken = "";
  let parentToken = "";
  let childId = "";
  let siblingId: string | null = null;
  let categoryId = "";
  let draftCategoryId = "";
  let wordIds: string[] = [];

  const asParent = (r: request.Test) => r.set("Authorization", `Bearer ${parentToken}`);
  const asAdmin = (r: request.Test) => r.set("Authorization", `Bearer ${adminToken}`);

  beforeAll(async () => {
    process.env.JWT_SECRET =
      process.env.JWT_SECRET ?? "dev_only_change_me_to_a_long_random_secret_value";
    const admin = await request(app)
      .post("/api/auth/login")
      .send({ email: "superadmin@littlereaders.test", password: "SuperDemo1" });
    adminToken = admin.body.data.tokens.accessToken;
    const parent = await request(app)
      .post("/api/auth/login")
      .send({ email: "parent@littlereaders.test", password: "ParentDemo1" });
    parentToken = parent.body.data.tokens.accessToken;

    const kids = await asParent(request(app).get("/api/children"));
    const seated = (kids.body.data as Array<{ id: string; hasLearningSeat?: boolean }>).filter(
      (k) => k.hasLearningSeat !== false
    );
    expect(seated.length).toBeGreaterThan(0);
    childId = seated[0].id;
    siblingId = seated[1]?.id ?? null;

    const child = await prisma.child.findUniqueOrThrow({ where: { id: childId } });
    const group = await prisma.learningGroup.findFirstOrThrow({
      where: { levelId: child.levelId ?? undefined },
      orderBy: { sortOrder: "asc" },
    });
    const cat = await prisma.learningCategory.create({
      data: {
        groupId: group.id,
        code: TAG,
        label: `Test ${TAG}`,
        emoji: "🧪",
        sortOrder: 999,
        unlockOrder: 0,
        isPublished: true,
        words: {
          create: ["zzcat", "zzdog", "zzhen", "zzcow"].map((text, i) => ({
            text,
            meaning: `test word ${i}`,
            emoji: "🐾",
            sortOrder: i,
          })),
        },
      },
      include: { words: true },
    });
    categoryId = cat.id;
    wordIds = cat.words.map((w) => w.id);

    const draft = await prisma.learningCategory.create({
      data: {
        groupId: group.id,
        code: `${TAG}_D`,
        label: `Draft ${TAG}`,
        isPublished: false,
        words: { create: [{ text: "zznomeaning", meaning: " ", emoji: "🐾" }] },
      },
    });
    draftCategoryId = draft.id;
  });

  let matchItBefore: { enabled: boolean } | null = null;

  afterAll(async () => {
    if (matchItBefore) {
      await prisma.activitySetting.update({
        where: { code: "MATCH_IT" },
        data: { enabled: matchItBefore.enabled },
      });
    } else {
      await prisma.activitySetting.deleteMany({ where: { code: "MATCH_IT" } });
    }
    await prisma.certificate.deleteMany({ where: { categoryId: { in: [categoryId, draftCategoryId] } } });
    await prisma.achievement.deleteMany({ where: { code: { contains: TAG } } });
    await prisma.learningCategory.deleteMany({ where: { id: { in: [categoryId, draftCategoryId] } } });
  });

  it("gives admin and parent the same five activities", async () => {
    const p = await asParent(request(app).get("/api/learning/activities"));
    const a = await asAdmin(request(app).get("/api/learning/activities"));
    expect(p.status).toBe(200);
    const codes = p.body.data.map((x: { code: string }) => x.code);
    expect(codes).toEqual(["LISTEN", "SPELL", "MATCH_IT", "QUIZ_TIME", "SURPRISE"]);
    expect(a.body.data.map((x: { code: string }) => x.code)).toEqual(codes);
  });

  it("applies the admin ON/OFF switch to parents and blocks the game", async () => {
    matchItBefore = await prisma.activitySetting.findUnique({ where: { code: "MATCH_IT" } });
    const off = await asAdmin(request(app).put("/api/learning/activities/MATCH_IT")).send({ enabled: false });
    expect(off.status).toBe(200);
    const seen = await asParent(request(app).get("/api/learning/activities"));
    expect(seen.body.data.find((x: { code: string }) => x.code === "MATCH_IT").enabled).toBe(false);
    const blocked = await asParent(request(app).post("/api/learning/sessions")).send({
      childId,
      categoryId,
      activityMode: "MATCHING",
    });
    expect(blocked.status).toBe(403);
    const parentPut = await asParent(request(app).put("/api/learning/activities/MATCH_IT")).send({ enabled: true });
    expect(parentPut.status).toBe(403);
    const on = await asAdmin(request(app).put("/api/learning/activities/MATCH_IT")).send({ enabled: true });
    expect(on.status).toBe(200);
  });

  it("issues one certificate when every word is learned, only for that child", async () => {
    const start = await asParent(request(app).post("/api/learning/sessions")).send({
      childId,
      categoryId,
      questionCount: 4,
      resume: false,
    });
    expect([200, 201]).toContain(start.status);
    const sessionId = start.body.data.sessionId;
    for (const wordId of wordIds) {
      const r = await asParent(request(app).post(`/api/learning/sessions/${sessionId}/attempts`)).send({
        wordId,
        round: "LISTEN",
        isCorrect: true,
      });
      expect(r.status).toBe(201);
    }
    const done = await asParent(request(app).post(`/api/learning/sessions/${sessionId}/complete`)).send({
      durationSec: 30,
    });
    expect(done.status).toBe(200);
    expect(done.body.data.newCertificates).toHaveLength(1);
    const cert = done.body.data.newCertificates[0];
    expect(cert.certificateNo).toMatch(/^LW-\d{4}-[A-Z0-9]{6}$/);
    expect(cert.category.label).toBe(`Test ${TAG}`);

    const view = await asParent(request(app).get(`/api/learning/certificates/${cert.id}`));
    expect(view.status).toBe(200);
    expect(view.body.data.childName).toBeTruthy();

    const progress = await asParent(
      request(app).get(`/api/learning/progress/${childId}/categories/${categoryId}`)
    );
    expect(progress.body.data.wordsLearned).toBe(4);
    expect(progress.body.data.byActivity.LISTEN).toBe(4);
    expect(progress.body.data.certificate.id).toBe(cert.id);

    // Replaying does not issue a second certificate.
    const again = await asParent(request(app).post("/api/learning/sessions")).send({
      childId,
      categoryId,
      activityMode: "QUIZ",
      questionCount: 4,
    });
    const againDone = await asParent(
      request(app).post(`/api/learning/sessions/${again.body.data.sessionId}/complete`)
    ).send({});
    expect(againDone.body.data.newCertificates).toHaveLength(0);
    expect(await prisma.certificate.count({ where: { childId, categoryId } })).toBe(1);

    if (siblingId) {
      const sib = await asParent(
        request(app).get(`/api/learning/progress/${siblingId}/categories/${categoryId}`)
      );
      expect(sib.body.data.wordsLearned).toBe(0);
      expect(sib.body.data.certificate).toBeNull();
    }
  });

  it("does not resume an abandoned game as Listen/Spell", async () => {
    await asParent(request(app).post("/api/learning/sessions")).send({
      childId,
      categoryId,
      activityMode: "MATCHING",
      questionCount: 4,
    });
    const active = await asParent(
      request(app).get(`/api/learning/sessions/active?childId=${childId}&categoryId=${categoryId}`)
    );
    expect(active.body.data).toBeNull();
  });

  it("runs a Daily Challenge with words from several categories", async () => {
    const start = await asParent(request(app).post("/api/learning/sessions")).send({
      childId,
      mix: "DAILY_CHALLENGE",
      activityMode: "QUIZ",
    });
    expect(start.status).toBe(201);
    expect(start.body.data.mix).toBe("DAILY_CHALLENGE");
    const q = start.body.data.questions[0];
    const r = await asParent(
      request(app).post(`/api/learning/sessions/${start.body.data.sessionId}/attempts`)
    ).send({ wordId: q.word.id, round: "QUIZ", isCorrect: true });
    expect(r.status).toBe(201);
    const done = await asParent(
      request(app).post(`/api/learning/sessions/${start.body.data.sessionId}/complete`)
    ).send({ durationSec: 20 });
    expect(done.status).toBe(200);
    expect(done.body.data.category.label).toBe("Daily Challenge");
    const status = await asParent(request(app).get(`/api/learning/progress/${childId}/daily-challenge`));
    expect(status.body.data.completedToday).toBe(true);
  });

  it("reports readiness and refuses to publish a category with missing meanings", async () => {
    const res = await asAdmin(request(app).get("/api/learning/admin/readiness?level=LEVEL_1"));
    expect(res.status).toBe(200);
    const draft = res.body.data.find((c: { id: string }) => c.id === draftCategoryId);
    if (draft) expect(draft.ready).toBe(false);
    await expect(updateCategory(draftCategoryId, { isPublished: true })).rejects.toThrow(/not ready/);
  });
});
