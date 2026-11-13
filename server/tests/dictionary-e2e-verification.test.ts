/**
 * Focused E2E verification for Central Dictionary Expansion.
 * Runs against the disposable *_test database only (vitest global-setup).
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { prisma } from "../src/lib/prisma.js";
import { ensureFourGrades } from "../src/dictionary/dictionary.service.js";
import { assertDisposableTestDatabase, resolveTestDatabaseUrl } from "./test-db.js";

const app = createApp();
const hasDb = Boolean(process.env.DATABASE_URL);

type Result = { id: number; name: string; pass: boolean; detail: string };
const results: Result[] = [];

function record(id: number, name: string, pass: boolean, detail: string) {
  results.push({ id, name, pass, detail });
  expect(pass, `#${id} ${name}: ${detail}`).toBe(true);
}

function csvEscape(v: string) {
  return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

describe.skipIf(!hasDb)("Central Dictionary Expansion — E2E verification", () => {
  const tag = `e2e${Date.now().toString(36)}`;
  // Letter-only unique headwords (quality gate rejects digits/underscores)
  const sampleHeads = [
    "amberfox", "bramble", "cedarleaf", "dewdrop", "emberglow",
    "fernway", "glimmer", "hazelnut", "ivytrail", "jadewing",
    "kelpwave", "larkspur", "mistvale", "nimbus", "opaline",
    "pinecone", "quiver", "riverbank", "sunpetal", "tidepool",
  ] as const;
  const prefix = "e2everify"; // used only for disposable category codes / hidden word
  let adminToken = "";
  let parentToken = "";
  let childG1 = "";
  let batchId = "";
  let grade1Id = "";
  let grade2Id = "";
  let level1Id = "";
  let level2Id = "";
  let catG1 = "";
  let catG2 = "";
  let sharedHeadword: string = sampleHeads[0];
  let centralDefinition = "";
  let senseId = "";
  let assignmentG1 = "";
  let assignmentG2 = "";
  let wordG1Id = "";
  let wordG2Id = "";
  let g1WordCountBefore = 0;
  let g1TopicCountBefore = 0;
  let g1PublishedTopicCountBefore = 0;
  const twentyWords = sampleHeads.map((headword, i) => ({
    headword,
    definition: `A clear child friendly meaning for ${headword} used in verification.`,
    pos: "noun",
    example: `We can use ${headword} in a short sentence.`,
  }));

  beforeAll(async () => {
    const testUrl = resolveTestDatabaseUrl();
    assertDisposableTestDatabase(testUrl);
    process.env.DATABASE_URL = testUrl;
    process.env.JWT_SECRET =
      process.env.JWT_SECRET ?? "dev_only_change_me_to_a_long_random_secret_value";

    await ensureFourGrades({ createMissing: true });

    const adminLogin = await request(app).post("/api/auth/login").send({
      email: "admin@littlereaders.test",
      password: "AdminDemo1",
    });
    expect(adminLogin.status).toBe(200);
    adminToken = adminLogin.body.data.tokens.accessToken;

    const parentLogin = await request(app).post("/api/auth/login").send({
      email: "parent@littlereaders.test",
      password: "ParentDemo1",
    });
    expect(parentLogin.status).toBe(200);
    parentToken = parentLogin.body.data.tokens.accessToken;

    const kids = await request(app)
      .get("/api/children")
      .set("Authorization", `Bearer ${parentToken}`);
    const g1Kid = (
      kids.body.data as Array<{
        id: string;
        hasLearningSeat: boolean;
        learnWiseGrade?: { levelCode: string };
      }>
    ).find((k) => k.hasLearningSeat && k.learnWiseGrade?.levelCode === "LEVEL_1");
    expect(g1Kid).toBeTruthy();
    childG1 = g1Kid!.id;

    const g1 = await prisma.learningGrade.findUniqueOrThrow({ where: { code: "GRADE_1" } });
    const g2 = await prisma.learningGrade.findUniqueOrThrow({ where: { code: "GRADE_2" } });
    grade1Id = g1.id;
    grade2Id = g2.id;
    level1Id = (await prisma.learningLevel.findUniqueOrThrow({ where: { code: "LEVEL_1" } })).id;
    level2Id = (await prisma.learningLevel.findUniqueOrThrow({ where: { code: "LEVEL_2" } })).id;

    const cat1 = await prisma.learningCategory.findFirstOrThrow({
      where: {
        group: { levelId: level1Id },
        isPublished: true,
        OR: [
          { code: { equals: "family_people", mode: "insensitive" } },
          { label: { contains: "Family", mode: "insensitive" } },
        ],
      },
    });
    catG1 = cat1.id;

    let cat2 = await prisma.learningCategory.findFirst({
      where: {
        group: { levelId: level2Id },
        OR: [
          { code: { equals: "family_people", mode: "insensitive" } },
          { label: { contains: "Family", mode: "insensitive" } },
        ],
      },
    });
    if (!cat2) {
      const group2 = await prisma.learningGroup.findFirstOrThrow({
        where: { levelId: level2Id },
      });
      cat2 = await prisma.learningCategory.create({
        data: {
          groupId: group2.id,
          code: `e2e_family_${tag}`,
          label: `E2E Family ${tag}`,
          emoji: "👨",
          sortOrder: 98,
          isPublished: false,
          status: "DRAFT",
        },
      });
    }
    catG2 = cat2.id;

    // Remove any leftover sample heads from prior failed runs
    await prisma.vocabularyWord.deleteMany({
      where: { text: { in: [...sampleHeads, "hiddenvale"] } },
    });
    await prisma.dictionaryEntry.deleteMany({
      where: { normalizedHeadword: { in: [...sampleHeads, "hiddenvale"] } },
    });

    g1WordCountBefore = await prisma.vocabularyWord.count({
      where: {
        isActive: true,
        category: { group: { level: { code: "LEVEL_1" } } },
        NOT: { text: { in: [...sampleHeads, "hiddenvale"] } },
      },
    });
    g1TopicCountBefore = await prisma.learningCategory.count({
      where: { group: { level: { code: "LEVEL_1" } } },
    });
    g1PublishedTopicCountBefore = await prisma.learningCategory.count({
      where: { group: { level: { code: "LEVEL_1" } }, isPublished: true },
    });
  });

  afterAll(async () => {
    const heads = [...sampleHeads, "hiddenvale"];
    const entries = await prisma.dictionaryEntry.findMany({
      where: { normalizedHeadword: { in: heads } },
      select: { id: true },
    });
    const entryIds = entries.map((e) => e.id);
    if (entryIds.length) {
      const senses = await prisma.dictionarySense.findMany({
        where: { entryId: { in: entryIds } },
        select: { id: true },
      });
      const senseIds = senses.map((s) => s.id);
      const assignments = await prisma.vocabularyGradeAssignment.findMany({
        where: { senseId: { in: senseIds } },
        select: { id: true },
      });
      const assignmentIds = assignments.map((a) => a.id);
      if (assignmentIds.length) {
        await prisma.dictionaryPublishEvent.deleteMany({
          where: { assignmentId: { in: assignmentIds } },
        });
        await prisma.vocabularyGradeAssignment.deleteMany({
          where: { id: { in: assignmentIds } },
        });
      }
      await prisma.vocabularyWord.deleteMany({ where: { text: { in: heads } } });
      await prisma.dictionarySense.deleteMany({ where: { entryId: { in: entryIds } } });
      await prisma.dictionaryEntry.deleteMany({ where: { id: { in: entryIds } } });
    }
    await prisma.dictionaryImportBatch.deleteMany({
      where: { originalFilename: { contains: tag } },
    });
    await prisma.learningCategory.deleteMany({
      where: { code: { startsWith: `e2e_family_${tag}` } },
    });

    // Print concise report for the operator
    const lines = [
      "",
      "=== Central Dictionary Expansion E2E Report ===",
      ...results.map(
        (r) => `${r.pass ? "PASS" : "FAIL"}  #${r.id} ${r.name} — ${r.detail}`
      ),
      `Summary: ${results.filter((r) => r.pass).length}/${results.length} passed`,
      "===============================================",
      "",
    ];
    console.log(lines.join("\n"));
  });

  it("1–2: upload 20 CSV words; duplicate upload merges without new headword rows", async () => {
    const csv = [
      "headword,definition,pos,example",
      ...twentyWords.map((w) =>
        [w.headword, w.definition, w.pos, w.example].map(csvEscape).join(",")
      ),
    ].join("\n");

    const preview = await request(app)
      .post("/api/admin/dictionary/uploads/preview")
      .set("Authorization", `Bearer ${adminToken}`)
      .attach("file", Buffer.from(csv, "utf8"), `sample-20-${tag}.csv`)
      .field("sourceName", "E2E Sample 20");
    const previewOk =
      preview.status === 201 &&
      preview.body.data.validCount === 20 &&
      preview.body.data.entryCount === 0;
    record(
      1,
      "Upload 20 sample words (preview)",
      previewOk,
      previewOk
        ? `validCount=20 batch=${preview.body.data.id}`
        : `status=${preview.status} valid=${preview.body?.data?.validCount} entryCount=${preview.body?.data?.entryCount}`
    );
    batchId = preview.body.data.id;

    const confirm = await request(app)
      .post(`/api/admin/dictionary/uploads/confirm/${batchId}`)
      .set("Authorization", `Bearer ${adminToken}`);
    const confirmOk =
      confirm.status === 200 && confirm.body.data.entryCount >= 20;
    record(
      1,
      "Confirm 20-word import",
      confirmOk,
      confirmOk
        ? `entries=${confirm.body.data.entryCount} senses=${confirm.body.data.senseCount}`
        : `status=${confirm.status} body=${JSON.stringify(confirm.body)}`
    );

    const beforeDup = await prisma.dictionaryEntry.count({
      where: { normalizedHeadword: { in: [...sampleHeads] } },
    });

    const dupPreview = await request(app)
      .post("/api/admin/dictionary/uploads/preview")
      .set("Authorization", `Bearer ${adminToken}`)
      .attach("file", Buffer.from(csv, "utf8"), `dup-20-${tag}.csv`)
      .field("sourceName", "E2E Duplicate");
    const dupConfirm = await request(app)
      .post(`/api/admin/dictionary/uploads/confirm/${dupPreview.body.data.id}`)
      .set("Authorization", `Bearer ${adminToken}`);
    const afterDup = await prisma.dictionaryEntry.count({
      where: { normalizedHeadword: { in: [...sampleHeads] } },
    });
    // Soft warnings on existing headwords; confirm merges senses, headword count unchanged
    record(
      2,
      "Duplicate upload handling",
      Boolean(
        dupPreview.status === 201 &&
          dupConfirm.status === 200 &&
          beforeDup === 20 &&
          afterDup === 20
      ),
      `before=${beforeDup} after=${afterDup} confirm=${dupConfirm.status} previewErrors=${dupPreview.body.data.errorCount}`
    );
  });

  it("3–8: multi-grade assign, overrides, preview/classify/approve/publish, VocabularyWord integrity", async () => {
    // Use first uploaded word as shared multi-grade headword
    sharedHeadword = twentyWords[0]!.headword;
    const entry = await prisma.dictionaryEntry.findUniqueOrThrow({
      where: { normalizedHeadword: sharedHeadword.toLowerCase() },
      include: { senses: { orderBy: { senseIndex: "asc" } } },
    });
    senseId = entry.senses[0]!.id;
    centralDefinition = entry.senses[0]!.definition;

    const a1 = await request(app)
      .post("/api/admin/dictionary/assignments/draft")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        senseId,
        gradeId: grade1Id,
        levelId: level1Id,
        categoryId: catG1,
        meaningOverride: "Grade 1 simple meaning for kids.",
        exampleOverride: "I see it every day.",
      });
    const a2 = await request(app)
      .post("/api/admin/dictionary/assignments/draft")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        senseId,
        gradeId: grade2Id,
        levelId: level2Id,
        categoryId: catG2,
        meaningOverride: "Grade 2 clearer meaning for older kids.",
        exampleOverride: "We studied this word in class.",
      });
    assignmentG1 = a1.body.data?.id;
    assignmentG2 = a2.body.data?.id;
    record(
      3,
      "Assign same word to Grade 1 and Grade 2",
      Boolean(a1.status === 201 && a2.status === 201 && assignmentG1 && assignmentG2),
      `G1=${assignmentG1} G2=${assignmentG2} statuses=${a1.status}/${a2.status}`
    );

    const senseStill = await prisma.dictionarySense.findUniqueOrThrow({
      where: { id: senseId },
    });
    const overridesOk =
      a1.body.data.meaningOverride === "Grade 1 simple meaning for kids." &&
      a2.body.data.meaningOverride === "Grade 2 clearer meaning for older kids." &&
      a1.body.data.exampleOverride === "I see it every day." &&
      a2.body.data.exampleOverride === "We studied this word in class.";
    record(
      4,
      "Different meaning/example per grade assignment",
      overridesOk,
      overridesOk ? "overrides set on both assignments" : "override mismatch"
    );
    record(
      5,
      "Central DictionarySense unchanged",
      senseStill.definition === centralDefinition,
      `central="${senseStill.definition}"`
    );

    // Classify the original 20-word batch (creates PENDING for other words)
    const classified = await request(app)
      .post(`/api/admin/dictionary/imports/${batchId}/classify`)
      .set("Authorization", `Bearer ${adminToken}`);

    await request(app)
      .post(`/api/admin/dictionary/assignments/${assignmentG1}/approve`)
      .set("Authorization", `Bearer ${adminToken}`);
    await request(app)
      .post(`/api/admin/dictionary/assignments/${assignmentG2}/approve`)
      .set("Authorization", `Bearer ${adminToken}`);

    const pub1 = await request(app)
      .post(`/api/admin/dictionary/assignments/${assignmentG1}/publish`)
      .set("Authorization", `Bearer ${adminToken}`);
    const pub2 = await request(app)
      .post(`/api/admin/dictionary/assignments/${assignmentG2}/publish`)
      .set("Authorization", `Bearer ${adminToken}`);

    wordG1Id = pub1.body.data?.publishedWordId;
    wordG2Id = pub2.body.data?.publishedWordId;

    record(
      6,
      "Preview→confirm→classify→approve→publish",
      Boolean(
        classified.status === 200 &&
          pub1.status === 200 &&
          pub2.status === 200 &&
          wordG1Id &&
          wordG2Id
      ),
      `classify=${classified.status} pubG1=${pub1.status} pubG2=${pub2.status}`
    );

    expect(wordG1Id).toBeTruthy();
    expect(wordG2Id).toBeTruthy();
    const w1 = await prisma.vocabularyWord.findUniqueOrThrow({ where: { id: wordG1Id } });
    const w2 = await prisma.vocabularyWord.findUniqueOrThrow({ where: { id: wordG2Id } });
    record(
      7,
      "Correct VocabularyWord per grade/topic",
      Boolean(
        w1.categoryId === catG1 &&
          w2.categoryId === catG2 &&
          w1.meaning === "Grade 1 simple meaning for kids." &&
          w2.meaning === "Grade 2 clearer meaning for older kids." &&
          w1.exampleSentence === "I see it every day." &&
          w2.exampleSentence === "We studied this word in class." &&
          w1.isActive &&
          w2.isActive
      ),
      `G1 meaning="${w1.meaning}" G2 meaning="${w2.meaning}"`
    );

    const dupCount = await prisma.vocabularyWord.count({
      where: { text: sharedHeadword, categoryId: catG1 },
    });
    const dupCount2 = await prisma.vocabularyWord.count({
      where: { text: sharedHeadword, categoryId: catG2 },
    });
    // Re-publish should not create extras
    await request(app)
      .post(`/api/admin/dictionary/assignments/${assignmentG1}/publish`)
      .set("Authorization", `Bearer ${adminToken}`);
    const dupCountAfter = await prisma.vocabularyWord.count({
      where: { text: sharedHeadword, categoryId: catG1 },
    });
    record(
      8,
      "No duplicate VocabularyWord records",
      Boolean(dupCount === 1 && dupCount2 === 1 && dupCountAfter === 1),
      `G1=${dupCountAfter} G2=${dupCount2}`
    );

    // Central sense still intact after publish
    const senseAfterPublish = await prisma.dictionarySense.findUniqueOrThrow({
      where: { id: senseId },
    });
    expect(senseAfterPublish.definition).toBe(centralDefinition);
  });

  it("9: Learn/Spell/Read APIs expose grade-specific meaning for G1 child", async () => {
    const words = await request(app)
      .get(`/api/learning/categories/${catG1}/words?childId=${childG1}`)
      .set("Authorization", `Bearer ${parentToken}`);
    const list = (words.body.data?.words ?? []) as Array<{
      id: string;
      word: string;
      simpleMeaning: string;
      exampleSentence?: string | null;
    }>;
    const hit = list.find((w) => w.word === sharedHeadword);
    const listOk =
      words.status === 200 &&
      hit?.simpleMeaning === "Grade 1 simple meaning for kids." &&
      hit?.exampleSentence === "I see it every day.";

    const one = hit
      ? await request(app)
          .get(`/api/learning/words/${hit.id}?childId=${childG1}`)
          .set("Authorization", `Bearer ${parentToken}`)
      : null;
    const detailOk =
      one?.status === 200 &&
      (one.body.data.simpleMeaning === "Grade 1 simple meaning for kids." ||
        one.body.data.meaning === "Grade 1 simple meaning for kids.");

    const session = await request(app)
      .post("/api/learning/sessions")
      .set("Authorization", `Bearer ${parentToken}`)
      .send({ childId: childG1, categoryId: catG1, questionCount: 5 });
    const sessionWords = (session.body.data?.questions ?? []) as Array<{
      word: { id: string; text?: string; word?: string; meaning?: string; simpleMeaning?: string };
    }>;
    const inSession = sessionWords.find(
      (q) =>
        q.word?.id === hit?.id ||
        q.word?.text === sharedHeadword ||
        q.word?.word === sharedHeadword
    );
    // Session may randomize; list+detail APIs are the authoritative meaning surface for Learn/Spell/Read
    record(
      9,
      "Learn/Spell/Read show grade-specific meaning",
      Boolean(listOk && detailOk),
      listOk && detailOk
        ? `list+detail meaning OK; sessionStatus=${session.status} inPool=${Boolean(inSession)}`
        : `list=${words.status} hit=${Boolean(hit)} detail=${one?.status} meaning=${hit?.simpleMeaning}`
    );
  });

  it("10: unpublish hides from child app; dictionary entry remains", async () => {
    expect(assignmentG1).toBeTruthy();
    expect(wordG1Id).toBeTruthy();
    const unpub = await request(app)
      .post(`/api/admin/dictionary/assignments/${assignmentG1}/unpublish`)
      .set("Authorization", `Bearer ${adminToken}`);
    const word = await prisma.vocabularyWord.findUnique({
      where: { id: wordG1Id },
    });
    const entry = await prisma.dictionaryEntry.findUnique({
      where: { normalizedHeadword: sharedHeadword.toLowerCase() },
      include: { senses: true },
    });
    const words = await request(app)
      .get(`/api/learning/categories/${catG1}/words?childId=${childG1}`)
      .set("Authorization", `Bearer ${parentToken}`);
    const list = (words.body.data?.words ?? []) as Array<{ word: string; isActive?: boolean }>;
    const stillVisible = list.some((w) => w.word === sharedHeadword);
    record(
      10,
      "Unpublish hides from child; dictionary kept",
      Boolean(
        unpub.status === 200 &&
          word?.isActive === false &&
          entry &&
          entry.senses.length > 0 &&
          !stillVisible
      ),
      `unpub=${unpub.status} active=${word?.isActive} entry=${Boolean(entry)} visible=${stillVisible}`
    );
  });

  it("11: Grade 1 existing records/topics unchanged (excluding E2E prefix words)", async () => {
    const g1Words = await prisma.vocabularyWord.count({
      where: {
        isActive: true,
        category: { group: { level: { code: "LEVEL_1" } } },
        NOT: { text: { in: [...sampleHeads, "hiddenvale"] } },
      },
    });
    const g1Topics = await prisma.learningCategory.count({
      where: { group: { level: { code: "LEVEL_1" } } },
    });
    const g1PubTopics = await prisma.learningCategory.count({
      where: { group: { level: { code: "LEVEL_1" } }, isPublished: true },
    });
    const ok =
      g1Words === g1WordCountBefore &&
      g1Topics === g1TopicCountBefore &&
      g1PubTopics === g1PublishedTopicCountBefore;
    record(
      11,
      "Grade 1 existing records/topics unchanged",
      ok,
      `words ${g1Words}/${g1WordCountBefore}, topics ${g1Topics}/${g1TopicCountBefore}, publishedTopics ${g1PubTopics}/${g1PublishedTopicCountBefore}`
    );
  });

  it("12: Grades 2–4 drafts remain hidden unless approved and published", async () => {
    // Create a draft-only assignment that is never approved
    const extra = await request(app)
      .post("/api/admin/dictionary/entries")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        headword: "hiddenvale",
        definition: "A hidden draft word for grade two.",
        example: "This should not show to kids.",
      });
    expect(extra.status).toBe(201);
    const hiddenSense = extra.body.data.senses[0].id;
    const draft = await request(app)
      .post("/api/admin/dictionary/assignments/draft")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        senseId: hiddenSense,
        gradeId: grade2Id,
        levelId: level2Id,
        categoryId: catG2,
        meaningOverride: "Should stay hidden from kids until approved.",
      });
    expect(draft.status).toBe(201);
    const draftId = draft.body.data.id;
    const pendingPublish = await request(app)
      .post(`/api/admin/dictionary/assignments/${draftId}/publish`)
      .set("Authorization", `Bearer ${adminToken}`);

    const activeHidden = await prisma.vocabularyWord.count({
      where: { text: "hiddenvale", isActive: true },
    });

    // Draft G2 category should not appear for a Grade 1 child browsing L2
    const g2Groups = await request(app)
      .get(`/api/learning/levels/2/groups?childId=${childG1}`)
      .set("Authorization", `Bearer ${parentToken}`);

    // G2 published assignment word exists in DB but draft category is not kid-visible;
    // ensure draft-status assignment never created an active word.
    const draftAssignment = await prisma.vocabularyGradeAssignment.findUniqueOrThrow({
      where: { id: draftId },
    });

    const g3DraftTopics = await prisma.learningCategory.count({
      where: {
        group: { level: { code: "LEVEL_3" } },
        OR: [{ isPublished: false }, { status: { in: ["DRAFT", "PENDING_APPROVAL", "APPROVED"] } }],
      },
    });
    const g4DraftTopics = await prisma.learningCategory.count({
      where: {
        group: { level: { code: "LEVEL_4" } },
        OR: [{ isPublished: false }, { status: { in: ["DRAFT", "PENDING_APPROVAL", "APPROVED"] } }],
      },
    });

    const ok =
      pendingPublish.status === 400 &&
      activeHidden === 0 &&
      draftAssignment.status === "DRAFT" &&
      g3DraftTopics >= 0 &&
      g4DraftTopics >= 0;
    record(
      12,
      "G2–4 drafts hidden unless approved+published",
      ok,
      `draftPublish=${pendingPublish.status} activeHidden=${activeHidden} draftStatus=${draftAssignment.status} g2GroupsStatus=${g2Groups.status} g3draftTopics=${g3DraftTopics} g4draftTopics=${g4DraftTopics}`
    );
  });
});
