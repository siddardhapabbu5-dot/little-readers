# Login Fix – Pre-Implementation Audit

**Date:** 2026-11-18  
**Branch:** `fix/login-auth-reliability`  
**Source:** `docs/LOGIN_AUTHENTICATION_AUDIT_REPORT.md` + live code inspection  

---

## Existing authentication behaviour

| Path | Behaviour |
|------|-----------|
| Web / mobile login | `POST /api/auth/login` → `loginUser` |
| Registration | `POST /api/auth/register` → `registerParent` (password hashed as-is) |
| Parent mobile | Login body includes `deviceId` → `activateParentDeviceSession` (revokes prior ACTIVE sessions) |
| Parent web | No `deviceId` → JWT without `sid` |
| Parent SMS OTP | APIs under `/parent/auth` — **not** wired to login UI |

---

## API error codes and formats

Error handler (`server/src/middleware/errorHandler.ts`) returns:

```json
{ "error": "<message>", "code": "<optional>", "details": { "code": "...", ... } }
```

| Condition | HTTP | Code |
|-----------|------|------|
| Bad credentials / inactive | 401 | (none) |
| Account lockout | 429 | `ACCOUNT_LOCKED` (+ `retryAfterSeconds` in details) |
| Password attempt RL | 429 | `RATE_LIMITED` |
| Device session race | 409 | `SESSION_CONFLICT` |
| Session revoked (middleware) | 401 | `SESSION_REVOKED` |

---

## Rate-limit and lockout thresholds

| Control | Window | Limit | Storage |
|---------|--------|-------|---------|
| Login / forgot / reset password RL | 15 min | 20 prod / 200 non-prod | **In-memory** `express-rate-limit` |
| Account lockout | 15 min | 5 failed passwords | PostgreSQL `failedLoginCount`, `loginLockedUntil` |
| Global `/api` RL | env `RATE_LIMIT_*` | default 100 / 15 min | In-memory |

Key pattern today: `pw:${path}:${ip}:${email}` (raw email). Skipped when `VITEST`/`NODE_ENV=test`.

---

## Password normalization

| Flow | Normalization |
|------|----------------|
| Register | Hash `input.password` **as-is** (no trim) |
| Login | `input.password.trim()` then verify |
| Reset / change | Hash as-is |

**Risk:** Edge-space passwords registered never match trimmed login; accidental edge spaces on login of normal passwords currently still work because of trim.

**Chosen contract (to implement):** verify as-is first, then trimmed if different; do not re-hash or migrate existing hashes; new register/reset/change remain as-is (intentional internal spaces preserved).

---

## Parent device-session rules

`activateParentDeviceSession` (**does not block** new login):

1. Revokes all ACTIVE sessions for the parent.
2. Creates new ACTIVE session for the provided `deviceId`.
3. Concurrent unique races → 409 `SESSION_CONFLICT`.
4. Old device later API calls → 401 `SESSION_REVOKED`.

**No dedicated lost-phone / device-transfer API or UI** beyond “log in on the new device” (which revokes the old session). Document as missing recovery UX — do not add insecure bypass.

---

## Redis usage

**None.** No `REDIS_URL`, no Redis client dependency in `server/package.json`. Login RL is process-local memory only.

---

## Regression risks

- Changing lockout HTTP status would break `auth-lockout.test.ts` (keep 429 + distinct codes).
- Stopping login trim without dual-verify would break users who type accidental edge spaces.
- Redis hard-fail-closed would block all login when Redis is down.
- Weakening one-device revoke on new login would break security policy.

---

## Test coverage before changes

| Suite | Covers |
|-------|--------|
| `server/tests/auth-lockout.test.ts` | Lockout, reset unlock, PIN lock |
| `server/tests/auth.test.ts` | Register/login happy paths |
| `server/tests/email-otp-auth.test.ts` | Email OTP (not login UI) |
| Web / mobile unit tests for login messages | **None** |

---

## Exact files to change

1. `apps/mobile/services/auth-errors.ts` — classify errors  
2. `apps/mobile/app/login.tsx` — tip only for `RATE_LIMITED`; timeout  
3. `apps/web/src/app/login/page.tsx` — single-flight + message map + timeout  
4. `apps/web/src/lib/auth-errors.ts` (**new**) — shared web messages  
5. `apps/mobile/services/api.ts` / `apps/web/src/lib/api.ts` — timeout support  
6. `server/src/auth/auth.service.ts` — password verify compatibility  
7. `server/src/auth/auth.routes.ts` — Redis-backed password RL  
8. `server/src/lib/redis.ts` (**new**), `server/src/lib/password-rate-limit.ts` (**new**)  
9. `server/src/config/env.ts` — optional `REDIS_URL`  
10. `server/src/parent-auth/session.service.ts` — clearer `SESSION_CONFLICT` message (policy unchanged)  
11. Tests under `server/tests/`, `apps/mobile/services/`, `apps/web/src/lib/`  

No migrations. No production env mutation in this change set (document `REDIS_URL` only).
