import { beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";

const app = createApp();
const hasDb = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDb)("Level 1 learning API", () => {
  let token = "";
  let childId = "";
  let categoryId = "";
  let sessionId = "";
  let wordId = "";
  let correctKey = "";

  beforeAll(async () => {
    process.env.JWT_SECRET =
      process.env.JWT_SECRET ?? "dev_only_change_me_to_a_long_random_secret_value";

    const login = await request(app).post("/api/auth/login").send({
      email: "parent@littlereaders.test",
      password: "ParentDemo1",
    });
    expect(login.status).toBe(200);
    token = login.body.data.tokens.accessToken as string;

    const kids = await request(app)
      .get("/api/children")
      .set("Authorization", `Bearer ${token}`);
    expect(kids.status).toBe(200);
    const grade1 = (
      kids.body.data as { id: string; hasLearningSeat: boolean; learnWiseGrade?: { levelCode: string } }[]
    ).find((k) => k.hasLearningSeat && k.learnWiseGrade?.levelCode === "LEVEL_1");
    if (grade1) {
      childId = grade1.id;
    } else {
      const created = await request(app)
        .post("/api/children")
        .set("Authorization", `Bearer ${token}`)
        .send({ displayName: `Grade1_${Date.now()}`, birthDate: "15/03/2020", level: "LEVEL_1" });
      expect(created.status).toBe(201);
      childId = created.body.data.id as string;
    }
  });

  it("lists learning levels and Level 1 groups/categories/words", async () => {
    const levels = await request(app)
      .get("/api/learning/levels")
      .set("Authorization", `Bearer ${token}`);
    expect(levels.status).toBe(200);
    expect(
      levels.body.data.some((l: { code: string }) => l.code === "LEVEL_1")
    ).toBe(true);

    const groups = await request(app)
      .get(`/api/learning/levels/1/groups?childId=${childId}`)
      .set("Authorization", `Bearer ${token}`);
    expect(groups.status).toBe(200);
    expect(groups.body.data.level.code).toBe("LEVEL_1");
    expect(groups.body.data.groups).toHaveLength(2);

    const cats = groups.body.data.groups.flatMap(
      (g: { categories: Array<{ wordCount: number; id: string }> }) =>
        g.categories
    );
    expect(cats).toHaveLength(10);
    expect(cats.every((c: { wordCount: number }) => c.wordCount >= 75)).toBe(
      true
    );
    categoryId = cats[0].id;

    const categories = await request(app)
      .get("/api/learning/categories?level=1&group=A")
      .set("Authorization", `Bearer ${token}`);
    expect(categories.status).toBe(200);
    expect(categories.body.data.length).toBe(5);

    const words = await request(app)
      .get(`/api/learning/categories/${categoryId}/words?childId=${childId}`)
      .set("Authorization", `Bearer ${token}`);
    expect(words.status).toBe(200);
    expect(words.body.data.words.length).toBeGreaterThanOrEqual(75);
    const sample = words.body.data.words[0];
    expect(sample.word).toBeTruthy();
    expect(sample.simpleMeaning).toBeTruthy();
    expect(sample.firstLetter).toBeTruthy();
    expect(sample.displayOrder).toBeGreaterThan(0);
    expect(sample.isActive).toBe(true);

    const one = await request(app)
      .get(`/api/learning/words/${sample.id}?childId=${childId}`)
      .set("Authorization", `Bearer ${token}`);
    expect(one.status).toBe(200);
    expect(one.body.data.id).toBe(sample.id);
    expect(one.body.data.levelId).toBeTruthy();
    expect(one.body.data.groupName).toBeTruthy();
    expect(one.body.data.categoryName).toBeTruthy();
  });

  it("returns Level 1 curriculum with 10 categories of 75 words", async () => {
    const res = await request(app)
      .get(`/api/learning/level-1/${childId}`)
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.level.code).toBe("LEVEL_1");
    const cats = res.body.data.groups.flatMap(
      (g: { categories: Array<{ wordCount: number; id: string }> }) => g.categories
    );
    expect(cats).toHaveLength(10);
    expect(cats.every((c: { wordCount: number }) => c.wordCount >= 75)).toBe(true);
    categoryId = cats[0].id;
  });

  it("starts a listen session with A–D options", async () => {
    const res = await request(app)
      .post("/api/learning/sessions")
      .set("Authorization", `Bearer ${token}`)
      .send({ childId, categoryId, questionCount: 5 });
    expect(res.status).toBe(201);
    sessionId = res.body.data.sessionId;
    const q0 = res.body.data.questions[0];
    wordId = q0.word.id;
    expect(q0.listenOptions).toHaveLength(4);
    expect(q0.listenOptions.filter((o: { isCorrect: boolean }) => o.isCorrect)).toHaveLength(
      1
    );
    correctKey = q0.listenOptions.find((o: { isCorrect: boolean }) => o.isCorrect).key;
  });

  it("records attempts and completes with results", async () => {
    const attempt = await request(app)
      .post(`/api/learning/sessions/${sessionId}/attempts`)
      .set("Authorization", `Bearer ${token}`)
      .send({
        wordId,
        round: "LISTEN",
        isCorrect: true,
        answerGiven: correctKey,
        usedClue: false,
        pointsAwarded: 10,
      });
    expect(attempt.status).toBe(201);
    expect(attempt.body.data.pointsAwarded).toBe(10);

    const letter = await request(app)
      .post(`/api/learning/sessions/${sessionId}/attempts`)
      .set("Authorization", `Bearer ${token}`)
      .send({
        wordId,
        round: "LETTER",
        isCorrect: true,
        answerGiven: "A",
        pointsAwarded: 6,
      });
    expect(letter.status).toBe(201);

    const done = await request(app)
      .post(`/api/learning/sessions/${sessionId}/complete`)
      .set("Authorization", `Bearer ${token}`)
      .send({ durationSec: 90 });
    expect(done.status).toBe(200);
    expect(done.body.data.points).toBeGreaterThan(0);
    expect(done.body.data.childName).toBeTruthy();

    const progress = await request(app)
      .get(`/api/learning/progress/${childId}`)
      .set("Authorization", `Bearer ${token}`);
    expect(progress.status).toBe(200);
    expect(progress.body.data.summary.wordsLearned).toBeGreaterThan(0);
  });
});
