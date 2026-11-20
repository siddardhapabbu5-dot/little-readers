import assert from "node:assert/strict";
import { shouldClearSessionForUnauthorized } from "./session";

assert.equal(
  shouldClearSessionForUnauthorized(undefined, "tok-student"),
  false,
  "no bearer on request → do not clear"
);

assert.equal(
  shouldClearSessionForUnauthorized("tok-admin", null),
  false,
  "no current token → already cleared / logged out"
);

assert.equal(
  shouldClearSessionForUnauthorized("tok-admin", "tok-student"),
  false,
  "stale Admin 401 must not wipe a newer Student session"
);

assert.equal(
  shouldClearSessionForUnauthorized("tok-student", "tok-parent"),
  false,
  "stale Student 401 must not wipe a newer Parent session"
);

assert.equal(
  shouldClearSessionForUnauthorized("tok-student", "tok-student"),
  true,
  "matching bearer 401 → clear current session"
);

console.log("session.test.ts: ok");
