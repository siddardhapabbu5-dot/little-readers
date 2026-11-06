import { beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { randomBytes } from "node:crypto";
import { createApp } from "../src/app.js";
import { prisma } from "../src/lib/prisma.js";
import { hashPassword } from "../src/lib/password.js";

const app = createApp();
const hasDb = Boolean(process.env.DATABASE_URL);

function deviceId(prefix: string) {
  return `${prefix}_${randomBytes(20).toString("hex")}`;
}

describe.skipIf(!hasDb)("Parent OTP + single active device (Phase 9)", () => {
  const unique = Date.now();
  const mobileLocal = `98${String(unique).slice(-8)}`;
  const mobileE164 = `+91${mobileLocal}`;
  const email = `otp_parent_${unique}@example.com`;
  const password = "SecurePass1";
  let parentId = "";
  let adminToken = "";

  beforeAll(async () => {
    process.env.JWT_SECRET =
      process.env.JWT_SECRET ?? "test_secret_at_least_thirty_two_chars_long";
    process.env.OTP_DEV_MODE = "1";
    process.env.SMS_PROVIDER = "console";

    const passwordHash = await hashPassword(password);
    const parent = await prisma.user.create({
      data: {
        name: "OTP Test Parent",
        email,
        passwordHash,
        role: "PARENT",
        isActive: true,
        mobileE164,
      },
    });
    parentId = parent.id;

    const adminLogin = await request(app).post("/api/auth/login").send({
      email: "admin@littlereaders.test",
      password: "AdminDemo1",
    });
    if (adminLogin.status === 200) {
      adminToken = adminLogin.body.data.tokens.accessToken;
    } else {
      const adminHash = await hashPassword("AdminDemo1");
      await prisma.user.upsert({
        where: { email: "admin@littlereaders.test" },
        update: {
          passwordHash: adminHash,
          role: "ADMIN",
          isActive: true,
        },
        create: {
          name: "Demo Admin",
          email: "admin@littlereaders.test",
          passwordHash: adminHash,
          role: "ADMIN",
          isActive: true,
        },
      });
      const retry = await request(app).post("/api/auth/login").send({
        email: "admin@littlereaders.test",
        password: "AdminDemo1",
      });
      expect(retry.status).toBe(200);
      adminToken = retry.body.data.tokens.accessToken;
    }
  });

  async function sendAndGetOtp() {
    // Clear prior sends so hourly limit / cooldown from earlier suites do not 429.
    await prisma.parentOtpVerification.deleteMany({ where: { mobileE164 } });
    const send = await request(app)
      .post("/api/parent/auth/send-otp")
      .send({ mobile: mobileLocal, countryCode: "+91" });
    expect(send.status).toBe(200);
    const otp = send.body.data?.devOtp as string | undefined;
    expect(otp).toMatch(/^\d{6}$/);
    return otp;
  }

  it("1) send-otp succeeds for registered parent mobile", async () => {
    const otp = await sendAndGetOtp();
    expect(otp).toHaveLength(6);
  });

  it("2) wrong OTP is rejected", async () => {
    await sendAndGetOtp();
    const res = await request(app)
      .post("/api/parent/auth/verify-otp")
      .send({
        mobile: mobileLocal,
        otp: "000000",
        deviceId: deviceId("d1"),
        platform: "ios",
      });
    expect(res.status).toBe(401);
    expect(res.body.code ?? res.body.details?.code).toBe("OTP_INVALID");
  });

  it("3) expired OTP is rejected", async () => {
    await sendAndGetOtp();
    await prisma.parentOtpVerification.updateMany({
      where: { mobileE164, consumedAt: null },
      data: { expiresAt: new Date(Date.now() - 60_000) },
    });
    const res = await request(app)
      .post("/api/parent/auth/verify-otp")
      .send({
        mobile: mobileLocal,
        otp: "123456",
        deviceId: deviceId("d2"),
        platform: "android",
      });
    expect(res.status).toBe(400);
    expect(res.body.code ?? res.body.details?.code).toBe("OTP_EXPIRED");
  });

  it("4) verify-otp issues tokens + ACTIVE session", async () => {
    const otp = await sendAndGetOtp();
    const d = deviceId("ok");
    const res = await request(app)
      .post("/api/parent/auth/verify-otp")
      .send({
        mobile: mobileLocal,
        otp,
        deviceId: d,
        platform: "ios",
        deviceName: "iPhone Test",
      });
    expect(res.status).toBe(200);
    expect(res.body.data.tokens.accessToken).toBeTruthy();
    expect(res.body.data.tokens.refreshToken).toBeTruthy();
    expect(res.body.data.session.id).toBeTruthy();

    const active = await prisma.parentDeviceSession.count({
      where: { parentId, status: "ACTIVE" },
    });
    expect(active).toBe(1);
  });

  it("5) OTP cannot be reused after verify", async () => {
    const otp = await sendAndGetOtp();
    const first = await request(app)
      .post("/api/parent/auth/verify-otp")
      .send({
        mobile: mobileLocal,
        otp,
        deviceId: deviceId("reuse1"),
        platform: "web",
      });
    expect(first.status).toBe(200);

    const second = await request(app)
      .post("/api/parent/auth/verify-otp")
      .send({
        mobile: mobileLocal,
        otp,
        deviceId: deviceId("reuse2"),
        platform: "web",
      });
    expect(second.status).toBeGreaterThanOrEqual(400);
  });

  it("6) second device verify revokes previous ACTIVE session", async () => {
    const otp1 = await sendAndGetOtp();
    const d1 = deviceId("devA");
    const first = await request(app)
      .post("/api/parent/auth/verify-otp")
      .send({
        mobile: mobileLocal,
        otp: otp1,
        deviceId: d1,
        platform: "ios",
      });
    expect(first.status).toBe(200);
    const token1 = first.body.data.tokens.accessToken as string;

    const otp2 = await sendAndGetOtp();
    const d2 = deviceId("devB");
    const second = await request(app)
      .post("/api/parent/auth/verify-otp")
      .send({
        mobile: mobileLocal,
        otp: otp2,
        deviceId: d2,
        platform: "android",
      });
    expect(second.status).toBe(200);

    const meOld = await request(app)
      .get("/api/auth/me")
      .set("Authorization", `Bearer ${token1}`);
    expect(meOld.status).toBe(401);
    expect(meOld.body.code ?? meOld.body.details?.code).toBe("SESSION_REVOKED");

    const meNew = await request(app)
      .get("/api/auth/me")
      .set("Authorization", `Bearer ${second.body.data.tokens.accessToken}`);
    expect(meNew.status).toBe(200);

    const active = await prisma.parentDeviceSession.count({
      where: { parentId, status: "ACTIVE" },
    });
    expect(active).toBe(1);
  });

  it("7) concurrent verify-otp leaves exactly one ACTIVE session", async () => {
    const otp = await sendAndGetOtp();
    const results = await Promise.all([
      request(app)
        .post("/api/parent/auth/verify-otp")
        .send({
          mobile: mobileLocal,
          otp,
          deviceId: deviceId("race1"),
          platform: "ios",
        }),
      request(app)
        .post("/api/parent/auth/verify-otp")
        .send({
          mobile: mobileLocal,
          otp,
          deviceId: deviceId("race2"),
          platform: "android",
        }),
    ]);
    const successes = results.filter((r) => r.status === 200);
    expect(successes.length).toBe(1);
    const active = await prisma.parentDeviceSession.count({
      where: { parentId, status: "ACTIVE" },
    });
    expect(active).toBe(1);
  });

  it("8) Admin email/password login unchanged", async () => {
    const res = await request(app).post("/api/auth/login").send({
      email: "admin@littlereaders.test",
      password: "AdminDemo1",
    });
    expect(res.status).toBe(200);
    expect(res.body.data.user.role).toMatch(/ADMIN/);
    const me = await request(app)
      .get("/api/auth/me")
      .set("Authorization", `Bearer ${res.body.data.tokens.accessToken}`);
    expect(me.status).toBe(200);
  });

  it("9) refresh rotates; revoked refresh fails", async () => {
    const otp = await sendAndGetOtp();
    const d = deviceId("refresh");
    const verified = await request(app)
      .post("/api/parent/auth/verify-otp")
      .send({
        mobile: mobileLocal,
        otp,
        deviceId: d,
        platform: "ios",
      });
    expect(verified.status).toBe(200);
    const refresh = verified.body.data.tokens.refreshToken as string;

    const rotated = await request(app)
      .post("/api/parent/auth/refresh")
      .send({ refreshToken: refresh, deviceId: d });
    expect(rotated.status).toBe(200);
    expect(rotated.body.data.tokens.refreshToken).toBeTruthy();
    expect(rotated.body.data.tokens.refreshToken).not.toBe(refresh);

    const reuse = await request(app)
      .post("/api/parent/auth/refresh")
      .send({ refreshToken: refresh, deviceId: d });
    expect(reuse.status).toBe(401);
  });

  it("10) Admin can list and revoke parent sessions", async () => {
    expect(adminToken).toBeTruthy();
    const list = await request(app)
      .get(`/api/admin/parents/${parentId}/device-sessions`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(list.status).toBe(200);
    expect(Array.isArray(list.body.data.sessions)).toBe(true);

    const active = list.body.data.sessions.find(
      (s: { status: string }) => s.status === "ACTIVE"
    );
    if (active) {
      const revoke = await request(app)
        .post(
          `/api/admin/parents/${parentId}/device-sessions/${active.id}/revoke`
        )
        .set("Authorization", `Bearer ${adminToken}`)
        .send({});
      expect(revoke.status).toBe(200);
    }

    const reset = await request(app)
      .post(`/api/admin/parents/${parentId}/device-sessions/reset`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({});
    expect(reset.status).toBe(200);
  });

  it("11) Admin can set parent mobile", async () => {
    const nextLocal = `97${String(unique).slice(-8)}`;
    const res = await request(app)
      .patch(`/api/admin/parents/${parentId}/mobile`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ mobile: nextLocal, countryCode: "+91" });
    expect(res.status).toBe(200);
    expect(res.body.data.mobileE164).toBe(`+91${nextLocal}`);
    // restore for any later local runs
    await prisma.user.update({
      where: { id: parentId },
      data: { mobileE164 },
    });
  });

  it("12) child learning ownership unchanged after device swap", async () => {
    const child = await prisma.child.create({
      data: {
        parentId,
        displayName: `OTP Child ${unique}`,
        birthYear: new Date().getFullYear() - 6,
        isActive: true,
      },
    });

    const otp = await sendAndGetOtp();
    const login = await request(app)
      .post("/api/parent/auth/verify-otp")
      .send({
        mobile: mobileLocal,
        otp,
        deviceId: deviceId("progress"),
        platform: "ios",
      });
    expect(login.status).toBe(200);

    const kids = await request(app)
      .get("/api/children")
      .set("Authorization", `Bearer ${login.body.data.tokens.accessToken}`);
    expect(kids.status).toBe(200);
    const ids = (kids.body.data as Array<{ id: string }>).map((c) => c.id);
    expect(ids).toContain(child.id);

    await prisma.child.update({
      where: { id: child.id },
      data: { isActive: false },
    });
  });
});
