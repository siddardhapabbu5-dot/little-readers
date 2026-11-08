import { Router, type NextFunction, type Response } from "express";
import { z } from "zod";
import { CLASSROOM_BADGES, POINT_SOURCES } from "@little-readers/shared";
import { requireAuth, requireRoles, type AuthenticatedRequest } from "../middleware/auth.js";
import { validateBody } from "../middleware/validate.js";
import * as svc from "./challenges.service.js";

export const challengesRouter = Router();
challengesRouter.use(requireAuth);

const familyRoles = requireRoles("PARENT", "ADMIN", "SUPER_ADMIN");
const teacherRoles = requireRoles("TEACHER", "SCHOOL_ADMIN", "ADMIN", "SUPER_ADMIN");
const adminRoles = requireRoles("ADMIN", "SUPER_ADMIN");

type Handler = (req: AuthenticatedRequest) => Promise<unknown>;
const send =
  (fn: Handler, status = 200) =>
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      res.status(status).json({ data: await fn(req) });
    } catch (error) {
      next(error);
    }
  };

const actor = (req: AuthenticatedRequest) => ({ id: req.user!.id, role: req.user!.role });
const childOf = (req: AuthenticatedRequest) => String(req.query.childId ?? req.params.childId ?? "");

const settingsSchema = z.object({
  nickname: z.string().max(40).nullable().optional(),
  globalOptIn: z.boolean().optional(),
});
const joinSchema = z.object({ childId: z.string().min(1), code: z.string().min(6).max(12) });
const inviteSchema = z.object({ childId: z.string().min(1) });
const respondSchema = z.object({ approve: z.boolean() });
const reportSchema = z.object({ key: z.string().min(8).max(64), reason: z.string().max(200).optional() });
const classroomChallengeSchema = z.object({
  title: z.string().trim().min(3).max(60),
  goalPoints: z.coerce.number().int().min(10).max(5000),
  childIds: z.array(z.string().min(1)).min(1).max(200),
});
const awardSchema = z.object({
  childId: z.string().min(1),
  badge: z.enum(CLASSROOM_BADGES.map((b) => b.key) as [string, ...string[]]),
});
const pointsShape = Object.fromEntries(
  POINT_SOURCES.map((s) => [s, z.coerce.number().int().min(0).max(100).optional()])
) as Record<(typeof POINT_SOURCES)[number], z.ZodOptional<z.ZodNumber>>;
const configSchema = z.object({
  globalEnabled: z.boolean().optional(),
  friendsEnabled: z.boolean().optional(),
  classroomEnabled: z.boolean().optional(),
  points: z.object(pointsShape).partial().optional(),
  goals: z
    .object({
      points: z.coerce.number().int().min(10).max(5000),
      activeDays: z.coerce.number().int().min(1).max(7),
      dailyChallenges: z.coerce.number().int().min(0).max(7),
      activities: z.coerce.number().int().min(1).max(POINT_SOURCES.length),
      repeatLimitPerDay: z.coerce.number().int().min(1).max(20),
    })
    .partial()
    .optional(),
});
const moderateSchema = z.object({ hidden: z.boolean().optional(), clear: z.boolean().optional() });

/* -------- shared settings (every signed-in screen reads the same switches) -------- */
challengesRouter.get(
  "/config",
  send(async () => {
    const c = await svc.getCompetitionConfig();
    return {
      features: { global: c.globalEnabled, friends: c.friendsEnabled, classroom: c.classroomEnabled },
      points: c.points,
      goals: c.goals,
    };
  })
);

/* -------- child / parent -------- */
challengesRouter.get("/overview", familyRoles, send((req) => svc.getChallengeOverview(actor(req), childOf(req))));
challengesRouter.get("/global", familyRoles, send((req) => svc.getGlobalLeaderboard(actor(req), childOf(req))));
challengesRouter.get("/winners", familyRoles, send(() => svc.getPreviousWinners()));
challengesRouter.get("/history", familyRoles, send((req) => svc.getChallengeHistory(actor(req), childOf(req))));
challengesRouter.get("/classroom", familyRoles, send((req) => svc.getChildClassroomChallenges(actor(req), childOf(req))));
challengesRouter.get("/friends", familyRoles, send((req) => svc.listFriends(actor(req), childOf(req))));
challengesRouter.get(
  "/friends/leaderboard",
  familyRoles,
  send((req) => svc.getFriendLeaderboard(actor(req), childOf(req)))
);
challengesRouter.post(
  "/friends/invite",
  familyRoles,
  validateBody(inviteSchema),
  send((req) => svc.createFriendInvite(actor(req), req.body.childId), 201)
);
challengesRouter.post(
  "/friends/join",
  familyRoles,
  validateBody(joinSchema),
  send((req) => svc.joinFriendInvite(actor(req), req.body.childId, req.body.code))
);
challengesRouter.post(
  "/friends/:id/respond",
  familyRoles,
  validateBody(respondSchema),
  send((req) => svc.respondFriendRequest(actor(req), String(req.params.id), req.body.approve))
);
challengesRouter.delete(
  "/friends/:id",
  familyRoles,
  send((req) => svc.removeFriendConnection(actor(req), String(req.params.id)))
);
challengesRouter.get(
  "/children/:childId/settings",
  familyRoles,
  send((req) => svc.getChildChallengeSettings(actor(req), String(req.params.childId)))
);
challengesRouter.put(
  "/children/:childId/settings",
  familyRoles,
  validateBody(settingsSchema),
  send((req) => svc.updateChildChallengeSettings(actor(req), String(req.params.childId), req.body))
);
challengesRouter.post(
  "/report",
  familyRoles,
  validateBody(reportSchema),
  send((req) => svc.reportNickname(actor(req), req.body.key, req.body.reason))
);

/* -------- teacher (own classrooms only) -------- */
challengesRouter.get(
  "/teacher/classrooms/:classroomId",
  teacherRoles,
  send((req) => svc.listClassroomChallenges(actor(req), String(req.params.classroomId)))
);
challengesRouter.post(
  "/teacher/classrooms/:classroomId",
  teacherRoles,
  validateBody(classroomChallengeSchema),
  send((req) => svc.saveClassroomChallenge(actor(req), String(req.params.classroomId), req.body))
);
challengesRouter.post(
  "/teacher/classrooms/:classroomId/:challengeId/badges",
  teacherRoles,
  validateBody(awardSchema),
  send((req) =>
    svc.awardClassroomBadge(actor(req), String(req.params.classroomId), String(req.params.challengeId), req.body)
  )
);

/* -------- admin -------- */
challengesRouter.get("/admin/config", adminRoles, send(() => svc.getCompetitionConfig()));
challengesRouter.put(
  "/admin/config",
  adminRoles,
  validateBody(configSchema),
  send((req) => svc.updateCompetitionConfig(req.user!.id, req.body))
);
challengesRouter.get("/admin/stats", adminRoles, send(() => svc.getAdminChallengeStats()));
challengesRouter.get(
  "/admin/nicknames",
  adminRoles,
  send((req) => svc.listAdminNicknames({ reportedOnly: req.query.reported === "1" }))
);
challengesRouter.put(
  "/admin/nicknames/:childId",
  adminRoles,
  validateBody(moderateSchema),
  send((req) => svc.moderateNickname(String(req.params.childId), req.body))
);
challengesRouter.post(
  "/admin/reports/:id/dismiss",
  adminRoles,
  send((req) => svc.dismissReport(String(req.params.id)))
);
challengesRouter.get("/admin/badges", adminRoles, send(() => svc.listAdminBadges()));
challengesRouter.delete(
  "/admin/badges/:id",
  adminRoles,
  send((req) => svc.revokeChallengeBadge(String(req.params.id)))
);
