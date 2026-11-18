# Learn Wise – Login Authentication Audit Report

**Date:** 2026-11-18  
**Mode:** READ-ONLY (no code, DB, Redis, production, or deploy changes)  
**Scope:** Web + mobile login reliability; rate-limit warning; user-specific failures  
**Stack note:** Authentication is **Express + Prisma** only. There is **no NestJS** auth implementation in this repo.

---

## Executive summary

Two distinct problems are overlapping in user reports:

1. **“You're signing in a little too quickly…”** is a **mobile frontend hardcoded message** for **any HTTP 429**, including **account lockout** (15 minutes) and true rate limiting. Users often are **not** “signing too quickly”; they are locked after failed passwords.

2. **Some users fail while others succeed** is most often explained by **account lockout**, **inactive accounts**, **parent single-device session revocation**, **password trim asymmetry**, or **web double-submit**, not by a broken global login endpoint.

**Primary login product path today:** email + password via `POST /api/auth/login` for admin, parent, teacher, and school admin. Parent SMS OTP APIs exist but **are not wired to current login UIs**.

---

## Authentication flows (do not mix)

| Flow | Endpoint | Clients | Notes |
|------|----------|---------|-------|
| **Email/password (shared)** | `POST /api/auth/login` | Mobile `apps/mobile/app/login.tsx`, Web `apps/web/src/app/login/page.tsx` | Single service: `loginUser` in `server/src/auth/auth.service.ts`. Role decides post-login route. |
| **Admin password login** | Same `/auth/login` | Same UIs | No separate admin login controller. Admin-only routes are forgot/reset under `/admin/auth`. |
| **Parent email/password** | Same `/auth/login` | Same UIs | Mobile sends `deviceId` → activates parent device session (one active device). Web typically has **no** `deviceId` → JWT without `sid`. |
| **Parent SMS OTP** | `POST /api/parent/auth/send-otp`, `verify-otp` | **No current login UI callers** | Backend + tests only. Not the live login screen path. |
| **Email OTP** | `/auth/email-otp/*` | Register / forgot-password / PIN flows | Not used for login. |

Router mounts: `server/src/routes/index.ts` → `/auth`, `/parent/auth`, `/admin/auth`.

---

## Root cause – rate-limit warning (P0)

### Finding
Mobile always shows:

> You're signing in a little too quickly. Please wait a minute and try again.

whenever `ApiError.status === 429` (`apps/mobile/services/auth-errors.ts`).

### Actual backend 429 sources
| Source | HTTP | Code | Real meaning |
|--------|------|------|--------------|
| Account lockout | 429 | `ACCOUNT_LOCKED` | 5 failed passwords → lock **15 minutes** (`server/src/lib/lockout.ts`) |
| Login rate limiter | 429 | `RATE_LIMITED` | 20 attempts / 15 min per `ip+email+path` (`passwordAttemptRateLimit`) |
| OTP / email-OTP limiters | 429 | often **no code** | OTP send/verify / cooldown |
| Global `/api` limiter | 429 | no auth code | Broad API flood protection |

### Why this feels like “login is broken”
- User mistypes password a few times → lockout 429 → mobile says “too quickly / wait a minute”.
- Real wait is **up to 15 minutes**, not ~1 minute.
- Web shows the backend lockout message more accurately; mobile does not.

### Redis
**No Redis rate-limit store.** `express-rate-limit` uses **in-memory** counters. Implications:
- Counters reset on process restart.
- Multiple Node instances (if ever scaled) do not share counters.
- There is **no Redis key expiry** to audit for login RL today.

### Proxy / IP
`server/src/app.ts` sets `trust proxy` to **1**. Rate-limit keys use `req.ip`. Correct behaviour depends on nginx setting `X-Forwarded-For` with a single trusted hop. Misconfiguration can make many users share one IP key (NAT + wrong proxy trust).

### Duplicate requests
| Client | Double-submit |
|--------|----------------|
| Mobile | Guarded (`if (loading) return` + disabled button) — mostly safe |
| Web | `disabled={loading}` only; **no early return** — race can fire **two** logins before re-render |

---

## Root causes – user-specific login failures

| Cause | Severity | Who is affected | Mechanism |
|-------|----------|-----------------|-----------|
| Account lockout mislabeled as rate limit | **P0** | Users with recent wrong passwords | `ACCOUNT_LOCKED` → mobile “too quickly” |
| Parent one-device session | **P0** | Mobile parents | Login with `deviceId` revokes other active sessions; other device gets `SESSION_REVOKED` |
| Inactive user (`isActive=false`) | **P1** | Specific accounts | Same 401 as bad password |
| Password trim asymmetry | **P1** | Users who registered with leading/trailing spaces | Login uses `password.trim()`; register hashes `input.password` **without** trim |
| Web double-submit | **P1** | Fast double Enter/click | Two attempts → faster lockout / rate limit |
| Concurrent device login | **P1** | Two phones same parent | 409 `SESSION_CONFLICT` poorly mapped on mobile |
| No client timeout | **P1** | Slow networks | Fetch can hang; looks like “login failed” |
| NAT + shared IP rate limit | **P1** | Shared school/office IP | Login key includes email, so mostly per-email; still coupled to IP |
| Email OTP / SMS OTP confusion | **P2** | Support tickets | OTP not on login UI; failures are password/device/lockout |

Password hashing remains bcrypt via `verifyPassword` / `hashPassword` — **no evidence of hash algorithm breakage** as a general cause.

---

## Frontend findings

### Mobile (`apps/mobile/app/login.tsx` + `auth-errors.ts`)
- One-request-in-flight guard present.
- Loading indicator present.
- **P0:** All 429 → “too quickly”; tip says wait ~1 minute.
- **P1:** 401/403 all mapped to wrong password; ignores `SESSION_CONFLICT`, inactive nuance.
- Email/password only (OTP styles leftover / unused).

### Web (`apps/web/src/app/login/page.tsx`)
- Shows backend error text (better for lockout).
- **P1:** Missing `if (loading) return` early in submit.
- Inputs not disabled while loading.
- Does not send `deviceId` (by design for web).

### API clients
- Mobile `apps/mobile/services/api.ts`, web `apps/web/src/lib/api.ts`: **no retries**, **no AbortSignal timeout** on login.

---

## Backend findings

### Login pipeline
`passwordAttemptRateLimit` → validate body → `loginUser`:
1. Normalize email `trim().toLowerCase()`
2. Reject missing/inactive with generic 401
3. `assertNotLocked`
4. `verifyPassword`
5. Clear failures / issue JWT
6. If PARENT + `deviceId` → `activateParentDeviceSession`

### Rate limiting (auth)
- Login: **20 / 15 min** prod (`pw:${path}:${ip}:${email}`)
- In-memory only
- Lockout separate DB fields: `failedLoginCount`, `loginLockedUntil`

### Session
- Mobile parents: JWT + `sid` + refresh; device session enforced in `auth` middleware
- Web parents: JWT without `sid` (legacy path)
- Admin: JWT without parent device session

---

## Redis / database findings

| Store | Login role |
|-------|------------|
| PostgreSQL (Prisma `User`) | Credentials, `isActive`, lockout fields, sessions |
| Redis | **Not used** for rate limiting in this codebase |
| Memory | `express-rate-limit` counters |

**Production config note:** If ops expected Redis-backed RL, that is **not implemented**. No Redis expiry issue for login RL; memory TTL is the express-rate-limit window.

---

## Security requirements (must preserve)

- bcrypt password hashing  
- Account lockout after repeated failures  
- Login rate limiting (do **not** disable)  
- Parent single-device enforcement on mobile  
- OTP security for flows that use OTP  
- Existing admin auth endpoint model  
- No credential logging  

---

## Exact files that need changes (after approval)

| Priority | File | Change |
|----------|------|--------|
| P0 | `apps/mobile/services/auth-errors.ts` | Branch on `ACCOUNT_LOCKED` vs `RATE_LIMITED`; show real wait time |
| P0 | `apps/mobile/app/login.tsx` | Tip text only for true rate limit; lockout-specific copy |
| P1 | `apps/web/src/app/login/page.tsx` | Early return if loading; disable fields; optional code-aware messages |
| P1 | `server/src/auth/auth.service.ts` (+ register) | Trim password consistently before hash and verify |
| P1 | `apps/mobile/services/api.ts`, `apps/web/src/lib/api.ts` | Login request timeout (AbortSignal) |
| P1 | Mobile error map | Handle `SESSION_CONFLICT`, `SESSION_REVOKED` clearly |
| P2 | Rate-limit messages | Add consistent `code` on all auth 429 middleware responses |
| P2 | Ops / nginx | Verify `X-Forwarded-For` + `trust proxy` 1 in production |
| P2 (optional later) | Redis store for rate-limit | Only if multi-instance scaling requires shared counters |

---

## Proposed fixes (approval required before implementation)

### Fix A — Correct mobile 429 messaging (P0)
- If `code === "ACCOUNT_LOCKED"`: show lockout message + retry minutes from `details` / server message.
- If `code === "RATE_LIMITED"`: keep “too quickly” / wait-and-retry.
- Never tell locked users to wait only one minute.

### Fix B — Web single-flight submit (P1)
- Mirror mobile: `if (loading) return` at start of submit; disable inputs while pending.

### Fix C — Password normalize (P1)
- Trim password on register (and login already trims) so hash and verify match.

### Fix D — Timeouts + clearer session errors (P1)
- Add ~20s timeout on login fetch.
- Map `SESSION_CONFLICT` / `SESSION_REVOKED` to parent-friendly device messages (without weakening one-device policy).

### Fix E — Do **not**
- Disable rate limiting  
- Raise limits without measuring abuse  
- Soften OTP or device security  
- Reset passwords or delete sessions as a “fix”

---

## Test plan and acceptance criteria

### Test cases (web + Android)

1. Correct admin email/password → success, land on admin.  
2. Incorrect admin password → clear wrong-password message; after 5 fails → **lockout copy**, not “too quickly”.  
3. Unknown email → same generic invalid credentials (no user enumeration).  
4. Parent OTP login → **N/A on current UI** (document; API-only).  
5. Invalid OTP → API-only until UI exists.  
6. Expired OTP → API-only.  
7. Rapid repeated login clicks → **one** in-flight request (web + mobile).  
8. Network timeout → clear connection/timeout message (after Fix D).  
9. Redis unavailable → **N/A** for login RL (memory); document if Redis added later.  
10. Database unavailable → 5xx friendly message, no rate-limit copy.  
11. Parent login on registered device → success.  
12. Parent login from new device → success on new; previous device session revoked (expected security).  
13. Session refresh → parent refresh still works; not blocked by OTP limiter incorrectly.  
14. Logout then login → success.  
15. After true `RATE_LIMITED`, wait window then succeed.

### Acceptance criteria
- Legitimate users with correct password are not told they are “signing too quickly” unless they actually hit `RATE_LIMITED`.  
- Locked accounts see lockout guidance with correct wait time.  
- One click → one login request.  
- Loading state blocks repeat submit.  
- Rate limiting and lockout remain enabled.  
- Parent one-device policy remains enforced.  
- No secrets in logs or UI.

---

## Production configuration changes?

| Item | Required now? |
|------|----------------|
| Code fixes A–D | Yes (after approval) |
| Disable rate limit | **No** |
| Redis for RL | Optional / later (scaling) |
| nginx `X-Forwarded-For` verification | Recommended ops check (P2) |
| Password resets / session deletes | **No** as blanket fix |
| Migrations | **No** for messaging/submit fixes; trim fix is code-only |

---

## Finding classification

### P0
1. Mobile maps all 429 (including `ACCOUNT_LOCKED`) to “signing too quickly / wait a minute”.  
2. Parent mobile one-device session causes “works on phone A, fails on phone B” unless users understand re-login.

### P1
3. Web login double-submit race.  
4. Password trim on login vs untrimmed register hash.  
5. No login request timeout.  
6. Poor mapping of `SESSION_CONFLICT` / opaque inactive-account 401.  
7. Possible shared-IP effects if proxy trust is wrong.

### P2
8. Inconsistent 429 `code` across limiters.  
9. In-memory rate-limit store.  
10. Dead OTP UI remnants vs live OTP APIs.  
11. Global API limiter vs auth-specific limiter interaction.

---

## Security risks if fixed incorrectly

- Disabling RL or lockout → brute force.  
- Returning distinct “user inactive” vs “bad password” → account enumeration.  
- Removing one-device enforcement → shared parent accounts across devices (product/security regression).  
- Logging passwords/OTPs/tokens → compliance risk.

Recommended approach preserves all of the above controls while fixing **client error taxonomy** and **submit hygiene**.

---

## STOP

This report completes the read-only audit.

**No production changes, no code edits, no deploys, no commits.**  
Awaiting explicit approval before implementing Fixes A–D (or a subset).
