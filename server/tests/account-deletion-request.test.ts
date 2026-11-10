import { afterAll, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { prisma } from "../src/lib/prisma.js";

const app = createApp();
const hasDb = Boolean(process.env.DATABASE_URL);
const stamp = Date.now();
const created: string[] = [];

function submit(body: Record<string, unknown>) {
  return request(app).post("/api/privacy/deletion-requests").send(body);
}

describe.skipIf(!hasDb)("Public account deletion requests (siwiapp.shop/delete-account)", () => {
  afterAll(async () => {
    if (created.length) await prisma.privacyDataRequest.deleteMany({ where: { id: { in: created } } });
    await prisma.user.deleteMany({ where: { email: { startsWith: `delreq_${stamp}` } } });
  });

  it("records a request without login and links it to the matching account by mobile", async () => {
    const mobile = `+9198${String(stamp).slice(-8)}`;
    const user = await prisma.user.create({
      data: {
        email: `delreq_${stamp}@test.local`,
        name: "Del Req",
        passwordHash: "x",
        role: "PARENT",
        mobileE164: mobile,
      },
    });

    const res = await submit({ mobile: mobile.slice(3), countryCode: "+91", reason: "No longer needed" });
    expect(res.status).toBe(201);
    expect(res.body.data.reference).toMatch(/^preq_/);
    created.push(res.body.data.reference);

    const row = await prisma.privacyDataRequest.findUnique({ where: { id: res.body.data.reference } });
    expect(row).toMatchObject({ userId: user.id, requestType: "ACCOUNT_DELETION", status: "SUBMITTED" });
    expect(row?.message).toContain(`Registered mobile: ${mobile}`);
    expect(row?.message).toContain("Matched an account by mobile number.");

    // Nothing was deleted.
    expect(await prisma.user.findUnique({ where: { id: user.id } })).not.toBeNull();

    // A second submission while the first is open does not create a duplicate.
    const again = await submit({ mobile, email: user.email });
    expect(again.status).toBe(201);
    expect(again.body.data.reference).toBe(res.body.data.reference);
    expect(await prisma.privacyDataRequest.count({ where: { userId: user.id } })).toBe(1);
  });

  it("gives the same response for unknown numbers, so it cannot be used to discover accounts", async () => {
    const res = await submit({ mobile: "+919000000001", email: `delreq_${stamp}_none@test.local` });
    expect(res.status).toBe(201);
    created.push(res.body.data.reference);
    expect(Object.keys(res.body.data).sort()).toEqual(["createdAt", "message", "reference"]);
    const row = await prisma.privacyDataRequest.findUnique({ where: { id: res.body.data.reference } });
    expect(row?.userId).toBeNull();
    expect(row?.message).toContain("No account matched");
  });

  it("rejects an invalid mobile number or email", async () => {
    expect((await submit({ mobile: "12" })).status).toBe(400);
    expect((await submit({ mobile: "9876543210", email: "not-an-email" })).status).toBe(400);
    expect((await submit({})).status).toBe(400);
  });
});
