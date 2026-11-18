type AuthLikeError = {
  status: number;
  code?: string;
  message: string;
  details?: unknown;
};

const INVALID_CREDENTIALS = "Email or password is incorrect.";
const RATE_LIMITED =
  "Too many login attempts. Please wait before trying again.";
const ACCOUNT_LOCKED =
  "Your account is temporarily locked after multiple unsuccessful login attempts. Please try again after the lockout period.";
const NETWORK =
  "Unable to connect. Please check your internet connection and try again.";
const DEVICE_CONFLICT =
  "This account is already active on another device. Use that device, or complete a device transfer from the approved device. Learn Wise allows one active parent device at a time.";
const SESSION_REVOKED =
  "You've been signed out because this account was opened on another device.";

function asAuthError(err: unknown): AuthLikeError | null {
  if (!err || typeof err !== "object") return null;
  const e = err as { status?: unknown; message?: unknown; code?: unknown; details?: unknown };
  if (typeof e.status !== "number" || typeof e.message !== "string") return null;
  return {
    status: e.status,
    message: e.message,
    code: typeof e.code === "string" ? e.code : undefined,
    details: e.details,
  };
}

function errorCode(err: AuthLikeError): string | undefined {
  if (err.code) return err.code;
  const details = err.details;
  if (details && typeof details === "object" && details !== null && "code" in details) {
    const code = (details as { code?: unknown }).code;
    return typeof code === "string" ? code : undefined;
  }
  return undefined;
}

/** Friendly, App-Store-safe login messages. Never show raw backend dumps. */
export function friendlyAuthError(err: unknown): string {
  const apiErr = asAuthError(err);
  if (apiErr) {
    const code = errorCode(apiErr);

    if (code === "ACCOUNT_LOCKED") {
      return /temporarily locked|lockout period|try again/i.test(apiErr.message)
        ? apiErr.message
        : ACCOUNT_LOCKED;
    }
    if (code === "PIN_LOCKED") {
      return apiErr.message || ACCOUNT_LOCKED;
    }
    if (code === "RATE_LIMITED") {
      return RATE_LIMITED;
    }
    if (code === "SESSION_CONFLICT") {
      return DEVICE_CONFLICT;
    }
    if (code === "SESSION_REVOKED") {
      return SESSION_REVOKED;
    }
    if (code === "NETWORK_UNAVAILABLE" || code === "REQUEST_TIMEOUT" || apiErr.status === 0) {
      return code === "REQUEST_TIMEOUT"
        ? "The sign-in request timed out. Please try again."
        : NETWORK;
    }

    // Unclassified 429 — prefer rate-limit copy only when message looks like RL.
    if (apiErr.status === 429) {
      if (/locked/i.test(apiErr.message)) return ACCOUNT_LOCKED;
      return RATE_LIMITED;
    }

    if (apiErr.status === 409 && /device|session/i.test(apiErr.message)) {
      return DEVICE_CONFLICT;
    }

    if (apiErr.status === 401 || apiErr.status === 403) {
      return INVALID_CREDENTIALS;
    }
    if (apiErr.status >= 500) {
      return "Our servers are taking a short break. Please try again shortly.";
    }
    if (/invalid|credentials|password|email/i.test(apiErr.message)) {
      return INVALID_CREDENTIALS;
    }
  }

  if (err instanceof Error) {
    if (/abort|timeout/i.test(err.message)) {
      return "The sign-in request timed out. Please try again.";
    }
    if (/failed to fetch|network request failed/i.test(err.message)) {
      return NETWORK;
    }
  }

  return "We couldn't log you in. Please try again.";
}

export function isRateLimitedAuthError(err: unknown): boolean {
  const apiErr = asAuthError(err);
  return Boolean(apiErr && errorCode(apiErr) === "RATE_LIMITED");
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
