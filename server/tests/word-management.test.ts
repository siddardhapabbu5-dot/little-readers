import { beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { prisma } from "../src/lib/prisma.js";

const app = createApp();
const hasDb = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDb)("Admin vocabulary word management", () => {
  let adminToken = "";
  let parentToken = "";
  const stamp = Date.now();
  const tag = String(stamp).replace(/\d/g, (d, at: number) => (at % 2 ? "klmnopqrst" : "abcdefghij")[Number(d)]);
  let categoryA = "";
  let categoryB = "";
  let wrongGradeCategory = "";
  let grade1Id = "";
  let levelAId = "";

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
    const rows = cats.body.data as Array<{
      id: string;
      group: {
        level: {
          id: string;
          grade: { id: string; code: string } | null;
        };
      };
    }>;
    const g1 = rows.filter((c) => c.group.level.grade?.code === "GRADE_1");
    const g2 = rows.filter((c) => c.group.level.grade?.code === "GRADE_2");
    expect(g1.length).toBeGreaterThanOrEqual(2);
    expect(g2.length).toBeGreaterThanOrEqual(1);
    categoryA = g1[0].id;
    categoryB = g1[1]?.id ?? g1[0].id;
    if (categoryB === categoryA && g1.length === 1) {
      // create a sibling category under same group for reclassify target
      const groupId = (
        await prisma.learningCategory.findUnique({ where: { id: categoryA } })
      )?.groupId;
      expect(groupId).toBeTruthy();
      const created = await request(app)
        .post("/api/admin/content/categories")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({
          groupId,
          code: `WM_${stamp}`,
          label: `WM Cat ${stamp}`,
          emoji: "🧪",
        });
      expect(created.status).toBe(201);
      categoryB = created.body.data.id;
    }
    wrongGradeCategory = g2[0].id;
    grade1Id = g1[0].group.level.grade!.id;
    levelAId = g1[0].group.level.id;
  });

  it("blocks PARENT from word admin APIs", async () => {
    const res = await request(app)
      .get("/api/admin/vocabulary/words")
      .set("Authorization", `Bearer ${parentToken}`);
    expect(res.status).toBe(403);
  });

  it("creates, reads, updates, deactivates, and safely deletes a word", async () => {
    const text = `wmword${tag}`;
    const created = await request(app)
      .post("/api/admin/vocabulary/words")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        categoryId: categoryA,
        text,
        meaning: "A test meaning for word management.",
        emoji: "🧪",
        phonetic: "test",
        difficulty: 2,
      });
    expect(created.status).toBe(201);
    const id = created.body.data.id as string;
    expect(created.body.data.origin).toBe("LEGACY");

    const listed = await request(app)
      .get(`/api/admin/vocabulary/words?q=${text}&take=20`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(listed.status).toBe(200);
    expect(listed.body.data.words.some((w: { id: string }) => w.id === id)).toBe(
      true
    );

    const detail = await request(app)
      .get(`/api/admin/vocabulary/words/${id}`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(detail.status).toBe(200);
    expect(detail.body.data.meaning).toContain("test meaning");

    const patched = await request(app)
      .patch(`/api/admin/vocabulary/words/${id}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ meaning: "Updated meaning for kids.", difficulty: 3 });
    expect(patched.status).toBe(200);
    expect(patched.body.data.meaning).toBe("Updated meaning for kids.");
    expect(patched.body.data.difficulty).toBe(3);

    const deact = await request(app)
      .post(`/api/admin/vocabulary/words/${id}/deactivate`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(deact.status).toBe(200);
    expect(deact.body.data.isActive).toBe(false);

    // reactivate for delete path
    await request(app)
      .patch(`/api/admin/vocabulary/words/${id}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ isActive: true });

    const del = await request(app)
      .delete(`/api/admin/vocabulary/words/${id}`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(del.status).toBe(200);
    expect(del.body.data.deleted).toBe(true);
  });

  it("rejects junk words like test ids, numbers and underscores", async () => {
    for (const text of [
      `playfix_${stamp}_w4`,
      `wmword${stamp}`,
      "x",
      "bbbbbb",
      "hello@world",
    ]) {
      const res = await request(app)
        .post("/api/admin/vocabulary/words")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ categoryId: categoryA, text, meaning: "A real meaning.", emoji: "🧪" });
      expect(res.status, text).toBe(400);
      expect(res.body.code, text).toBe("WORD_QUALITY");
    }

    const badMeaning = await request(app)
      .post("/api/admin/vocabulary/words")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ categoryId: categoryA, text: `wmmean${tag}`, meaning: `test_${stamp}`, emoji: "🧪" });
    expect(badMeaning.status).toBe(400);
    expect(badMeaning.body.code).toBe("WORD_QUALITY");
  });

  it("reclassifies without changing word id and rejects invalid grade/category", async () => {
    const text = `wmreclass${tag}`;
    const created = await request(app)
      .post("/api/admin/vocabulary/words")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        categoryId: categoryA,
        text,
        meaning: "Reclass test meaning.",
        emoji: "🔁",
      });
    expect(created.status).toBe(201);
    const id = created.body.data.id as string;

    const bad = await request(app)
      .post(`/api/admin/vocabulary/words/${id}/reclassify`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        categoryId: wrongGradeCategory,
        gradeId: grade1Id,
        levelId: levelAId,
      });
    expect(bad.status).toBe(400);

    const ok = await request(app)
      .post(`/api/admin/vocabulary/words/${id}/reclassify`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ categoryId: categoryB, gradeId: grade1Id });
    expect(ok.status).toBe(200);
    expect(ok.body.data.id).toBe(id);
    expect(ok.body.data.categoryId).toBe(categoryB);

    // clean up
    await request(app)
      .delete(`/api/admin/vocabulary/words/${id}`)
      .set("Authorization", `Bearer ${adminToken}`);
  });

  it("blocks hard delete when learning attempts exist", async () => {
    const text = `wmhist${tag}`;
    const created = await request(app)
      .post("/api/admin/vocabulary/words")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        categoryId: categoryA,
        text,
        meaning: "History-linked meaning.",
        emoji: "📎",
      });
    expect(created.status).toBe(201);
    const id = created.body.data.id as string;

    const child = await prisma.child.findFirst({ where: { isActive: true } });
    expect(child).toBeTruthy();
    const session = await prisma.learningSession.create({
      data: {
        childId: child!.id,
        categoryId: categoryA,
        status: "IN_PROGRESS",
      },
    });
    await prisma.questionAttempt.create({
      data: {
        sessionId: session.id,
        wordId: id,
        round: "LISTEN",
        isCorrect: true,
        answerGiven: text,
      },
    });

    const del = await request(app)
      .delete(`/api/admin/vocabulary/words/${id}`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(del.status).toBe(409);

    const still = await prisma.vocabularyWord.findUnique({ where: { id } });
    expect(still).toBeTruthy();
    expect(still?.id).toBe(id);

    await request(app)
      .post(`/api/admin/vocabulary/words/${id}/deactivate`)
      .set("Authorization", `Bearer ${adminToken}`);
  });

  it("bulk approve / reject / publish with per-id results", async () => {
    const head = `wmbulk${tag}`;
    const category = await prisma.learningCategory.findFirst({
      where: { isPublished: true },
      include: {
        group: { include: { level: { include: { grade: true } } } },
      },
    });
    expect(category?.group.level.gradeId).toBeTruthy();
    const gradeId = category!.group.level.gradeId!;
    const levelId = category!.group.levelId;

    const entry = await prisma.dictionaryEntry.create({
      data: {
        headword: head,
        normalizedHeadword: head.toLowerCase(),
        sourceName: "Bulk Test",
        senses: {
          create: [
            {
              senseIndex: 0,
              definition: "A small friendly animal children know.",
              wordType: "noun",
            },
            {
              senseIndex: 1,
              definition: "Another sense used only for bulk reject.",
              wordType: "noun",
            },
          ],
        },
      },
      include: { senses: true },
    });

    const aApprove = await prisma.vocabularyGradeAssignment.create({
      data: {
        senseId: entry.senses[0].id,
        gradeId,
        levelId,
        categoryId: category!.id,
        status: "PENDING",
        difficultyScore: 20,
        confidenceScore: 40,
        explanation: "test bulk approve",
        classificationVersion: "test",
      },
    });
    const aReject = await prisma.vocabularyGradeAssignment.create({
      data: {
        senseId: entry.senses[1].id,
        gradeId,
        levelId,
        categoryId: category!.id,
        status: "PENDING",
        difficultyScore: 10,
        confidenceScore: 10,
        explanation: "test bulk reject",
        classificationVersion: "test",
      },
    });

    const approve = await request(app)
      .post("/api/admin/dictionary/assignments/bulk-approve")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ ids: [aApprove.id] });
    expect(approve.status).toBe(200);
    expect(approve.body.data.updated).toBe(1);
    expect(approve.body.data.results[0].ok).toBe(true);

    const publish = await request(app)
      .post("/api/admin/dictionary/assignments/bulk-publish")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ ids: [aApprove.id] });
    expect(publish.status).toBe(200);
    expect(publish.body.data.updated).toBe(1);
    expect(publish.body.data.results[0].publishedWordId).toBeTruthy();

    const word = await prisma.vocabularyWord.findUnique({
      where: { id: publish.body.data.results[0].publishedWordId },
    });
    expect(word?.text).toBe(head);

    const reject = await request(app)
      .post("/api/admin/dictionary/assignments/bulk-reject")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ ids: [aReject.id] });
    expect(reject.status).toBe(200);
    expect(reject.body.data.updated).toBe(1);
  });
});

