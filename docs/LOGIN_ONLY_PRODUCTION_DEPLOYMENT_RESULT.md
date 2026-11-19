# Learn Wise – Login-Only Production Deployment Result

**Date (UTC):** 2026-11-18  
**VPS:** `root@201.18.220.29` (`srv2131305`) · `/var/www/siwi`  
**Approval:** Explicit user approval for login-only deploy  

---

## 1. PRE_SHA and deployed content

| Item | Value |
|------|--------|
| Branch | `feature/central-dictionary-expansion` |
| **PRE_SHA (git HEAD, unchanged)** | `39ec03d3832ecade2c6148f8e0ba6b9298a9aa74` |
| **Login content source** | `122c6275c6ca0150e54c5c47d9464d83ea4c84f5` |
| Merge tip pulled? | **No** (`7b78f3b` not deployed) |
| Level-2 `eb296fe` deployed? | **No** |
| Git HEAD moved? | **No** (path checkout only; HEAD still `PRE_SHA`) |
| Index/cached login paths | **31** (exact approved manifest) |
| Blob verify vs `122c627` | **All 31 matched** |

**Effective deployed code state:** production tree = `PRE_SHA` + login-only paths from `122c627` (staged in index; not a new commit/push).

---

## 2. Exact deployed files (31)

```
apps/mobile/app/login.tsx
apps/mobile/services/api.ts
apps/mobile/services/auth-errors.test.ts
apps/mobile/services/auth-errors.ts
apps/web/src/app/login/page.tsx
apps/web/src/lib/api.ts
apps/web/src/lib/auth-errors.test.ts
apps/web/src/lib/auth-errors.ts
apps/web/src/lib/login-submit-guard.test.ts
docs/LOGIN_AUTHENTICATION_AUDIT_REPORT.md
docs/LOGIN_AUTH_PRODUCTION_DEPLOYMENT_PLAN.md
docs/LOGIN_AUTH_PRODUCTION_READINESS_REPORT.md
docs/LOGIN_FIX_POST_IMPLEMENTATION_AUDIT.md
docs/LOGIN_FIX_PRE_IMPLEMENTATION_AUDIT.md
docs/LOGIN_ONLY_FINAL_COMMIT_REVIEW.md
docs/LOGIN_ONLY_RELEASE_ISOLATION_REPORT.md
docs/LOGIN_REDIS_AUTO_RECOVERY_REPORT.md
docs/LOGIN_REDIS_MULTI_INSTANCE_STAGING_REPORT.md
package-lock.json
server/package.json
server/scripts/staging-create-test-user.mjs
server/scripts/staging-redis-multi-instance-verify.mjs
server/src/auth/auth.routes.ts
server/src/auth/auth.service.ts
server/src/config/env.ts
server/src/lib/lockout.ts
server/src/lib/password-rate-limit.ts
server/src/lib/password.ts
server/src/lib/redis.ts
server/src/parent-auth/session.service.ts
server/tests/login-auth-fixes.test.ts
```

No Level-2 / `batch-d2` / `exports/level2-*` paths were applied.

---

## 3. Backup location and verification

| Item | Value |
|------|--------|
| Backup root | `/root/backups/login-only-20261118T164015Z` |
| PRE_SHA file | `…/PRE_SHA.txt` |
| Dirty porcelain snapshot | `…/dirty-porcelain.txt` |
| Pre-login path copies | `…/pre-login-paths/` |
| Dirty untracked tree copy | `…/dirty-tree/` |
| File count in backup | **819** |
| Checksums | `…/SHA256SUMS.txt` |
| Checksum of checksums | `1f59142fc8e26d7dd20170b8e70cfe13112a506277c37ed4468d22b9e17d3c79` |
| Backup deleted? | **No** |

Original **15 dirty paths preserved** after deploy (verified present in `git status`).

---

## 4. Dependency installation

| Step | Result |
|------|--------|
| `npm ci` | **PASS** (exit 0; ~1274 packages) |
| `ioredis` in `server/package.json` | **PASS** |
| `require('ioredis')` from app root | **PASS** |
| `npx prisma generate` | **PASS** (required after `npm ci`; **not** a migration) |
| `REDIS_URL` changed? | **No** (left unchanged) |

**Incident:** Immediately after `npm ci` + first `pm2 restart siwi-api`, API crash-looped with missing Prisma enum export (`ConsentType`) until `prisma generate`. Public health briefly **502**. Regenerating the client restored `/api/health` to **ok**. No schema migrate / DB data change.

---

## 5. API / web deployment

| Step | Result |
|------|--------|
| `pm2 restart siwi-api` | **PASS** (online after prisma generate) |
| Web `next build` | **PASS** |
| `pm2 restart siwi-web` | **PASS** (online) |
| Local `http://127.0.0.1:4100/api/health` | **PASS** (`status:"ok"`) |
| Public `https://api.siwiapp.shop/api/health` | **PASS** (`status:"ok"`) |
| `https://siwiapp.shop/login` | **PASS** (HTTP 200) |

---

## 6. Redis (no secrets)

| Check | Result |
|-------|--------|
| `REDIS_URL` present (server `.env` + PM2) | **PASS** |
| Value printed | **No** |
| TCP / RESP PING | **PASS** |
| Docker Redis PING | **PASS** |
| Config changed | **No** |
| Rate-limit keys `rl:pw:*` after smoke | **4 keys scanned** — **PASS** |
| `RATE_LIMITED` observed on login burst | **PASS** (HTTP 429, code `RATE_LIMITED`, 21 attempts) |

---

## 7. Smoke tests

Credential source: **docs demo fallback** (`admin@littlereaders.test` / `parent@littlereaders.test`).  
Production `ENSURE_DEMO_LOGINS` is **falsy**; `OTP_DEV_MODE=0`. No `SMOKE_*` credentials were configured. Demo logins returned **401** (expected when demos are disabled). **No passwords/tokens are recorded here.**

| # | Test | Result | Evidence |
|---|------|--------|----------|
| 1 | Admin successful login | **FAIL** | HTTP 401; demo admin unavailable on prod |
| 2 | Parent successful login | **FAIL** | HTTP 401; demo parent unavailable on prod |
| 3 | Incorrect password | **PASS** | HTTP 401 |
| 4 | Account lockout message | **NOT TESTED** | Skipped to avoid locking real accounts (no dedicated smoke lockout user) |
| 5 | Rate-limit message | **PASS** | HTTP 429 + `RATE_LIMITED` |
| 6 | Parent single-device conflict | **NOT TESTED** | Depends on successful parent login |
| 7 | Login timeout / network failure | **PASS** | Client short-timeout error triggered |
| 8 | Redis rate-limit operation | **PASS** | `rl:pw:*` keys present; RL code returned |
| 9 | Web login and navigation | **PASS** | `/login` HTTP 200; web online |
| 10 | Grade-1 learning journey / content | **PARTIAL** | Public `/kids` and `/kids/level-1` HTTP **200**; authenticated journey **NOT TESTED** (no parent token) |

Smoke artifact: `/root/backups/login-only-20261118T164015Z/smoke/results.json`

---

## 8. PM2 status (final)

| App | Status | Mode | Notes |
|-----|--------|------|-------|
| `siwi-api` | **online** | fork | Restarts elevated during prisma crash-loop window; stable after generate |
| `siwi-web` | **online** | cluster | Restarted after successful web build |

Instance count remains **1** API process.

---

## 9. Public health-check

| Endpoint | Result |
|----------|--------|
| `https://api.siwiapp.shop/api/health` | **PASS** — `status:"ok"`, `service:"little-readers-api"` |
| `https://siwiapp.shop/login` | **PASS** — 200 |
| `https://siwiapp.shop/kids/level-1` | **PASS** — 200 |

---

## 10. Rollback status

| Item | Status |
|------|--------|
| Rollback executed? | **No** |
| Reason | API/web healthy; rate-limit + Redis path verified; login endpoint returns expected 401/429. Admin/parent **FAIL** attributed to **missing production smoke credentials**, not API outage. |
| Backup retained? | **Yes** (`/root/backups/login-only-20261118T164015Z`) |
| Dirty 15 paths preserved? | **Yes** |

Rollback remains available via the backup + path restore procedure in `docs/LOGIN_ONLY_PRODUCTION_DEPLOYMENT_PLAN.md` if a real-account login failure is confirmed.

---

## 11. Scope compliance

| Restriction | Honored |
|-------------|---------|
| No Level-2 deploy | **Yes** |
| No DB migrate / data changes | **Yes** |
| No OTP/session policy changes beyond approved login files | **Yes** |
| No env config changes (`REDIS_URL` unchanged) | **Yes** |
| No Android / Play release | **Yes** |
| No unrelated WIP modifications | **Yes** |
| No commit/push | **Yes** |

---

## 12. Overall verdict

### **DEPLOYED WITH ATTENTION REQUIRED**

Login-only files from `122c627` are live on production (HEAD still `39ec03d`). API and web are healthy; Redis-backed `RATE_LIMITED` works.

**Required follow-up (manual, no further deploy unless requested):**
1. Verify admin + parent login with **real production accounts** (or add non-secret `SMOKE_*` test users under separate approval).  
2. Optionally re-test lockout + device conflict with a dedicated disposable smoke user.  
3. Confirm Grade-1 authenticated learning journey after a successful parent login.

**Awaiting your confirmation of real-account login**, or instruction to roll back using the retained backup.
