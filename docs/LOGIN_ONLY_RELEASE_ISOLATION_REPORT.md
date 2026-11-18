# Learn Wise – Login-Only Release Isolation Report

**Date:** 2026-11-18  
**Source branch (dirty WIP):** `fix/login-auth-reliability` @ `eb296fe` + uncommitted work  
**Isolated branch:** `release/login-auth-only`  
**Isolated worktree:** `C:\Users\harsh\OneDrive\Documents\Desktop\SIWI-login-auth-only`  
**Base commit:** `eb296fe` (`Add Level-2 Types of Nouns 3D pilot assets…`)  
**Restrictions honored:** no commit, no push, no deploy, no prod env/DB changes, no AAB, original WIP preserved  

---

## STEP 1 – Inspection summary

| Item | Value |
|------|--------|
| Original workspace | `…\SIWI-Read IT & Spell IT` still on `fix/login-auth-reliability` with full unrelated WIP |
| Isolated worktree | Clean checkout of `eb296fe` + **login-only** overlays |
| Login fix commits on branch | **None** — fixes were uncommitted; isolation applied as working-tree changes on `release/login-auth-only` |

---

## STEP 2 – File classification

### A. Login-only (safe to include as whole file)

| File | Change | Safe isolation |
|------|--------|----------------|
| `apps/mobile/app/login.tsx` | Timeout, request-id guard, RATE_LIMITED tip only | Yes |
| `apps/mobile/services/auth-errors.ts` | ACCOUNT_LOCKED / RATE_LIMITED / device / network messages | Yes |
| `apps/mobile/services/auth-errors.test.ts` | Unit tests (**new**) | Yes |
| `apps/web/src/app/login/page.tsx` | Single-flight, disabled fields, friendly errors, timeout | Yes |
| `apps/web/src/lib/auth-errors.ts` | Web error map (**new**) | Yes |
| `apps/web/src/lib/auth-errors.test.ts` | Unit tests (**new**) | Yes |
| `apps/web/src/lib/login-submit-guard.test.ts` | Double-submit guard test (**new**) | Yes |
| `server/src/auth/auth.routes.ts` | Wire Redis/memory password limiter | Yes |
| `server/src/auth/auth.service.ts` | `verifyLoginPassword` | Yes |
| `server/src/config/env.ts` | Optional `REDIS_URL` only | Yes |
| `server/src/lib/lockout.ts` | Clearer ACCOUNT_LOCKED message | Yes |
| `server/src/lib/password.ts` | `verifyLoginPassword` helper | Yes |
| `server/src/lib/redis.ts` | Redis client (**new**) | Yes |
| `server/src/lib/password-rate-limit.ts` | Shared RL + fallback (**new**) | Yes |
| `server/src/parent-auth/session.service.ts` | SESSION_CONFLICT message only | Yes |
| `server/tests/login-auth-fixes.test.ts` | Regression suite (**new**) | Yes |
| `docs/LOGIN_*.md` (5 audit/plan docs) | Login docs only | Yes |

### B. Shared files (login + unrelated) — isolation method

| File | Login-related | Unrelated | Isolation method |
|------|---------------|-----------|------------------|
| `apps/mobile/services/api.ts` | `timeoutMs` / abort helpers | Diff review: **login-only** in current WIP | Copied whole current file (verified login-only hunks) |
| `apps/web/src/lib/api.ts` | Same timeout helpers | Diff review: **login-only** | Copied whole current file |
| `server/package.json` | `"ioredis": "^6.0.0"` | content-quality scripts; vitest bump to 3.2.7 | **Surgical:** added **only** `ioredis`; left vitest at `^3.0.5`; **excluded** content-quality scripts |
| `package-lock.json` | ioredis dependency tree | Would also lock unrelated WIP if copied blindly | Regenerated in worktree via `npm install ioredis` only |
| `package.json` (root) | none for login | content-quality npm scripts | **Excluded entirely** |

### C. Unrelated — excluded from isolated release

Examples (not exhaustive):  
`apps/mobile/app/(tabs)/*`, `admin*.tsx`, content-quality modules, vocab-import, `server/src/app.ts` / `routes/index.ts` content-quality mounts, SpeakWord, e2e, grade reports, marketing docs, storage/media pilots, `apps/mobile/app.json` versionCode 28 bump, etc.

**Original WIP left untouched** in `SIWI-Read IT & Spell IT`.

---

## STEP 3 – Isolated release prepared

| Property | Value |
|----------|--------|
| Branch | `release/login-auth-only` |
| Worktree path | `C:\Users\harsh\OneDrive\Documents\Desktop\SIWI-login-auth-only` |
| Method | `git worktree add … -b release/login-auth-only eb296fe` then copy/surgical patch |
| Commit | **Not created** (awaiting approval) |
| Push | **Not done** |

### Contained fixes checklist

1. Lockout vs rate-limit error separation — **Yes**  
2. Parent session-conflict messaging — **Yes**  
3. Web duplicate-submission prevention — **Yes**  
4. Password verification compatibility — **Yes**  
5. Login timeout (25s) — **Yes**  
6. Redis-backed RL + bounded memory fallback — **Yes**  

### Confirmed absent from isolated status

No `content-quality`, vocab-import, home/learn tabs, SpeakWord, or other unrelated paths in `git status` of the worktree.

---

## STEP 4 – Test results (isolated worktree)

**Executed in** `SIWI-login-auth-only` after local `prisma generate` and gitignored `.env` copy for tests only.

### Backend — **28 passed**

```
npm run test --workspace=@little-readers/server -- tests/login-auth-fixes.test.ts tests/auth-lockout.test.ts tests/auth.test.ts
```

| Suite | Result |
|-------|--------|
| `login-auth-fixes.test.ts` | 15 passed |
| `auth-lockout.test.ts` | 5 passed |
| `auth.test.ts` | 8 passed |
| **Total** | **28 passed** |

### Web / mobile unit — **OK**

| Test | Result |
|------|--------|
| `apps/mobile/services/auth-errors.test.ts` | OK |
| `apps/web/src/lib/auth-errors.test.ts` | OK |
| `apps/web/src/lib/login-submit-guard.test.ts` | OK |

---

## STEP 5 – Redis staging test plan

**Do not set production `REDIS_URL`.** Use staging only.

### Prerequisites
- Staging Redis reachable (no prod credentials in docs).  
- Two staging API processes (e.g. two pm2 apps or two ports) with the **same** `REDIS_URL`.  
- Test account / synthetic emails only.

### Cases

| # | Scenario | Procedure | Expected |
|---|----------|-----------|----------|
| 1 | Redis available | Set staging `REDIS_URL`; restart both instances; login incorrectly many times against same email from one IP | Counters shared; eventually `RATE_LIMITED` from either instance |
| 2 | Two instances share counters | Hit instance A then B with same email/IP under threshold | Combined count approaches max; not reset per process |
| 3 | Redis temporarily unavailable | Stop Redis mid-test; continue attempts | Bounded **memory** fallback; still rate-limited per process; logs warn `[rate-limit] Redis…`; **never unlimited** |
| 4 | Redis reconnection | Restore Redis; **restart API processes** (current code may latch to memory until restart) | Shared Redis counters resume after restart |
| 5 | Counter expiry | Wait 15 minutes (or inspect TTL on `rl:pw:*` keys in staging Redis — do not dump emails) | Window resets; login allowed again |

### Staging readiness status

| Item | Status |
|------|--------|
| Code supports Redis + fallback | Ready |
| Staging Redis provisioned | **Ops / NOT TESTED in this task** |
| Automated multi-instance CI | Not present |
| Production `REDIS_URL` | **Must remain unchanged** until separate approval |

---

## STEP 6 – Android compatibility

| Topic | Detail |
|-------|--------|
| Older clients | Builds that still hardcode all HTTP 429 as “signing too quickly…” (includes Play builds at **versionCode 27** on base commit; any APK without the new `auth-errors.ts`) |
| WIP versionCode 28 | Exists only in **unrelated** dirty tree `app.json` — **not** part of this isolated login release |
| Required update | New Android release containing `apps/mobile/app/login.tsx`, `services/api.ts`, `services/auth-errors.ts` (and bump versionCode in a **separate approved** release branch) |
| API compatibility | Older apps remain compatible: still receive 429 + `code`; they ignore `code` and keep old copy until updated. No breaking contract. |
| Proposed sequence | 1) Commit/deploy backend+web from `release/login-auth-only` 2) Smoke web lockout messaging 3) Separate approval → QA Android build 4) Separate approval → production AAB/Play rollout |
| This task | **No AAB generated** |

---

## Remaining blockers

1. **Commit approval** for `release/login-auth-only` (currently uncommitted clean login set).  
2. **Deploy approval** backend → web.  
3. **Android AAB approval** (separate) for installed-app P0 messaging.  
4. **Staging Redis exercise** before enabling multi-instance `REDIS_URL` in production.  
5. **P2** dedicated parent device-transfer UX still missing (documented; no insecure bypass).

---

## Recommended next actions (awaiting your approval)

1. Review this worktree / `git diff` on `release/login-auth-only`.  
2. Approve **commit** (login-only files listed above).  
3. Approve **push** of `release/login-auth-only` if desired.  
4. Approve **backend + web deploy**.  
5. Separately approve Redis staging test + optional prod `REDIS_URL`.  
6. Separately approve Android release.

**Stop:** Isolated release prepared and tested. No commit, push, deploy, prod env change, or AAB performed.
