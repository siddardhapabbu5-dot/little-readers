import { beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";

const app = createApp();
const hasDb = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDb)("Admin content structure CRUD", () => {
  let adminToken = "";
  let parentToken = "";
  let superToken = "";
  const stamp = Date.now();

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

    const superAdmin = await request(app).post("/api/auth/login").send({
      email: "superadmin@littlereaders.test",
      password: "SuperDemo1",
    });
    expect(superAdmin.status).toBe(200);
    superToken = superAdmin.body.data.tokens.accessToken;
  });

  it("blocks PARENT from content admin APIs", async () => {
    const res = await request(app)
      .get("/api/admin/content/grades")
      .set("Authorization", `Bearer ${parentToken}`);
    expect(res.status).toBe(403);
  });

  it("lists seeded grades and supports create / patch / deactivate", async () => {
    const list = await request(app)
      .get("/api/admin/content/grades")
      .set("Authorization", `Bearer ${adminToken}`);
    expect(list.status).toBe(200);
    expect(list.body.data.some((g: { code: string }) => g.code === "GRADE_1")).toBe(true);

    const code = `GRADE_T${stamp}`.slice(0, 40);
    const created = await request(app)
      .post("/api/admin/content/grades")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        code,
        label: "Temp Grade",
        ageMin: 2,
        ageMax: 4,
        description: "test",
        sortOrder: 99,
      });
    expect(created.status).toBe(201);
    const id = created.body.data.id as string;

    const renamedCode = `GRADE_R${stamp}`.slice(0, 40);
    const patched = await request(app)
      .patch(`/api/admin/content/grades/${id}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        code: renamedCode,
        label: "Temp Grade Renamed",
        ageMin: 2,
        ageMax: 5,
      });
    expect(patched.status).toBe(200);
    expect(patched.body.data.code).toBe(renamedCode);
    expect(patched.body.data.label).toBe("Temp Grade Renamed");

    const badAge = await request(app)
      .patch(`/api/admin/content/grades/${id}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ ageMin: 9, ageMax: 3 });
    expect(badAge.status).toBe(400);

    const deact = await request(app)
      .post(`/api/admin/content/grades/${id}/deactivate`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(deact.status).toBe(200);
    expect(deact.body.data.isActive).toBe(false);

    const adminDel = await request(app)
      .delete(`/api/admin/content/grades/${id}`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(adminDel.status).toBe(403);

    const del = await request(app)
      .delete(`/api/admin/content/grades/${id}`)
      .set("Authorization", `Bearer ${superToken}`);
    expect(del.status).toBe(200);
  });

  it("creates difficulty level under grade, group, category; blocks bad grade link", async () => {
    const grades = await request(app)
      .get("/api/admin/content/grades")
      .set("Authorization", `Bearer ${adminToken}`);
    const grade1 = grades.body.data.find((g: { code: string }) => g.code === "GRADE_1");
    expect(grade1).toBeTruthy();

    const noGrade = await request(app)
      .post("/api/admin/content/levels")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        code: `DIFF_${stamp}`,
        label: "Easy",
        kind: "DIFFICULTY",
      });
    expect(noGrade.status).toBe(400);

    const level = await request(app)
      .post("/api/admin/content/levels")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        code: `DIFF_${stamp}`,
        label: "Easy band",
        kind: "DIFFICULTY",
        gradeId: grade1.id,
        ageMin: 1,
        ageMax: 3,
      });
    expect(level.status).toBe(201);
    const levelId = level.body.data.id as string;

    const group = await request(app)
      .post("/api/admin/content/groups")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        levelId,
        code: `G_${stamp}`.slice(0, 40),
        label: "Test Group",
      });
    expect(group.status).toBe(201);
    const groupId = group.body.data.id as string;

    const category = await request(app)
      .post("/api/admin/content/categories")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        groupId,
        code: `CAT_${stamp}`.slice(0, 40),
        label: "Test Category",
        description: "empty shell",
      });
    expect(category.status).toBe(201);

    const unpub = await request(app)
      .post(`/api/admin/content/categories/${category.body.data.id}/deactivate`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(unpub.status).toBe(200);
    expect(unpub.body.data.isPublished).toBe(false);

    // Cleanup empty category/group/level
    await request(app)
      .delete(`/api/admin/content/categories/${category.body.data.id}`)
      .set("Authorization", `Bearer ${superToken}`);
    await request(app)
      .delete(`/api/admin/content/groups/${groupId}`)
      .set("Authorization", `Bearer ${superToken}`);
    await request(app)
      .delete(`/api/admin/content/levels/${levelId}`)
      .set("Authorization", `Bearer ${superToken}`);
  });

  it("refuses deleting in-use grade (GRADE_1) without an explicit force", async () => {
    const grades = await request(app)
      .get("/api/admin/content/grades")
      .set("Authorization", `Bearer ${adminToken}`);
    const grade1 = grades.body.data.find((g: { code: string }) => g.code === "GRADE_1");
    const del = await request(app)
      .delete(`/api/admin/content/grades/${grade1.id}`)
      .set("Authorization", `Bearer ${superToken}`);
    expect(del.status).toBe(409);
    expect(del.body.details?.code).toBe("GRADE_IN_USE");
    expect(del.body.details?.suggest).toBe("force");
    const after = await request(app)
      .get("/api/admin/content/grades")
      .set("Authorization", `Bearer ${adminToken}`);
    expect(after.body.data.some((g: { id: string }) => g.id === grade1.id)).toBe(true);
  });
});
