import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import * as XLSX from "xlsx";
import { createApp } from "../src/app.js";
import { prisma } from "../src/lib/prisma.js";
import { hashPassword } from "../src/lib/password.js";
import { TOPIC_COLUMNS, WORD_COLUMNS } from "../src/curriculum/curriculum.service.js";

const app = createApp();
const hasDb = Boolean(process.env.DATABASE_URL);
const tag = String(Date.now()).replace(/\d/g, (d, at: number) => (at % 2 ? "klmnopqrst" : "abcdefghij")[Number(d)]);
const TAG = tag.toUpperCase();
const GROUP = `T${TAG}`.slice(0, 20);
const CAT_A = `CURTEST_${TAG}_A`;
const CAT_B = `CURTEST_${TAG}_B`;

type Row = Record<string, string | number>;

function workbook(topics: Row[], words: Row[]) {
  const wb = XLSX.utils.book_new();
  const sheet = (cols: readonly string[], rows: Row[]) =>
    XLSX.utils.aoa_to_sheet([[...cols], ...rows.map((r) => cols.map((c) => r[c] ?? ""))]);
  XLSX.utils.book_append_sheet(wb, sheet(TOPIC_COLUMNS, topics), "Topics");
  XLSX.utils.book_append_sheet(wb, sheet(WORD_COLUMNS, words), "Words");
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

const topic = (code: string, label: string, extra: Row = {}): Row => ({
  "Grade Code": "GRADE_3",
  "Group Code": GROUP,
  "Group Label": `Test Group ${TAG}`,
  "Category Code": code,
  Topic: label,
  Symbol: "🧪",
  "Daily Conversation": "How do you test a topic?",
  "Example Sentence": "We test every topic carefully.",
  "Needs Review": "YES",
  ...extra,
});
const word = (code: string, w: string, extra: Row = {}): Row => ({
  "Category Code": code,
  Word: w,
  Meaning: `a test meaning for ${w}`,
  "Example Sentence": `This sentence uses ${w}.`,
  Emoji: "⭐",
  Difficulty: 2,
  ...extra,
});

async function grade1Snapshot() {
  const cats = await prisma.learningCategory.findMany({
    where: { group: { level: { code: "LEVEL_1" } } },
    select: { id: true, label: true, isPublished: true, status: true, updatedAt: true },
    orderBy: { id: "asc" },
  });
  const words = await prisma.vocabularyWord.count({
    where: { isActive: true, category: { isPublished: true, group: { level: { code: "LEVEL_1" } } } },
  });
  return { cats, words };
}

describe.skipIf(!hasDb)("Learn Wise curriculum (Grades 1–4): workflow, import/export, access", () => {
  let adminToken = "";
  let parentToken = "";
  let parentId = "";
  let level2Id = "";
  let level3Id = "";
  let level4Id = "";
  const levelPublished = new Map<string, boolean>();
  let g1Before: Awaited<ReturnType<typeof grade1Snapshot>>;
  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });
  const upload = (path: string, levelCode: string, buf: Buffer, fields: Record<string, string> = {}) => {
    let req = request(app).post(path).set(auth(adminToken)).field("levelCode", levelCode);
    for (const [k, v] of Object.entries(fields)) req = req.field(k, v);
    return req.attach("file", buf, "curriculum.xlsx");
  };
  const setStatus = (id: string, status: string) =>
    request(app).post(`/api/admin/curriculum/categories/${id}/status`).set(auth(adminToken)).send({ status });

  beforeAll(async () => {
    process.env.JWT_SECRET =
      process.env.JWT_SECRET ?? "dev_only_change_me_to_a_long_random_secret_value";
    g1Before = await grade1Snapshot();
    const levels = await prisma.learningLevel.findMany({
      where: { code: { in: ["LEVEL_2", "LEVEL_3", "LEVEL_4"] } },
    });
    for (const l of levels) levelPublished.set(l.code, l.isPublished);
    level2Id = levels.find((l) => l.code === "LEVEL_2")!.id;
    level3Id = levels.find((l) => l.code === "LEVEL_3")!.id;
    level4Id = levels.find((l) => l.code === "LEVEL_4")!.id;

    const admin = await request(app).post("/api/auth/login").send({ email: "admin@littlereaders.test", password: "AdminDemo1" });
    expect(admin.status).toBe(200);
    adminToken = admin.body.data.tokens.accessToken;

    const email = `curtest_${tag}@example.com`;
    const user = await prisma.user.create({
      data: { name: "Curriculum Test Parent", email, passwordHash: await hashPassword("ParentPass1"), role: "PARENT", isActive: true },
    });
    parentId = user.id;
    const login = await request(app).post("/api/auth/login").send({ email, password: "ParentPass1" });
    expect(login.status).toBe(200);
    parentToken = login.body.data.tokens.accessToken;
  });

  afterAll(async () => {
    const children = await prisma.child.findMany({ where: { parentId }, select: { id: true } });
    const childIds = children.map((c) => c.id);
    await prisma.questionAttempt.deleteMany({ where: { session: { childId: { in: childIds } } } });
    await prisma.learningSession.deleteMany({ where: { childId: { in: childIds } } });
    await prisma.subscriptionAuditEvent.deleteMany({ where: { userId: parentId } });
    await prisma.subscription.deleteMany({ where: { userId: parentId } });
    await prisma.child.deleteMany({ where: { parentId } });
    await prisma.user.deleteMany({ where: { id: parentId } });
    await prisma.learningGroup.deleteMany({ where: { code: { in: [GROUP, `${GROUP}4`.slice(0, 20)] } } });
    for (const [code, isPublished] of levelPublished) {
      await prisma.learningLevel.update({ where: { code }, data: { isPublished } });
    }
  });

  it("blocks parents from the curriculum admin API", async () => {
    const res = await request(app).get("/api/admin/curriculum/overview").set(auth(parentToken));
    expect(res.status).toBe(403);
  });

  it("overview lists Grades 1–4 with Grade 1 locked", async () => {
    const res = await request(app).get("/api/admin/curriculum/overview").set(auth(adminToken));
    expect(res.status).toBe(200);
    const codes = res.body.data.map((g: { level: { code: string } }) => g.level.code);
    expect(codes).toEqual(["LEVEL_1", "LEVEL_2", "LEVEL_3", "LEVEL_4"]);
    const g1 = res.body.data[0];
    expect(g1.level.locked).toBe(true);
    expect(g1.totals.byStatus.PUBLISHED).toBe(10);
    expect(res.body.data[1].level.locked).toBe(false);
    const bad = await request(app).get("/api/admin/curriculum/summary?levelCode=LEVEL_9").set(auth(adminToken));
    expect(bad.status).toBe(400);
  });

  it("exports Grade 1 as a workbook; preview works but import and status changes are refused", async () => {
    const res = await request(app)
      .get("/api/admin/curriculum/export.xlsx?levelCode=LEVEL_1")
      .set(auth(adminToken))
      .buffer(true)
      .parse((r, cb) => {
        const chunks: Buffer[] = [];
        r.on("data", (c: Buffer) => chunks.push(c));
        r.on("end", () => cb(null, Buffer.concat(chunks)));
      });
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("spreadsheetml");
    const wb = XLSX.read(res.body as Buffer, { type: "buffer" });
    expect(wb.SheetNames).toEqual(["Read Me", "Topics", "Words"]);
    const topics = XLSX.utils.sheet_to_json<Record<string, string>>(wb.Sheets.Topics!);
    const words = XLSX.utils.sheet_to_json<Record<string, string>>(wb.Sheets.Words!);
    expect(topics.filter((t) => t.Status === "PUBLISHED")).toHaveLength(10);
    expect(words.length).toBeGreaterThanOrEqual(750);
    expect(topics.every((t) => t["Grade Code"] === "GRADE_1")).toBe(true);

    const preview = await upload("/api/admin/curriculum/import/preview", "LEVEL_1", res.body as Buffer);
    expect(preview.status).toBe(200);
    expect(preview.body.data.locked).toBe(true);
    expect(preview.body.data.canApply).toBe(false);

    const apply = await upload("/api/admin/curriculum/import/apply", "LEVEL_1", res.body as Buffer);
    expect(apply.status).toBe(403);
    expect(apply.body.details?.code).toBe("GRADE_LOCKED");

    const g1Cat = await prisma.learningCategory.findFirstOrThrow({
      where: { isPublished: true, group: { level: { code: "LEVEL_1" } } },
    });
    const st = await setStatus(g1Cat.id, "UNPUBLISHED");
    expect(st.status).toBe(403);
  });

  it("preview validates rows: mandatory fields, grade mismatch, duplicates and word quality", async () => {
    const buf = workbook(
      [
        topic(CAT_A, `Test Topic A ${TAG}`),
        topic(CAT_A, `Test Topic A again ${TAG}`),
        topic(CAT_B, `Test Topic A ${TAG}`),
        topic(`CURTEST_${TAG}_C`, `Wrong grade ${TAG}`, { "Grade Code": "GRADE_2" }),
        topic(`CURTEST_${TAG}_D`, ""),
        topic(`CURTEST_${TAG}_E`, "Family and People"),
      ],
      [
        word(CAT_A, "planet"),
        word(CAT_A, "planet"),
        word(CAT_A, "rocket2"),
        word(CAT_A, "comet", { Emoji: "" }),
        word(CAT_A, "orbit", { Meaning: "" }),
        word("NOPE_CODE", "star"),
        word(CAT_A, "moon"),
      ]
    );
    const res = await upload("/api/admin/curriculum/import/preview", "LEVEL_3", buf);
    expect(res.status).toBe(200);
    const d = res.body.data;
    expect(d.fileIssues).toEqual([]);
    expect(d.topics.map((t: { action: string }) => t.action)).toEqual([
      "NEW", "DUPLICATE", "DUPLICATE", "ERROR", "ERROR", "DUPLICATE",
    ]);
    expect(d.topics[3].issues.join(" ")).toMatch(/does not match/);
    expect(d.topics[4].issues.join(" ")).toMatch(/Topic is empty/);
    expect(d.topics[5].issues.join(" ")).toMatch(/already exists/);
    expect(d.words.map((w: { action: string }) => w.action)).toEqual([
      "NEW", "DUPLICATE", "ERROR", "ERROR", "ERROR", "ERROR", "NEW",
    ]);
    expect(d.words[2].issues.join(" ")).toMatch(/numbers/);
    expect(d.words[3].issues.join(" ")).toMatch(/Emoji/);
    expect(d.words[4].issues.join(" ")).toMatch(/Meaning/);
    expect(d.words[5].issues.join(" ")).toMatch(/not in this grade/);
    expect(d.errorCount).toBeGreaterThan(0);

    const missingCols = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(missingCols, XLSX.utils.aoa_to_sheet([["Topic"], ["x"]]), "Topics");
    const mc = await upload(
      "/api/admin/curriculum/import/preview",
      "LEVEL_3",
      XLSX.write(missingCols, { type: "buffer", bookType: "xlsx" }) as Buffer
    );
    expect(mc.status).toBe(200);
    expect(mc.body.data.fileIssues.join(" ")).toMatch(/Words.*missing|missing column/);

    const notXlsx = await request(app)
      .post("/api/admin/curriculum/import/preview")
      .set(auth(adminToken))
      .field("levelCode", "LEVEL_3")
      .attach("file", Buffer.from("a,b\n1,2"), "x.csv");
    expect(notXlsx.status).toBe(400);
  });

  it("apply refuses files with errors unless partial import is confirmed; imports as hidden DRAFT", async () => {
    const buf = workbook(
      [topic(CAT_A, `Test Topic A ${TAG}`), topic(CAT_B, `Test Topic B ${TAG}`, { Status: "PUBLISHED" })],
      [word(CAT_A, "planet"), word(CAT_A, "moon"), word(CAT_A, "rocket2")]
    );
    const strict = await upload("/api/admin/curriculum/import/apply", "LEVEL_3", buf);
    expect(strict.status).toBe(400);
    expect(strict.body.details?.code).toBe("IMPORT_HAS_ERRORS");

    const partial = await upload("/api/admin/curriculum/import/apply", "LEVEL_3", buf, { allowPartial: "true" });
    expect(partial.status).toBe(200);
    expect(partial.body.data.groupsCreated).toBe(1);
    expect(partial.body.data.topicsCreated).toBe(2);
    expect(partial.body.data.wordsCreated).toBe(2);

    const cats = await prisma.learningCategory.findMany({ where: { code: { in: [CAT_A, CAT_B] } } });
    expect(cats).toHaveLength(2);
    for (const c of cats) {
      expect(c.status).toBe("DRAFT");
      expect(c.isPublished).toBe(false);
      expect(c.needsReview).toBe(true);
      expect(c.symbol).toBe("🧪");
      expect(c.dailyConversation).toBe("How do you test a topic?");
    }
    const w = await prisma.vocabularyWord.findFirstOrThrow({ where: { text: "planet", category: { code: CAT_A } } });
    expect(w.exampleSentence).toBe("This sentence uses planet.");

    const again = await upload("/api/admin/curriculum/import/preview", "LEVEL_3", workbook(
      [topic(CAT_A, `Test Topic A ${TAG}`)],
      [word(CAT_A, "planet"), word(CAT_A, "moon", { Meaning: "a changed meaning for moon" })]
    ));
    expect(again.body.data.topics[0].action).toBe("UNCHANGED");
    expect(again.body.data.words.map((x: { action: string }) => x.action)).toEqual(["UNCHANGED", "UPDATE"]);
  });

  it("status workflow: draft → pending → approved → published → unpublished, with guards", async () => {
    const a = await prisma.learningCategory.findFirstOrThrow({ where: { code: CAT_A } });
    const b = await prisma.learningCategory.findFirstOrThrow({ where: { code: CAT_B } });

    const skip = await setStatus(a.id, "PUBLISHED");
    expect(skip.status).toBe(409);
    expect(skip.body.details?.code).toBe("INVALID_STATUS_TRANSITION");
    const bypass = await request(app)
      .patch(`/api/admin/content/categories/${a.id}`)
      .set(auth(adminToken))
      .send({ isPublished: true });
    expect(bypass.status).toBe(409);
    expect(bypass.body.details?.code).toBe("APPROVAL_REQUIRED");

    expect((await setStatus(a.id, "PENDING_APPROVAL")).status).toBe(200);
    const approved = await setStatus(a.id, "APPROVED");
    expect(approved.status).toBe(200);
    expect(approved.body.data.needsReview).toBe(false);
    expect(approved.body.data.isPublished).toBe(false);

    const staffView = async () => {
      const r = await request(app).get("/api/learning/levels/3/groups").set(auth(adminToken));
      expect(r.status).toBe(200);
      return r.body.data.groups.flatMap((g: { categories: { id: string }[] }) => g.categories.map((c) => c.id));
    };
    expect(await staffView()).not.toContain(a.id);

    const published = await setStatus(a.id, "PUBLISHED");
    expect(published.status).toBe(200);
    expect(published.body.data.isPublished).toBe(true);
    expect(await staffView()).toContain(a.id);

    await setStatus(b.id, "PENDING_APPROVAL");
    await setStatus(b.id, "APPROVED");
    const empty = await setStatus(b.id, "PUBLISHED");
    expect(empty.status).toBe(400);
    expect(await staffView()).not.toContain(b.id);

    const locked = await upload("/api/admin/curriculum/import/preview", "LEVEL_3", workbook(
      [topic(CAT_A, `Test Topic A ${TAG}`)],
      [word(CAT_A, "galaxy")]
    ));
    expect(locked.body.data.words[0].issues.join(" ")).toMatch(/published/);

    const unpub = await setStatus(a.id, "UNPUBLISHED");
    expect(unpub.status).toBe(200);
    expect(unpub.body.data.isPublished).toBe(false);
    expect(await staffView()).not.toContain(a.id);
    expect((await setStatus(a.id, "PUBLISHED")).status).toBe(200);

    const bulk = await request(app)
      .post("/api/admin/curriculum/categories/status")
      .set(auth(adminToken))
      .send({ categoryIds: [a.id, b.id], status: "UNPUBLISHED" });
    expect(bulk.status).toBe(200);
    expect(bulk.body.data.updated).toBe(1);
    expect((await setStatus(a.id, "PUBLISHED")).status).toBe(200);
  });

  it("Grade 3 and Grade 4 children see only their own grade's published topics", async () => {
    await prisma.learningLevel.updateMany({ where: { id: { in: [level3Id, level4Id] } }, data: { isPublished: true } });

    const g4 = await upload("/api/admin/curriculum/import/apply", "LEVEL_4", workbook(
      [topic(`CURTEST_${TAG}_G4`, `Grade Four Topic ${TAG}`, { "Grade Code": "GRADE_4", "Group Code": `${GROUP}4`.slice(0, 20) })],
      [word(`CURTEST_${TAG}_G4`, "debate")]
    ));
    expect(g4.status).toBe(200);
    const g4Cat = await prisma.learningCategory.findFirstOrThrow({ where: { code: `CURTEST_${TAG}_G4` } });
    for (const s of ["PENDING_APPROVAL", "APPROVED", "PUBLISHED"]) expect((await setStatus(g4Cat.id, s)).status).toBe(200);
    const g3Cat = await prisma.learningCategory.findFirstOrThrow({ where: { code: CAT_A } });
    const g2Cat = await prisma.learningCategory.findFirst({
      where: { isPublished: true, group: { levelId: level2Id }, words: { some: { isActive: true } } },
    });

    const mk = async (level: string, name: string) => {
      const r = await request(app).post("/api/children").set(auth(parentToken))
        .send({ displayName: name, birthDate: "10/02/2016", level });
      expect(r.status).toBe(201);
      expect(r.body.data.level).toBe(level);
      return r.body.data.id as string;
    };
    const c3 = await mk("LEVEL_3", "Thea Three");
    const c4 = await mk("LEVEL_4", "Finn Four");

    const noSub = await request(app).post("/api/learning/sessions").set(auth(parentToken))
      .send({ childId: c3, categoryId: g3Cat.id, questionCount: 5 });
    expect(noSub.status).toBe(402);
    expect(noSub.body.details?.levelCode).toBe("LEVEL_3");
    const noSubWords = await request(app).get(`/api/learning/categories/${g3Cat.id}/words?childId=${c3}`).set(auth(parentToken));
    expect(noSubWords.status).toBe(402);

    for (const [childId, levelId] of [[c3, level3Id], [c4, level4Id]]) {
      const g = await request(app).post("/api/subscriptions/admin/grade-grant").set(auth(adminToken))
        .send({ childId, levelId, months: 1 });
      expect(g.status).toBe(201);
    }

    const groups3 = await request(app).get(`/api/learning/levels/3/groups?childId=${c3}`).set(auth(parentToken));
    expect(groups3.status).toBe(200);
    const cats3 = groups3.body.data.groups.flatMap((g: { categories: { id: string; symbol: string; dailyConversation: string }[] }) => g.categories);
    expect(cats3.map((c: { id: string }) => c.id)).toContain(g3Cat.id);
    const shown = cats3.find((c: { id: string }) => c.id === g3Cat.id);
    expect(shown.symbol).toBe("🧪");
    expect(shown.dailyConversation).toBe("How do you test a topic?");
    const b = await prisma.learningCategory.findFirstOrThrow({ where: { code: CAT_B } });
    expect(cats3.map((c: { id: string }) => c.id)).not.toContain(b.id);
    expect(cats3.map((c: { id: string }) => c.id)).not.toContain(g4Cat.id);

    const play3 = await request(app).post("/api/learning/sessions").set(auth(parentToken))
      .send({ childId: c3, categoryId: g3Cat.id, questionCount: 5 });
    expect(play3.status).toBe(201);

    const words = await request(app).get(`/api/learning/categories/${g3Cat.id}/words?childId=${c3}`).set(auth(parentToken));
    expect(words.status).toBe(200);
    expect(words.body.data.category.dailyConversation).toBe("How do you test a topic?");
    expect(words.body.data.words[0].exampleSentence).toMatch(/This sentence uses/);
    const wrongGrade = await request(app).get(`/api/learning/categories/${g3Cat.id}/words?childId=${c4}`).set(auth(parentToken));
    expect(wrongGrade.status).toBe(403);
    expect(wrongGrade.body.details?.code).toBe("GRADE_CONTENT_FORBIDDEN");

    const groups4 = await request(app).get(`/api/learning/levels/4/groups?childId=${c4}`).set(auth(parentToken));
    expect(groups4.status).toBe(200);
    const ids4 = groups4.body.data.groups.flatMap((g: { categories: { id: string }[] }) => g.categories.map((c) => c.id));
    expect(ids4).toContain(g4Cat.id);
    expect(ids4).not.toContain(g3Cat.id);

    const cross = [
      [c3, g4Cat.id],
      [c4, g3Cat.id],
      ...(g2Cat ? [[c3, g2Cat.id], [c4, g2Cat.id]] : []),
    ];
    for (const [childId, categoryId] of cross) {
      const r = await request(app).post("/api/learning/sessions").set(auth(parentToken))
        .send({ childId, categoryId, questionCount: 5 });
      expect(r.status).toBe(403);
      expect(r.body.details?.code).toBe("GRADE_CONTENT_FORBIDDEN");
    }
    expect((await request(app).get(`/api/learning/levels/4/groups?childId=${c3}`).set(auth(parentToken))).status).toBe(403);
    expect((await request(app).get(`/api/learning/levels/1/groups?childId=${c4}`).set(auth(parentToken))).status).toBe(403);
  });

  it("Grade 1 content is untouched by every curriculum operation", async () => {
    const after = await grade1Snapshot();
    expect(after.words).toBe(g1Before.words);
    expect(after.cats).toEqual(g1Before.cats);
  });
});
