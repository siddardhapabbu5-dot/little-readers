import { ApiClientError } from "./api";

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
const TIMEOUT = "The sign-in request timed out. Please try again.";

function errorCode(err: ApiClientError): string | undefined {
  if (err.code) return err.code;
  const details = err.details;
  if (details && typeof details === "object" && details !== null && "code" in details) {
    const code = (details as { code?: unknown }).code;
    return typeof code === "string" ? code : undefined;
  }
  return undefined;
}

/** Map login API failures to consistent user-facing copy (web). */
export function friendlyLoginError(err: unknown): string {
  if (err instanceof ApiClientError) {
    const code = errorCode(err);

    if (code === "ACCOUNT_LOCKED") {
      return /temporarily locked|lockout period|try again/i.test(err.message)
        ? err.message
        : ACCOUNT_LOCKED;
    }
    if (code === "RATE_LIMITED") return RATE_LIMITED;
    if (code === "SESSION_CONFLICT") return DEVICE_CONFLICT;
    if (code === "SESSION_REVOKED") return SESSION_REVOKED;
    if (code === "NETWORK_UNAVAILABLE" || code === "REQUEST_TIMEOUT" || err.status === 0) {
      return code === "REQUEST_TIMEOUT" ? TIMEOUT : NETWORK;
    }

    if (err.status === 429) {
      if (/locked/i.test(err.message)) return ACCOUNT_LOCKED;
      return RATE_LIMITED;
    }
    if (err.status === 409 && /device|session/i.test(err.message)) {
      return DEVICE_CONFLICT;
    }
    if (err.status === 401 || err.status === 403) return INVALID_CREDENTIALS;
    if (err.status >= 500) {
      return "Our servers are taking a short break. Please try again shortly.";
    }
    if (err.message) return err.message;
  }

  if (err instanceof Error) {
    if (/abort|timeout/i.test(err.message)) return TIMEOUT;
    if (/failed to fetch|network/i.test(err.message)) return NETWORK;
  }

  return "Unable to log in. Please try again.";
}
