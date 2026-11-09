import { createHmac, randomInt } from "node:crypto";
import type { Prisma, UserRole } from "@prisma/client";
import {
  CLASSROOM_BADGES,
  DEFAULT_CHALLENGE_POINTS,
  DEFAULT_WEEKLY_GOALS,
  POINT_SOURCES,
  POINT_SOURCE_LABELS,
  WEEKLY_BADGES,
  type PointSource,
  type WeeklyGoals,
} from "@little-readers/shared";
import { env } from "../config/env.js";
import { AppError } from "../lib/errors.js";
import { prisma } from "../lib/prisma.js";
import { assertClassroomAccess } from "../schools/school.access.js";

export type Actor = { id: string; role: UserRole };

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_MS = 7 * DAY_MS;

/* ------------------------------ weeks (UTC) ------------------------------ */

/** Monday 00:00 UTC of the week containing `d`. */
export function weekStartOf(d = new Date()) {
  const day = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  day.setUTCDate(day.getUTCDate() - ((day.getUTCDay() + 6) % 7));
  return day;
}

export function addWeeks(d: Date, n: number) {
  return new Date(d.getTime() + n * WEEK_MS);
}

export function dayKeyOf(d = new Date()) {
  return d.toISOString().slice(0, 10);
}

function weekCode(weekStart: Date) {
  return dayKeyOf(weekStart).replace(/-/g, "");
}

function weekLabel(weekStart: Date) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(weekStart);
}

export function weeklyBadgeCode(weekStart: Date, key: string) {
  return `wk_${weekCode(weekStart)}_${key}`;
}

/* ------------------------------ config ------------------------------ */

function parseJson(raw: string | null | undefined): Record<string, unknown> {
  if (!raw) return {};
  try {
    const v = JSON.parse(raw);
    return v && typeof v === "object" ? (v as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function clampInt(v: unknown, min: number, max: number, fallback: number) {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

export async function getCompetitionConfig() {
  const row = await prisma.competitionConfig.findUnique({ where: { id: "default" } });
  const rawPoints = parseJson(row?.pointsJson);
  const rawGoals = parseJson(row?.goalsJson);
  const points = {} as Record<PointSource, number>;
  for (const s of POINT_SOURCES) {
    points[s] = clampInt(rawPoints[s], 0, 100, DEFAULT_CHALLENGE_POINTS[s]);
  }
  const goals: WeeklyGoals = {
    points: clampInt(rawGoals.points, 10, 5000, DEFAULT_WEEKLY_GOALS.points),
    activeDays: clampInt(rawGoals.activeDays, 1, 7, DEFAULT_WEEKLY_GOALS.activeDays),
    dailyChallenges: clampInt(rawGoals.dailyChallenges, 0, 7, DEFAULT_WEEKLY_GOALS.dailyChallenges),
    activities: clampInt(rawGoals.activities, 1, POINT_SOURCES.length, DEFAULT_WEEKLY_GOALS.activities),
    repeatLimitPerDay: clampInt(
      rawGoals.repeatLimitPerDay,
      1,
      20,
      DEFAULT_WEEKLY_GOALS.repeatLimitPerDay
    ),
  };
  return {
    globalEnabled: row?.globalEnabled ?? true,
    friendsEnabled: row?.friendsEnabled ?? true,
    classroomEnabled: row?.classroomEnabled ?? true,
    points,
    goals,
    lastFinalizedWeek: row?.lastFinalizedWeek ?? null,
    updatedAt: row?.updatedAt ?? null,
  };
}

export type CompetitionConfigView = Awaited<ReturnType<typeof getCompetitionConfig>>;

export async function updateCompetitionConfig(
  actorId: string,
  input: {
    globalEnabled?: boolean;
    friendsEnabled?: boolean;
    classroomEnabled?: boolean;
    points?: Partial<Record<PointSource, number>>;
    goals?: Partial<WeeklyGoals>;
  }
) {
  const current = await getCompetitionConfig();
  const points = { ...current.points, ...(input.points ?? {}) };
  const goals = { ...current.goals, ...(input.goals ?? {}) };
  await prisma.competitionConfig.upsert({
    where: { id: "default" },
    create: {
      id: "default",
      globalEnabled: input.globalEnabled ?? current.globalEnabled,
      friendsEnabled: input.friendsEnabled ?? current.friendsEnabled,
      classroomEnabled: input.classroomEnabled ?? current.classroomEnabled,
      pointsJson: JSON.stringify(points),
      goalsJson: JSON.stringify(goals),
      updatedById: actorId,
    },
    update: {
      ...(input.globalEnabled !== undefined ? { globalEnabled: input.globalEnabled } : {}),
      ...(input.friendsEnabled !== undefined ? { friendsEnabled: input.friendsEnabled } : {}),
      ...(input.classroomEnabled !== undefined ? { classroomEnabled: input.classroomEnabled } : {}),
      pointsJson: JSON.stringify(points),
      goalsJson: JSON.stringify(goals),
      updatedById: actorId,
    },
  });
  return getCompetitionConfig();
}

/* ------------------------------ access ------------------------------ */

const isAdmin = (role: UserRole) => role === "ADMIN" || role === "SUPER_ADMIN";

/** Reads: the child's parent (or a platform admin). */
async function childForRead(actor: Actor, childId: string) {
  const child = await prisma.child.findFirst({
    where: isAdmin(actor.role) ? { id: childId } : { id: childId, parentId: actor.id, isActive: true },
    select: {
      id: true,
      parentId: true,
      displayName: true,
      leaderboardNickname: true,
      nicknameHidden: true,
      globalLeaderboardOptIn: true,
      globalConsentAt: true,
    },
  });
  if (!child) throw new AppError("Child not found", 404);
  return child;
}

/** Writes (consent, nickname, friends): only the child's own parent. */
async function childForParentWrite(actor: Actor, childId: string) {
  if (actor.role !== "PARENT") throw new AppError("Only the parent can change this", 403);
  return childForRead(actor, childId);
}

/* ------------------------------ points ledger ------------------------------ */

type SessionForPoints = {
  id: string;
  childId: string;
  categoryId: string;
  mode: string | null;
  status: string;
  questionsTotal: number;
  attempts: { round: string; isCorrect: boolean }[];
};

/** Which point sources a finished session earns, before limits. */
export function pointSourcesForSession(s: SessionForPoints): { source: PointSource; scope: string | null }[] {
  const total = Math.max(s.questionsTotal, s.attempts.length);
  // Verified completion: at least 3 correct answers (or every question in a shorter session).
  const needed = Math.max(1, Math.min(3, total));
  const correct = (rounds: string[] | null) =>
    s.attempts.filter((a) => a.isCorrect && (!rounds || rounds.includes(a.round))).length;

  switch (s.mode) {
    case "DAILY_CHALLENGE":
    case "REVISION_WORLD":
    case "MIXED":
      return correct(null) >= needed ? [{ source: s.mode, scope: null }] : [];
    case "SURPRISE":
      return correct(null) >= needed ? [{ source: "SURPRISE", scope: s.categoryId }] : [];
    case "MATCHING":
      return correct(null) >= needed ? [{ source: "MATCH_IT", scope: s.categoryId }] : [];
    case "QUIZ":
      return correct(null) >= needed ? [{ source: "QUIZ_TIME", scope: s.categoryId }] : [];
    case "REVISION":
      return correct(null) >= needed ? [{ source: "REVISION_WORLD", scope: s.categoryId }] : [];
    default: {
      const out: { source: PointSource; scope: string | null }[] = [];
      if (correct(["LISTEN"]) >= needed) out.push({ source: "LISTEN", scope: s.categoryId });
      if (correct(["SPELL", "LETTER"]) >= needed) out.push({ source: "SPELL", scope: s.categoryId });
      return out;
    }
  }
}

/**
 * Award weekly challenge points for a COMPLETED session. Idempotent per (session, source);
 * the same activity + topic only earns points `repeatLimitPerDay` times per UTC day
 * (Daily Challenge: once per day).
 */
export async function awardSessionPoints(sessionId: string, now = new Date()) {
  const session = await prisma.learningSession.findUnique({
    where: { id: sessionId },
    select: {
      id: true,
      childId: true,
      categoryId: true,
      mode: true,
      status: true,
      questionsTotal: true,
      attempts: { select: { round: true, isCorrect: true } },
    },
  });
  if (!session || session.status !== "COMPLETED") return { awarded: [], limited: [], totalAwarded: 0 };

  const cfg = await getCompetitionConfig();
  const weekStart = weekStartOf(now);
  const dayKey = dayKeyOf(now);
  const awarded: { source: PointSource; label: string; points: number }[] = [];
  const limited: { source: PointSource; label: string }[] = [];

  for (const { source, scope } of pointSourcesForSession(session)) {
    const points = cfg.points[source];
    if (points <= 0) continue;
    const limit = source === "DAILY_CHALLENGE" ? 1 : cfg.goals.repeatLimitPerDay;
    const already = await prisma.pointsTransaction.count({
      where: { childId: session.childId, source, dayKey, categoryId: scope },
    });
    if (already >= limit) {
      limited.push({ source, label: POINT_SOURCE_LABELS[source] });
      continue;
    }
    try {
      await prisma.pointsTransaction.create({
        data: {
          childId: session.childId,
          sessionId: session.id,
          source,
          categoryId: scope,
          points,
          weekStart,
          dayKey,
          createdAt: now,
        },
      });
      awarded.push({ source, label: POINT_SOURCE_LABELS[source], points });
    } catch (err) {
      if ((err as { code?: string }).code !== "P2002") throw err;
    }
  }

  const newBadges = awarded.length ? await evaluateWeeklyBadges(session.childId, weekStart, cfg) : [];
  return {
    awarded,
    limited,
    totalAwarded: awarded.reduce((n, a) => n + a.points, 0),
    newBadges,
  };
}

/* ------------------------------ weekly stats + badges ------------------------------ */

async function weekStats(childId: string, weekStart: Date, cfg: CompetitionConfigView) {
  const rows = await prisma.pointsTransaction.findMany({
    where: { childId, weekStart },
    select: { source: true, points: true, dayKey: true },
  });
  const points = rows.reduce((n, r) => n + r.points, 0);
  const days = new Set(rows.map((r) => r.dayKey)).size;
  const dailyChallenges = new Set(
    rows.filter((r) => r.source === "DAILY_CHALLENGE").map((r) => r.dayKey)
  ).size;
  const activities = new Set(rows.map((r) => r.source)).size;
  const bySource = POINT_SOURCES.map((s) => ({
    source: s,
    label: POINT_SOURCE_LABELS[s],
    points: rows.filter((r) => r.source === s).reduce((n, r) => n + r.points, 0),
    times: rows.filter((r) => r.source === s).length,
  }));
  const g = cfg.goals;
  const goals = [
    { key: "points", label: `Earn ${g.points} points`, current: points, target: g.points },
    { key: "activeDays", label: `Learn on ${g.activeDays} different days`, current: days, target: g.activeDays },
    {
      key: "dailyChallenges",
      label: `Finish ${g.dailyChallenges} Daily Challenges`,
      current: dailyChallenges,
      target: g.dailyChallenges,
    },
    {
      key: "activities",
      label: `Play ${g.activities} different activities`,
      current: activities,
      target: g.activities,
    },
  ]
    .filter((x) => x.target > 0)
    .map((x) => ({ ...x, done: x.current >= x.target, pct: Math.min(100, Math.round((x.current / x.target) * 100)) }));
  return { points, days, dailyChallenges, activities, bySource, goals };
}

async function upsertBadge(childId: string, code: string, title: string, description: string) {
  const existing = await prisma.achievement.findUnique({
    where: { childId_code: { childId, code } },
    select: { id: true },
  });
  if (existing) return null;
  try {
    return await prisma.achievement.create({ data: { childId, code, title, description } });
  } catch (err) {
    if ((err as { code?: string }).code === "P2002") return null;
    throw err;
  }
}

const badgeDef = (key: string) => WEEKLY_BADGES.find((b) => b.key === key)!;

/** Weekly Star / Learning Champion / Perfect Week are awarded as soon as they are reached. */
export async function evaluateWeeklyBadges(childId: string, weekStart: Date, cfg?: CompetitionConfigView) {
  const config = cfg ?? (await getCompetitionConfig());
  const stats = await weekStats(childId, weekStart, config);
  const label = `Week of ${weekLabel(weekStart)}`;
  const earned: string[] = [];
  const give = async (key: string) => {
    const def = badgeDef(key);
    const row = await upsertBadge(childId, weeklyBadgeCode(weekStart, key), def.title, `${def.description} · ${label}`);
    if (row) earned.push(def.title);
  };
  const goal = (k: string) => stats.goals.find((x) => x.key === k);
  if (goal("points")?.done) await give("star");
  if (goal("activeDays")?.done) await give("champion");
  if (stats.goals.length && stats.goals.every((x) => x.done)) await give("perfect");
  return earned;
}

/* ------------------------------ ranking ------------------------------ */

type Ranked = { childId: string; points: number; lastAt: Date; rank: number };

const globalChildFilter: Prisma.ChildWhereInput = {
  isActive: true,
  globalLeaderboardOptIn: true,
  nicknameHidden: false,
  leaderboardNickname: { not: null },
};

/** Server-side ranking. Ties: more points, then who reached the score first, then id. */
export async function rankWeek(
  weekStart: Date,
  filter: { childIds?: string[]; global?: boolean }
): Promise<Ranked[]> {
  const where: Prisma.PointsTransactionWhereInput = { weekStart };
  if (filter.childIds) where.childId = { in: filter.childIds };
  if (filter.global) where.child = globalChildFilter;
  else where.child = { isActive: true };
  const groups = await prisma.pointsTransaction.groupBy({
    by: ["childId"],
    where,
    _sum: { points: true },
    _max: { createdAt: true },
  });
  return groups
    .map((g) => ({
      childId: g.childId,
      points: g._sum.points ?? 0,
      lastAt: g._max.createdAt ?? new Date(0),
    }))
    .filter((g) => g.points > 0)
    .sort(
      (a, b) =>
        b.points - a.points ||
        a.lastAt.getTime() - b.lastAt.getTime() ||
        a.childId.localeCompare(b.childId)
    )
    .map((g, i) => ({ ...g, rank: i + 1 }));
}

/** Opaque per-entry key so a parent can report a nickname without seeing any child id. */
function reportKey(childId: string) {
  return createHmac("sha256", env.JWT_SECRET).update(`lb:${childId}`).digest("hex").slice(0, 24);
}

async function weeklyBadgeEmojis(childIds: string[], weekStart: Date) {
  if (!childIds.length) return new Map<string, string>();
  const prefix = `wk_${weekCode(weekStart)}_`;
  const rows = await prisma.achievement.findMany({
    where: { childId: { in: childIds }, code: { startsWith: prefix } },
    select: { childId: true, code: true },
  });
  const order = ["gold", "silver", "bronze", "perfect", "star", "champion"];
  const best = new Map<string, string>();
  for (const id of childIds) {
    const keys = rows.filter((r) => r.childId === id).map((r) => r.code.slice(prefix.length));
    const key = order.find((k) => keys.includes(k));
    if (key) best.set(id, badgeDef(key).emoji);
  }
  return best;
}

/* ------------------------------ weekly reset / history ------------------------------ */

/** Close one week: snapshot global ranks and give Gold/Silver/Bronze. Safe to repeat. */
export async function finalizeWeek(weekStart: Date) {
  const cfg = await getCompetitionConfig();
  if (!cfg.globalEnabled) return { weekStart, ranked: 0 };
  const ranked = await rankWeek(weekStart, { global: true });
  if (!ranked.length) return { weekStart, ranked: 0 };
  const kids = await prisma.child.findMany({
    where: { id: { in: ranked.map((r) => r.childId) } },
    select: { id: true, leaderboardNickname: true },
  });
  const nick = new Map(kids.map((k) => [k.id, k.leaderboardNickname ?? "Learner"]));
  await prisma.weeklyRanking.createMany({
    data: ranked.map((r) => ({
      weekStart,
      childId: r.childId,
      nickname: nick.get(r.childId) ?? "Learner",
      points: r.points,
      rank: r.rank,
    })),
    skipDuplicates: true,
  });
  const medals = ["gold", "silver", "bronze"];
  for (const r of ranked.slice(0, 3)) {
    const def = badgeDef(medals[r.rank - 1]);
    await upsertBadge(
      r.childId,
      weeklyBadgeCode(weekStart, def.key),
      def.title,
      `${def.description} · Week of ${weekLabel(weekStart)}`
    );
  }
  return { weekStart, ranked: ranked.length };
}

/** Lazily finalize every closed week since the last run (weekly reset, history preserved). */
export async function ensureWeeksFinalized(now = new Date()) {
  const previous = addWeeks(weekStartOf(now), -1);
  const row = await prisma.competitionConfig.findUnique({
    where: { id: "default" },
    select: { lastFinalizedWeek: true },
  });
  const last = row?.lastFinalizedWeek ?? null;
  if (last && last.getTime() >= previous.getTime()) return;
  let ws = last ? addWeeks(last, 1) : previous;
  const oldest = addWeeks(previous, -12);
  if (ws < oldest) ws = oldest;
  while (ws.getTime() <= previous.getTime()) {
    await finalizeWeek(ws);
    ws = addWeeks(ws, 1);
  }
  await prisma.competitionConfig.upsert({
    where: { id: "default" },
    create: { id: "default", lastFinalizedWeek: previous },
    update: { lastFinalizedWeek: previous },
  });
}

/* ------------------------------ child overview ------------------------------ */

export async function getChallengeOverview(actor: Actor, childId: string, now = new Date()) {
  const child = await childForRead(actor, childId);
  await ensureWeeksFinalized(now);
  const cfg = await getCompetitionConfig();
  const weekStart = weekStartOf(now);
  const endsAt = addWeeks(weekStart, 1);
  const [stats, lifetime, weekBadges, lifetimeBadges, friendsCount, classroomCount] = await Promise.all([
    weekStats(childId, weekStart, cfg),
    prisma.pointsTransaction.aggregate({ where: { childId }, _sum: { points: true } }),
    prisma.achievement.findMany({
      where: { childId, code: { startsWith: `wk_${weekCode(weekStart)}_` } },
      select: { code: true, title: true, earnedAt: true },
    }),
    prisma.achievement.count({
      where: { childId, OR: [{ code: { startsWith: "wk_" } }, { code: { startsWith: "class_" } }] },
    }),
    prisma.friendConnection.count({
      where: { status: "ACCEPTED", OR: [{ childId }, { friendChildId: childId }] },
    }),
    prisma.classroomChallenge.count({ where: { weekStart, childIds: { has: childId } } }),
  ]);

  let globalRank: { rank: number; players: number } | null = null;
  const optedIn = child.globalLeaderboardOptIn && Boolean(child.leaderboardNickname) && !child.nicknameHidden;
  if (cfg.globalEnabled && optedIn) {
    const ranked = await rankWeek(weekStart, { global: true });
    const me = ranked.find((r) => r.childId === childId);
    if (me) globalRank = { rank: me.rank, players: ranked.length };
  }

  return {
    weekStart,
    endsAt,
    endsInMs: Math.max(0, endsAt.getTime() - now.getTime()),
    weekPoints: stats.points,
    lifetimePoints: lifetime._sum.points ?? 0,
    bySource: stats.bySource,
    goals: stats.goals,
    remainingGoals: stats.goals.filter((g) => !g.done).length,
    weekBadges: weekBadges.map((b) => {
      const key = b.code.split("_").pop() ?? "";
      return { key, title: b.title, emoji: badgeDef(key)?.emoji ?? "🏅", earnedAt: b.earnedAt };
    }),
    lifetimeBadges,
    pointsTable: POINT_SOURCES.map((s) => ({ source: s, label: POINT_SOURCE_LABELS[s], points: cfg.points[s] })),
    repeatLimitPerDay: cfg.goals.repeatLimitPerDay,
    features: {
      global: cfg.globalEnabled,
      friends: cfg.friendsEnabled,
      classroom: cfg.classroomEnabled,
    },
    nickname: child.nicknameHidden ? null : child.leaderboardNickname,
    globalOptIn: optedIn,
    globalRank,
    friendsCount,
    classroomCount,
  };
}

/* ------------------------------ global leaderboard ------------------------------ */

export async function getGlobalLeaderboard(actor: Actor, childId: string, now = new Date()) {
  const child = await childForRead(actor, childId);
  const cfg = await getCompetitionConfig();
  const weekStart = weekStartOf(now);
  const endsAt = addWeeks(weekStart, 1);
  if (!cfg.globalEnabled) {
    return { enabled: false as const, weekStart, endsAt };
  }
  await ensureWeeksFinalized(now);
  const optedIn = child.globalLeaderboardOptIn && Boolean(child.leaderboardNickname) && !child.nicknameHidden;
  const ranked = await rankWeek(weekStart, { global: true });
  const meRow = optedIn ? ranked.find((r) => r.childId === childId) ?? null : null;
  const top = ranked.slice(0, 10);
  const nearby = meRow
    ? ranked.slice(Math.max(0, meRow.rank - 3), meRow.rank + 2).filter((r) => r.rank > 10)
    : [];
  const shown = [...top, ...nearby];
  const kids = await prisma.child.findMany({
    where: { id: { in: shown.map((r) => r.childId) } },
    select: { id: true, leaderboardNickname: true },
  });
  const nick = new Map(kids.map((k) => [k.id, k.leaderboardNickname ?? "Learner"]));
  const badges = await weeklyBadgeEmojis(shown.map((r) => r.childId), weekStart);
  const view = (r: Ranked) => ({
    rank: r.rank,
    nickname: nick.get(r.childId) ?? "Learner",
    points: r.points,
    badge: badges.get(r.childId) ?? null,
    isMe: r.childId === childId,
    key: reportKey(r.childId),
  });
  return {
    enabled: true as const,
    weekStart,
    endsAt,
    endsInMs: Math.max(0, endsAt.getTime() - now.getTime()),
    optedIn,
    hasNickname: Boolean(child.leaderboardNickname) && !child.nicknameHidden,
    players: ranked.length,
    top: top.map(view),
    nearby: nearby.map(view),
    me: meRow ? view(meRow) : null,
  };
}

export async function getPreviousWinners(weeks = 8, now = new Date()) {
  await ensureWeeksFinalized(now);
  const rows = await prisma.weeklyRanking.findMany({
    where: { rank: { lte: 3 } },
    orderBy: [{ weekStart: "desc" }, { rank: "asc" }],
    take: weeks * 3,
    include: { child: { select: { nicknameHidden: true } } },
  });
  const byWeek = new Map<string, { weekStart: Date; winners: { rank: number; nickname: string; points: number }[] }>();
  for (const r of rows) {
    const k = r.weekStart.toISOString();
    if (!byWeek.has(k)) byWeek.set(k, { weekStart: r.weekStart, winners: [] });
    byWeek.get(k)!.winners.push({
      rank: r.rank,
      nickname: r.child.nicknameHidden ? "Learner" : r.nickname,
      points: r.points,
    });
  }
  return [...byWeek.values()];
}

export async function getChallengeHistory(actor: Actor, childId: string, now = new Date()) {
  await childForRead(actor, childId);
  await ensureWeeksFinalized(now);
  const [weeks, ranks, badges] = await Promise.all([
    prisma.pointsTransaction.groupBy({
      by: ["weekStart"],
      where: { childId },
      _sum: { points: true },
      orderBy: { weekStart: "desc" },
      take: 12,
    }),
    prisma.weeklyRanking.findMany({ where: { childId }, select: { weekStart: true, rank: true } }),
    prisma.achievement.findMany({
      where: { childId, OR: [{ code: { startsWith: "wk_" } }, { code: { startsWith: "class_" } }] },
      orderBy: { earnedAt: "desc" },
      select: { code: true, title: true, description: true, earnedAt: true },
    }),
  ]);
  const rankBy = new Map(ranks.map((r) => [r.weekStart.toISOString(), r.rank]));
  const allBadges = [...WEEKLY_BADGES, ...CLASSROOM_BADGES];
  const emojiFor = (code: string) => {
    const key = code.startsWith("wk_") ? code.split("_").pop() : CLASSROOM_BADGES.find((b) => code.endsWith(`_${b.key}`))?.key;
    return allBadges.find((b) => b.key === key)?.emoji ?? "🏅";
  };
  return {
    weeks: weeks.map((w) => ({
      weekStart: w.weekStart,
      points: w._sum.points ?? 0,
      globalRank: rankBy.get(w.weekStart.toISOString()) ?? null,
      badges: badges
        .filter((b) => b.code.startsWith(`wk_${weekCode(w.weekStart)}_`))
        .map((b) => ({ title: b.title, emoji: emojiFor(b.code) })),
    })),
    badges: badges.map((b) => ({ ...b, emoji: emojiFor(b.code) })),
  };
}

/* ------------------------------ parent settings ------------------------------ */

const BLOCKED_WORDS = ["fuck", "shit", "bitch", "sex", "porn", "kill", "die", "hate", "stupid", "idiot", "dumb", "ass", "damn", "crap", "nazi"];
const ADJECTIVES = ["Brave", "Happy", "Clever", "Sunny", "Swift", "Bright", "Jolly", "Lucky", "Super", "Mighty"];
const ANIMALS = ["Tiger", "Panda", "Dolphin", "Eagle", "Koala", "Lion", "Owl", "Rabbit", "Fox", "Penguin"];

export function suggestNicknames(n = 4) {
  const out = new Set<string>();
  while (out.size < n) {
    out.add(`${ADJECTIVES[randomInt(ADJECTIVES.length)]} ${ANIMALS[randomInt(ANIMALS.length)]} ${randomInt(10, 100)}`);
  }
  return [...out];
}

export function validateNickname(raw: string, realName: string) {
  const nickname = raw.trim().replace(/\s+/g, " ");
  if (nickname.length < 3 || nickname.length > 20) {
    throw new AppError("Nickname must be 3–20 characters", 400);
  }
  if (!/^[A-Za-z0-9 ]+$/.test(nickname)) {
    throw new AppError("Use only letters, numbers and spaces", 400);
  }
  if ((nickname.match(/\d/g) ?? []).length > 3) {
    throw new AppError("Too many numbers — nicknames cannot contain phone numbers", 400);
  }
  const lower = nickname.toLowerCase();
  const squashed = lower.replace(/[^a-z]/g, "");
  if (BLOCKED_WORDS.some((w) => lower.split(" ").includes(w) || (w.length > 3 && squashed.includes(w)))) {
    throw new AppError("Please choose a friendlier nickname", 400);
  }
  const nameParts = realName.toLowerCase().split(/\s+/).filter((p) => p.length >= 3);
  if (nameParts.some((p) => squashed.includes(p.replace(/[^a-z]/g, "")))) {
    throw new AppError("Nickname must not include the child's real name", 400);
  }
  return nickname;
}

export async function getChildChallengeSettings(actor: Actor, childId: string) {
  const child = await childForRead(actor, childId);
  const cfg = await getCompetitionConfig();
  return {
    childId: child.id,
    nickname: child.leaderboardNickname,
    nicknameHidden: child.nicknameHidden,
    globalOptIn: child.globalLeaderboardOptIn,
    globalConsentAt: child.globalConsentAt,
    features: { global: cfg.globalEnabled, friends: cfg.friendsEnabled, classroom: cfg.classroomEnabled },
    suggestions: suggestNicknames(),
  };
}

export async function updateChildChallengeSettings(
  actor: Actor,
  childId: string,
  input: { nickname?: string | null; globalOptIn?: boolean }
) {
  const child = await childForParentWrite(actor, childId);
  const data: Prisma.ChildUpdateInput = {};
  let nickname = child.leaderboardNickname;
  let hidden = child.nicknameHidden;
  if (input.nickname !== undefined) {
    if (input.nickname === null || input.nickname.trim() === "") {
      nickname = null;
      data.leaderboardNickname = null;
    } else {
      nickname = validateNickname(input.nickname, child.displayName);
      if (nickname !== child.leaderboardNickname) {
        data.leaderboardNickname = nickname;
        data.nicknameHidden = false;
        hidden = false;
      }
    }
  }
  if (input.globalOptIn !== undefined) {
    if (input.globalOptIn) {
      const cfg = await getCompetitionConfig();
      if (!cfg.globalEnabled) throw new AppError("The global leaderboard is turned off right now", 409);
      if (!nickname || hidden) throw new AppError("Choose an approved nickname first", 409);
      data.globalLeaderboardOptIn = true;
      if (!child.globalLeaderboardOptIn) data.globalConsentAt = new Date();
    } else {
      data.globalLeaderboardOptIn = false;
      data.globalConsentAt = null;
    }
  }
  if (!nickname && input.globalOptIn === undefined && child.globalLeaderboardOptIn) {
    data.globalLeaderboardOptIn = false;
    data.globalConsentAt = null;
  }
  if (Object.keys(data).length) {
    await prisma.child.update({ where: { id: childId }, data });
  }
  return getChildChallengeSettings(actor, childId);
}

export async function reportNickname(actor: Actor, key: string, reason?: string, now = new Date()) {
  if (actor.role !== "PARENT") throw new AppError("Only parents can report", 403);
  const ws = weekStartOf(now);
  const ranked = [
    ...(await rankWeek(ws, { global: true })),
    ...(await rankWeek(addWeeks(ws, -1), { global: true })),
  ];
  const target = ranked.find((r) => reportKey(r.childId) === key);
  if (!target) throw new AppError("Leaderboard entry not found", 404);
  await prisma.leaderboardReport.upsert({
    where: { childId_reporterUserId: { childId: target.childId, reporterUserId: actor.id } },
    create: { childId: target.childId, reporterUserId: actor.id, reason: reason?.slice(0, 200) ?? null },
    update: { status: "OPEN", reason: reason?.slice(0, 200) ?? null, resolvedAt: null },
  });
  return { reported: true };
}

/* ------------------------------ friends ------------------------------ */

const CODE_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
const INVITE_DAYS = 7;

async function assertFriendsEnabled() {
  const cfg = await getCompetitionConfig();
  if (!cfg.friendsEnabled) throw new AppError("Friends Challenge is turned off right now", 409);
}

function newInviteCode() {
  let code = "";
  for (let i = 0; i < 8; i += 1) code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  return code;
}

export async function createFriendInvite(actor: Actor, childId: string, now = new Date()) {
  await assertFriendsEnabled();
  const child = await childForParentWrite(actor, childId);
  if (!child.leaderboardNickname || child.nicknameHidden) {
    throw new AppError("Choose a nickname before inviting friends", 409);
  }
  const open = await prisma.friendConnection.count({
    where: { childId, status: "INVITED", expiresAt: { gt: now } },
  });
  if (open >= 5) throw new AppError("You already have 5 open invitations", 409);
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      const row = await prisma.friendConnection.create({
        data: { childId, inviteCode: newInviteCode(), expiresAt: new Date(now.getTime() + INVITE_DAYS * DAY_MS) },
      });
      return { id: row.id, code: row.inviteCode, expiresAt: row.expiresAt };
    } catch (err) {
      if ((err as { code?: string }).code !== "P2002") throw err;
    }
  }
  throw new AppError("Could not create invitation", 500);
}

export async function joinFriendInvite(actor: Actor, childId: string, code: string, now = new Date()) {
  await assertFriendsEnabled();
  const joiner = await childForParentWrite(actor, childId);
  if (!joiner.leaderboardNickname || joiner.nicknameHidden) {
    throw new AppError("Choose a nickname before joining friends", 409);
  }
  const conn = await prisma.friendConnection.findUnique({
    where: { inviteCode: code.trim().toUpperCase() },
    include: { child: { select: { parentId: true, isActive: true } } },
  });
  if (!conn || conn.status !== "INVITED" || conn.expiresAt <= now || !conn.child.isActive) {
    throw new AppError("This invitation code is not valid", 404);
  }
  if (conn.childId === childId) throw new AppError("You cannot use your own invitation", 400);
  const existing = await prisma.friendConnection.findFirst({
    where: {
      status: { in: ["PENDING", "ACCEPTED"] },
      OR: [
        { childId: conn.childId, friendChildId: childId },
        { childId, friendChildId: conn.childId },
      ],
    },
  });
  if (existing) throw new AppError("You are already friends (or waiting for approval)", 409);
  // Same parent (siblings): both approvals come from the same person.
  const status = conn.child.parentId === actor.id ? "ACCEPTED" : "PENDING";
  const updated = await prisma.friendConnection.updateMany({
    where: { id: conn.id, status: "INVITED" },
    data: { friendChildId: childId, status },
  });
  if (!updated.count) throw new AppError("This invitation code is not valid", 404);
  return { id: conn.id, status };
}

export async function respondFriendRequest(actor: Actor, connectionId: string, approve: boolean) {
  if (actor.role !== "PARENT") throw new AppError("Only the parent can approve", 403);
  const conn = await prisma.friendConnection.findUnique({
    where: { id: connectionId },
    include: { child: { select: { parentId: true } } },
  });
  if (!conn || conn.child.parentId !== actor.id) throw new AppError("Request not found", 404);
  if (conn.status !== "PENDING") throw new AppError("This request is no longer waiting", 409);
  await prisma.friendConnection.update({
    where: { id: conn.id },
    data: { status: approve ? "ACCEPTED" : "REJECTED" },
  });
  return { id: conn.id, status: approve ? "ACCEPTED" : "REJECTED" };
}

export async function removeFriendConnection(actor: Actor, connectionId: string) {
  if (actor.role !== "PARENT") throw new AppError("Only the parent can remove friends", 403);
  const conn = await prisma.friendConnection.findUnique({
    where: { id: connectionId },
    include: {
      child: { select: { parentId: true } },
      friendChild: { select: { parentId: true } },
    },
  });
  const mine = conn && (conn.child.parentId === actor.id || conn.friendChild?.parentId === actor.id);
  if (!conn || !mine) throw new AppError("Connection not found", 404);
  if (conn.status === "REMOVED") return { id: conn.id, status: "REMOVED" };
  await prisma.friendConnection.update({ where: { id: conn.id }, data: { status: "REMOVED" } });
  return { id: conn.id, status: "REMOVED" };
}

const friendName = (c: { leaderboardNickname: string | null; nicknameHidden: boolean } | null) =>
  c && c.leaderboardNickname && !c.nicknameHidden ? c.leaderboardNickname : "Friend";

export async function listFriends(actor: Actor, childId: string, now = new Date()) {
  await childForRead(actor, childId);
  const nickSel = { select: { leaderboardNickname: true, nicknameHidden: true, isActive: true } };
  const rows = await prisma.friendConnection.findMany({
    where: {
      status: { in: ["INVITED", "PENDING", "ACCEPTED"] },
      OR: [{ childId }, { friendChildId: childId }],
    },
    include: { child: nickSel, friendChild: nickSel },
    orderBy: { updatedAt: "desc" },
  });
  const other = (r: (typeof rows)[number]) => (r.childId === childId ? r.friendChild : r.child);
  return {
    friends: rows
      .filter((r) => r.status === "ACCEPTED" && other(r)?.isActive)
      .map((r) => ({ id: r.id, nickname: friendName(other(r)), since: r.updatedAt })),
    waitingForYou: rows
      .filter((r) => r.status === "PENDING" && r.childId === childId)
      .map((r) => ({ id: r.id, nickname: friendName(r.friendChild) })),
    waitingForOther: rows
      .filter((r) => r.status === "PENDING" && r.friendChildId === childId)
      .map((r) => ({ id: r.id, nickname: friendName(r.child) })),
    openInvites: rows
      .filter((r) => r.status === "INVITED" && r.childId === childId && r.expiresAt > now)
      .map((r) => ({ id: r.id, code: r.inviteCode, expiresAt: r.expiresAt })),
  };
}

export async function getFriendLeaderboard(actor: Actor, childId: string, now = new Date()) {
  const child = await childForRead(actor, childId);
  const cfg = await getCompetitionConfig();
  const weekStart = weekStartOf(now);
  if (!cfg.friendsEnabled) return { enabled: false as const, weekStart, entries: [] };
  const links = await prisma.friendConnection.findMany({
    where: { status: "ACCEPTED", OR: [{ childId }, { friendChildId: childId }] },
    select: { childId: true, friendChildId: true },
  });
  const ids = [childId, ...links.map((l) => (l.childId === childId ? l.friendChildId! : l.childId))];
  const ranked = await rankWeek(weekStart, { childIds: ids });
  const kids = await prisma.child.findMany({
    where: { id: { in: ids }, isActive: true },
    select: { id: true, leaderboardNickname: true, nicknameHidden: true },
  });
  const byId = new Map(kids.map((k) => [k.id, k]));
  const zero = ids
    .filter((id) => byId.has(id) && !ranked.some((r) => r.childId === id))
    .map((id, i) => ({ childId: id, points: 0, lastAt: new Date(0), rank: ranked.length + i + 1 }));
  const badges = await weeklyBadgeEmojis(ids, weekStart);
  return {
    enabled: true as const,
    weekStart,
    entries: [...ranked, ...zero].map((r) => ({
      rank: r.rank,
      nickname: r.childId === childId ? friendName(child) : friendName(byId.get(r.childId) ?? null),
      points: r.points,
      badge: badges.get(r.childId) ?? null,
      isMe: r.childId === childId,
    })),
  };
}

/* ------------------------------ classroom challenges ------------------------------ */

async function assertClassroomEnabled() {
  const cfg = await getCompetitionConfig();
  if (!cfg.classroomEnabled) throw new AppError("Classroom challenges are turned off right now", 409);
}

const classroomAccess = (actor: Actor, classroomId: string) =>
  assertClassroomAccess(actor, classroomId, { requireTeacherAssignment: actor.role === "TEACHER" });

export async function saveClassroomChallenge(
  actor: Actor,
  classroomId: string,
  input: { title: string; goalPoints: number; childIds: string[] },
  now = new Date()
) {
  await assertClassroomEnabled();
  await classroomAccess(actor, classroomId);
  const enrolled = await prisma.classroomEnrollment.findMany({
    where: { classroomId, isActive: true, leftAt: null, child: { isActive: true } },
    select: { childId: true },
  });
  const allowed = new Set(enrolled.map((e) => e.childId));
  const childIds = [...new Set(input.childIds)];
  if (!childIds.length) throw new AppError("Choose at least one student", 400);
  if (childIds.some((id) => !allowed.has(id))) {
    throw new AppError("Only children enrolled in this classroom can join", 400);
  }
  const weekStart = weekStartOf(now);
  const row = await prisma.classroomChallenge.upsert({
    where: { classroomId_weekStart: { classroomId, weekStart } },
    create: {
      classroomId,
      weekStart,
      title: input.title.trim(),
      goalPoints: input.goalPoints,
      childIds,
      createdByUserId: actor.id,
    },
    update: { title: input.title.trim(), goalPoints: input.goalPoints, childIds },
  });
  return row;
}

async function classroomBoard(challenge: { id: string; weekStart: Date; goalPoints: number; childIds: string[] }) {
  const ranked = await rankWeek(challenge.weekStart, { childIds: challenge.childIds });
  const kids = await prisma.child.findMany({
    where: { id: { in: challenge.childIds }, isActive: true },
    select: { id: true, displayName: true, leaderboardNickname: true, nicknameHidden: true },
  });
  const zero = kids
    .filter((k) => !ranked.some((r) => r.childId === k.id))
    .sort((a, b) => a.displayName.localeCompare(b.displayName))
    .map((k, i) => ({ childId: k.id, points: 0, lastAt: new Date(0), rank: ranked.length + i + 1 }));
  const awards = await prisma.achievement.findMany({
    where: { childId: { in: challenge.childIds }, code: { startsWith: `class_${challenge.id}_` } },
    select: { childId: true, code: true },
  });
  return [...ranked, ...zero]
    .filter((r) => kids.some((k) => k.id === r.childId))
    .map((r) => {
      const k = kids.find((x) => x.id === r.childId)!;
      return {
        childId: r.childId,
        displayName: k.displayName,
        nickname: k.leaderboardNickname && !k.nicknameHidden ? k.leaderboardNickname : null,
        rank: r.rank,
        points: r.points,
        goalPct: Math.min(100, Math.round((r.points / Math.max(1, challenge.goalPoints)) * 100)),
        badges: awards
          .filter((a) => a.childId === r.childId)
          .map((a) => CLASSROOM_BADGES.find((b) => a.code.endsWith(`_${b.key}`)))
          .filter((b): b is (typeof CLASSROOM_BADGES)[number] => Boolean(b))
          .map((b) => ({ key: b.key, title: b.title, emoji: b.emoji })),
      };
    });
}

export async function listClassroomChallenges(actor: Actor, classroomId: string, now = new Date()) {
  await classroomAccess(actor, classroomId);
  const cfg = await getCompetitionConfig();
  const weekStart = weekStartOf(now);
  const rows = await prisma.classroomChallenge.findMany({
    where: { classroomId },
    orderBy: { weekStart: "desc" },
    take: 12,
  });
  const current = rows.find((r) => r.weekStart.getTime() === weekStart.getTime()) ?? null;
  const enrolled = await prisma.classroomEnrollment.findMany({
    where: { classroomId, isActive: true, leftAt: null, child: { isActive: true } },
    select: { child: { select: { id: true, displayName: true } } },
  });
  const history = [];
  for (const r of rows.filter((x) => x !== current)) {
    const board = await classroomBoard(r);
    history.push({
      id: r.id,
      title: r.title,
      weekStart: r.weekStart,
      goalPoints: r.goalPoints,
      participants: r.childIds.length,
      top: board.slice(0, 3).map((b) => ({ displayName: b.displayName, points: b.points, rank: b.rank })),
      goalReached: board.filter((b) => b.points >= r.goalPoints).length,
    });
  }
  return {
    enabled: cfg.classroomEnabled,
    weekStart,
    endsAt: addWeeks(weekStart, 1),
    students: enrolled.map((e) => ({ childId: e.child.id, displayName: e.child.displayName })),
    current: current
      ? {
          id: current.id,
          title: current.title,
          goalPoints: current.goalPoints,
          childIds: current.childIds,
          weekStart: current.weekStart,
          board: await classroomBoard(current),
        }
      : null,
    history,
    badgeCatalog: CLASSROOM_BADGES,
  };
}

export async function awardClassroomBadge(
  actor: Actor,
  classroomId: string,
  challengeId: string,
  input: { childId: string; badge: string }
) {
  const classroom = await classroomAccess(actor, classroomId);
  const challenge = await prisma.classroomChallenge.findFirst({ where: { id: challengeId, classroomId } });
  if (!challenge) throw new AppError("Challenge not found", 404);
  if (!challenge.childIds.includes(input.childId)) {
    throw new AppError("This student is not part of the challenge", 400);
  }
  const def = CLASSROOM_BADGES.find((b) => b.key === input.badge);
  if (!def) throw new AppError("Unknown badge", 400);
  const row = await upsertBadge(
    input.childId,
    `class_${challenge.id}_${def.key}`,
    def.title,
    `${challenge.title} · ${classroom.name} · Week of ${weekLabel(challenge.weekStart)}`
  );
  return { awarded: Boolean(row), badge: def };
}

/** Parent / child view: only challenges the child takes part in; classmates by nickname or first name. */
export async function getChildClassroomChallenges(actor: Actor, childId: string, now = new Date()) {
  await childForRead(actor, childId);
  const cfg = await getCompetitionConfig();
  const weekStart = weekStartOf(now);
  if (!cfg.classroomEnabled) return { enabled: false as const, weekStart, current: [], badges: [] };
  const rows = await prisma.classroomChallenge.findMany({
    where: { weekStart, childIds: { has: childId } },
    include: { classroom: { select: { name: true } } },
  });
  const current = [];
  for (const r of rows) {
    const board = await classroomBoard(r);
    current.push({
      id: r.id,
      title: r.title,
      classroomName: r.classroom.name,
      goalPoints: r.goalPoints,
      board: board.map((b) => ({
        rank: b.rank,
        name: b.childId === childId ? "You" : b.nickname ?? b.displayName.split(" ")[0],
        points: b.points,
        goalPct: b.goalPct,
        isMe: b.childId === childId,
        badges: b.badges,
      })),
    });
  }
  const badges = await prisma.achievement.findMany({
    where: { childId, code: { startsWith: "class_" } },
    orderBy: { earnedAt: "desc" },
    select: { code: true, title: true, description: true, earnedAt: true },
  });
  return {
    enabled: true as const,
    weekStart,
    current,
    badges: badges.map((b) => ({
      ...b,
      emoji: CLASSROOM_BADGES.find((d) => b.code.endsWith(`_${d.key}`))?.emoji ?? "🏅",
    })),
  };
}

/* ------------------------------ admin ------------------------------ */

export async function getAdminChallengeStats(now = new Date()) {
  await ensureWeeksFinalized(now);
  const weekStart = weekStartOf(now);
  // Admin Practice learners belong to staff accounts; stats count real families only.
  const familyOnly = { child: { parent: { role: "PARENT" as const } } };
  const [week, players, optedIn, nicknames, friends, pendingFriends, classChallenges, openReports, history, winners] =
    await Promise.all([
      prisma.pointsTransaction.aggregate({ where: { weekStart, ...familyOnly }, _sum: { points: true }, _count: true }),
      prisma.pointsTransaction.groupBy({ by: ["childId"], where: { weekStart, ...familyOnly } }),
      prisma.child.count({ where: { isActive: true, globalLeaderboardOptIn: true } }),
      prisma.child.count({ where: { leaderboardNickname: { not: null } } }),
      prisma.friendConnection.count({ where: { status: "ACCEPTED" } }),
      prisma.friendConnection.count({ where: { status: "PENDING" } }),
      prisma.classroomChallenge.count({ where: { weekStart } }),
      prisma.leaderboardReport.count({ where: { status: "OPEN" } }),
      prisma.pointsTransaction.groupBy({
        by: ["weekStart"],
        where: familyOnly,
        _sum: { points: true },
        _count: { childId: true },
        orderBy: { weekStart: "desc" },
        take: 8,
      }),
      getPreviousWinners(8, now),
    ]);
  const playersByWeek = await Promise.all(
    history.map((h) =>
      prisma.pointsTransaction
        .groupBy({ by: ["childId"], where: { weekStart: h.weekStart, ...familyOnly } })
        .then((g) => g.length)
    )
  );
  return {
    weekStart,
    thisWeek: {
      players: players.length,
      points: week._sum.points ?? 0,
      awards: week._count,
      classroomChallenges: classChallenges,
    },
    optedIn,
    nicknames,
    friends,
    pendingFriends,
    openReports,
    history: history.map((h, i) => ({
      weekStart: h.weekStart,
      points: h._sum.points ?? 0,
      players: playersByWeek[i],
      winners: winners.find((w) => w.weekStart.getTime() === h.weekStart.getTime())?.winners ?? [],
    })),
  };
}

export async function listAdminNicknames(filter: { reportedOnly?: boolean }) {
  const rows = await prisma.child.findMany({
    where: {
      leaderboardNickname: { not: null },
      ...(filter.reportedOnly ? { leaderboardReports: { some: { status: "OPEN" } } } : {}),
    },
    select: {
      id: true,
      displayName: true,
      leaderboardNickname: true,
      nicknameHidden: true,
      globalLeaderboardOptIn: true,
      leaderboardReports: {
        where: { status: "OPEN" },
        select: { id: true, reason: true, createdAt: true },
      },
    },
    orderBy: { leaderboardNickname: "asc" },
    take: 200,
  });
  return rows.map((r) => ({
    childId: r.id,
    displayName: r.displayName,
    nickname: r.leaderboardNickname,
    hidden: r.nicknameHidden,
    globalOptIn: r.globalLeaderboardOptIn,
    openReports: r.leaderboardReports,
  }));
}

export async function moderateNickname(childId: string, input: { hidden?: boolean; clear?: boolean }) {
  const child = await prisma.child.findUnique({ where: { id: childId }, select: { id: true } });
  if (!child) throw new AppError("Child not found", 404);
  const data: Prisma.ChildUpdateInput = {};
  if (input.hidden !== undefined) data.nicknameHidden = input.hidden;
  if (input.clear) {
    data.leaderboardNickname = null;
    data.globalLeaderboardOptIn = false;
    data.globalConsentAt = null;
    data.nicknameHidden = false;
  }
  await prisma.child.update({ where: { id: childId }, data });
  await prisma.leaderboardReport.updateMany({
    where: { childId, status: "OPEN" },
    data: { status: "RESOLVED", resolvedAt: new Date() },
  });
  return { childId, ...input };
}

export async function dismissReport(reportId: string) {
  const r = await prisma.leaderboardReport.findUnique({ where: { id: reportId } });
  if (!r) throw new AppError("Report not found", 404);
  await prisma.leaderboardReport.update({
    where: { id: reportId },
    data: { status: "DISMISSED", resolvedAt: new Date() },
  });
  return { id: reportId, status: "DISMISSED" };
}

export async function listAdminBadges() {
  const rows = await prisma.achievement.findMany({
    where: { OR: [{ code: { startsWith: "wk_" } }, { code: { startsWith: "class_" } }] },
    orderBy: { earnedAt: "desc" },
    select: {
      id: true,
      code: true,
      title: true,
      description: true,
      earnedAt: true,
      child: { select: { displayName: true, leaderboardNickname: true } },
    },
  });
  const keyOf = (code: string) =>
    code.startsWith("wk_") ? code.split("_").pop()! : CLASSROOM_BADGES.find((b) => code.endsWith(`_${b.key}`))?.key ?? "";
  const catalog = [
    ...WEEKLY_BADGES.map((b) => ({ ...b, type: "weekly" as const })),
    ...CLASSROOM_BADGES.map((b) => ({ ...b, type: "classroom" as const })),
  ].map((b) => ({ ...b, awarded: rows.filter((r) => keyOf(r.code) === b.key).length }));
  return {
    catalog,
    recent: rows.slice(0, 30).map((r) => ({
      id: r.id,
      title: r.title,
      description: r.description,
      earnedAt: r.earnedAt,
      emoji: catalog.find((c) => c.key === keyOf(r.code))?.emoji ?? "🏅",
      child: r.child.leaderboardNickname ?? r.child.displayName,
    })),
  };
}

/** Admin can take back a wrongly awarded challenge badge (only wk_/class_ badges). */
export async function revokeChallengeBadge(achievementId: string) {
  const row = await prisma.achievement.findUnique({ where: { id: achievementId }, select: { code: true } });
  if (!row || !(row.code.startsWith("wk_") || row.code.startsWith("class_"))) {
    throw new AppError("Badge not found", 404);
  }
  await prisma.achievement.delete({ where: { id: achievementId } });
  return { revoked: true };
}
