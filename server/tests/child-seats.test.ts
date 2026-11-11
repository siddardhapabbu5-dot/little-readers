import { beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { prisma } from "../src/lib/prisma.js";

const app = createApp();
const hasDb = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDb)("Child learning seats (base 2 + add-ons)", () => {
  let parentToken = "";
  let parentId = "";
  let categoryId = "";

  beforeAll(async () => {
    process.env.JWT_SECRET =
      process.env.JWT_SECRET ?? "dev_only_change_me_to_a_long_random_secret_value";

    const login = await request(app).post("/api/auth/login").send({
      email: "parent@littlereaders.test",
      password: "ParentDemo1",
    });
    expect(login.status).toBe(200);
    parentToken = login.body.data.tokens.accessToken;

    const me = await request(app)
      .get("/api/auth/me")
      .set("Authorization", `Bearer ${parentToken}`);
    parentId = me.body.data.id as string;

    const expiresAt = new Date();
    expiresAt.setFullYear(expiresAt.getFullYear() + 1);

    // Normalize all prior subscriptions so capacity is exactly base 2 for this suite.
    await prisma.subscription.updateMany({
      where: { userId: parentId },
      data: {
        status: "EXPIRED",
        cancelledAt: new Date(),
        extraSeats: 0,
        includedSeats: 2,
      },
    });
    await prisma.subscription.create({
      data: {
        userId: parentId,
        plan: "MONTHLY",
        status: "ACTIVE",
        startedAt: new Date(),
        expiresAt,
        provider: "test",
        providerRef: `seat_test_sub_${Date.now()}`,
        includedSeats: 2,
        extraSeats: 0,
      },
    });

    // Reset children for deterministic seat tests
    await prisma.child.updateMany({
      where: { parentId },
      data: { isActive: false, hasLearningSeat: false },
    });

    const cat = await prisma.learningCategory.findFirst({
      where: { isPublished: true, group: { level: { code: "LEVEL_1" } } },
    });
    expect(cat).toBeTruthy();
    categoryId = cat!.id;

    const existingWords = await prisma.vocabularyWord.count({
      where: { categoryId, isActive: true },
    });
    if (existingWords < 5) {
      const stamp = `seatfix_${Date.now()}`;
      for (let i = 0; i < 8; i++) {
        await prisma.vocabularyWord.create({
          data: {
            categoryId,
            text: `${stamp}_w${i}`,
            meaning: `seat fixture ${i}`,
            emoji: "⭐",
            firstLetter: "S",
            sortOrder: i + 1,
            isActive: true,
          },
        });
      }
    }
  });

  it("auto-seats first two children and blocks third from learning", async () => {
    const mk = async (name: string) => {
      const res = await request(app)
        .post("/api/children")
        .set("Authorization", `Bearer ${parentToken}`)
        .send({ displayName: name, birthDate: "15/03/2021", level: "LEVEL_1" });
      expect(res.status).toBe(201);
      return res.body.data as { id: string; hasLearningSeat: boolean };
    };

    const a = await mk(`SeatA_${Date.now()}`);
    const b = await mk(`SeatB_${Date.now()}`);
    const c = await mk(`SeatC_${Date.now()}`);

    expect(a.hasLearningSeat).toBe(true);
    expect(b.hasLearningSeat).toBe(true);
    expect(c.hasLearningSeat).toBe(false);

    const me = await request(app)
      .get("/api/subscriptions/me")
      .set("Authorization", `Bearer ${parentToken}`);
    expect(me.status).toBe(200);
    expect(me.body.data.seats.capacity).toBe(2);
    expect(me.body.data.seats.assigned).toBe(2);
    expect(me.body.data.seats.available).toBe(0);

    const blocked = await request(app)
      .post("/api/learning/sessions")
      .set("Authorization", `Bearer ${parentToken}`)
      .send({ childId: c.id, categoryId, questionCount: 5 });
    expect(blocked.status).toBe(402);
    expect(blocked.body.details?.code).toBe("SEAT_REQUIRED");

    const allowed = await request(app)
      .post("/api/learning/sessions")
      .set("Authorization", `Bearer ${parentToken}`)
      .send({ childId: a.id, categoryId, questionCount: 5 });
    expect([200, 201]).toContain(allowed.status);
  });

  it("admin grant + assign unlocks third child", async () => {
    const adminLogin = await request(app).post("/api/auth/login").send({
      email: "admin@littlereaders.test",
      password: "AdminDemo1",
    });
    expect(adminLogin.status).toBe(200);
    const adminToken = adminLogin.body.data.tokens.accessToken as string;

    const kids = await request(app)
      .get("/api/children")
      .set("Authorization", `Bearer ${parentToken}`);
    const unseated = (kids.body.data as { id: string; hasLearningSeat: boolean }[]).find(
      (k) => !k.hasLearningSeat
    );
    expect(unseated).toBeTruthy();

    const grant = await request(app)
      .post("/api/subscriptions/seats/grant")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ parentUserId: parentId, seats: 1, amountCents: 0 });
    expect(grant.status).toBe(200);
    expect(grant.body.data.subscription.extraSeats).toBeGreaterThanOrEqual(1);

    const assign = await request(app)
      .post("/api/subscriptions/seats/assign")
      .set("Authorization", `Bearer ${parentToken}`)
      .send({ childId: unseated!.id });
    expect(assign.status).toBe(200);

    const session = await request(app)
      .post("/api/learning/sessions")
      .set("Authorization", `Bearer ${parentToken}`)
      .send({ childId: unseated!.id, categoryId, questionCount: 5 });
    expect([200, 201]).toContain(session.status);
  });
});
