export type Goal = { key: string; label: string; current: number; target: number; done: boolean; pct: number };

export type ChallengeOverview = {
  weekStart: string;
  endsAt: string;
  endsInMs: number;
  weekPoints: number;
  lifetimePoints: number;
  bySource: { source: string; label: string; points: number; times: number }[];
  goals: Goal[];
  remainingGoals: number;
  weekBadges: { key: string; title: string; emoji: string }[];
  lifetimeBadges: number;
  pointsTable: { source: string; label: string; points: number }[];
  repeatLimitPerDay: number;
  features: { global: boolean; friends: boolean; classroom: boolean };
  nickname: string | null;
  globalOptIn: boolean;
  globalRank: { rank: number; players: number } | null;
  friendsCount: number;
  classroomCount: number;
};

export type BoardEntry = {
  rank: number;
  nickname: string;
  points: number;
  badge: string | null;
  isMe: boolean;
  key?: string;
};

export type GlobalBoard =
  | { enabled: false; weekStart: string; endsAt: string }
  | {
      enabled: true;
      weekStart: string;
      endsAt: string;
      endsInMs: number;
      optedIn: boolean;
      hasNickname: boolean;
      players: number;
      top: BoardEntry[];
      nearby: BoardEntry[];
      me: BoardEntry | null;
    };

export type FriendBoard = { enabled: boolean; entries: BoardEntry[] };

export type FriendList = {
  friends: { id: string; nickname: string }[];
  waitingForYou: { id: string; nickname: string }[];
  waitingForOther: { id: string; nickname: string }[];
  openInvites: { id: string; code: string; expiresAt: string }[];
};

export type ClassBadge = { key: string; title: string; emoji: string };

export type ChildClassroom = {
  enabled: boolean;
  current: {
    id: string;
    title: string;
    classroomName: string;
    goalPoints: number;
    board: { rank: number; name: string; points: number; goalPct: number; isMe: boolean; badges: ClassBadge[] }[];
  }[];
  badges: { code: string; title: string; description: string | null; earnedAt: string; emoji: string }[];
};

export type ChallengeHistory = {
  weeks: { weekStart: string; points: number; globalRank: number | null; badges: { title: string; emoji: string }[] }[];
  badges: { code: string; title: string; description: string | null; earnedAt: string; emoji: string }[];
};

export type Winners = { weekStart: string; winners: { rank: number; nickname: string; points: number }[] }[];

export type ChildChallengeSettings = {
  childId: string;
  nickname: string | null;
  nicknameHidden: boolean;
  globalOptIn: boolean;
  globalConsentAt: string | null;
  features: { global: boolean; friends: boolean; classroom: boolean };
  suggestions: string[];
};

export const MEDALS = ["🥇", "🥈", "🥉"];

export function formatCountdown(ms: number) {
  const mins = Math.max(0, Math.floor(ms / 60000));
  const d = Math.floor(mins / 1440);
  const h = Math.floor((mins % 1440) / 60);
  const m = mins % 60;
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

export function weekOf(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
}
