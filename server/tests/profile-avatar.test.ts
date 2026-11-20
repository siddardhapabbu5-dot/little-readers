import { describe, expect, it, beforeAll } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";

const app = createApp();
const hasDb = Boolean(process.env.DATABASE_URL);
const TINY_JPEG =
  "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==";

describe.skipIf(!hasDb)("Profile photo", () => {
  const tokens: Record<string, string> = {};

  beforeAll(async () => {
    process.env.JWT_SECRET =
      process.env.JWT_SECRET ?? "dev_only_change_me_to_a_long_random_secret_value";
    for (const [key, email, password] of [
      ["parent", "parent@littlereaders.test", "ParentDemo1"],
      ["admin", "superadmin@littlereaders.test", "SuperDemo1"],
    ]) {
      const res = await request(app).post("/api/auth/login").send({ email, password });
      expect(res.status).toBe(200);
      tokens[key] = res.body.data.tokens.accessToken;
    }
  });

  it.each(["parent", "admin"])("%s can set, read and remove a photo", async (who) => {
    const auth = `Bearer ${tokens[who]}`;
    const saved = await request(app)
      .put("/api/auth/me/avatar")
      .set("Authorization", auth)
      .send({ image: TINY_JPEG });
    expect(saved.status).toBe(200);

    const read = await request(app).get("/api/auth/me/avatar").set("Authorization", auth);
    expect(read.body.data.avatarUrl).toBe(TINY_JPEG);

    const removed = await request(app)
      .put("/api/auth/me/avatar")
      .set("Authorization", auth)
      .send({ image: null });
    expect(removed.status).toBe(200);
    const after = await request(app).get("/api/auth/me/avatar").set("Authorization", auth);
    expect(after.body.data.avatarUrl).toBeNull();
  });

  it("rejects non-images and requires login", async () => {
    const bad = await request(app)
      .put("/api/auth/me/avatar")
      .set("Authorization", `Bearer ${tokens.parent}`)
      .send({ image: "https://example.com/x.jpg" });
    expect(bad.status).toBe(400);

    const anon = await request(app).put("/api/auth/me/avatar").send({ image: TINY_JPEG });
    expect(anon.status).toBe(401);
  });

  /**
   * Root-cause lock: student JWTs are not User tokens. /auth/me/avatar must 401.
   * Mobile must not call this for STUDENT — the client treats 401 as session death.
   */
  it("rejects student JWT on /auth/me/avatar (User-only)", async () => {
    const { prisma } = await import("../src/lib/prisma.js");
    const { hashPassword } = await import("../src/lib/password.js");
    const parent = await prisma.user.findFirst({
      where: { email: "parent@littlereaders.test" },
      select: { id: true },
    });
    expect(parent).toBeTruthy();
    const level = await prisma.learningLevel.findFirst({
      where: { code: "LEVEL_1" },
      select: { id: true },
    });
    const sid = `AVT${Date.now().toString(36).toUpperCase()}`.slice(0, 12);
    const child = await prisma.child.create({
      data: {
        parentId: parent!.id,
        displayName: "AvatarProbe",
        birthYear: 2018,
        levelId: level?.id ?? undefined,
        hasLearningSeat: false,
        studentCredential: {
          create: {
            studentLoginId: sid,
            passwordHash: await hashPassword("TempAvatar1!"),
            mustChangePassword: false,
            accountCreationMethod: "TEST_AVATAR_PROBE",
          },
        },
      },
      select: { id: true },
    });
    const login = await request(app).post("/api/student/auth/login").send({
      studentLoginId: sid,
      password: "TempAvatar1!",
      installationId: "avatar-probe-install01",
      platform: "android",
      deviceName: "test",
    });
    expect(login.status).toBe(200);
    const studentToken = login.body.data.tokens.accessToken as string;

    const getAvatar = await request(app)
      .get("/api/auth/me/avatar")
      .set("Authorization", `Bearer ${studentToken}`);
    expect(getAvatar.status).toBe(401);

    const putAvatar = await request(app)
      .put("/api/auth/me/avatar")
      .set("Authorization", `Bearer ${studentToken}`)
      .send({ image: TINY_JPEG });
    expect(putAvatar.status).toBe(401);

    // Student me still works — session is valid; only User avatar route rejects.
    const me = await request(app)
      .get("/api/student/auth/me")
      .set("Authorization", `Bearer ${studentToken}`);
    expect(me.status).toBe(200);

    await prisma.child.delete({ where: { id: child.id } }).catch(() => undefined);
  });
});
