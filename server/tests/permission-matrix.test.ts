import { beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { prisma } from "../src/lib/prisma.js";
import { hashPassword } from "../src/lib/password.js";
import { hasPermission, permissionsForRole } from "../src/auth/permissions.js";

const app = createApp();
const hasDb = Boolean(process.env.DATABASE_URL);

describe("permission matrix", () => {
  it("keeps destructive and admin-management rights with SUPER_ADMIN only", () => {
    expect(hasPermission("SUPER_ADMIN", "content.destroy")).toBe(true);
    expect(hasPermission("ADMIN", "content.destroy")).toBe(false);
    expect(hasPermission("ADMIN", "admins.manage")).toBe(false);
    expect(hasPermission("ADMIN", "content.manage")).toBe(true);
    expect(hasPermission("SCHOOL_ADMIN", "content.manage")).toBe(false);
    expect(hasPermission("SCHOOL_ADMIN", "schools.manage")).toBe(true);
    expect(hasPermission("TEACHER", "schools.manage")).toBe(false);
    expect(hasPermission("PARENT", "content.manage")).toBe(false);
    expect(hasPermission(undefined, "content.manage")).toBe(false);
    expect(permissionsForRole("TEACHER")).toEqual(["classrooms.teach"]);
  });
});

describe.skipIf(!hasDb)("permission matrix on routes", () => {
  const stamp = Date.now();
  const schoolAdminEmail = `school-admin-${stamp}@littlereaders.test`;
  const teacherEmail = `matrix-teacher-${stamp}@littlereaders.test`;
  let superToken = "";
  let adminToken = "";
  let schoolAdminToken = "";
  let teacherToken = "";

  async function login(email: string, password: string) {
    const res = await request(app).post("/api/auth/login").send({ email, password });
    expect(res.status).toBe(200);
    return res.body.data.tokens.accessToken as string;
  }

  beforeAll(async () => {
    process.env.JWT_SECRET =
      process.env.JWT_SECRET ?? "dev_only_change_me_to_a_long_random_secret_value";
    const passwordHash = await hashPassword("SchoolDemo1");
    await prisma.user.createMany({
      data: [
        { name: "Matrix School Admin", email: schoolAdminEmail, passwordHash, role: "SCHOOL_ADMIN" },
        { name: "Matrix Teacher", email: teacherEmail, passwordHash, role: "TEACHER" },
      ],
    });
    superToken = await login("superadmin@littlereaders.test", "SuperDemo1");
    adminToken = await login("admin@littlereaders.test", "AdminDemo1");
    schoolAdminToken = await login(schoolAdminEmail, "SchoolDemo1");
    teacherToken = await login(teacherEmail, "SchoolDemo1");
  });

  it("refuses SCHOOL_ADMIN and TEACHER on content admin APIs", async () => {
    for (const token of [schoolAdminToken, teacherToken]) {
      for (const path of [
        "/api/admin/content/grades",
        "/api/admin/vocabulary/words",
        "/api/admin/curriculum/summary",
        "/api/admin/lessons",
      ]) {
        const res = await request(app).get(path).set("Authorization", `Bearer ${token}`);
        expect(res.status, path).toBe(403);
        expect(res.body.details?.code, path).toBe("PERMISSION_DENIED");
      }
    }
  });

  it("lets SCHOOL_ADMIN manage schools but not users or payments", async () => {
    const schools = await request(app)
      .get("/api/admin/schools")
      .set("Authorization", `Bearer ${schoolAdminToken}`);
    expect(schools.status).not.toBe(403);

    for (const path of ["/api/admin/users", "/api/payments/admin"]) {
      const res = await request(app).get(path).set("Authorization", `Bearer ${schoolAdminToken}`);
      expect(res.status, path).toBe(403);
    }
  });

  it("refuses ADMIN on bulk word deletion and structural deletes; SUPER_ADMIN passes the gate", async () => {
    const clear = await request(app)
      .post("/api/admin/vocabulary/words/clear-all")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ confirm: "DELETE_ALL_WORDS" });
    expect(clear.status).toBe(403);
    expect(clear.body.details?.permission).toBe("content.destroy");

    const missingId = "00000000-0000-0000-0000-000000000000";
    for (const path of [
      `/api/admin/content/grades/${missingId}`,
      `/api/admin/content/levels/${missingId}`,
      `/api/admin/content/groups/${missingId}`,
      `/api/admin/content/categories/${missingId}`,
      `/api/admin/academic/levels/${missingId}`,
      `/api/admin/academic/grades/${missingId}`,
    ]) {
      const asAdmin = await request(app).delete(path).set("Authorization", `Bearer ${adminToken}`);
      expect(asAdmin.status, path).toBe(403);
      const asSuper = await request(app).delete(path).set("Authorization", `Bearer ${superToken}`);
      expect(asSuper.status, path).not.toBe(403);
    }
  });

  it("refuses ADMIN creating other admins", async () => {
    const res = await request(app)
      .post("/api/admin/users")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        name: "Nope Admin",
        email: `nope-${stamp}@littlereaders.test`,
        password: "NopeAdmin1!",
        role: "ADMIN",
      });
    expect(res.status).toBe(403);
  });

  it("returns the caller's permissions from /auth/me", async () => {
    const me = await request(app).get("/api/auth/me").set("Authorization", `Bearer ${adminToken}`);
    expect(me.status).toBe(200);
    expect(me.body.data.permissions).toContain("content.manage");
    expect(me.body.data.permissions).not.toContain("content.destroy");

    const school = await request(app)
      .get("/api/auth/me")
      .set("Authorization", `Bearer ${schoolAdminToken}`);
    expect(school.body.data.permissions).toEqual(["schools.manage", "classrooms.teach"]);
  });
});
