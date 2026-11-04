import { beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";

const app = createApp();
const hasDb = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDb)("Children update/delete + admin parent directory authz", () => {
  const unique = Date.now();
  const parentEmail = `child_authz_p_${unique}@example.com`;
  const otherEmail = `child_authz_o_${unique}@example.com`;
  const password = "SecurePass1";
  let parentToken = "";
  let otherToken = "";
  let adminToken = "";
  let childId = "";
  let otherChildId = "";

  beforeAll(() => {
    process.env.JWT_SECRET =
      process.env.JWT_SECRET ?? "test_secret_at_least_thirty_two_chars_long";
  });

  it("registers two parents and creates children", async () => {
    const p = await request(app).post("/api/auth/register").send({
      name: "Authz Parent",
      email: parentEmail,
      password,
      acceptTerms: true,
      acceptPrivacy: true,
      parentalConsent: true,
    });
    expect(p.status).toBe(201);
    parentToken = p.body.data.tokens.accessToken;

    const o = await request(app).post("/api/auth/register").send({
      name: "Other Parent",
      email: otherEmail,
      password,
      acceptTerms: true,
      acceptPrivacy: true,
      parentalConsent: true,
    });
    expect(o.status).toBe(201);
    otherToken = o.body.data.tokens.accessToken;

    const adminLogin = await request(app).post("/api/auth/login").send({
      email: "admin@littlereaders.test",
      password: "AdminDemo1",
    });
    expect(adminLogin.status).toBe(200);
    adminToken = adminLogin.body.data.tokens.accessToken;

    const c1 = await request(app)
      .post("/api/children")
      .set("Authorization", `Bearer ${parentToken}`)
      .send({ displayName: "AuthzKid", birthYear: new Date().getFullYear() - 4 });
    expect(c1.status).toBe(201);
    childId = c1.body.data.id;

    const c2 = await request(app)
      .post("/api/children")
      .set("Authorization", `Bearer ${otherToken}`)
      .send({ displayName: "OtherKid", birthYear: new Date().getFullYear() - 5 });
    expect(c2.status).toBe(201);
    otherChildId = c2.body.data.id;
  });

  it("blocks parent from reading another parent's child", async () => {
    const res = await request(app)
      .get(`/api/children/${otherChildId}`)
      .set("Authorization", `Bearer ${parentToken}`);
    expect(res.status).toBe(404);
  });

  it("blocks parent from patching another parent's child", async () => {
    const res = await request(app)
      .patch(`/api/children/${otherChildId}`)
      .set("Authorization", `Bearer ${parentToken}`)
      .send({ displayName: "Hacked" });
    expect(res.status).toBe(404);
  });

  it("blocks parent from deleting another parent's child", async () => {
    const res = await request(app)
      .delete(`/api/children/${otherChildId}`)
      .set("Authorization", `Bearer ${parentToken}`);
    expect(res.status).toBe(404);
  });

  it("allows parent to update and soft-delete own child", async () => {
    const patch = await request(app)
      .patch(`/api/children/${childId}`)
      .set("Authorization", `Bearer ${parentToken}`)
      .send({ displayName: "AuthzKidUpdated" });
    expect(patch.status).toBe(200);
    expect(patch.body.data.displayName).toBe("AuthzKidUpdated");

    const del = await request(app)
      .delete(`/api/children/${childId}`)
      .set("Authorization", `Bearer ${parentToken}`);
    expect(del.status).toBe(200);
    expect(del.body.data.deleted).toBe(true);

    const gone = await request(app)
      .get(`/api/children/${childId}`)
      .set("Authorization", `Bearer ${parentToken}`);
    expect(gone.status).toBe(404);
  });

  it("blocks PARENT from admin parents directory", async () => {
    const res = await request(app)
      .get("/api/children/admin/parents")
      .set("Authorization", `Bearer ${otherToken}`);
    expect(res.status).toBe(403);
  });

  it("allows ADMIN to list parents and read any child profile", async () => {
    const list = await request(app)
      .get("/api/children/admin/parents")
      .set("Authorization", `Bearer ${adminToken}`);
    expect(list.status).toBe(200);
    expect(Array.isArray(list.body.data)).toBe(true);

    const child = await request(app)
      .get(`/api/children/${otherChildId}`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(child.status).toBe(200);
    expect(child.body.data.displayName).toBe("OtherKid");
  });

  it("rejects unauthenticated child mutation", async () => {
    const res = await request(app)
      .patch(`/api/children/${otherChildId}`)
      .send({ displayName: "Nope" });
    expect(res.status).toBe(401);
  });
});
