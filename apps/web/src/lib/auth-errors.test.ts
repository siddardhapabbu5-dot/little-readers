import assert from "node:assert/strict";
import { ApiClientError } from "./api";
import { friendlyLoginError } from "./auth-errors";

assert.equal(
  friendlyLoginError(
    new ApiClientError("locked", 429, { code: "ACCOUNT_LOCKED" }, "ACCOUNT_LOCKED")
  ).includes("temporarily locked"),
  true
);

assert.equal(
  friendlyLoginError(new ApiClientError("rl", 429, undefined, "RATE_LIMITED")),
  "Too many login attempts. Please wait before trying again."
);

assert.equal(
  friendlyLoginError(new ApiClientError("bad", 401)),
  "Email or password is incorrect."
);

assert.equal(
  friendlyLoginError(
    new ApiClientError("conflict", 409, undefined, "SESSION_CONFLICT")
  ).includes("another device"),
  true
);

assert.equal(
  friendlyLoginError(
    new ApiClientError("net", 0, undefined, "NETWORK_UNAVAILABLE")
  ).includes("internet connection"),
  true
);

assert.equal(
  friendlyLoginError(
    new ApiClientError("timeout", 0, undefined, "REQUEST_TIMEOUT")
  ).includes("timed out"),
  true
);

assert.equal(
  friendlyLoginError(new ApiClientError("boom", 500)).toLowerCase().includes("too many"),
  false
);

console.log("web auth-errors tests OK");
