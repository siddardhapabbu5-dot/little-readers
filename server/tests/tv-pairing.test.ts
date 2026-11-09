import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { prisma } from "../src/lib/prisma.js";
import { resetTvStore } from "../src/tv/tv.store.js";

const app = createApp();
const hasDb = Boolean(process.env.DATABASE_URL);
const TEST_LABEL = "Vitest living room TV";

async function startPairing() {
  const res = await request(app).post("/api/tv/pair/start").send({ deviceLabel: TEST_LABEL });
  expect(res.status).toBe(201);
  return res.body.data as { pairingId: string; code: string; pollToken: string };
}

describe.skipIf(!hasDb)("TV pairing", () => {
  let parentToken = "";
  let childId = "";

  beforeAll(async () => {
    process.env.JWT_SECRET =
      process.env.JWT_SECRET ?? "dev_only_change_me_to_a_long_random_secret_value";
    const login = await request(app).post("/api/auth/login").send({
      email: "parent@littlereaders.test",
      password: "ParentDemo1",
    });
    expect(login.status).toBe(200);
    parentToken = login.body.data.tokens.accessToken;
    const kids = await request(app).get("/api/children").set("Authorization", `Bearer ${parentToken}`);
    childId = kids.body.data[0].id;
  });

  beforeEach(() => resetTvStore());

  afterAll(async () => {
    await prisma.tvDeviceSession.deleteMany({ where: { deviceLabel: TEST_LABEL } });
  });

  it("keeps an approved TV connected after the in-memory store resets (API restart)", async () => {
    const p = await startPairing();
    await request(app)
      .post("/api/tv/pair/approve")
      .set("Authorization", `Bearer ${parentToken}`)
      .send({ code: p.code, childId });
    const tvToken = (await request(app).post("/api/tv/pair/poll").send(p)).body.data.accessToken;
    resetTvStore();
    const me = await request(app).get("/api/tv/me").set("Authorization", `Bearer ${tvToken}`);
    expect(me.status).toBe(200);
    // Only a hash of the TV token is stored.
    expect(await prisma.tvDeviceSession.count({ where: { tokenHash: tvToken } })).toBe(0);
  });

  it("lets only one of two simultaneous approvals use a code", async () => {
    const p = await startPairing();
    const send = () =>
      request(app)
        .post("/api/tv/pair/approve")
        .set("Authorization", `Bearer ${parentToken}`)
        .send({ code: p.code, childId });
    const results = await Promise.all([send(), send()]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 404]);
  });

  it("issues a code without exposing any token until a parent approves", async () => {
    const p = await startPairing();
    expect(p.code).toMatch(/^[A-Z0-9]{4}-[A-Z0-9]{4}$/);
    const poll = await request(app).post("/api/tv/pair/poll").send(p);
    expect(poll.status).toBe(200);
    expect(poll.body.data).toEqual({ status: "PENDING" });
  });

  it("rejects polling with a wrong poll token", async () => {
    const p = await startPairing();
    const poll = await request(app)
      .post("/api/tv/pair/poll")
      .send({ pairingId: p.pairingId, pollToken: "nope" });
    expect(poll.status).toBe(410);
  });

  it("requires a signed-in parent to approve", async () => {
    const p = await startPairing();
    const res = await request(app).post("/api/tv/pair/approve").send({ code: p.code, childId });
    expect(res.status).toBe(401);
  });

  it("does not let a parent connect a child they do not own", async () => {
    const p = await startPairing();
    const other = await prisma.child.findFirst({
      where: { parent: { email: { not: "parent@littlereaders.test" } } },
      select: { id: true },
    });
    const res = await request(app)
      .post("/api/tv/pair/approve")
      .set("Authorization", `Bearer ${parentToken}`)
      .send({ code: p.code, childId: other?.id ?? "missing-child" });
    expect(res.status).toBe(404);
  });

  it("pairs once, scopes the TV to that child, and can be revoked", async () => {
    const p = await startPairing();
    const approve = await request(app)
      .post("/api/tv/pair/approve")
      .set("Authorization", `Bearer ${parentToken}`)
      .send({ code: p.code.toLowerCase().replace("-", " "), childId });
    expect(approve.status).toBe(200);
    expect(approve.body.data.childId).toBe(childId);

    const claimed = await request(app).post("/api/tv/pair/poll").send(p);
    expect(claimed.body.data.status).toBe("APPROVED");
    const tvToken = claimed.body.data.accessToken as string;
    expect(tvToken.length).toBeGreaterThan(40);

    // Single use: the same pairing cannot hand out a second token.
    const again = await request(app).post("/api/tv/pair/poll").send(p);
    expect(again.status).toBe(410);

    // The code cannot be approved twice.
    const reuse = await request(app)
      .post("/api/tv/pair/approve")
      .set("Authorization", `Bearer ${parentToken}`)
      .send({ code: p.code, childId });
    expect(reuse.status).toBe(404);

    const me = await request(app).get("/api/tv/me").set("Authorization", `Bearer ${tvToken}`);
    expect(me.status).toBe(200);
    expect(me.body.data.child.id).toBe(childId);

    // A TV token is not a parent token.
    const parentApi = await request(app).get("/api/children").set("Authorization", `Bearer ${tvToken}`);
    expect(parentApi.status).toBe(401);
    const payments = await request(app)
      .get("/api/subscriptions/me")
      .set("Authorization", `Bearer ${tvToken}`);
    expect(payments.status).toBe(401);

    const cats = await request(app).get("/api/tv/categories").set("Authorization", `Bearer ${tvToken}`);
    expect(cats.status).toBe(200);
    expect(Array.isArray(cats.body.data.categories)).toBe(true);

    const list = await request(app).get("/api/tv/connections").set("Authorization", `Bearer ${parentToken}`);
    expect(list.body.data.map((c: { id: string }) => c.id)).toContain(approve.body.data.connectionId);

    const revoke = await request(app)
      .delete(`/api/tv/connections/${approve.body.data.connectionId}`)
      .set("Authorization", `Bearer ${parentToken}`);
    expect(revoke.status).toBe(200);
    const after = await request(app).get("/api/tv/me").set("Authorization", `Bearer ${tvToken}`);
    expect(after.status).toBe(401);
  });

  it("rejects learning sessions that belong to another child", async () => {
    const p = await startPairing();
    await request(app)
      .post("/api/tv/pair/approve")
      .set("Authorization", `Bearer ${parentToken}`)
      .send({ code: p.code, childId });
    const claimed = await request(app).post("/api/tv/pair/poll").send(p);
    const tvToken = claimed.body.data.accessToken as string;

    const foreign = await prisma.learningSession.findFirst({
      where: { childId: { not: childId } },
      select: { id: true },
    });
    if (!foreign) return;
    const res = await request(app)
      .post(`/api/tv/sessions/${foreign.id}/attempts`)
      .set("Authorization", `Bearer ${tvToken}`)
      .send({ wordId: "x", round: "LISTEN", isCorrect: true });
    expect(res.status).toBe(404);
  });

  it("TV can disconnect itself", async () => {
    const p = await startPairing();
    await request(app)
      .post("/api/tv/pair/approve")
      .set("Authorization", `Bearer ${parentToken}`)
      .send({ code: p.code, childId });
    const tvToken = (await request(app).post("/api/tv/pair/poll").send(p)).body.data.accessToken;
    const bye = await request(app).post("/api/tv/disconnect").set("Authorization", `Bearer ${tvToken}`);
    expect(bye.status).toBe(200);
    const me = await request(app).get("/api/tv/me").set("Authorization", `Bearer ${tvToken}`);
    expect(me.status).toBe(401);
  });
});
