import assert from "node:assert/strict";
import {
  friendlyAuthError,
  isRateLimitedAuthError,
  shouldBindParentDeviceSession,
} from "./auth-errors";

function err(
  message: string,
  status: number,
  code?: string,
  details?: unknown
) {
  return Object.assign(new Error(message), { status, code, details });
}

assert.equal(
  friendlyAuthError(err("locked", 429, "ACCOUNT_LOCKED")),
  "Your account is temporarily locked after multiple unsuccessful login attempts. Please try again after the lockout period."
);

assert.equal(
  friendlyAuthError(err("rl", 429, "RATE_LIMITED")),
  "Too many login attempts. Please wait before trying again."
);

assert.equal(
  friendlyAuthError(err("bad", 401)),
  "Email or password is incorrect."
);

assert.equal(
  friendlyAuthError(err("gone", 403, "ACCOUNT_INACTIVE")),
  "This account is inactive. Contact Learn Wise support."
);

assert.equal(
  friendlyAuthError(err("no id", 401, "STUDENT_ID_UNKNOWN")),
  "That Student ID was not found."
);

assert.equal(
  friendlyAuthError(err("bad pw", 401, "STUDENT_PASSWORD_INVALID")),
  "That password is incorrect."
);

assert.equal(
  friendlyAuthError(err("otp", 401, "OTP_INVALID")),
  "That code is incorrect. Please try again."
);

assert.equal(
  friendlyAuthError(err("exp", 400, "OTP_EXPIRED")),
  "That code has expired. Request a new one."
);

assert.equal(
  friendlyAuthError(err("conflict", 409, "SESSION_CONFLICT")).includes("another device"),
  true
);

assert.equal(
  friendlyAuthError(err("down", 0, "NETWORK_UNAVAILABLE")),
  "Unable to connect. Please check your internet connection and try again."
);

assert.equal(
  friendlyAuthError(err("slow", 0, "REQUEST_TIMEOUT")).includes("timed out"),
  true
);

assert.equal(isRateLimitedAuthError(err("rl", 429, "RATE_LIMITED")), true);
assert.equal(isRateLimitedAuthError(err("locked", 429, "ACCOUNT_LOCKED")), false);

assert.equal(friendlyAuthError(err("boom", 500)).includes("too many"), false);
assert.equal(shouldBindParentDeviceSession("web"), false);
assert.equal(shouldBindParentDeviceSession("android"), true);

console.log("mobile auth-errors tests OK");
