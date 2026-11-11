import { beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { prisma } from "../src/lib/prisma.js";

const app = createApp();
const hasDb = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDb)("Device lock + subscription enforcement", () => {
  let parentToken = "";
  let childId = "";
  const installA = `lr_android_install_aaaaaaaaaaaaaaaaaaaa`;
  const installB = `lr_android_install_bbbbbbbbbbbbbbbbbbbb`;

  beforeAll(async () => {
    process.env.JWT_SECRET =
      process.env.JWT_SECRET ?? "dev_only_change_me_to_a_long_random_secret_value";

    const login = await request(app).post("/api/auth/login").send({
      email: "parent@littlereaders.test",
      password: "ParentDemo1",
    });
    expect(login.status).toBe(200);
    parentToken = login.body.data.tokens.accessToken;

    // Ensure active subscription exists
    const me = await request(app)
      .get("/api/auth/me")
      .set("Authorization", `Bearer ${parentToken}`);
    const userId = me.body.data.id as string;
    const existing = await prisma.subscription.findFirst({ where: { userId } });
    const expiresAt = new Date();
    expiresAt.setFullYear(expiresAt.getFullYear() + 1);
    if (!existing) {
      await prisma.subscription.create({
        data: {
          userId,
          plan: "MONTHLY",
          status: "ACTIVE",
          startedAt: new Date(),
          expiresAt,
          provider: "test",
          providerRef: `test_sub_${Date.now()}`,
        },
      });
    } else {
      await prisma.subscription.update({
        where: { id: existing.id },
        data: { status: "ACTIVE", expiresAt, cancelledAt: null },
      });
    }

    const kids = await request(app)
      .get("/api/children")
      .set("Authorization", `Bearer ${parentToken}`);
    const grade1 = (
      kids.body.data as { id: string; hasLearningSeat: boolean; learnWiseGrade?: { levelCode: string } }[]
    ).find((k) => k.hasLearningSeat && k.learnWiseGrade?.levelCode === "LEVEL_1");
    if (grade1) {
      childId = grade1.id;
    } else {
      const created = await request(app)
        .post("/api/children")
        .set("Authorization", `Bearer ${parentToken}`)
        .send({ displayName: `Grade1_${Date.now()}`, birthDate: "15/03/2020", level: "LEVEL_1" });
      expect(created.status).toBe(201);
      childId = created.body.data.id;
    }

    // Clear any prior device for deterministic tests
    await prisma.studentDevice.deleteMany({ where: { childId } });
  });

  it("registers first phone and allows same phone again", async () => {
    const first = await request(app)
      .post("/api/devices/register")
      .set("Authorization", `Bearer ${parentToken}`)
      .send({
        childId,
        installationId: installA,
        platform: "android",
        deviceLabel: "Phone A",
      });
    expect(first.status).toBe(200);
    expect(first.body.data.allowed).toBe(true);

    const again = await request(app)
      .post("/api/devices/register")
      .set("Authorization", `Bearer ${parentToken}`)
      .send({
        childId,
        installationId: installA,
        platform: "android",
      });
    expect(again.status).toBe(200);
    expect(again.body.data.allowed).toBe(true);
  });

  it("blocks a second phone until authorized transfer", async () => {
    const blocked = await request(app)
      .post("/api/devices/register")
      .set("Authorization", `Bearer ${parentToken}`)
      .send({
        childId,
        installationId: installB,
        platform: "android",
        deviceLabel: "Phone B",
      });
    expect(blocked.status).toBe(403);
    expect(String(blocked.body.error)).toMatch(/already registered on another device/i);

    const transfer = await request(app)
      .post("/api/devices/transfer")
      .set("Authorization", `Bearer ${parentToken}`)
      .send({
        childId,
        reason: "Replaced phone",
        newInstallationId: installB,
        platform: "android",
      });
    expect(transfer.status).toBe(200);
    expect(transfer.body.data.registeredNew).toBe(true);

    const oldBlocked = await request(app)
      .post("/api/devices/register")
      .set("Authorization", `Bearer ${parentToken}`)
      .send({
        childId,
        installationId: installA,
        platform: "android",
      });
    expect(oldBlocked.status).toBe(403);
  });

  it("enforces subscription and device on mobile learning sessions", async () => {
    const cats = await request(app)
      .get(`/api/learning/levels/1/groups?childId=${childId}`)
      .set("Authorization", `Bearer ${parentToken}`);
    const categoryId = cats.body.data.groups[0].categories[0].id;

    const noDeviceHeader = await request(app)
      .post("/api/learning/sessions")
      .set("Authorization", `Bearer ${parentToken}`)
      .set("X-Client-Platform", "android")
      .send({ childId, categoryId, questionCount: 5 });
    expect(noDeviceHeader.status).toBe(400);

    const ok = await request(app)
      .post("/api/learning/sessions")
      .set("Authorization", `Bearer ${parentToken}`)
      .set("X-Client-Platform", "android")
      .set("X-Installation-Id", installB)
      .send({ childId, categoryId, questionCount: 5 });
    expect(ok.status).toBe(201);

    // Expire subscription and ensure block
    await prisma.subscription.updateMany({
      where: { userId: (await prisma.child.findUniqueOrThrow({ where: { id: childId } })).parentId },
      data: { status: "EXPIRED" },
    });
    const expired = await request(app)
      .post("/api/learning/sessions")
      .set("Authorization", `Bearer ${parentToken}`)
      .set("X-Client-Platform", "android")
      .set("X-Installation-Id", installB)
      .send({ childId, categoryId, questionCount: 5 });
    expect(expired.status).toBe(402);

    // Restore for other suites
    const expiresAt = new Date();
    expiresAt.setFullYear(expiresAt.getFullYear() + 1);
    await prisma.subscription.updateMany({
      where: { userId: (await prisma.child.findUniqueOrThrow({ where: { id: childId } })).parentId },
      data: { status: "ACTIVE", expiresAt },
    });
  });

  it("does not release device registration on repeated login", async () => {
    const login = await request(app).post("/api/auth/login").send({
      email: "parent@littlereaders.test",
      password: "ParentDemo1",
    });
    expect(login.status).toBe(200);
    const device = await prisma.studentDevice.findUnique({ where: { childId } });
    expect(device?.isActive).toBe(true);
    expect(device?.installationId).toBe(installB);
  });
});
