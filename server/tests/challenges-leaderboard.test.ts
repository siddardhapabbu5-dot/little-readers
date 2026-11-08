import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { prisma } from "../src/lib/prisma.js";
import { hashPassword } from "../src/lib/password.js";
import {
  addWeeks,
  dayKeyOf,
  finalizeWeek,
  weekStartOf,
  weeklyBadgeCode,
} from "../src/challenges/challenges.service.js";

const app = createApp();
const hasDb = Boolean(process.env.DATABASE_URL);
const TAG = `ZZCH_${Date.now()}`;
const PAST_WEEK = new Date(Date.UTC(2020, 0, 6)); // a Monday long ago, used for the weekly reset test

describe.skipIf(!hasDb)("Challenge World: points, leaderboards, friends, classroom", () => {
  let adminToken = "";
  let parentToken = "";
  let parentBToken = "";
  let teacherToken = "";
  let outsiderTeacherToken = "";
  let childId = "";
  let siblingId: string | null = null;
  let childBId = "";
  let parentBId = "";
  let categoryId = "";
  let wordIds: string[] = [];
  let classroomId = "";
  let challengeId = "";
  let schoolIds: string[] = [];
  let teacherIds: string[] = [];
  const sessionIds: string[] = [];
  let configBefore: Awaited<ReturnType<typeof prisma.competitionConfig.findUnique>> = null;
  let kidsBefore: Array<{
    id: string;
    leaderboardNickname: string | null;
    globalLeaderboardOptIn: boolean;
    globalConsentAt: Date | null;
    nicknameHidden: boolean;
  }> = [];

  const as = (token: string) => (r: request.Test) => r.set("Authorization", `Bearer ${token}`);
  const asParent = (r: request.Test) => as(parentToken)(r);
  const asParentB = (r: request.Test) => as(parentBToken)(r);
  const asAdmin = (r: request.Test) => as(adminToken)(r);

  async function playListen(count = 4) {
    const start = await asParent(request(app).post("/api/learning/sessions")).send({
      childId,
      categoryId,
      questionCount: 4,
      resume: false,
    });
    expect([200, 201]).toContain(start.status);
    const sessionId = start.body.data.sessionId as string;
    sessionIds.push(sessionId);
    for (const wordId of wordIds.slice(0, count)) {
      await asParent(request(app).post(`/api/learning/sessions/${sessionId}/attempts`)).send({
        wordId,
        round: "LISTEN",
        isCorrect: true,
      });
    }
    const done = await asParent(request(app).post(`/api/learning/sessions/${sessionId}/complete`)).send({
      durationSec: 20,
    });
    expect(done.status).toBe(200);
    return { sessionId, challenge: done.body.data.challenge };
  }

  beforeAll(async () => {
    process.env.JWT_SECRET = process.env.JWT_SECRET ?? "dev_only_change_me_to_a_long_random_secret_value";
    configBefore = await prisma.competitionConfig.findUnique({ where: { id: "default" } });

    const admin = await request(app)
      .post("/api/auth/login")
      .send({ email: "superadmin@littlereaders.test", password: "SuperDemo1" });
    adminToken = admin.body.data.tokens.accessToken;
    const parent = await request(app)
      .post("/api/auth/login")
      .send({ email: "parent@littlereaders.test", password: "ParentDemo1" });
    parentToken = parent.body.data.tokens.accessToken;
    const parentId = parent.body.data.user.id as string;

    const kids = await prisma.child.findMany({
      where: { parentId, isActive: true, hasLearningSeat: true },
      orderBy: { createdAt: "asc" },
    });
    expect(kids.length).toBeGreaterThan(0);
    childId = kids[0].id;
    siblingId = kids[1]?.id ?? null;
    kidsBefore = await prisma.child.findMany({
      where: { parentId },
      select: {
        id: true,
        leaderboardNickname: true,
        globalLeaderboardOptIn: true,
        globalConsentAt: true,
        nicknameHidden: true,
      },
    });

    // Second family (different parent) for global + friends tests.
    const pB = await prisma.user.create({
      data: {
        name: "Challenge Parent B",
        email: `${TAG.toLowerCase()}_b@example.com`,
        passwordHash: await hashPassword("ParentPass1"),
        role: "PARENT",
        isActive: true,
      },
    });
    parentBId = pB.id;
    const loginB = await request(app)
      .post("/api/auth/login")
      .send({ email: `${TAG.toLowerCase()}_b@example.com`, password: "ParentPass1" });
    expect(loginB.status).toBe(200);
    parentBToken = loginB.body.data.tokens.accessToken;
    const childB = await prisma.child.create({
      data: { parentId: parentBId, displayName: "Bella Test", birthYear: 2019 },
    });
    childBId = childB.id;

    const child = await prisma.child.findUniqueOrThrow({ where: { id: childId } });
    const group = await prisma.learningGroup.findFirstOrThrow({
      where: { levelId: child.levelId ?? undefined },
      orderBy: { sortOrder: "asc" },
    });
    const cat = await prisma.learningCategory.create({
      data: {
        groupId: group.id,
        code: TAG,
        label: `Test ${TAG}`,
        emoji: "🧪",
        sortOrder: 999,
        unlockOrder: 0,
        isPublished: true,
        words: {
          create: ["zzant", "zzbee", "zzelk", "zzyak"].map((text, i) => ({
            text,
            meaning: `test word ${i}`,
            emoji: "🐾",
            sortOrder: i,
          })),
        },
      },
      include: { words: true },
    });
    categoryId = cat.id;
    wordIds = cat.words.map((w) => w.id);

    // Classroom: teacher A owns it; teacher B is in another school.
    const pw = await hashPassword("TeacherDemo1");
    const [sA, sB] = await Promise.all([
      prisma.school.create({ data: { name: `School ${TAG}`, code: `${TAG}_A` } }),
      prisma.school.create({ data: { name: `Other ${TAG}`, code: `${TAG}_B` } }),
    ]);
    schoolIds = [sA.id, sB.id];
    const [tA, tB] = await Promise.all([
      prisma.user.create({
        data: { name: "Teacher A", email: `${TAG.toLowerCase()}_ta@example.com`, passwordHash: pw, role: "TEACHER", isActive: true },
      }),
      prisma.user.create({
        data: { name: "Teacher B", email: `${TAG.toLowerCase()}_tb@example.com`, passwordHash: pw, role: "TEACHER", isActive: true },
      }),
    ]);
    teacherIds = [tA.id, tB.id];
    await prisma.schoolStaff.createMany({
      data: [
        { schoolId: sA.id, userId: tA.id, staffRole: "TEACHER" },
        { schoolId: sB.id, userId: tB.id, staffRole: "TEACHER" },
      ],
    });
    const room = await prisma.classroom.create({ data: { schoolId: sA.id, name: `Class ${TAG}` } });
    classroomId = room.id;
    await prisma.classroomTeacher.create({ data: { classroomId, teacherUserId: tA.id } });
    await prisma.classroomEnrollment.create({ data: { classroomId, childId } });
    const lt = await request(app)
      .post("/api/auth/login")
      .send({ email: `${TAG.toLowerCase()}_ta@example.com`, password: "TeacherDemo1" });
    teacherToken = lt.body.data.tokens.accessToken;
    const lo = await request(app)
      .post("/api/auth/login")
      .send({ email: `${TAG.toLowerCase()}_tb@example.com`, password: "TeacherDemo1" });
    outsiderTeacherToken = lo.body.data.tokens.accessToken;
  });

  afterAll(async () => {
    await prisma.pointsTransaction.deleteMany({
      where: { OR: [{ sessionId: { in: sessionIds } }, { weekStart: PAST_WEEK }, { childId: childBId }] },
    });
    await prisma.weeklyRanking.deleteMany({ where: { weekStart: PAST_WEEK } });
    await prisma.achievement.deleteMany({
      where: {
        OR: [
          { code: { startsWith: `wk_${dayKeyOf(PAST_WEEK).replace(/-/g, "")}_` } },
          { code: { contains: TAG } },
          ...(challengeId ? [{ code: { startsWith: `class_${challengeId}_` } }] : []),
        ],
      },
    });
    await prisma.friendConnection.deleteMany({ where: { OR: [{ childId: childBId }, { friendChildId: childBId }] } });
    await prisma.leaderboardReport.deleteMany({ where: { reporterUserId: parentBId } });
    for (const k of kidsBefore) {
      const { id, ...rest } = k;
      await prisma.child.update({ where: { id }, data: rest });
    }
    await prisma.classroom.deleteMany({ where: { id: classroomId } });
    await prisma.school.deleteMany({ where: { id: { in: schoolIds } } });
    await prisma.user.deleteMany({ where: { id: { in: [...teacherIds, parentBId] } } });
    await prisma.learningCategory.deleteMany({ where: { id: categoryId } });
    if (configBefore) {
      const { id, updatedAt, ...rest } = configBefore;
      void updatedAt;
      await prisma.competitionConfig.update({ where: { id }, data: rest });
    }
  });

  it("keeps the global leaderboard OFF by default and needs a parent-approved nickname", async () => {
    const child = await prisma.child.findUniqueOrThrow({ where: { id: childBId } });
    expect(child.globalLeaderboardOptIn).toBe(false);

    const noNick = await asParentB(request(app).put(`/api/challenges/children/${childBId}/settings`)).send({
      globalOptIn: true,
    });
    expect(noNick.status).toBe(409);

    const realName = await asParentB(request(app).put(`/api/challenges/children/${childBId}/settings`)).send({
      nickname: "Bella Star",
    });
    expect(realName.status).toBe(400);

    const phone = await asParentB(request(app).put(`/api/challenges/children/${childBId}/settings`)).send({
      nickname: "Kid 9876543",
    });
    expect(phone.status).toBe(400);

    const ok = await asParentB(request(app).put(`/api/challenges/children/${childBId}/settings`)).send({
      nickname: `Brave Panda ${TAG.slice(-3)}`,
      globalOptIn: true,
    });
    expect(ok.status).toBe(200);
    expect(ok.body.data.globalOptIn).toBe(true);
    expect(ok.body.data.globalConsentAt).toBeTruthy();

    // Another parent, a teacher or an admin cannot change this child's consent.
    const other = await asParent(request(app).put(`/api/challenges/children/${childBId}/settings`)).send({
      globalOptIn: false,
    });
    expect(other.status).toBe(404);
    const teacher = await as(teacherToken)(request(app).put(`/api/challenges/children/${childBId}/settings`)).send({
      globalOptIn: false,
    });
    expect(teacher.status).toBe(403);
    const admin = await asAdmin(request(app).put(`/api/challenges/children/${childBId}/settings`)).send({
      globalOptIn: false,
    });
    expect(admin.status).toBe(403);

    const board = await asParent(request(app).get(`/api/challenges/global?childId=${childId}`));
    expect(board.status).toBe(200);
    expect(board.body.data.optedIn).toBe(false);
    expect(board.body.data.me).toBeNull();
  });

  it("awards points for verified completion only, once per session, with a daily repeat limit", async () => {
    const before = await prisma.pointsTransaction.count({ where: { childId, categoryId } });
    expect(before).toBe(0);

    const tooFew = await playListen(1);
    expect(tooFew.challenge.awarded).toHaveLength(0);

    const first = await playListen(4);
    expect(first.challenge.awarded).toEqual([{ source: "LISTEN", label: "Listen", points: 5 }]);

    // Completing the same session again never pays twice.
    const again = await asParent(request(app).post(`/api/learning/sessions/${first.sessionId}/complete`)).send({});
    expect(again.status).toBe(200);
    expect(await prisma.pointsTransaction.count({ where: { sessionId: first.sessionId } })).toBe(1);

    await playListen(4);
    await playListen(4);
    const fourth = await playListen(4);
    expect(fourth.challenge.awarded).toHaveLength(0);
    expect(fourth.challenge.limited.map((l: { source: string }) => l.source)).toEqual(["LISTEN"]);
    expect(await prisma.pointsTransaction.count({ where: { childId, categoryId } })).toBe(3);

    const overview = await asParent(request(app).get(`/api/challenges/overview?childId=${childId}`));
    expect(overview.status).toBe(200);
    expect(overview.body.data.weekPoints).toBeGreaterThanOrEqual(15);
    expect(overview.body.data.goals.length).toBeGreaterThan(0);
    expect(overview.body.data.endsInMs).toBeGreaterThan(0);
  });

  it("ranks opted-in children on the server without exposing names or ids", async () => {
    await asParent(request(app).put(`/api/challenges/children/${childId}/settings`)).send({
      nickname: `Swift Owl ${TAG.slice(-3)}`,
      globalOptIn: true,
    });
    const mine = await prisma.pointsTransaction.aggregate({
      where: { childId, weekStart: weekStartOf() },
      _sum: { points: true },
    });
    const now = new Date();
    await prisma.pointsTransaction.create({
      data: {
        childId: childBId,
        source: "DAILY_CHALLENGE",
        points: (mine._sum.points ?? 0) + 20,
        weekStart: weekStartOf(now),
        dayKey: dayKeyOf(now),
      },
    });

    const board = await asParent(request(app).get(`/api/challenges/global?childId=${childId}`));
    expect(board.status).toBe(200);
    const d = board.body.data;
    expect(d.optedIn).toBe(true);
    const names = d.top.map((e: { nickname: string }) => e.nickname);
    const iB = names.indexOf(`Brave Panda ${TAG.slice(-3)}`);
    const iMe = names.indexOf(`Swift Owl ${TAG.slice(-3)}`);
    expect(iB).toBeGreaterThanOrEqual(0);
    if (iMe >= 0) expect(iB).toBeLessThan(iMe);
    expect(d.me.rank).toBeGreaterThan(d.top[iB].rank);
    const raw = JSON.stringify(d);
    expect(raw).not.toContain(childBId);
    expect(raw).not.toContain("Bella");
    expect(raw).not.toContain(childId);

    // Parent can switch it off at any time.
    const off = await asParent(request(app).put(`/api/challenges/children/${childId}/settings`)).send({
      globalOptIn: false,
    });
    expect(off.body.data.globalOptIn).toBe(false);
    const after = await asParentB(request(app).get(`/api/challenges/global?childId=${childBId}`));
    expect(after.body.data.top.map((e: { nickname: string }) => e.nickname)).not.toContain(
      `Swift Owl ${TAG.slice(-3)}`
    );
  });

  it("needs both parents to connect friends and shows a private friend leaderboard", async () => {
    const invite = await asParent(request(app).post("/api/challenges/friends/invite")).send({ childId });
    expect(invite.status).toBe(201);
    const code = invite.body.data.code as string;

    const joinOwn = await asParent(request(app).post("/api/challenges/friends/join")).send({ childId, code });
    expect(joinOwn.status).toBe(400);

    const join = await asParentB(request(app).post("/api/challenges/friends/join")).send({ childId: childBId, code });
    expect(join.status).toBe(200);
    expect(join.body.data.status).toBe("PENDING");

    // Not friends yet.
    const before = await asParent(request(app).get(`/api/challenges/friends/leaderboard?childId=${childId}`));
    expect(before.body.data.entries).toHaveLength(1);

    const selfApprove = await asParentB(request(app).post(`/api/challenges/friends/${invite.body.data.id}/respond`)).send({
      approve: true,
    });
    expect(selfApprove.status).toBe(404);

    const list = await asParent(request(app).get(`/api/challenges/friends?childId=${childId}`));
    expect(list.body.data.waitingForYou).toHaveLength(1);
    const approve = await asParent(request(app).post(`/api/challenges/friends/${invite.body.data.id}/respond`)).send({
      approve: true,
    });
    expect(approve.body.data.status).toBe("ACCEPTED");

    const board = await asParent(request(app).get(`/api/challenges/friends/leaderboard?childId=${childId}`));
    expect(board.body.data.entries).toHaveLength(2);
    expect(board.body.data.entries[0].nickname).toBe(`Brave Panda ${TAG.slice(-3)}`);
    expect(JSON.stringify(board.body.data)).not.toContain("Bella");

    // Either parent can remove the connection.
    const removed = await asParentB(request(app).delete(`/api/challenges/friends/${invite.body.data.id}`));
    expect(removed.body.data.status).toBe("REMOVED");
    const gone = await asParent(request(app).get(`/api/challenges/friends?childId=${childId}`));
    expect(gone.body.data.friends).toHaveLength(0);
  });

  it("lets a teacher run a classroom challenge for enrolled children only", async () => {
    const notEnrolled = await as(teacherToken)(request(app).post(`/api/challenges/teacher/classrooms/${classroomId}`)).send({
      title: "Spelling Stars",
      goalPoints: 50,
      childIds: [childId, childBId],
    });
    expect(notEnrolled.status).toBe(400);

    const created = await as(teacherToken)(request(app).post(`/api/challenges/teacher/classrooms/${classroomId}`)).send({
      title: "Spelling Stars",
      goalPoints: 50,
      childIds: [childId],
    });
    expect(created.status).toBe(200);
    challengeId = created.body.data.id;

    const outsider = await as(outsiderTeacherToken)(request(app).get(`/api/challenges/teacher/classrooms/${classroomId}`));
    expect(outsider.status).toBe(403);
    const parentTry = await asParent(request(app).get(`/api/challenges/teacher/classrooms/${classroomId}`));
    expect(parentTry.status).toBe(403);

    const view = await as(teacherToken)(request(app).get(`/api/challenges/teacher/classrooms/${classroomId}`));
    expect(view.status).toBe(200);
    expect(view.body.data.current.board[0].childId).toBe(childId);
    expect(view.body.data.current.board[0].points).toBeGreaterThan(0);

    const award = await as(teacherToken)(
      request(app).post(`/api/challenges/teacher/classrooms/${classroomId}/${created.body.data.id}/badges`)
    ).send({ childId, badge: "super_speller" });
    expect(award.status).toBe(200);
    expect(award.body.data.awarded).toBe(true);

    // Works even though this child is not opted in to the global board.
    const parentView = await asParent(request(app).get(`/api/challenges/classroom?childId=${childId}`));
    expect(parentView.body.data.current).toHaveLength(1);
    expect(parentView.body.data.current[0].board[0].name).toBe("You");
    expect(parentView.body.data.badges[0].title).toBe("Super Speller");

    const outsideChild = await asParentB(request(app).get(`/api/challenges/classroom?childId=${childBId}`));
    expect(outsideChild.body.data.current).toHaveLength(0);
  });

  it("closes a week: snapshots ranks, awards medals and keeps history", async () => {
    await prisma.pointsTransaction.createMany({
      data: [
        { childId: childBId, source: "QUIZ_TIME", points: 40, weekStart: PAST_WEEK, dayKey: "2020-01-06" },
        { childId, source: "QUIZ_TIME", points: 10, weekStart: PAST_WEEK, dayKey: "2020-01-07" },
      ],
    });
    const res = await finalizeWeek(PAST_WEEK);
    expect(res.ranked).toBe(1); // only the opted-in child is ranked
    const again = await finalizeWeek(PAST_WEEK);
    expect(again.ranked).toBe(1);
    expect(await prisma.weeklyRanking.count({ where: { weekStart: PAST_WEEK } })).toBe(1);
    const gold = await prisma.achievement.findUnique({
      where: { childId_code: { childId: childBId, code: weeklyBadgeCode(PAST_WEEK, "gold") } },
    });
    expect(gold?.title).toBe("Gold Champion");

    const history = await asParentB(request(app).get(`/api/challenges/history?childId=${childBId}`));
    const week = history.body.data.weeks.find((w: { weekStart: string }) => w.weekStart === PAST_WEEK.toISOString());
    expect(week.points).toBe(40);
    expect(week.globalRank).toBe(1);
    expect(week.badges.map((b: { title: string }) => b.title)).toContain("Gold Champion");

    // Current week is separate from the closed week; lifetime points include both.
    const ov = await asParentB(request(app).get(`/api/challenges/overview?childId=${childBId}`));
    expect(ov.body.data.lifetimePoints).toBeGreaterThan(ov.body.data.weekPoints);
    expect(addWeeks(PAST_WEEK, 1).getTime() - PAST_WEEK.getTime()).toBe(7 * 86400000);
  });

  it("keeps two children of one parent separate", async () => {
    if (!siblingId) return;
    const sib = await asParent(request(app).get(`/api/challenges/overview?childId=${siblingId}`));
    expect(sib.status).toBe(200);
    expect(await prisma.pointsTransaction.count({ where: { childId: siblingId, categoryId } })).toBe(0);
    const sibLedger = await prisma.pointsTransaction.aggregate({
      where: { childId: siblingId, weekStart: weekStartOf() },
      _sum: { points: true },
    });
    expect(sib.body.data.weekPoints).toBe(sibLedger._sum.points ?? 0);
    const sibFriends = await asParent(request(app).get(`/api/challenges/friends?childId=${siblingId}`));
    expect(sibFriends.body.data.friends).toHaveLength(0);
    const sibClass = await asParent(request(app).get(`/api/challenges/classroom?childId=${siblingId}`));
    expect(sibClass.body.data.current).toHaveLength(0);
  });

  it("gives Admin the switches, point values and nickname moderation", async () => {
    const parentTry = await asParent(request(app).put("/api/challenges/admin/config")).send({ globalEnabled: false });
    expect(parentTry.status).toBe(403);

    const set = await asAdmin(request(app).put("/api/challenges/admin/config")).send({
      globalEnabled: false,
      points: { LISTEN: 7 },
    });
    expect(set.status).toBe(200);
    expect(set.body.data.points.LISTEN).toBe(7);
    const shared = await asParent(request(app).get("/api/challenges/config"));
    expect(shared.body.data.features.global).toBe(false);
    const board = await asParent(request(app).get(`/api/challenges/global?childId=${childId}`));
    expect(board.body.data.enabled).toBe(false);
    await asAdmin(request(app).put("/api/challenges/admin/config")).send({
      globalEnabled: true,
      points: { LISTEN: 5 },
    });

    const report = await asParentB(request(app).get(`/api/challenges/global?childId=${childBId}`));
    const key = report.body.data.top[0].key;
    const rep = await asParentB(request(app).post("/api/challenges/report")).send({ key, reason: "test" });
    expect(rep.status).toBe(200);
    const reported = await asAdmin(request(app).get("/api/challenges/admin/nicknames?reported=1"));
    expect(reported.body.data.length).toBeGreaterThan(0);

    const hide = await asAdmin(request(app).put(`/api/challenges/admin/nicknames/${childBId}`)).send({ hidden: true });
    expect(hide.status).toBe(200);
    const hidden = await asParent(request(app).get(`/api/challenges/global?childId=${childId}`));
    expect(hidden.body.data.top.map((e: { nickname: string }) => e.nickname)).not.toContain(
      `Brave Panda ${TAG.slice(-3)}`
    );

    const stats = await asAdmin(request(app).get("/api/challenges/admin/stats"));
    expect(stats.status).toBe(200);
    expect(stats.body.data.thisWeek.players).toBeGreaterThan(0);
    const badges = await asAdmin(request(app).get("/api/challenges/admin/badges"));
    expect(badges.body.data.catalog.find((b: { key: string }) => b.key === "gold").awarded).toBeGreaterThan(0);
  });

  it("leaves existing login, children, progress and certificates working", async () => {
    const kids = await asParent(request(app).get("/api/children"));
    expect(kids.status).toBe(200);
    const progress = await asParent(request(app).get(`/api/learning/progress/${childId}`));
    expect(progress.status).toBe(200);
    const certs = await asParent(request(app).get(`/api/learning/progress/${childId}/certificates`));
    expect(certs.status).toBe(200);
  });
});
