type AuthLikeError = {
  status: number;
  code?: string;
  message: string;
  details?: unknown;
};

const INVALID_EMAIL_PASSWORD = "Email or password is incorrect.";
const UNKNOWN_EMAIL = "No account was found for that email.";
const INVALID_PASSWORD = "That password is incorrect.";
const UNKNOWN_STUDENT_ID = "That Student ID was not found.";
const INVALID_OTP = "That code is incorrect. Please try again.";
const EXPIRED_OTP = "That code has expired. Request a new one.";
const RATE_LIMITED =
  "Too many login attempts. Please wait before trying again.";
const ACCOUNT_LOCKED =
  "Your account is temporarily locked after multiple unsuccessful login attempts. Please try again after the lockout period.";
const ACCOUNT_INACTIVE =
  "This account is inactive. Contact Learn Wise support.";
const NETWORK =
  "Unable to connect. Please check your internet connection and try again.";
const DEVICE_CONFLICT =
  "This account is already active on another device. Use that device, or complete a device transfer from the approved device. Learn Wise allows one active parent device at a time.";
const SESSION_REVOKED =
  "You've been signed out because this account was opened on another device.";
const TIMEOUT = "The sign-in request timed out. Please try again.";
const SERVER =
  "Our servers are taking a short break. Please try again shortly.";

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

    if (code === "ACCOUNT_LOCKED" || code === "PIN_LOCKED") {
      return /temporarily locked|lockout period|try again/i.test(apiErr.message)
        ? apiErr.message
        : ACCOUNT_LOCKED;
    }
    if (code === "ACCOUNT_INACTIVE") return ACCOUNT_INACTIVE;
    if (code === "RATE_LIMITED" || code === "OTP_HOURLY_LIMIT") return RATE_LIMITED;
    if (code === "OTP_RESEND_COOLDOWN") {
      return apiErr.message || "Please wait before requesting another code.";
    }
    if (code === "OTP_INVALID" || code === "INVALID_OTP") return INVALID_OTP;
    if (code === "OTP_EXPIRED" || code === "OTP_NOT_FOUND") return EXPIRED_OTP;
    if (code === "OTP_MAX_ATTEMPTS") {
      return "Too many incorrect codes. Request a new OTP.";
    }
    if (code === "STUDENT_ID_UNKNOWN") return UNKNOWN_STUDENT_ID;
    if (code === "STUDENT_PASSWORD_INVALID") return INVALID_PASSWORD;
    if (code === "SESSION_CONFLICT") return DEVICE_CONFLICT;
    if (code === "SESSION_REVOKED") return SESSION_REVOKED;
    if (code === "NETWORK_UNAVAILABLE" || code === "REQUEST_TIMEOUT" || apiErr.status === 0) {
      return code === "REQUEST_TIMEOUT" ? TIMEOUT : NETWORK;
    }

    if (apiErr.status === 429) {
      if (/locked/i.test(apiErr.message)) return ACCOUNT_LOCKED;
      return RATE_LIMITED;
    }

    if (apiErr.status === 409 && /device|session/i.test(apiErr.message)) {
      return DEVICE_CONFLICT;
    }

    // Prefer specific copy when backend message already distinguishes cases.
    if (/student id was not found|unknown student/i.test(apiErr.message)) {
      return UNKNOWN_STUDENT_ID;
    }
    if (/password is incorrect/i.test(apiErr.message)) {
      return INVALID_PASSWORD;
    }
    if (/inactive/i.test(apiErr.message)) {
      return ACCOUNT_INACTIVE;
    }
    if (/otp expired|request a new/i.test(apiErr.message) && /otp|code/i.test(apiErr.message)) {
      return EXPIRED_OTP;
    }
    if (/incorrect otp|invalid otp/i.test(apiErr.message)) {
      return INVALID_OTP;
    }

    if (apiErr.status === 401 || apiErr.status === 403) {
      // Email/password login intentionally uses one message for unknown email
      // and wrong password (anti-enumeration), except ACCOUNT_INACTIVE above.
      return INVALID_EMAIL_PASSWORD;
    }
    if (apiErr.status >= 500) return SERVER;
  }

  if (err instanceof Error) {
    if (/abort|timeout/i.test(err.message)) return TIMEOUT;
    if (/failed to fetch|network request failed/i.test(err.message)) return NETWORK;
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
  parentOrStudentBilling: ["PARENT", "STUDENT", "ADMIN", "SUPER_ADMIN", "SCHOOL_ADMIN"] as const,
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

/** Native phones participate in Parent one-device sessions; browser /app/ does not. */
export function shouldBindParentDeviceSession(platform: string): boolean {
  return platform === "ios" || platform === "android";
}
