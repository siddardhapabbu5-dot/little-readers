# Learn Wise – Final Login-Only Commit Review

**Date:** 2026-11-18  
**Mode:** READ-ONLY (no stage, commit, push, deploy, or prod changes)  
**Recommendation:** **READY FOR COMMIT**

---

## 1. Branch and base commit

| Item | Value |
|------|--------|
| Branch | `release/login-auth-only` |
| Worktree | `C:\Users\harsh\OneDrive\Documents\Desktop\SIWI-login-auth-only` |
| HEAD / base | `eb296fe` — *Add Level-2 Types of Nouns 3D pilot assets, tooling, and cutover exports.* |
| Commit state | Login fixes are **uncommitted** working-tree changes on top of `eb296fe` |
| Sibling WIP | `fix/login-auth-reliability` at same base with **unrelated dirty WIP preserved** and untouched by this release tree |

`git worktree list` confirms both trees coexist; isolation holds.

---

## 2. Git status (isolated worktree)

**Modified (tracked):**
- `apps/mobile/app/login.tsx`
- `apps/mobile/services/api.ts`
- `apps/mobile/services/auth-errors.ts`
- `apps/web/src/app/login/page.tsx`
- `apps/web/src/lib/api.ts`
- `package-lock.json`
- `server/package.json` (**ioredis only**)
- `server/src/auth/auth.routes.ts`
- `server/src/auth/auth.service.ts`
- `server/src/config/env.ts`
- `server/src/lib/lockout.ts`
- `server/src/lib/password.ts`
- `server/src/parent-auth/session.service.ts`

**Untracked (new):**
- `apps/mobile/services/auth-errors.test.ts`
- `apps/web/src/lib/auth-errors.ts`
- `apps/web/src/lib/auth-errors.test.ts`
- `apps/web/src/lib/login-submit-guard.test.ts`
- `server/src/lib/redis.ts`
- `server/src/lib/password-rate-limit.ts`
- `server/tests/login-auth-fixes.test.ts`
- `server/scripts/staging-create-test-user.mjs`
- `server/scripts/staging-redis-multi-instance-verify.mjs`
- Login docs under `docs/LOGIN_*.md` (+ staging JSON)

**Not in status (must never commit):** `.env` (present locally for tests; gitignored)

No content-quality / vocab / admin UI paths appear in this worktree status.

---

## 3. Login fixes verification

| # | Fix | Status | Evidence |
|---|-----|--------|----------|
| 1 | `ACCOUNT_LOCKED` vs `RATE_LIMITED` | **PASS** | Mobile/web `auth-errors`; lockout.ts; limiter `code: RATE_LIMITED` |
| 2 | Parent `SESSION_CONFLICT` messaging | **PASS** | `session.service.ts` clear device-transfer guidance; one-device policy unchanged |
| 3 | Web single-flight submit | **PASS** | `loadingRef` early return + disabled fields |
| 4 | Password verify compatibility | **PASS** | `verifyLoginPassword` (exact then trimmed); no hash rewrite |
| 5 | 25s login timeout | **PASS** | `LOGIN_REQUEST_TIMEOUT_MS = 25_000` web + mobile |
| 6 | Redis shared RL | **PASS** | `password-rate-limit.ts` + hashed keys + TTL |
| 7 | Redis auto-recovery | **PASS** | `unavailableUntil` cooldown + `connectInFlight`; staging 20/20 |
| 8 | Bounded memory fallback | **PASS** | Fallback store while Redis in cooldown/outage |

---

## 4. Redis evidence review

| Source | Role |
|--------|------|
| `docs/LOGIN_REDIS_MULTI_INSTANCE_STAGING_REPORT.md` | Earlier 18/18 run; documented **pre-fix** sticky latch |
| `docs/LOGIN_REDIS_AUTO_RECOVERY_REPORT.md` | Post-fix: auto-recover without restart |
| **This audit re-run** | Staging harness **20/20 PASS** (2026-11-18) |

Confirmed in latest re-run:
- Shared counters across two API instances  
- TTL expiry  
- Bounded fallback during outage  
- Automatic Redis recovery **without API restart**  
- Second outage/recovery cycle on same processes  
- `ACCOUNT_LOCKED` distinct from `RATE_LIMITED`  

---

## 5. Exact proposed commit file list

### Include (required for product fix)

| Path | Why required | Feature | Unrelated? |
|------|--------------|---------|------------|
| `apps/mobile/app/login.tsx` | Timeout + RATE_LIMITED tip | 1,5 | No |
| `apps/mobile/services/api.ts` | `timeoutMs` support | 5 | No |
| `apps/mobile/services/auth-errors.ts` | Error classification | 1,2 | No |
| `apps/mobile/services/auth-errors.test.ts` | Mobile unit tests | 1 | No |
| `apps/web/src/app/login/page.tsx` | Single-flight + errors + timeout | 1,3,5 | No |
| `apps/web/src/lib/api.ts` | Timeout helper | 5 | No |
| `apps/web/src/lib/auth-errors.ts` | Web error map | 1,2 | No |
| `apps/web/src/lib/auth-errors.test.ts` | Web unit tests | 1 | No |
| `apps/web/src/lib/login-submit-guard.test.ts` | Double-submit guard test | 3 | No |
| `server/src/auth/auth.routes.ts` | Wire shared limiter | 6 | No |
| `server/src/auth/auth.service.ts` | `verifyLoginPassword` | 4 | No |
| `server/src/config/env.ts` | Optional `REDIS_URL` | 6 | No |
| `server/src/lib/lockout.ts` | Lockout message | 1 | No |
| `server/src/lib/password.ts` | Compat verify helper | 4 | No |
| `server/src/lib/redis.ts` | Client + auto-recovery | 6,7,8 | No |
| `server/src/lib/password-rate-limit.ts` | Redis/memory store | 6,8 | No |
| `server/src/parent-auth/session.service.ts` | SESSION_CONFLICT copy | 2 | No |
| `server/tests/login-auth-fixes.test.ts` | Backend regression | all | No |
| `server/package.json` | Add `ioredis` only | 6 | **No** (verified) |
| `package-lock.json` | Lock `ioredis` tree | 6 | No (ioredis-related) |

### Include (recommended docs / staging harness)

| Path | Why | Unrelated? |
|------|-----|------------|
| `docs/LOGIN_AUTHENTICATION_AUDIT_REPORT.md` | Original audit | No |
| `docs/LOGIN_FIX_PRE_IMPLEMENTATION_AUDIT.md` | Pre-fix audit | No |
| `docs/LOGIN_FIX_POST_IMPLEMENTATION_AUDIT.md` | Post-fix audit | No |
| `docs/LOGIN_AUTH_PRODUCTION_READINESS_REPORT.md` | Readiness | No |
| `docs/LOGIN_AUTH_PRODUCTION_DEPLOYMENT_PLAN.md` | Deploy plan | No |
| `docs/LOGIN_ONLY_RELEASE_ISOLATION_REPORT.md` | Isolation | No |
| `docs/LOGIN_REDIS_MULTI_INSTANCE_STAGING_REPORT.md` | Staging history | No |
| `docs/LOGIN_REDIS_AUTO_RECOVERY_REPORT.md` | Auto-recovery | No |
| `docs/LOGIN_ONLY_FINAL_COMMIT_REVIEW.md` | This review | No |
| `server/scripts/staging-redis-multi-instance-verify.mjs` | Repeatable staging | No |
| `server/scripts/staging-create-test-user.mjs` | Staging helper | No |

### Exclude from commit

| Path | Reason |
|------|--------|
| `.env` / secrets | Local only; gitignored |
| `docs/LOGIN_REDIS_STAGING_RESULTS.json` | Generated ephemeral artifact (optional; safe to omit) |
| Everything under `fix/login-auth-reliability` dirty tree | Unrelated WIP |
| content-quality scripts / vitest bumps | Not present in this `server/package.json` diff |

**Shared-file check:** `server/package.json` diff is **only** `"ioredis": "^6.0.0"`. No content-quality scripts. Vitest remains `^3.0.5`.

---

## 6. Test results (executed this audit)

### Backend — **PASS (28/28)**
```
tests/login-auth-fixes.test.ts + auth-lockout.test.ts + auth.test.ts
Test Files  3 passed | Tests  28 passed
```

### Web / mobile unit — **PASS**
- `apps/mobile/services/auth-errors.test.ts` → OK  
- `apps/web/src/lib/auth-errors.test.ts` → OK  
- `apps/web/src/lib/login-submit-guard.test.ts` → OK  

### Redis multi-instance + auto-recovery — **PASS (20/20)**
Re-ran `server/scripts/staging-redis-multi-instance-verify.mjs` on this branch after final code state:
`Passed: 20/20` (shared counters, TTL, fallback, auto-recover without restart, second cycle, ACCOUNT_LOCKED ≠ RATE_LIMITED).

---

## 7. Security review

| Control | Status |
|---------|--------|
| Password hashes unchanged by login | **PASS** |
| Lockout cannot be bypassed by Redis outage | **PASS** (DB lockout + bounded RL) |
| Rate limit never unlimited | **PASS** |
| Redis keys hashed (no raw email) | **PASS** |
| Parent one-device enforcement | **PASS** (policy unchanged) |
| OTP flows unchanged | **PASS** |
| No secrets in proposed commit set | **PASS** (exclude `.env`) |

---

## 8. Remaining risks

| Risk | Priority |
|------|----------|
| Older Android APKs still hardcode 429 → “too quickly” until app update | **P1** |
| Memory vs Redis counter discontinuity across brief outages | **P2** |
| ~3s reconnect cooldown | **P2** |
| No dedicated parent device-transfer UX | **P2** |
| Historical multi-instance doc still mentions sticky latch (superseded by auto-recovery report) | **P2** docs |

---

## 9. Production configuration requirements

| Mode | Redis | Behaviour |
|------|-------|-----------|
| Single API instance | Optional | In-memory RL is bounded and safe |
| Multiple API instances | **Recommended** `REDIS_URL` | Shared counters + auto-recovery |
| Do not set prod `REDIS_URL` until approved | — | Staging verified on local Docker only |

**Android:** API+web deploy improves web immediately; Play/AAB update still required for installed-app lockout messaging (versionCode 27 base clients).

**Deploy sequence (after commit approval):** backend → web smoke → optional Redis → separate Android release.  
**Rollback:** redeploy previous API/web artifacts; no password/session wipe.

---

## 10. Final recommendation

### **READY FOR COMMIT**

Conditions for the commit (when you approve staging/commit separately):
1. Commit **only** the include lists above from `release/login-auth-only`.  
2. **Do not** commit `.env`.  
3. Prefer **omit** `docs/LOGIN_REDIS_STAGING_RESULTS.json`.  
4. Do **not** merge unrelated WIP from `fix/login-auth-reliability`.

**Awaiting your explicit approval before staging or committing.**
