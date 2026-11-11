import { afterAll, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { prisma } from "../src/lib/prisma.js";

const app = createApp();
const hasDb = Boolean(process.env.DATABASE_URL);
const stamp = Date.now();
const emailPrefix = `pingate_${stamp}`;

async function registerParent() {
  const reg = await request(app).post("/api/auth/register").send({
    name: "Pin Gate",
    email: `${emailPrefix}@test.local`,
    password: "ParentDemo1",
    acceptTerms: true,
    acceptPrivacy: true,
    parentalConsent: true,
  });
  expect(reg.status).toBe(201);
  return reg.body.data.tokens.accessToken as string;
}

describe.skipIf(!hasDb)("Parent PIN gate (LW-001)", () => {
  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email: { startsWith: emailPrefix } } });
  });

  it("creates once, rejects overwrite, rejects wrong PIN without ending the session, accepts the right PIN", async () => {
    const token = await registerParent();
    const auth = { Authorization: `Bearer ${token}` };

    const status0 = await request(app).get("/api/parent/auth/gate/status").set(auth);
    expect(status0.status).toBe(200);
    expect(status0.body.data.pinSet).toBe(false);

    const set = await request(app).post("/api/parent/auth/gate/set-pin").set(auth).send({ pin: "2468" });
    expect(set.status).toBe(200);

    const overwrite = await request(app).post("/api/parent/auth/gate/set-pin").set(auth).send({ pin: "1111" });
    expect(overwrite.status).toBe(409);
    expect(overwrite.body.code).toBe("PIN_ALREADY_SET");

    const wrong = await request(app).post("/api/parent/auth/gate/verify-pin").set(auth).send({ pin: "1111" });
    expect(wrong.status).toBe(401);
    expect(wrong.body.code).toBe("PIN_INVALID");
    expect(JSON.stringify(wrong.body)).not.toContain("2468");

    // The session must still be valid after a wrong PIN.
    const stillAuthed = await request(app).get("/api/parent/auth/gate/status").set(auth);
    expect(stillAuthed.status).toBe(200);
    expect(stillAuthed.body.data.pinSet).toBe(true);

    const right = await request(app).post("/api/parent/auth/gate/verify-pin").set(auth).send({ pin: "2468" });
    expect(right.status).toBe(200);
    expect(right.body.data).toMatchObject({ verified: true, unlockSeconds: 600 });
  });

  it("requires login for PIN endpoints", async () => {
    const res = await request(app).post("/api/parent/auth/gate/verify-pin").send({ pin: "2468" });
    expect(res.status).toBe(401);
  });
});
