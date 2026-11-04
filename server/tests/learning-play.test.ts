import { beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { prisma } from "../src/lib/prisma.js";

const app = createApp();
const hasDb = Boolean(process.env.DATABASE_URL);

async function ensureActiveSubscription(userId: string) {
  const expiresAt = new Date();
  expiresAt.setFullYear(expiresAt.getFullYear() + 1);
  const existing = await prisma.subscription.findFirst({ where: { userId } });
  if (!existing) {
    await prisma.subscription.create({
      data: {
        userId,
        plan: "MONTHLY",
        status: "ACTIVE",
        startedAt: new Date(),
        expiresAt,
        provider: "test",
        providerRef: `play_test_${userId.slice(0, 8)}_${Date.now()}`,
      },
    });
  } else {
    await prisma.subscription.update({
      where: { id: existing.id },
      data: { status: "ACTIVE", expiresAt, cancelledAt: null },
    });
  }
}

describe.skipIf(!hasDb)("Listen / Spell / progress persistence", () => {
  let parentAToken = "";
  let parentBToken = "";
  let childA = "";
  let childB = "";
  let categoryId = "";
  let sessionId = "";
  let wordId = "";
  let correctKey = "";
  let firstLetter = "";

  beforeAll(async () => {
    process.env.JWT_SECRET =
      process.env.JWT_SECRET ?? "dev_only_change_me_to_a_long_random_secret_value";

    const stamp = Date.now();
    const regA = await request(app)
      .post("/api/auth/register")
      .send({
        name: "Play Parent A",
        email: `play.a.${stamp}@littlereaders.test`,
        password: "ParentDemo1",
        acceptTerms: true,
        acceptPrivacy: true,
        parentalConsent: true,
      });
    expect(regA.status).toBe(201);
    parentAToken = regA.body.data.tokens.accessToken as string;
    await ensureActiveSubscription(regA.body.data.user.id as string);

    const regB = await request(app)
      .post("/api/auth/register")
      .send({
        name: "Play Parent B",
        email: `play.b.${stamp}@littlereaders.test`,
        password: "ParentDemo1",
        acceptTerms: true,
        acceptPrivacy: true,
        parentalConsent: true,
      });
    expect(regB.status).toBe(201);
    parentBToken = regB.body.data.tokens.accessToken as string;
    await ensureActiveSubscription(regB.body.data.user.id as string);

    const childResA = await request(app)
      .post("/api/children")
      .set("Authorization", `Bearer ${parentAToken}`)
      .send({ displayName: "PlayKidA", birthYear: 2023 });
    expect(childResA.status).toBe(201);
    childA = childResA.body.data.id as string;

    const childResB = await request(app)
      .post("/api/children")
      .set("Authorization", `Bearer ${parentBToken}`)
      .send({ displayName: "PlayKidB", birthYear: 2023 });
    expect(childResB.status).toBe(201);
    childB = childResB.body.data.id as string;

    const groups = await request(app)
      .get(`/api/learning/levels/1/groups?childId=${childA}`)
      .set("Authorization", `Bearer ${parentAToken}`);
    expect(groups.status).toBe(200);
    const cats = groups.body.data.groups.flatMap(
      (g: { categories: Array<{ id: string }> }) => g.categories
    );
    categoryId = cats[0].id;

    // Fixture words for play tests (production seed keeps vocabulary empty).
    const wordStamp = `playfix_${Date.now()}`;
    for (let i = 0; i < 8; i++) {
      await prisma.vocabularyWord.create({
        data: {
          categoryId,
          text: `${wordStamp}_w${i}`,
          meaning: `fixture meaning ${i}`,
          emoji: "📘",
          firstLetter: "P",
          sortOrder: i + 1,
          isActive: true,
        },
      });
    }
  });

  it("starts Listen session with four A–D options and word media fields", async () => {
    const res = await request(app)
      .post("/api/learning/sessions")
      .set("Authorization", `Bearer ${parentAToken}`)
      .send({ childId: childA, categoryId, questionCount: 5 });
    expect(res.status).toBe(201);
    sessionId = res.body.data.sessionId;
    const q0 = res.body.data.questions[0];
    wordId = q0.word.id;
    firstLetter = q0.word.firstLetter;
    expect(q0.listenOptions).toHaveLength(4);
    expect(q0.word).toMatchObject({
      id: expect.any(String),
      text: expect.any(String),
      meaning: expect.any(String),
      firstLetter: expect.any(String),
    });
    // imageUrl / audioUrl may be null until owner uploads assets — never invented
    expect("imageUrl" in q0.word).toBe(true);
    expect("audioUrl" in q0.word).toBe(true);
    correctKey = q0.listenOptions.find(
      (o: { isCorrect: boolean }) => o.isCorrect
    ).key;
  });

  it("records Listen then Letter attempts with scoring", async () => {
    const listen = await request(app)
      .post(`/api/learning/sessions/${sessionId}/attempts`)
      .set("Authorization", `Bearer ${parentAToken}`)
      .send({
        wordId,
        round: "LISTEN",
        isCorrect: true,
        answerGiven: correctKey,
        usedClue: false,
        pointsAwarded: 10,
      });
    expect(listen.status).toBe(201);
    expect(listen.body.data.pointsAwarded).toBe(10);
    expect(listen.body.data.duplicate).toBe(false);

    const letter = await request(app)
      .post(`/api/learning/sessions/${sessionId}/attempts`)
      .set("Authorization", `Bearer ${parentAToken}`)
      .send({
        wordId,
        round: "LETTER",
        isCorrect: true,
        answerGiven: firstLetter,
        pointsAwarded: 6,
      });
    expect(letter.status).toBe(201);
    expect(letter.body.data.pointsAwarded).toBe(6);
  });

  it("rejects duplicate correct Listen score (idempotent)", async () => {
    const dup = await request(app)
      .post(`/api/learning/sessions/${sessionId}/attempts`)
      .set("Authorization", `Bearer ${parentAToken}`)
      .send({
        wordId,
        round: "LISTEN",
        isCorrect: true,
        answerGiven: correctKey,
        pointsAwarded: 10,
      });
    expect(dup.status).toBe(201);
    expect(dup.body.data.duplicate).toBe(true);
    expect(dup.body.data.pointsAwarded).toBe(10);

    // Session points should still reflect a single Listen award of 10 (+ letter 6)
    const progressBefore = await request(app)
      .get(`/api/learning/progress/${childA}`)
      .set("Authorization", `Bearer ${parentAToken}`);
    expect(progressBefore.status).toBe(200);
  });

  it("completes session once and returns results summary", async () => {
    const done = await request(app)
      .post(`/api/learning/sessions/${sessionId}/complete`)
      .set("Authorization", `Bearer ${parentAToken}`)
      .send({ durationSec: 120 });
    expect(done.status).toBe(200);
    expect(done.body.data.points).toBeGreaterThanOrEqual(16);
    expect(done.body.data.stars).toBeGreaterThanOrEqual(0);
    expect(done.body.data.accuracy).toBeGreaterThanOrEqual(0);
    expect(done.body.data.wordsLearned).toBeGreaterThanOrEqual(1);
    expect(done.body.data.childName).toBe("PlayKidA");

    const again = await request(app)
      .post(`/api/learning/sessions/${sessionId}/complete`)
      .set("Authorization", `Bearer ${parentAToken}`)
      .send({ durationSec: 120 });
    expect(again.status).toBe(200);
    expect(again.body.data.points).toBe(done.body.data.points);
    expect(again.body.data.stars).toBe(done.body.data.stars);
  });

  it("blocks parent B from child A progress and sessions", async () => {
    const progress = await request(app)
      .get(`/api/learning/progress/${childA}`)
      .set("Authorization", `Bearer ${parentBToken}`);
    expect(progress.status).toBe(404);

    const attempt = await request(app)
      .post(`/api/learning/sessions/${sessionId}/attempts`)
      .set("Authorization", `Bearer ${parentBToken}`)
      .send({
        wordId,
        round: "SPELL",
        isCorrect: true,
        answerGiven: "x",
        pointsAwarded: 8,
      });
    expect([404, 400]).toContain(attempt.status);

    const foreignSession = await request(app)
      .post("/api/learning/sessions")
      .set("Authorization", `Bearer ${parentBToken}`)
      .send({ childId: childA, categoryId, questionCount: 5 });
    expect(foreignSession.status).toBe(404);

    // Parent B can still play with own child
    const own = await request(app)
      .post("/api/learning/sessions")
      .set("Authorization", `Bearer ${parentBToken}`)
      .send({ childId: childB, categoryId, questionCount: 5 });
    expect(own.status).toBe(201);
  });

  it("rejects attempts after session is closed", async () => {
    const closed = await request(app)
      .post(`/api/learning/sessions/${sessionId}/attempts`)
      .set("Authorization", `Bearer ${parentAToken}`)
      .send({
        wordId,
        round: "SPELL",
        isCorrect: true,
        answerGiven: "ok",
        pointsAwarded: 8,
      });
    expect(closed.status).toBe(400);
  });
});
