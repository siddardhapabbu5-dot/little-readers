import { beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { prisma } from "../src/lib/prisma.js";
import { ensureFourGrades } from "../src/dictionary/dictionary.service.js";
import { classifySense, CLASSIFICATION_VERSION } from "../src/dictionary/classify.js";
import type { CategoryHint, GradeCode } from "../src/dictionary/classify.js";

const app = createApp();
const hasDb = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDb)("Four-grade dictionary classification", () => {
  let adminToken = "";

  beforeAll(async () => {
    process.env.JWT_SECRET =
      process.env.JWT_SECRET ?? "dev_only_change_me_to_a_long_random_secret_value";
    await ensureFourGrades({ createMissing: true });
    const { seedLevel1Vocabulary } = await import(
      "../prisma/seeds/level1-vocabulary.js"
    );
    await seedLevel1Vocabulary(prisma as unknown as Parameters<typeof seedLevel1Vocabulary>[0], {
      includeWords: false,
    });
    await prisma.learningCategory.updateMany({ data: { isPublished: true } });

    const login = await request(app).post("/api/auth/login").send({
      email: "admin@littlereaders.test",
      password: "AdminDemo1",
    });
    expect(login.status).toBe(200);
    adminToken = login.body.data.tokens.accessToken;
  });

  it("classify-v1 uses mixed signals and can suggest multi-grade near boundaries", () => {
    const fake = (
      grade: GradeCode,
      gradeId: string,
      levelId: string,
      code: string,
      label: string
    ): CategoryHint => ({
      id: `cat_${grade}_${code}`,
      code,
      label,
      gradeCode: grade,
      gradeId,
      levelId,
    });
    const byGrade: Record<GradeCode, CategoryHint[]> = {
      GRADE_1: [
        fake("GRADE_1", "g1", "l1", "FAMILY_AND_PEOPLE", "Family and People"),
        fake("GRADE_1", "g1", "l1", "ANIMALS", "Animals"),
      ],
      GRADE_2: [
        fake("GRADE_2", "g2", "l2", "FAMILY_AND_PEOPLE", "Family and People"),
        fake("GRADE_2", "g2", "l2", "ANIMALS", "Animals"),
      ],
      GRADE_3: [
        fake("GRADE_3", "g3", "l3", "NATURE", "Nature"),
      ],
      GRADE_4: [
        fake("GRADE_4", "g4", "l4", "NATURE", "Nature"),
      ],
    };

    const easy = classifySense(
      { headword: "mom", definition: "A mother in the family." },
      byGrade
    );
    expect(easy[0].gradeCode).toBe("GRADE_1");
    expect(easy[0].categoryId).toContain("FAMILY");
    expect(easy[0].explanation).toContain(CLASSIFICATION_VERSION);
    expect(easy[0].explanation.toLowerCase()).toContain("not a guarantee");

    const animal = classifySense(
      { headword: "cat", definition: "A small pet animal." },
      byGrade
    );
    expect(animal[0].categoryId).toContain("ANIMALS");

    // No Fruits category → do not dump apple into Family
    const onlyFamily: Record<GradeCode, CategoryHint[]> = {
      GRADE_1: [
        fake("GRADE_1", "g1", "l1", "FAMILY_AND_PEOPLE", "Family and People"),
      ],
      GRADE_2: [],
      GRADE_3: [],
      GRADE_4: [],
    };
    expect(
      classifySense(
        { headword: "apple", definition: "A sweet fruit." },
        onlyFamily
      )
    ).toEqual([]);

    const hard = classifySense(
      {
        headword: "photosynthesis",
        definition:
          "A complex biological process by which plants convert light into chemical energy; an abstract scientific concept about nature.",
        wordType: "noun",
      },
      byGrade
    );
    expect(hard.length).toBeGreaterThan(0);
    expect(["GRADE_3", "GRADE_4"]).toContain(hard[0].gradeCode);
  });

  it("imports JSON dictionary, classifies, approves and publishes without duplicating headword entries", async () => {
    const headword = "mom";
    const tag = String(Date.now()).replace(/\d/g, (d) => "abcdefghij"[Number(d)]);
    const payload = [
      {
        headword,
        pronunciation: "test",
        senses: [
          {
            definition: `A mother in the family (test ${tag}).`,
            wordType: "noun",
            synonyms: ["mama"],
          },
          {
            definition: `A caring parent who helps children (test ${tag}).`,
            wordType: "noun",
          },
        ],
      },
    ];
    const buf = Buffer.from(JSON.stringify(payload), "utf8");

    const upload = await request(app)
      .post("/api/admin/dictionary/uploads")
      .set("Authorization", `Bearer ${adminToken}`)
      .attach("file", buf, "mini-dict.json")
      .field("sourceName", "Test English-English Dictionary")
      .field("licence", "test-licence");
    expect(upload.status).toBe(201);
    const batchId = upload.body.data.id as string;
    expect(upload.body.data.senseCount).toBeGreaterThanOrEqual(2);

    const entryCount = await prisma.dictionaryEntry.count({
      where: { normalizedHeadword: headword.toLowerCase() },
    });
    expect(entryCount).toBe(1);

    const classified = await request(app)
      .post(`/api/admin/dictionary/imports/${batchId}/classify`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(classified.status).toBe(200);
    expect(classified.body.data.status).toBe("CLASSIFIED");

    const pending = await request(app)
      .get("/api/admin/dictionary/assignments?status=PENDING&take=50")
      .set("Authorization", `Bearer ${adminToken}`);
    expect(pending.status).toBe(200);
    const mine = (
      pending.body.data as Array<{
        id: string;
        sense: { entry: { headword: string } };
      }>
    ).filter((a) => a.sense.entry.headword === headword);
    expect(mine.length).toBeGreaterThan(0);

    const first = mine[0];
    const approve = await request(app)
      .post(`/api/admin/dictionary/assignments/${first.id}/approve`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(approve.status).toBe(200);
    expect(approve.body.data.status).toBe("APPROVED");

    const publish = await request(app)
      .post(`/api/admin/dictionary/assignments/${first.id}/publish`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(publish.status).toBe(200);
    expect(publish.body.data.status).toBe("PUBLISHED");
    expect(publish.body.data.publishedWordId).toBeTruthy();

    const word = await prisma.vocabularyWord.findUnique({
      where: { id: publish.body.data.publishedWordId },
    });
    expect(word?.isActive).toBe(true);
    expect(word?.origin).toBe("DICTIONARY");
    expect(word?.text).toBe(payload[0].headword);
  });

  it("lists four grades for admin", async () => {
    const res = await request(app)
      .get("/api/admin/dictionary/grades")
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    const codes = (res.body.data as Array<{ code: string }>).map((g) => g.code);
    // Seeded four grades must exist; Admin CRUD may add temporary grades in parallel tests.
    expect(codes).toEqual(expect.arrayContaining([
      "GRADE_1",
      "GRADE_2",
      "GRADE_3",
      "GRADE_4",
    ]));
    expect(codes.filter((c) => c.startsWith("GRADE_")).length).toBeGreaterThanOrEqual(4);
  });
});
