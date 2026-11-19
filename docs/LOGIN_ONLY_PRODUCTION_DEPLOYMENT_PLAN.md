# Learn Wise – Login-Only Production Deployment Plan

**Date (UTC):** 2026-11-18  
**Mode:** Preparation only — **no production mutation** in this task  
**VPS:** `root@201.18.220.29` (`srv2131305`) · `/var/www/siwi`  
**Production branch:** `feature/central-dictionary-expansion`  
**PRE_SHA (live HEAD):** `39ec03d3832ecade2c6148f8e0ba6b9298a9aa74`  
**Approved login commit:** `122c6275c6ca0150e54c5c47d9464d83ea4c84f5`  
**Approved merge commit (tip):** `7b78f3b0d6a98cc80088b8f81a6815c6db2997b9`  

**Do not execute deploy steps until separate explicit approval.**

---

## 1. Production dirty working tree (read-only)

Inspected via SSH; **not** modified, stashed, cleaned, or reset.

| Status | Path |
|--------|------|
| `D` (deleted tracked) | `apps/mobile/data/pilot-batch-d1.json` |
| `D` | `docs/documentation/siwi-3d-visual-upgrade/grade1/g1-3d-cutover-payload.json` |
| `D` | `server/scripts/apply-g1-3d-cutover.mjs` |
| `??` | `docs/curriculum/apply-additional-vocab-local.json` |
| `??` | `exports/` |
| `??` | `server/lw-cert2.tmp.ts` |
| `??` | `server/scripts/_vps-check-imageurl.mjs` |
| `??` | `server/scripts/_vps-g1-audit-readonly.mjs` |
| `??` | `server/scripts/_vps-g1-audit-readonly2.mjs` |
| `??` | `server/scripts/_vps-verify-g1-live.mjs` |
| `??` | `server/scripts/apply-l2-pilot-batch-d2-cutover.mjs` |
| `??` | `server/scripts/audit-l2-pilot-batch-d2-precutover.mjs` |
| `??` | `server/scripts/publish-grades-2-4.ts` |
| `??` | `server/storage/content-correction-work/` |
| `??` | `server/storage/vocab-media/` |

| Check | Result | Status |
|-------|--------|--------|
| Exact path overlap with **login-only** file set | **None** | **PASS** |
| Overlap with Level-2 tip content (not login) | `exports/`, L2 scripts, `server/storage/vocab-media/` | **NEEDS ATTENTION** (for full-branch pull only) |
| Dirty tree blocks login path checkout? | Unlikely — login paths clean | **PASS** (plan) |

**Implication:** Login-only path application can leave dirty L2/WIP files untouched. A full pull to `7b78f3b` would still collide with those untracked L2 paths.

---

## 2. Exact login-only change set

### Why not `PRE_SHA...7b78f3b` / `PRE_SHA...122c627` as the deploy unit

`39ec03d...122c627` lists **79 files** because history still contains intermediate commit:

1. `eb296fe` — Level-2 Types of Nouns 3D pilot assets/tooling (**exclude**)  
2. `122c627` — login reliability (**include**)  
3. `7b78f3b` — merge PR #1 (do **not** cherry-pick the merge)

### Correct login-only unit

**Commit `122c627` alone** (parent `eb296fe`).  
`git show --name-status 122c627` → **31 paths**, zero Level-2 media/exports.

### Required backend (runtime)

| Path | Change |
|------|--------|
| `server/src/auth/auth.routes.ts` | Password rate limiter wiring |
| `server/src/auth/auth.service.ts` | Login flow / lockout messaging |
| `server/src/lib/lockout.ts` | Lockout helpers |
| `server/src/lib/password.ts` | `verifyLoginPassword` compatibility |
| `server/src/lib/redis.ts` | **New** — Redis client + auto-recovery |
| `server/src/lib/password-rate-limit.ts` | **New** — Redis/memory dual store |
| `server/src/parent-auth/session.service.ts` | `SESSION_CONFLICT` copy |
| `server/src/config/env.ts` | Optional `REDIS_URL` |
| `server/package.json` | Add `ioredis` |
| `package-lock.json` | Lock `ioredis` + transitive deps |

### Required web (runtime)

| Path | Change |
|------|--------|
| `apps/web/src/app/login/page.tsx` | Single-flight + errors + timeout |
| `apps/web/src/lib/api.ts` | Optional `timeoutMs` |
| `apps/web/src/lib/auth-errors.ts` | **New** — `ACCOUNT_LOCKED` vs `RATE_LIMITED` |

### Required mobile (code only — no AAB in this plan)

| Path | Change |
|------|--------|
| `apps/mobile/app/login.tsx` | Timeout + tip only for rate limit |
| `apps/mobile/services/api.ts` | Optional `timeoutMs` |
| `apps/mobile/services/auth-errors.ts` | Code-aware messages |

### Optional / non-runtime (safe to include or skip)

- Docs: `docs/LOGIN_*.md`  
- Tests: `server/tests/login-auth-fixes.test.ts`, web/mobile `*.test.ts`  
- Staging scripts: `server/scripts/staging-create-test-user.mjs`, `staging-redis-multi-instance-verify.mjs`

### Explicitly excluded (Level-2 / unrelated)

- All `exports/level2-3d-*`  
- `server/storage/vocab-media/pilot/batch-d2/**`  
- L2 scripts (`apply-l2-pilot-*`, `upload-l2-*`, `validate-l2-*`, etc.)  
- Commit `eb296fe` itself  
- Merge commit `7b78f3b` as a cherry-pick source  
- Local WIP on `fix/login-auth-reliability`

---

## 3. Ancestry and compatibility

| Check | Result | Status |
|-------|--------|--------|
| `39ec03d` ancestor of `122c627` | **YES** | **PASS** |
| `39ec03d` ancestor of `7b78f3b` | **YES** | **PASS** |
| Parent of `122c627` | `eb296fe` | — |
| Login-touched base files identical on `39ec03d` vs `eb296fe` | **All SAME** (auth/login/api/env/password/lockout/session/`package.json`/`package-lock.json`) | **PASS** |
| New files absent on PRE_SHA | `redis.ts`, `password-rate-limit.ts`, web `auth-errors.ts`, etc. | **PASS** (additive) |
| Simulated merge-tree `39ec03d` + `122c627` | No `changed in both` / conflict markers | **PASS** |
| Cherry-pick merge `7b78f3b` | **Not recommended** (merge commit) | **NEEDS ATTENTION** |
| Blind `git pull` to tip | Brings L2 + login (79 files) + dirty collisions | **FAIL** for login-only goal |

**Conclusion:** Login changes **can** be applied onto `PRE_SHA=39ec03d` using **`122c627` only**, without requiring `eb296fe` content. Compatibility of the login patch base with production tree is **PASS**.

---

## 4. Redis verification (no secrets printed)

| Check | Result | Status |
|-------|--------|--------|
| `REDIS_URL` in PM2 `siwi-api` env | Present, non-empty | **PASS** |
| `REDIS_URL` in server/root `.env` | Present, non-empty | **PASS** |
| Scheme | `redis` (not TLS) | **NEEDS ATTENTION** (acceptable on loopback) |
| Host kind | **loopback** | **PASS** for single-host |
| Port | `6379` | **PASS** |
| Username in URL | No | — |
| Password in URL | No | **NEEDS ATTENTION** (ok if bound to localhost only) |
| TCP reachable | Yes | **PASS** |
| RESP `PING` → `PONG` | Yes | **PASS** |
| Docker Redis container present + `PONG` | Yes | **PASS** |
| `ioredis` installed on VPS today | **No** | **NEEDS ATTENTION** (expected pre-login deploy) |
| `ioredis` in live `server/package.json` / lockfile | **No** | Expected until login deps applied |
| API instance count | **1** (`siwi-api` fork) | **PASS** |

### Does merged login code use production `REDIS_URL`?

**Yes.** After login code is live, `server/src/config/env.ts` reads optional `REDIS_URL`; `redis.ts` / `password-rate-limit.ts` use it for shared counters with bounded memory fallback and auto-recovery.

Today’s running API build does **not** yet include that code, so the existing URL is configured but **unused by login RL until deploy + `ioredis` install + API restart**.

### Suitability for single API instance

| Aspect | Assessment |
|--------|------------|
| Functional fit | **Suitable** — loopback Redis + single `siwi-api` process |
| Security | No password; rely on localhost binding / host firewall (historical SEC-16). Do not expose `6379` publicly |
| Ops | Keep existing `REDIS_URL` as-is; **do not change** without separate approval |
| If Redis down | Login code falls back to bounded in-memory RL (never unlimited) |

---

## 5. Recommended deployment sequence (execute only after approval)

### 5.0 Preconditions

- [ ] Explicit approval for **login-only** production apply  
- [ ] Confirm `PRE_SHA` still `39ec03d…` (re-check immediately before action)  
- [ ] Dirty tree still has **no** overlap with login paths  
- [ ] No Android AAB in this sequence  
- [ ] No Level-2 cutover in this sequence  

### 5.1 Backup / rollback anchor

```bash
cd /var/www/siwi
PRE_SHA=$(git rev-parse HEAD)   # expect 39ec03d3832ecade2c6148f8e0ba6b9298a9aa74
echo "$PRE_SHA" > /root/backups/siwi-pre-login-only-$(date -u +%Y%m%dT%H%M%SZ).sha
git status --porcelain > /root/backups/siwi-pre-login-only-dirty-$(date -u +%Y%m%dT%H%M%SZ).txt
pm2 list | tee /root/backups/siwi-pre-login-only-pm2-$(date -u +%Y%m%dT%H%M%SZ).txt
# Prefer existing Hostinger snapshot / pg_dump practice (no migrate required for login)
```

### 5.2 Exact login-only code application method

**Preferred method (when approved): path checkout from `122c627` — not merge cherry-pick, not full pull.**

```bash
cd /var/www/siwi
git fetch origin 122c6275c6ca0150e54c5c47d9464d83ea4c84f5
# Optional: verify object
git cat-file -t 122c6275c6ca0150e54c5c47d9464d83ea4c84f5

# Apply ONLY login runtime (+ optional tests/docs/scripts). Do NOT checkout eb296fe / 7b78f3b trees.
git checkout 122c6275c6ca0150e54c5c47d9464d83ea4c84f5 -- \
  server/src/auth/auth.routes.ts \
  server/src/auth/auth.service.ts \
  server/src/lib/lockout.ts \
  server/src/lib/password.ts \
  server/src/lib/redis.ts \
  server/src/lib/password-rate-limit.ts \
  server/src/parent-auth/session.service.ts \
  server/src/config/env.ts \
  server/package.json \
  package-lock.json \
  apps/web/src/app/login/page.tsx \
  apps/web/src/lib/api.ts \
  apps/web/src/lib/auth-errors.ts \
  apps/mobile/app/login.tsx \
  apps/mobile/services/api.ts \
  apps/mobile/services/auth-errors.ts

# Optional non-runtime:
# git checkout 122c6275c6ca0150e54c5c47d9464d83ea4c84f5 -- \
#   server/tests/login-auth-fixes.test.ts \
#   apps/web/src/lib/auth-errors.test.ts \
#   apps/web/src/lib/login-submit-guard.test.ts \
#   apps/mobile/services/auth-errors.test.ts \
#   server/scripts/staging-create-test-user.mjs \
#   server/scripts/staging-redis-multi-instance-verify.mjs \
#   docs/LOGIN_AUTHENTICATION_AUDIT_REPORT.md \
#   docs/LOGIN_AUTH_PRODUCTION_DEPLOYMENT_PLAN.md \
#   docs/LOGIN_AUTH_PRODUCTION_READINESS_REPORT.md \
#   docs/LOGIN_FIX_POST_IMPLEMENTATION_AUDIT.md \
#   docs/LOGIN_FIX_PRE_IMPLEMENTATION_AUDIT.md \
#   docs/LOGIN_ONLY_FINAL_COMMIT_REVIEW.md \
#   docs/LOGIN_ONLY_RELEASE_ISOLATION_REPORT.md \
#   docs/LOGIN_REDIS_AUTO_RECOVERY_REPORT.md \
#   docs/LOGIN_REDIS_MULTI_INSTANCE_STAGING_REPORT.md

git status --porcelain   # expect login paths staged/modified; dirty L2 leftovers unchanged
```

**Alternate (when approved):** `git cherry-pick 122c627` while staying on `feature/central-dictionary-expansion` at `39ec03d`.  
Do **not** cherry-pick `7b78f3b`.  
Do **not** `git pull` / merge tip (pulls Level-2).

Leave production dirty L2/WIP files alone unless a separate cleanup is approved.

### 5.3 Dependency installation

Required because `ioredis` is **not** installed on the VPS today:

```bash
cd /var/www/siwi
npm ci
# Confirm without printing secrets:
node -e "require('ioredis'); console.log('ioredis_ok')"
```

No Prisma migrate. Do not change `.env` / `REDIS_URL`.

### 5.4 API restart + health

```bash
pm2 restart siwi-api --update-env
curl -fsS http://127.0.0.1:4100/api/health
curl -fsS https://api.siwiapp.shop/api/health
pm2 logs siwi-api --lines 80 --nostream
# Expect no crash loop; optional [rate-limit] Redis lines only if issues
```

### 5.5 Web build + restart

Web login UX requires a Next rebuild:

```bash
cd /var/www/siwi
npm run build --workspace=@little-readers/web
pm2 restart siwi-web --update-env
# Smoke:
curl -fsS -o /dev/null -w "%{http_code}\n" https://siwiapp.shop/login || true
```

### 5.6 Login smoke tests (approved test accounts only)

**Admin:** correct login; wrong password; lockout (`ACCOUNT_LOCKED`); careful rate-limit check; post-lockout expiry.  
**Parent:** existing login; wrong password; same-device; new-device revoke/conflict messaging; refresh; logout/login.  
**Web:** single-flight submit; loading state; distinct lockout vs rate-limit copy; timeout; retry.  
**Redis:** with existing loopback URL — counters persist across requests; outage still bounded (optional controlled test); `ACCOUNT_LOCKED` ≠ `RATE_LIMITED`.  
**Android store clients:** messaging may remain generic until separate AAB — document, do not block API/web.

### 5.7 Rollback to PRE_SHA

```bash
cd /var/www/siwi
# Restore login paths from recorded PRE_SHA (dirty L2 files stay untouched)
git checkout 39ec03d3832ecade2c6148f8e0ba6b9298a9aa74 -- \
  server/src/auth/auth.routes.ts \
  server/src/auth/auth.service.ts \
  server/src/lib/lockout.ts \
  server/src/lib/password.ts \
  server/src/parent-auth/session.service.ts \
  server/src/config/env.ts \
  server/package.json \
  package-lock.json \
  apps/web/src/app/login/page.tsx \
  apps/web/src/lib/api.ts \
  apps/mobile/app/login.tsx \
  apps/mobile/services/api.ts \
  apps/mobile/services/auth-errors.ts
# Remove files that did not exist on PRE_SHA
rm -f server/src/lib/redis.ts \
      server/src/lib/password-rate-limit.ts \
      apps/web/src/lib/auth-errors.ts
npm ci
pm2 restart siwi-api --update-env
npm run build --workspace=@little-readers/web
pm2 restart siwi-web --update-env
curl -fsS https://api.siwiapp.shop/api/health
```

Do **not** wipe sessions/passwords or unset `REDIS_URL` as rollback.

---

## 6. Risks and gates

| ID | Priority | Item | Status |
|----|----------|------|--------|
| LO-01 | P0 | Full tip pull is **not** login-only | **PASS** (avoided by this plan) |
| LO-02 | P0 | Dirty tree preserved; no overlap with login paths | **PASS** |
| LO-03 | P0 | Apply `122c627` paths only; never assume merge cherry-pick | **PASS** (method) |
| LO-04 | P1 | Must `npm ci` for `ioredis` before API uses Redis RL | **NEEDS ATTENTION** until deploy |
| LO-05 | P1 | Redis has no password (loopback) — leave config unchanged | **NEEDS ATTENTION** (ops) |
| LO-06 | P1 | Android lockout copy needs separate AAB | **NEEDS ATTENTION** |
| LO-07 | P2 | Optional docs/tests/scripts not required for runtime | **PASS** |

---

## 7. Final recommendation

**READY TO DEPLOY (login-only)** after explicit approval, using:

1. Record `PRE_SHA=39ec03d…`  
2. `git checkout 122c627 -- <login file list>` (not pull, not merge cherry-pick)  
3. `npm ci` → restart `siwi-api` → build/restart `siwi-web`  
4. Smoke tests  
5. Keep dirty L2/WIP untouched; keep `REDIS_URL` unchanged  

**Not authorized by this document:** any production git write, install, restart, build, env change, or Android release.

---

## 8. Stop condition

Plan prepared at `docs/LOGIN_ONLY_PRODUCTION_DEPLOYMENT_PLAN.md`.  

**Awaiting your separate explicit approval before any production action.**
