import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { prisma } from "../src/lib/prisma.js";
import { ensureFourGrades } from "../src/dictionary/dictionary.service.js";

const app = createApp();
const hasDb = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDb)("Central dictionary expansion", () => {
  let adminToken = "";
  // Letter-only unique suffix (quality gate rejects digits in headwords)
  const tag = `exp${Date.now()
    .toString(36)
    .replace(/\d/g, (d) => "abcdefghij"[Number(d)])}`;
  const headword = `bark${tag}`;
  let entryId = "";
  let senseA = "";
  let senseB = "";
  let grade1Id = "";
  let grade2Id = "";
  let level1Id = "";
  let level2Id = "";
  let catG1 = "";
  let catG2 = "";
  let assignmentG1 = "";
  let assignmentG2 = "";
  let g1WordCountBefore = 0;
  let g1TopicCountBefore = 0;

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

    const login = await request(app).post("/api/auth/login").send({
      email: "admin@littlereaders.test",
      password: "AdminDemo1",
    });
    expect(login.status).toBe(200);
    adminToken = login.body.data.tokens.accessToken;

    const g1 = await prisma.learningGrade.findUniqueOrThrow({
      where: { code: "GRADE_1" },
    });
    const g2 = await prisma.learningGrade.findUniqueOrThrow({
      where: { code: "GRADE_2" },
    });
    grade1Id = g1.id;
    grade2Id = g2.id;
    const l1 = await prisma.learningLevel.findUniqueOrThrow({
      where: { code: "LEVEL_1" },
    });
    const l2 = await prisma.learningLevel.findUniqueOrThrow({
      where: { code: "LEVEL_2" },
    });
    level1Id = l1.id;
    level2Id = l2.id;

    const familyG1 = await prisma.learningCategory.findFirst({
      where: {
        OR: [
          { code: { equals: "family_people", mode: "insensitive" } },
          { code: { equals: "FAMILY_AND_PEOPLE", mode: "insensitive" } },
          { label: { contains: "Family", mode: "insensitive" } },
        ],
        group: { levelId: l1.id },
        isPublished: true,
      },
    });
    const familyG2 = await prisma.learningCategory.findFirst({
      where: {
        OR: [
          { code: { equals: "family_people", mode: "insensitive" } },
          { code: { equals: "FAMILY_AND_PEOPLE", mode: "insensitive" } },
          { label: { contains: "Family", mode: "insensitive" } },
        ],
        group: { levelId: l2.id },
      },
      orderBy: { createdAt: "asc" },
    });
    // Grade 2 topics may be draft; create a disposable draft topic if missing
    let g2Cat = familyG2;
    if (!g2Cat) {
      const group2 = await prisma.learningGroup.findFirst({
        where: { levelId: l2.id },
      });
      expect(group2).toBeTruthy();
      g2Cat = await prisma.learningCategory.create({
        data: {
          groupId: group2!.id,
          code: `dict_exp_${tag}`,
          label: `Dictionary Exp ${tag}`,
          emoji: "📚",
          sortOrder: 99,
          isPublished: false,
          status: "DRAFT",
        },
      });
    }
    expect(familyG1).toBeTruthy();
    catG1 = familyG1!.id;
    catG2 = g2Cat!.id;

    g1WordCountBefore = await prisma.vocabularyWord.count({
      where: {
        isActive: true,
        category: { group: { level: { code: "LEVEL_1" } } },
      },
    });
    g1TopicCountBefore = await prisma.learningCategory.count({
      where: { group: { level: { code: "LEVEL_1" } }, isPublished: true },
    });
  });

  afterAll(async () => {
    if (assignmentG1) {
      await prisma.dictionaryPublishEvent.deleteMany({
        where: { assignmentId: { in: [assignmentG1, assignmentG2].filter(Boolean) } },
      });
      await prisma.vocabularyGradeAssignment.deleteMany({
        where: { id: { in: [assignmentG1, assignmentG2].filter(Boolean) } },
      });
    }
    await prisma.vocabularyWord.deleteMany({ where: { text: headword } });
    await prisma.dictionaryEntry.deleteMany({
      where: { normalizedHeadword: headword.toLowerCase() },
    });
    await prisma.dictionaryImportBatch.deleteMany({
      where: { originalFilename: { contains: `preview-${tag}` } },
    });
  });

  it("creates an entry with multiple senses without touching Grade 1 baseline counts", async () => {
    const created = await request(app)
      .post("/api/admin/dictionary/entries")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        headword,
        definition: "The hard outer covering of a tree.",
        wordType: "noun",
        example: "The bark feels rough.",
        pronunciation: "/bɑːk/",
      });
    expect(created.status).toBe(201);
    entryId = created.body.data.id;
    senseA = created.body.data.senses[0].id;

    const sense2 = await request(app)
      .post(`/api/admin/dictionary/entries/${entryId}/senses`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        definition: "The sound a dog makes.",
        wordType: "noun",
        example: "Dogs bark at night.",
      });
    expect(sense2.status).toBe(201);
    senseB = sense2.body.data.id;

    const got = await request(app)
      .get(`/api/admin/dictionary/entries/${entryId}`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(got.status).toBe(200);
    expect(got.body.data.senses).toHaveLength(2);

    const g1Words = await prisma.vocabularyWord.count({
      where: {
        isActive: true,
        category: { group: { level: { code: "LEVEL_1" } } },
      },
    });
    const g1Topics = await prisma.learningCategory.count({
      where: { group: { level: { code: "LEVEL_1" } }, isPublished: true },
    });
    expect(g1Words).toBe(g1WordCountBefore);
    expect(g1Topics).toBe(g1TopicCountBefore);
  });

  it("assigns the same word to multiple grades/categories with overrides that never mutate central sense", async () => {
    const a1 = await request(app)
      .post("/api/admin/dictionary/assignments/draft")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        senseId: senseA,
        gradeId: grade1Id,
        levelId: level1Id,
        categoryId: catG1,
        meaningOverride: "The skin of a tree for little kids.",
        exampleOverride: "I touch the bark.",
      });
    expect(a1.status).toBe(201);
    assignmentG1 = a1.body.data.id;

    const a2 = await request(app)
      .post("/api/admin/dictionary/assignments/draft")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        senseId: senseA,
        gradeId: grade2Id,
        levelId: level2Id,
        categoryId: catG2,
        meaningOverride: "The outer layer of a tree trunk.",
        exampleOverride: "The bark protects the tree.",
      });
    expect(a2.status).toBe(201);
    assignmentG2 = a2.body.data.id;

    const sense = await prisma.dictionarySense.findUniqueOrThrow({
      where: { id: senseA },
    });
    expect(sense.definition).toBe("The hard outer covering of a tree.");

    await request(app)
      .post(`/api/admin/dictionary/assignments/${assignmentG1}/approve`)
      .set("Authorization", `Bearer ${adminToken}`);

    const pub = await request(app)
      .post(`/api/admin/dictionary/assignments/${assignmentG1}/publish`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(pub.status).toBe(200);
    expect(pub.body.data.status).toBe("PUBLISHED");

    const word = await prisma.vocabularyWord.findUniqueOrThrow({
      where: { id: pub.body.data.publishedWordId },
    });
    expect(word.meaning).toBe("The skin of a tree for little kids.");
    expect(word.exampleSentence).toBe("I touch the bark.");
    expect(word.text).toBe(headword);

    const senseAfter = await prisma.dictionarySense.findUniqueOrThrow({
      where: { id: senseA },
    });
    expect(senseAfter.definition).toBe("The hard outer covering of a tree.");

    // Grade 2 assignment stays draft/unpublished — not published unless approved
    const g2 = await prisma.vocabularyGradeAssignment.findUniqueOrThrow({
      where: { id: assignmentG2 },
    });
    expect(g2.status).toBe("DRAFT");
    expect(
      await prisma.vocabularyWord.count({
        where: { text: headword, categoryId: catG2, isActive: true },
      })
    ).toBe(0);
  });

  it("publish upserts without duplicates; unpublish hides word and keeps dictionary", async () => {
    const again = await request(app)
      .post(`/api/admin/dictionary/assignments/${assignmentG1}/publish`)
      .set("Authorization", `Bearer ${adminToken}`);
    // Idempotent re-publish of PUBLISHED is allowed; still one VocabularyWord
    expect(again.status).toBe(200);
    expect(
      await prisma.vocabularyWord.count({
        where: { text: headword, categoryId: catG1 },
      })
    ).toBe(1);

    const unpub = await request(app)
      .post(`/api/admin/dictionary/assignments/${assignmentG1}/unpublish`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(unpub.status).toBe(200);
    expect(unpub.body.data.status).toBe("UNPUBLISHED");

    const word = await prisma.vocabularyWord.findFirst({
      where: { text: headword, categoryId: catG1 },
    });
    expect(word?.isActive).toBe(false);

    const entry = await prisma.dictionaryEntry.findUnique({
      where: { id: entryId },
    });
    expect(entry).toBeTruthy();

    await request(app)
      .post(`/api/admin/dictionary/assignments/${assignmentG1}/publish`)
      .set("Authorization", `Bearer ${adminToken}`)
      .expect(200);

    const words = await prisma.vocabularyWord.findMany({
      where: { text: headword, categoryId: catG1 },
    });
    expect(words).toHaveLength(1);
    expect(words[0]!.isActive).toBe(true);

    const events = await request(app)
      .get(`/api/admin/dictionary/publish-events?assignmentId=${assignmentG1}`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(events.status).toBe(200);
    expect(events.body.data.length).toBeGreaterThanOrEqual(2);
  });

  it("preview reports invalid rows and does not write entries until confirm", async () => {
    const csv = [
      "headword,definition,pos,example",
      `okword${tag},a valid meaning here for the sample row,noun,Hello there.`,
      ",missing word meaning,noun,x",
      `badword${tag},,noun,no meaning`,
    ].join("\n");

    const preview = await request(app)
      .post("/api/admin/dictionary/uploads/preview")
      .set("Authorization", `Bearer ${adminToken}`)
      .attach("file", Buffer.from(csv, "utf8"), `preview-${tag}.csv`)
      .field("sourceName", "Expansion preview");
    expect(preview.status).toBe(201);
    expect(preview.body.data.errorCount).toBeGreaterThanOrEqual(1);
    expect(preview.body.data.validCount).toBe(1);
    expect(preview.body.data.entryCount).toBe(0);
    expect(preview.body.data.errors.some((e: { issues: string[] }) => e.issues.length > 0)).toBe(
      true
    );

    const before = await prisma.dictionaryEntry.count({
      where: { normalizedHeadword: `okword${tag}` },
    });
    expect(before).toBe(0);

    const confirm = await request(app)
      .post(`/api/admin/dictionary/uploads/confirm/${preview.body.data.id}`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(confirm.status).toBe(200);
    expect(confirm.body.data.entryCount).toBeGreaterThanOrEqual(1);
    expect(confirm.body.data.status).toBe("PARSED");

    const errorsCsv = await request(app)
      .get(`/api/admin/dictionary/imports/${preview.body.data.id}/errors.csv`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(errorsCsv.status).toBe(200);
    expect(errorsCsv.text).toContain("row,headword,issues");

    await prisma.dictionaryEntry.deleteMany({
      where: { normalizedHeadword: `okword${tag}` },
    });
  });

  it("dashboard returns per-grade stats and search finds the entry", async () => {
    const dash = await request(app)
      .get("/api/admin/dictionary/dashboard")
      .set("Authorization", `Bearer ${adminToken}`);
    expect(dash.status).toBe(200);
    const codes = (dash.body.data.grades as Array<{ grade: { code: string } }>).map(
      (g) => g.grade.code
    );
    expect(codes).toEqual(
      expect.arrayContaining(["GRADE_1", "GRADE_2", "GRADE_3", "GRADE_4"])
    );

    const search = await request(app)
      .get(`/api/admin/dictionary/entries?q=${headword}`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(search.status).toBe(200);
    expect(
      (search.body.data as Array<{ headword: string }>).some(
        (e) => e.headword === headword
      )
    ).toBe(true);

    const exportRes = await request(app)
      .get(`/api/admin/dictionary/export.xlsx?gradeId=${grade1Id}`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(exportRes.status).toBe(200);
    expect(exportRes.headers["content-type"]).toMatch(/spreadsheetml/);
  });

  it("rejects publishing PENDING without approve; draft never appears as active kids word in G2", async () => {
    const pendingPub = await request(app)
      .post(`/api/admin/dictionary/assignments/${assignmentG2}/publish`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(pendingPub.status).toBe(400);

    const kidsWords = await prisma.vocabularyWord.count({
      where: {
        text: headword,
        categoryId: catG2,
        isActive: true,
      },
    });
    expect(kidsWords).toBe(0);
  });
});
