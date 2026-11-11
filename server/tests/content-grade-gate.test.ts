import { beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { prisma } from "../src/lib/prisma.js";

const app = createApp();
const stamp = Date.now();

async function registerParent(tag: string) {
  const reg = await request(app).post("/api/auth/register").send({
    name: `Gate ${tag}`,
    email: `gate_${tag}_${stamp}@test.local`,
    password: "ParentDemo1",
    acceptTerms: true,
    acceptPrivacy: true,
    parentalConsent: true,
  });
  expect(reg.status).toBe(201);
  const token = reg.body.data.tokens.accessToken as string;
  const status = await request(app).get("/api/agreements").set("Authorization", `Bearer ${token}`);
  await request(app)
    .post("/api/agreements/accept")
    .set("Authorization", `Bearer ${token}`)
    .send({ versionIds: status.body.data.documents.map((d: { current: { id: string } }) => d.current.id) });
  return { token, id: reg.body.data.user.id as string };
}

async function addChild(token: string, name: string, level: string) {
  const res = await request(app)
    .post("/api/children")
    .set("Authorization", `Bearer ${token}`)
    .send({ displayName: name, birthDate: "10/02/2020", level });
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  return res.body.data.id as string;
}

async function grantGrade(userId: string, childId: string, levelId: string) {
  await prisma.subscription.create({
    data: {
      userId,
      childId,
      levelId,
      plan: "YEARLY",
      status: "ACTIVE",
      startedAt: new Date(),
      expiresAt: new Date(Date.now() + 30 * 86_400_000),
      provider: "manual_admin",
      providerRef: `gate_${childId}`,
      includedSeats: 1,
    },
  });
}

describe("T-SEC-05 — content endpoints enforce the grade gate", () => {
  let parent = { token: "", id: "" };
  let adminToken = "";
  let ava = ""; // Grade 1, subscribed
  let ben = ""; // Grade 2, subscribed
  let cleo = ""; // Grade 1, not subscribed
  let g1CategoryId = "";
  let g1WordId = "";

  const get = (path: string, token = parent.token) =>
    request(app).get(path).set("Authorization", `Bearer ${token}`);

  beforeAll(async () => {
    const level1 = await prisma.learningLevel.findUniqueOrThrow({ where: { code: "LEVEL_1" } });
    const level2 = await prisma.learningLevel.findUniqueOrThrow({ where: { code: "LEVEL_2" } });
    const cat = await prisma.learningCategory.findFirstOrThrow({
      where: { isPublished: true, group: { levelId: level1.id }, words: { some: { isActive: true } } },
      include: { words: { where: { isActive: true }, take: 1 } },
    });
    g1CategoryId = cat.id;
    g1WordId = cat.words[0].id;

    parent = await registerParent("family");
    ava = await addChild(parent.token, "Ava G1", "LEVEL_1");
    ben = await addChild(parent.token, "Ben G2", "LEVEL_2");
    cleo = await addChild(parent.token, "Cleo G1", "LEVEL_1");
    await grantGrade(parent.id, ava, level1.id);
    await grantGrade(parent.id, ben, level2.id);

    const admin = await request(app).post("/api/auth/login").send({ email: "admin@littlereaders.test", password: "AdminDemo1" });
    expect(admin.status).toBe(200);
    adminToken = admin.body.data.tokens.accessToken;
  });

  it("parents must name a child; admins may browse the catalog", async () => {
    for (const path of [`/api/learning/categories/${g1CategoryId}/words`, `/api/learning/words/${g1WordId}`, "/api/learning/levels/1/groups"]) {
      const res = await get(path);
      expect(res.status, path).toBe(400);
      expect(res.body.code, path).toBe("CHILD_REQUIRED");
      expect((await get(path, adminToken)).status, path).toBe(200);
    }
  });

  it("an entitled child reads its own grade's content", async () => {
    const q = `?childId=${ava}`;
    const words = await get(`/api/learning/categories/${g1CategoryId}/words${q}`);
    expect(words.status).toBe(200);
    expect(words.body.data.words.length).toBeGreaterThan(0);
    expect((await get(`/api/learning/words/${g1WordId}${q}`)).status).toBe(200);
    const groups = await get(`/api/learning/levels/1/groups${q}`);
    expect(groups.status).toBe(200);
    expect(groups.body.data.access.entitled).toBe(true);
    expect(groups.body.data.groups.length).toBeGreaterThan(0);
    expect((await get(`/api/learning/level-1/${ava}`)).status).toBe(200);
    expect((await get(`/api/learning/lessons${q}`)).status).toBe(200);
  });

  it("a subscribed child cannot read another grade's content", async () => {
    const q = `?childId=${ben}`;
    for (const path of [
      `/api/learning/categories/${g1CategoryId}/words${q}`,
      `/api/learning/words/${g1WordId}${q}`,
      `/api/learning/levels/1/groups${q}`,
      `/api/learning/level-1/${ben}`,
    ]) {
      const res = await get(path);
      expect(res.status, path).toBe(403);
      expect(res.body.code, path).toBe("GRADE_CONTENT_FORBIDDEN");
    }
  });

  it("an unsubscribed child gets no grade content", async () => {
    const q = `?childId=${cleo}`;
    for (const path of [
      `/api/learning/categories/${g1CategoryId}/words${q}`,
      `/api/learning/words/${g1WordId}${q}`,
      `/api/learning/level-1/${cleo}`,
      `/api/learning/lessons${q}`,
    ]) {
      const res = await get(path);
      expect(res.status, path).toBe(402);
      expect(res.body.code, path).toBe("SUBSCRIPTION_REQUIRED");
    }
    const groups = await get(`/api/learning/levels/1/groups${q}`);
    expect(groups.status).toBe(200);
    expect(groups.body.data.access.entitled).toBe(false);
    expect(groups.body.data.groups).toEqual([]);
  });

  it("another family's child is never readable", async () => {
    const other = await registerParent("other");
    const res = await get(`/api/learning/categories/${g1CategoryId}/words?childId=${ava}`, other.token);
    expect(res.status).toBe(404);
  });
});
