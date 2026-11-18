# Login Fix – Post-Implementation Audit

**Date:** 2026-11-18  
**Branch:** `fix/login-auth-reliability`  
**Status:** Implementation complete locally. **Not deployed.** Awaiting production approval.

---

## 1. Exact files changed

| File | Change |
|------|--------|
| `docs/LOGIN_FIX_PRE_IMPLEMENTATION_AUDIT.md` | Pre-change audit |
| `docs/LOGIN_FIX_POST_IMPLEMENTATION_AUDIT.md` | This report |
| `apps/mobile/services/auth-errors.ts` | Distinct ACCOUNT_LOCKED / RATE_LIMITED / device / network messages |
| `apps/mobile/services/auth-errors.test.ts` | Mobile message unit tests |
| `apps/mobile/app/login.tsx` | Timeout; tip only for RATE_LIMITED; late-response guard |
| `apps/mobile/services/api.ts` | Optional `timeoutMs` + abort handling |
| `apps/web/src/lib/auth-errors.ts` | Web-friendly login error map (**new**) |
| `apps/web/src/lib/auth-errors.test.ts` | Web message unit tests (**new**) |
| `apps/web/src/lib/login-submit-guard.test.ts` | Double-submit guard unit test (**new**) |
| `apps/web/src/lib/api.ts` | `LOGIN_REQUEST_TIMEOUT_MS` + timeout support |
| `apps/web/src/app/login/page.tsx` | Single-flight submit; disable fields; friendly errors; timeout |
| `server/src/lib/password.ts` | `verifyLoginPassword` compatibility helper |
| `server/src/auth/auth.service.ts` | Use `verifyLoginPassword` (no hash migration) |
| `server/src/lib/lockout.ts` | Clearer ACCOUNT_LOCKED message (policy unchanged) |
| `server/src/lib/redis.ts` | Optional Redis client (**new**) |
| `server/src/lib/password-rate-limit.ts` | Shared Redis-backed RL + memory fallback (**new**) |
| `server/src/auth/auth.routes.ts` | Wire shared password limiter |
| `server/src/parent-auth/session.service.ts` | Clearer SESSION_CONFLICT copy (policy unchanged) |
| `server/src/config/env.ts` | Optional `REDIS_URL` |
| `server/package.json` / lockfile | Add `ioredis` dependency |
| `server/tests/login-auth-fixes.test.ts` | Regression suite (**new**) |

---

## 2. Summary of each fix

### P0 – Error classification
- Mobile/web map `ACCOUNT_LOCKED` → lockout message (not “too quickly”).
- `RATE_LIMITED` → “Too many login attempts…”.
- Invalid credentials → “Email or password is incorrect.”
- Network/timeout → connection/timeout messages (never rate-limit copy).

### P0 – Parent single-device UX
- One-device revoke-on-new-login **preserved**.
- `SESSION_CONFLICT` message explains other-device activity and that transfer must use the approved device.
- **Documented gap:** no dedicated lost-phone / device-transfer product flow beyond logging in on the new device (which revokes the old session). No insecure bypass added.

### P1 – Web double-submit
- `loadingRef` early return + disabled inputs/button + `aria-busy`.
- Button re-enabled after success or failure.

### P1 – Password normalization
- Register/reset/change still hash as submitted (no silent trim; no hash rewrite).
- Login uses `verifyLoginPassword`: exact match first, then trimmed if different.
- Internal spaces preserved; existing hashes unchanged.

### P1 – Login timeout
- Default login client timeout **25 seconds** (`LOGIN_REQUEST_TIMEOUT_MS`).
- Aborted requests surface timeout code; late responses ignored via request-id refs.
- No automatic retries.

### P1 – Shared Redis rate limiting
- When `REDIS_URL` is set: atomic INCR + PEXPIRE store shared across instances.
- Keys use hashed email (SHA-256 prefix), never raw email.
- Key still combines path + IP + hashed email (avoids shared-IP locking unrelated accounts).
- If Redis is unset or fails: **bounded in-memory fallback** with warnings — **never unlimited**.
- Distinct `RATE_LIMITED` vs `ACCOUNT_LOCKED` codes retained.

---

## 3. Before / after behaviour

| Scenario | Before | After |
|----------|--------|-------|
| Account locked (5 fails) | Mobile: “signing too quickly / wait a minute” | Clear temporary lockout message |
| True rate limit | Same “too quickly” copy | Distinct rate-limit message |
| Web double Enter/click | Possible duplicate POSTs | Single in-flight request |
| Password edge spaces | Login trimmed only; register as-is | Dual verify; hashes untouched |
| Slow network | Hang indefinitely | 25s timeout + retry allowed |
| Multi-instance RL | Per-process memory only | Redis when configured; else memory fallback |
| New parent device login | Succeeds; old session revoked (opaque) | Same security; clearer conflict/revoked copy |

---

## 4. Backend test results

Command: `npm run test --workspace=@little-readers/server -- tests/login-auth-fixes.test.ts tests/auth-lockout.test.ts tests/auth.test.ts`

| Suite | Result |
|-------|--------|
| `login-auth-fixes.test.ts` | **15 passed** |
| `auth-lockout.test.ts` | **5 passed** |
| `auth.test.ts` | **8 passed** |
| **Total** | **28 passed** |

Covered: correct/incorrect/unknown credentials, lockout + expiry, password compatibility, device session revoke, rate-limit key hashing, Redis unavailable helpers, `/auth/me` ungated rejection.

---

## 5. Web test results

| Test | Result |
|------|--------|
| `apps/web/src/lib/auth-errors.test.ts` | **OK** |
| `apps/web/src/lib/login-submit-guard.test.ts` | **OK** |

Manual UI click/Enter not automated in CI (no web Playwright login suite in scope). Guard unit test covers double-submit semantics.

---

## 6. Android / mobile test results

| Test | Result |
|------|--------|
| `apps/mobile/services/auth-errors.test.ts` | **OK** |

Device/APK E2E not run in this change set (no deploy). Logic covered by unit tests + shared API timeout path.

---

## 7. Security regression results

| Check | Status |
|-------|--------|
| Password hashes unchanged by login | **Pass** (asserted in test) |
| User records not mutated except normal lockout counters | **Pass** |
| OTP flows untouched | **Pass** (no OTP login UI wiring) |
| Parent one-device enforcement active | **Pass** (revoke test) |
| Admin still uses same `/auth/login` | **Pass** |
| JWT validation unchanged except messaging | **Pass** |
| Rate limiting not disabled | **Pass** (memory or Redis always bounded) |

---

## 8. Redis behaviour and failure handling

| Mode | Behaviour |
|------|-----------|
| `REDIS_URL` unset | MemoryStore only (bounded) |
| Redis up | Shared counters with TTL = 15 minutes |
| Redis down / errors | Warning log + MemoryStore fallback; login remains protected |

**Not done automatically:** setting production `REDIS_URL`. Ops must add it deliberately.

---

## 9. Password compatibility findings

- Existing accounts keep their hashes.
- Accidental leading/trailing spaces on login still succeed against normal hashes.
- Passwords registered with intentional edge spaces still verify via exact match.
- Internal spaces always significant.

---

## 10. Unresolved issues

| Item | Priority | Notes |
|------|----------|-------|
| No dedicated lost-phone / device-transfer product flow | **P2** | Documented; login-on-new-device remains the security transfer |
| Global `/api` rate limiter still memory-only | **P2** | Out of login-fix scope |
| Email OTP limiter still uses raw email in key | **P2** | Not part of password login path |
| Live Redis multi-instance soak test | **P2** | Needs staging Redis |
| Unrelated pre-existing `content-quality.service.ts` nullability TS errors | **P2** | Not introduced by this work |

---

## 11. Required environment configuration (document only — not applied)

```env
# Optional. Enables shared login rate-limit counters across API instances.
REDIS_URL=redis://<host>:6379
```

- Do **not** commit secrets.
- Without `REDIS_URL`, behaviour remains secure via in-memory limits.
- Confirm nginx still forwards a single trusted `X-Forwarded-For` hop (`trust proxy` = 1).

---

## 12. Production deployment checklist (awaiting approval)

1. Merge/deploy `fix/login-auth-reliability` login files only (avoid unrelated dirty tree files).  
2. Optionally set `REDIS_URL` on API hosts and restart `pm2`/process.  
3. Smoke: admin login, parent mobile login, wrong password → lockout copy, double-click web login.  
4. Confirm old Android builds still receive `code` fields (`ACCOUNT_LOCKED` / `RATE_LIMITED`).  
5. Monitor logs for `[rate-limit] Redis` warnings.  
6. **Do not** reset passwords, delete sessions, or disable rate limits as part of deploy.

---

## Remaining classification

- **P0 remaining:** none identified for login messaging/reliability after this fix.  
- **P1 remaining:** none for the approved five fixes.  
- **P2:** device-transfer product UX; Redis soak; global RL Redis; OTP key hashing.

---

## Stop

Implementation + automated tests + this audit are complete.  
**No production deploy, no prod env mutation, no commit/push** until separately approved.
