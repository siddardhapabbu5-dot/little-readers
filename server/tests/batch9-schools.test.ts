import { beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { prisma } from "../src/lib/prisma.js";

const app = createApp();
const hasDb = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDb)("Batch 9 — schools / teachers / classrooms", () => {
  let adminToken = "";
  let parentToken = "";
  let childId = "";
  const stamp = Date.now();
  let schoolA = "";
  let schoolB = "";
  let teacherAToken = "";
  let teacherBToken = "";
  let teacherAId = "";
  let teacherBId = "";
  let classA = "";
  let classB = "";
  let lessonId = "";

  beforeAll(async () => {
    process.env.JWT_SECRET =
      process.env.JWT_SECRET ?? "dev_only_change_me_to_a_long_random_secret_value";

    const admin = await request(app).post("/api/auth/login").send({
      email: "admin@littlereaders.test",
      password: "AdminDemo1",
    });
    expect(admin.status).toBe(200);
    adminToken = admin.body.data.tokens.accessToken;

    const parent = await request(app).post("/api/auth/login").send({
      email: "parent@littlereaders.test",
      password: "ParentDemo1",
    });
    expect(parent.status).toBe(200);
    parentToken = parent.body.data.tokens.accessToken;
    const parentId = parent.body.data.user.id as string;

    const child = await prisma.child.findFirst({
      where: { parentId, isActive: true },
    });
    expect(child).toBeTruthy();
    childId = child!.id;

    const sA = await request(app)
      .post("/api/admin/schools")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ name: `School A ${stamp}`, code: `SA${stamp}` });
    expect(sA.status).toBe(201);
    schoolA = sA.body.data.id;

    const sB = await request(app)
      .post("/api/admin/schools")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ name: `School B ${stamp}`, code: `SB${stamp}` });
    expect(sB.status).toBe(201);
    schoolB = sB.body.data.id;

    const tA = await request(app)
      .post(`/api/admin/schools/${schoolA}/teachers`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        name: "Teacher A",
        email: `teachera${stamp}@test.local`,
        password: "TeacherDemo1",
      });
    expect(tA.status).toBe(201);
    teacherAId = tA.body.data.user.id;

    const tB = await request(app)
      .post(`/api/admin/schools/${schoolB}/teachers`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        name: "Teacher B",
        email: `teacherb${stamp}@test.local`,
        password: "TeacherDemo1",
      });
    expect(tB.status).toBe(201);
    teacherBId = tB.body.data.user.id;

    const loginA = await request(app).post("/api/auth/login").send({
      email: `teachera${stamp}@test.local`,
      password: "TeacherDemo1",
    });
    expect(loginA.status).toBe(200);
    teacherAToken = loginA.body.data.tokens.accessToken;

    const loginB = await request(app).post("/api/auth/login").send({
      email: `teacherb${stamp}@test.local`,
      password: "TeacherDemo1",
    });
    expect(loginB.status).toBe(200);
    teacherBToken = loginB.body.data.tokens.accessToken;

    const cA = await request(app)
      .post(`/api/admin/schools/${schoolA}/classrooms`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ name: `Class A ${stamp}`, gradeLabel: "Grade 1" });
    expect(cA.status).toBe(201);
    classA = cA.body.data.id;

    const cB = await request(app)
      .post(`/api/admin/schools/${schoolB}/classrooms`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ name: `Class B ${stamp}` });
    expect(cB.status).toBe(201);
    classB = cB.body.data.id;

    await request(app)
      .post(`/api/admin/schools/classrooms/${classA}/teachers`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ teacherUserId: teacherAId });
    await request(app)
      .post(`/api/admin/schools/classrooms/${classB}/teachers`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ teacherUserId: teacherBId });

    const lesson = await prisma.lesson.findFirst({
      where: { isPublished: true, isActive: true },
    });
    lessonId = lesson?.id ?? "";
  });

  it("isolates teachers across classrooms and blocks parent/admin APIs", async () => {
    const denyB = await request(app)
      .get(`/api/teacher/classrooms/${classA}/progress`)
      .set("Authorization", `Bearer ${teacherBToken}`);
    expect(denyB.status).toBe(403);

    const allowA = await request(app)
      .get(`/api/teacher/classrooms/${classA}/progress`)
      .set("Authorization", `Bearer ${teacherAToken}`);
    expect(allowA.status).toBe(200);

    const parentSchool = await request(app)
      .get("/api/admin/schools")
      .set("Authorization", `Bearer ${parentToken}`);
    expect(parentSchool.status).toBe(403);

    const teacherVocab = await request(app)
      .get("/api/admin/vocabulary/words?take=5")
      .set("Authorization", `Bearer ${teacherAToken}`);
    expect(teacherVocab.status).toBe(403);

    const teacherSeats = await request(app)
      .post("/api/subscriptions/seats/grant")
      .set("Authorization", `Bearer ${teacherAToken}`)
      .send({ parentUserId: "x", seats: 1, amountCents: 0, provider: "manual_admin" });
    expect(teacherSeats.status).toBe(403);
  });

  it("enrolls existing child once and supports lesson assign + progress", async () => {
    const enroll = await request(app)
      .post(`/api/admin/schools/classrooms/${classA}/students`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ childId });
    expect(enroll.status).toBe(201);

    const dup = await request(app)
      .post(`/api/admin/schools/classrooms/${classA}/students`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ childId });
    expect(dup.status).toBe(409);

    const badChild = await request(app)
      .post(`/api/admin/schools/classrooms/${classA}/students`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ childId: "does-not-exist" });
    expect([400, 404]).toContain(badChild.status);

    if (lessonId) {
      const assign = await request(app)
        .post(`/api/teacher/classrooms/${classA}/lessons`)
        .set("Authorization", `Bearer ${teacherAToken}`)
        .send({ lessonId });
      expect([200, 201]).toContain(assign.status);
    }

    const progress = await request(app)
      .get(`/api/teacher/classrooms/${classA}/progress`)
      .set("Authorization", `Bearer ${teacherAToken}`);
    expect(progress.status).toBe(200);
    expect(progress.body.data.students.some((s: { childId: string }) => s.childId === childId)).toBe(
      true
    );

    const crossSchool = await request(app)
      .post(`/api/admin/schools/classrooms/${classB}/teachers`)
      .set("Authorization", `Bearer ${teacherAToken}`)
      .send({ teacherUserId: teacherAId });
    expect(crossSchool.status).toBe(403);
  });

  it("deactivated teacher cannot use protected APIs", async () => {
    const deact = await request(app)
      .patch(`/api/admin/schools/teachers/${teacherAId}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ schoolId: schoolA, isActive: false });
    expect(deact.status).toBe(200);

    const blocked = await request(app)
      .get("/api/teacher/me")
      .set("Authorization", `Bearer ${teacherAToken}`);
    expect(blocked.status).toBe(401);

    const loginFail = await request(app).post("/api/auth/login").send({
      email: `teachera${stamp}@test.local`,
      password: "TeacherDemo1",
    });
    expect(loginFail.status).toBe(401);

    // restore for cleanliness
    await request(app)
      .patch(`/api/admin/schools/teachers/${teacherAId}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ schoolId: schoolA, isActive: true });
  });
});
