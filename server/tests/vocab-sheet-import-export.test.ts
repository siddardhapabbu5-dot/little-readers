import { describe, expect, it, beforeAll } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { prisma } from "../src/lib/prisma.js";

const app = createApp();
const hasDb = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDb)("Vocabulary grade/level CSV export & import", () => {
  let adminToken = "";
  let gradeId = "";
  let categoryLabel = "";
  let levelCode = "";
  let categoryCode = "";

  beforeAll(async () => {
    process.env.JWT_SECRET =
      process.env.JWT_SECRET ?? "dev_only_change_me_to_a_long_random_secret_value";
    const admin = await request(app).post("/api/auth/login").send({
      email: "admin@littlereaders.test",
      password: "AdminDemo1",
    });
    expect(admin.status).toBe(200);
    adminToken = admin.body.data.tokens.accessToken;

    const grade = await prisma.learningGrade.findFirst({ where: { code: "GRADE_1" } });
    expect(grade).toBeTruthy();
    gradeId = grade!.id;
    const cat = await prisma.learningCategory.findFirst({
      where: { group: { level: { gradeId } } },
      include: { group: { include: { level: true } } },
    });
    expect(cat).toBeTruthy();
    categoryLabel = cat!.label;
    categoryCode = cat!.code;
    levelCode = cat!.group.level.code;
  });

  it("exports CSV and imports a row into an existing category", async () => {
    const exported = await request(app)
      .get(`/api/admin/vocabulary/words/export.csv?gradeId=${gradeId}&isActive=true`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(exported.status).toBe(200);
    expect(exported.headers["content-type"]).toMatch(/csv/);
    expect(exported.text).toContain("grade_code");
    expect(exported.text).toContain("word");

    const stamp = `sheetword${String(Date.now()).replace(/\d/g, (d) => "abcdefghij"[Number(d)])}`;
    const csv = [
      "grade_code,level_code,category_code,category_label,word,meaning,emoji,difficulty,sort_order,is_active",
      `GRADE_1,${levelCode},${categoryCode},"${categoryLabel}",${stamp},sheet meaning,book,1,1,true`,
    ].join("\n");

    const imported = await request(app)
      .post("/api/admin/vocabulary/words/import-sheet")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ csv });
    expect(imported.status).toBe(200);
    expect(imported.body.data.failed).toBe(0);
    expect(imported.body.data.created + imported.body.data.updated).toBeGreaterThanOrEqual(1);

    const word = await prisma.vocabularyWord.findFirst({
      where: { text: stamp },
    });
    expect(word?.meaning).toBe("sheet meaning");
    await prisma.vocabularyWord.deleteMany({ where: { text: stamp } });
  });

  it("imports rows with an outdated group_code and reports failures per category", async () => {
    const stamp = `groupword${String(Date.now()).replace(/\d/g, (d) => "abcdefghij"[Number(d)])}`;
    const csv = [
      "grade_code,level_code,group_code,category_code,category_label,word,meaning",
      `GRADE_1,${levelCode},ZZ_OLD_GROUP,${categoryCode},"${categoryLabel}",${stamp},group meaning`,
      `GRADE_1,${levelCode},,${categoryCode},"${categoryLabel}",bad_word_1,bad meaning`,
    ].join("\n");

    const imported = await request(app)
      .post("/api/admin/vocabulary/words/import-sheet")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ csv });
    expect(imported.status).toBe(200);
    expect(imported.body.data.created + imported.body.data.updated).toBe(1);
    expect(imported.body.data.failed).toBe(1);
    expect(imported.body.data.failedByCategory).toEqual([
      expect.objectContaining({ category: categoryLabel, count: 1 }),
    ]);
    await prisma.vocabularyWord.deleteMany({ where: { text: stamp } });
  });
});
