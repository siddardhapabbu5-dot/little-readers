import { ApiError } from "./api";

/** Friendly, App-Store-safe login messages. Never show raw backend dumps. */
export function friendlyAuthError(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 429) {
      return "You're signing in a little too quickly. Please wait a minute and try again.";
    }
    if (err.status === 401 || err.status === 403) {
      return "That email or password doesn't look right. Please try again.";
    }
    if (err.status >= 500) {
      return "Our servers are taking a short break. Please try again shortly.";
    }
    if (/too many requests/i.test(err.message)) {
      return "You're signing in a little too quickly. Please wait a minute and try again.";
    }
    if (/invalid|credentials|password|email/i.test(err.message)) {
      return "That email or password doesn't look right. Please try again.";
    }
  }

  if (err instanceof Error) {
    if (/failed to fetch|network request failed/i.test(err.message)) {
      return "We couldn't reach Learn Wise right now. Check your connection and try again.";
    }
  }

  return "We couldn't log you in. Please try again.";
}

export function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

export type AppRole =
  | "PARENT"
  | "STUDENT"
  | "TEACHER"
  | "ADMIN"
  | "SUPER_ADMIN"
  | "SCHOOL_ADMIN";

/** Post-login / cold-start home for an authenticated role. */
export function routeForRole(role: string): string {
  switch (role) {
    case "SUPER_ADMIN":
    case "ADMIN":
      return "/admin";
    case "SCHOOL_ADMIN":
    case "TEACHER":
      return "/teacher";
    case "PARENT":
      return "/parent";
    case "STUDENT":
      return "/(tabs)/home";
    default:
      return "/(tabs)/home";
  }
}

export const ROLE_SETS = {
  parentFamily: ["PARENT", "ADMIN", "SUPER_ADMIN", "SCHOOL_ADMIN"] as const,
  kidsLearning: ["PARENT", "STUDENT", "ADMIN", "SUPER_ADMIN", "SCHOOL_ADMIN"] as const,
  teacher: ["TEACHER", "ADMIN", "SUPER_ADMIN", "SCHOOL_ADMIN"] as const,
  admin: ["ADMIN", "SUPER_ADMIN"] as const,
  schools: ["ADMIN", "SUPER_ADMIN", "SCHOOL_ADMIN"] as const,
  superAdmin: ["SUPER_ADMIN"] as const,
  anyAuthed: [
    "PARENT",
    "STUDENT",
    "TEACHER",
    "ADMIN",
    "SUPER_ADMIN",
    "SCHOOL_ADMIN",
  ] as const,
};

export function roleAllowed(role: string, allowed: readonly string[]): boolean {
  return allowed.includes(role);
}
