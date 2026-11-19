# Learn Wise – Login Authentication Production Deployment Readiness

**Date:** 2026-11-18  
**Mode:** READ-ONLY preparation (no deploy, no prod Redis/env change, no AAB, no DB mutation, no commit/push)  
**Repository:** https://github.com/siddardhapabbu5-dot/little-readers  
**Merged PR:** https://github.com/siddardhapabbu5-dot/little-readers/pull/1  

---

## 1. Verified merged commit

| Item | Value | Status |
|------|--------|--------|
| Target branch | `feature/central-dictionary-expansion` | **PASS** |
| Merge commit | `7b78f3b0d6a98cc80088b8f81a6815c6db2997b9` | **PASS** |
| Approved login commit (parent) | `122c6275c6ca0150e54c5c47d9464d83ea4c84f5` | **PASS** |
| Prior target tip (other parent) | `eb296fe3a03e1828b48dab87b24b510a4245e285` | **PASS** |
| Commits after merge on target | None (tip still `7b78f3b`) | **PASS** |
| Files in login delta (`eb296fe…7b78f3b`) | **31** | **PASS** |
| Unrelated commits replacing login | None | **PASS** |

### Local review context

| Location | Branch / HEAD | Notes |
|----------|---------------|--------|
| Worktree `SIWI-login-auth-only` | `release/login-auth-only` @ `122c627` | Source of merge; docs written here |
| Main workspace | `fix/login-auth-reliability` @ `eb296fe` + dirty WIP | **Preserved / untouched** |
| Remote target | `origin/feature/central-dictionary-expansion` @ `7b78f3b` | Contains login merge |

### Login-only change set included

**Backend:** `auth.routes.ts`, `auth.service.ts`, `lockout.ts`, `password.ts`, `redis.ts`, `password-rate-limit.ts`, `session.service.ts`, `env.ts` (`REDIS_URL` optional), `server/package.json` (+ `ioredis`), lockfile, staging scripts, `login-auth-fixes.test.ts`  

**Web:** `apps/web/src/app/login/page.tsx`, `lib/api.ts`, `lib/auth-errors.ts` (+ tests / submit guard)  

**Mobile:** `apps/mobile/app/login.tsx`, `services/api.ts`, `services/auth-errors.ts` (+ test)  

**Docs:** `docs/LOGIN_*` (planning/audit/staging reports)

### Pre-merge test evidence (re-run at merge time)

| Suite | Result | Status |
|-------|--------|--------|
| Backend auth suites | **28/28 PASS** | **PASS** |
| Web/mobile unit (`tsx`) | **PASS** | **PASS** |
| Redis multi-instance + auto-recovery staging | **20/20 PASS** (local Docker) | **PASS** (staging only) |
| GitHub Actions on PR | None configured | **NOT TESTED** (no CI) |

---

## 2. Current production architecture

Sources: `ecosystem.config.cjs`, Hostinger go-live scripts under `docs/curriculum/HOSTINGER-*.txt`, `docs/ops/DEPLOYMENT_SEQUENCE.md`, `docs/ops/ENVIRONMENT_VARIABLES.md`, `docs/LEARN_WISE_COMPLETE_AUDIT.md`, live health probe.

| Component | Documented value | Status |
|-----------|------------------|--------|
| Public API | `https://api.siwiapp.shop/api` | **PASS** (health OK this review) |
| Public web | `https://siwiapp.shop` | **NEEDS ATTENTION** (login HEAD probe inconclusive from this shell) |
| Login endpoint | Express `POST /api/auth/login` (`server/src/auth/auth.routes.ts`) | **PASS** |
| Nest `apps/api` | Health-only scaffold; **not** the login service | **PASS** |
| Deploy root | `/var/www/siwi` | **PASS** (ops scripts) |
| Process manager | **PM2** preferred; `systemctl restart siwi-api` fallback | **PASS** (documented) |
| API process | PM2 name **`siwi-api`**, cwd `/var/www/siwi/server`, `tsx … src/index.ts` | **PASS** (`ecosystem.config.cjs`) |
| Web process | PM2 name **`siwi-web`**, cwd `/var/www/siwi/apps/web`, `next start -p 3100` | **PASS** |
| API instances | `instances: 1`, `exec_mode: "fork"` | **PASS** (config = single instance) |
| Local health | `http://127.0.0.1:4100/api/health` (fallback `3001` in scripts) | **PASS** (scripted) |
| Public health | `GET https://api.siwiapp.shop/api/health` → `status:"ok"`, `service:"little-readers-api"` | **PASS** |
| Node | `engines.node: ">=20"` | **PASS** (repo requirement) |
| Package manager | npm workspaces + root `package-lock.json` | **PASS** |
| Trust proxy | `app.set("trust proxy", 1)` for client IP / RL keys | **PASS** |
| Current production git SHA | **Not readable without Hostinger SSH** | **NOT TESTED** |
| Historical audit SHA | Audit once recorded prod at `336d01a` (may be stale) | **NEEDS ATTENTION** |

**P0 process gate:** Before deploying, record production `git rev-parse HEAD` in `/var/www/siwi`. If production is **behind** `eb296fe`, a full `git pull` of `feature/central-dictionary-expansion` will ship **central-dictionary content plus login**, not login alone. Prefer confirming prod already tracks that branch near `eb296fe`, or deploy only the login delta (`122c627`) onto the recorded prod tip after separate approval of scope.

---

## 3. Backend deployment instructions

### Prerequisites

1. Explicit **production deploy approval** for this login release.  
2. Record pre-deploy SHA and PM2 status on the VPS.  
3. Confirm whether deploy scope is **branch tip `7b78f3b`** or **login-only cherry-pick**.  
4. Do **not** set `REDIS_URL` in this step unless Option B is separately approved.  
5. No Prisma migrate. No password/session surgery.

### Pre-deployment backup (from established ops pattern)

```bash
# On Hostinger (root) — record state; use existing backup practice
cd /var/www/siwi
git rev-parse HEAD > /root/backups/siwi-pre-login-auth-$(date +%Y%m%d%H%M%S).sha
pm2 list
# Prefer existing Hostinger/Postgres snapshot or pg_dump to /root/backups (OPS docs).
# Off-host copy recommended (OPS-01 still open historically).
```

### Dependency install + code update (exact commands from Hostinger script style)

```bash
set -e
cd /var/www/siwi

git fetch origin feature/central-dictionary-expansion
git checkout feature/central-dictionary-expansion
git pull --ff-only origin feature/central-dictionary-expansion
git rev-parse HEAD   # expect 7b78f3b0d6a98cc80088b8f81a6815c6db2997b9 if tip unchanged

# Install workspace deps so ioredis is present (required after lockfile change)
npm ci

# Optional local verification on the server (uses server test DB settings — skip if unsafe on prod DB)
# cd server && npx vitest run tests/login-auth-fixes.test.ts tests/auth-lockout.test.ts tests/auth.test.ts
```

API runtime per `ecosystem.config.cjs` is **tsx on TypeScript sources** (no mandatory `server` dist build for the current PM2 path). If ops later switches to `npm run start` (`node dist/index.js`), run `npm run build --workspace=@little-readers/server` before restart.

### Service restart + health

```bash
if command -v pm2 >/dev/null 2>&1; then
  pm2 restart siwi-api --update-env || pm2 restart all --update-env
else
  systemctl restart siwi-api || true
fi

curl -fsS http://127.0.0.1:4100/api/health || curl -fsS http://127.0.0.1:3001/api/health
curl -fsS https://api.siwiapp.shop/api/health
pm2 logs siwi-api --lines 100   # watch for crash loops / [rate-limit] Redis warnings
```

### Rollback sequence (backend)

```bash
cd /var/www/siwi
# PRE_SHA must be the value recorded before deploy — do not invent
git checkout "$PRE_SHA"
# or: git reset --hard "$PRE_SHA"  (only if that is your established Hostinger practice)
npm ci
pm2 restart siwi-api --update-env || pm2 restart all --update-env
curl -fsS https://api.siwiapp.shop/api/health
```

Do **not** delete parent sessions or reset passwords as rollback.

---

## 4. Web deployment instructions

| Item | Documented value | Status |
|------|------------------|--------|
| App | Next.js `apps/web` | **PASS** |
| PM2 | `siwi-web`, `next start -p 3100` | **PASS** |
| API URL | `NEXT_PUBLIC_API_URL=https://api.siwiapp.shop/api` | **PASS** (ops docs) |
| Build | `npm run build --workspace=@little-readers/web` (or cwd `apps/web` → `next build`) | **PASS** |
| Login files | `/login` page + `auth-errors` + API `timeoutMs` | **PASS** |

### Exact commands (after same git pull / `npm ci` as backend)

```bash
cd /var/www/siwi
npm run build --workspace=@little-readers/web

if command -v pm2 >/dev/null 2>&1; then
  pm2 restart siwi-web --update-env || pm2 restart all --update-env
else
  # no alternate documented for web beyond pm2 in ecosystem.config.cjs
  echo "Restart siwi-web via pm2"
fi

# Smoke
curl -fsS -o /dev/null -w "%{http_code}\n" https://siwiapp.shop/login || true
```

Hard-refresh browser `/login` after deploy. Web gains lockout/rate-limit messaging and single-flight protection immediately (no store review).

### Web rollback

Redeploy previous web build at recorded `$PRE_SHA` (rebuild + `pm2 restart siwi-web`). Keep API/DB as decided independently.

---

## 5. Redis production requirements

### Answers (evidence-based)

| # | Question | Answer | Status |
|---|----------|--------|--------|
| 1 | Single vs multi API instance? | **Configured single** (`ecosystem.config.cjs` `instances: 1`) | **PASS** (config) / live process count **NOT TESTED** without SSH |
| 2 | Redis installed/running in prod? | Historical audit: Docker Redis present on VPS; also in `docker-compose.yml` | **NEEDS ATTENTION** (current state **NOT TESTED**) |
| 3 | Production `REDIS_URL` configured? | Code treats it as **optional**; this release must **not** set it without approval | **NOT TESTED** (do not probe secrets) |
| 4 | Connection secure? | Historical: Redis without password / broad bind noted as SEC-16 | **NEEDS ATTENTION** |
| 5 | Auth/TLS required? | Prefer password + localhost bind (or TLS URL) before enabling shared RL | **NEEDS ATTENTION** |
| 6 | Reachable from every API instance? | With one instance, localhost Redis is enough if enabled | **NEEDS ATTENTION** until verified |
| 7 | Counters shared across instances? | Only when `REDIS_URL` set **and** Redis healthy | **PASS** (code + staging) |
| 8 | Bounded fallback when Redis down? | Yes — same max attempts; never unlimited | **PASS** |
| 9 | Auto-recovery without API restart? | Yes — 3s cooldown + single `connectInFlight` client | **PASS** (staging 20/20) |

### Option A – Single API instance (matches current ecosystem config)

- **Acceptable** to deploy login fixes **without** setting production `REDIS_URL`.  
- Bounded **in-memory** password rate limiting remains active.  
- DB account lockout (`failedLoginCount` / `loginLockedUntil`) is independent of Redis.  
- **Operational limits:** if a second API process is started later without Redis, counters are **per process** (attackers can multiply attempt budget). Global `/api` limiter remains memory-only (out of scope).

### Option B – Multiple API instances (separate approval)

Require shared Redis-backed limiting:

1. Confirm Redis listens on localhost (or private network), not public internet.  
2. Set password (or TLS) — do not leave open Redis.  
3. Set `REDIS_URL` only in server env on Hostinger (never commit).  
4. Ensure **every** `siwi-api` instance uses the **same** `REDIS_URL`.  
5. `pm2 restart siwi-api --update-env` (or all API instances).  
6. Monitor `[rate-limit] Redis` warnings; verify shared keys `rl:pw:…` and TTL.  
7. Confirm auto-recovery after brief Redis stop without API restart.

**Do not change production `REDIS_URL` or restart Redis in this readiness task.**

---

## 6. Android release plan

| Item | Value | Status |
|------|--------|--------|
| Package ID | `com.littlereaders.app` | **PASS** |
| Display name | Learn Wise | **PASS** |
| versionName in merged tree | `1.0.0` | **PASS** |
| versionCode in merged tree | **27** (`apps/mobile/app.json`) | **PASS** |
| Production API (EAS) | `https://api.siwiapp.shop/api` | **PASS** |
| Login compatibility | Additive API `code` + messages; old apps ignore `code` | **PASS** |
| Old clients lockout UX | Still generic “too quickly” on all 429 | **NEEDS ATTENTION** (P1) |
| EAS production profile | AAB (`eas.json` `production`) | **PASS** |
| Signing | EAS-managed upload key / local Gradle props (docs) | **PASS** (do not change keys) |

### Recommended next release (do not build until approved)

1. **versionCode:** increment **27 → 28** (every Play upload must increase).  
2. **versionName:** keep `1.0.0` or bump to `1.0.1` if you want a user-visible patch label.  
3. Include login files already on `7b78f3b` (`login.tsx`, `api.ts`, `auth-errors.ts`). Do **not** pull unrelated WIP from `fix/login-auth-reliability`.  
4. Build (when approved):

```bash
cd apps/mobile
eas build --platform android --profile production   # AAB
# Internal validation APK (optional):
# eas build --platform android --profile preview
```

5. **AAB validation:** package ID, versionCode 28, production API URL, signed with upload key (not debug).  
6. **Login test checklist:** correct login; wrong password; lockout copy ≠ rate-limit tip; device conflict copy; timeout; single in-flight submit; no demo flag (`EXPO_PUBLIC_ENABLE_DEMO=0`).  
7. **Play sequence:** Internal testing → closed (if required) → production rollout; monitor crashes.  
8. **Rollback:** Halt rollout / use Play previous release; **users are not automatically downgraded**. Backend must remain compatible with old APKs (it does).

**Do not generate AAB/APK or upload to Play in this task.**

---

## 7. Database impact

| Check | Result | Status |
|-------|--------|--------|
| Prisma migration required for login fixes | **No** | **PASS** |
| Password hash rewrite | **No** (`verifyLoginPassword` only) | **PASS** |
| User record mutation required | **No** | **PASS** |
| Parent session deletion required | **No** | **PASS** |
| OTP schema/API change | **No** | **PASS** |
| Production data cleanup | **No** | **PASS** |
| Existing lockout columns | Already present (`failedLoginCount`, `loginLockedUntil`) | **PASS** |

**No migration or data-change approval is required for this login deploy.** If any unexpected migration appears in the full branch delta when comparing to **actual** prod HEAD, **STOP** and request separate approval.

---

## 8. Smoke test checklist (post-deploy)

Use **approved test accounts only**. Never log passwords, OTPs, tokens, or Redis credentials.

### Admin
1. Correct email/password → success  
2. Incorrect password → generic invalid credentials  
3. Account lockout after repeated failures → `ACCOUNT_LOCKED` / lockout message (web)  
4. Rate limiting after burst → `RATE_LIMITED` (careful on prod)  
5. Login after lockout expiry (test account only)

### Parent
1. Existing parent login  
2. Incorrect password  
3. Existing-device login (`deviceId`)  
4. New-device login → prior session revoked / conflict messaging on old device  
5. Session refresh / `/auth/me`  
6. Logout and login again

### Web and Android (new build)
1. One login request per submission  
2. Loading indicator + disabled controls  
3. Correct error messages (`ACCOUNT_LOCKED` vs `RATE_LIMITED` vs timeout)  
4. Network timeout (~25s) messaging  
5. Retry after failure  
6. No duplicate submissions

### Redis (only if Option B enabled)
1. Shared counters across instances  
2. TTL expiry  
3. Redis outage → API still responds  
4. Bounded fallback (not unlimited)  
5. Automatic recovery without API restart  
6. `ACCOUNT_LOCKED` remains distinct from `RATE_LIMITED`

---

## 9. Rollback instructions

| Layer | Action | Notes |
|-------|--------|--------|
| Backend | Redeploy recorded `$PRE_SHA`; `npm ci`; `pm2 restart siwi-api` | Do not invent SHA |
| Web | Rebuild/restart `siwi-web` at `$PRE_SHA` | |
| Redis config | If `REDIS_URL` was newly set, remove/unset only with approval; restart API | Leaving Redis unused is harmless |
| Android | Play halt / previous track | No automatic user downgrade |
| DB / users | **No** password resets, session wipes, or migrates for rollback | |

**Last-known-good production commit:** **NOT verified in this review** (requires Hostinger `git rev-parse HEAD`). Historical audit mentioned `336d01a` — treat as **stale unless reconfirmed**. Artifact identity for PM2 is the git tree under `/var/www/siwi` plus built Next `.next` output.

---

## 10. Risks and blockers

### P0
| Finding | Status | Notes |
|---------|--------|--------|
| Unconfirmed production HEAD vs branch tip | **NEEDS ATTENTION** | Full pull may ship non-login dictionary work if prod is old |
| Deploy without separate approval | **PASS** (blocked by process) | This doc does not authorize deploy |

### P1
| Finding | Status | Notes |
|---------|--------|--------|
| Android store update for lockout messaging | **NEEDS ATTENTION** | versionCode 28+ release required |
| Production Redis security (password/bind) before Option B | **NEEDS ATTENTION** | Historical SEC-16 |
| Confirm live PM2 instance count = 1 | **NOT TESTED** | Config says 1 |

### P2
| Finding | Status | Notes |
|---------|--------|--------|
| No GitHub CI on auth PRs | **NEEDS ATTENTION** | Rely on local/staging tests |
| Parent device-transfer UX | **NEEDS ATTENTION** | Remains P2 product; policy unchanged |
| Brief RL counter discontinuity across Redis failover | **PASS** (accepted) | Auto-recovery mitigates sticky latch |
| Off-site backup automation | **NEEDS ATTENTION** | Historical OPS-01 |

---

## 11. Required approvals (stop gates)

1. **This readiness document** — complete (no deploy executed).  
2. Explicit approval to **deploy backend** (and confirm deploy scope: tip `7b78f3b` vs login-only).  
3. Explicit approval to **deploy web**.  
4. Separate approval to set production **`REDIS_URL`** / harden Redis (Option B).  
5. Separate approval to **bump Android versionCode**, build AAB, and upload to Play.  
6. Production smoke tests on approved accounts after each layer.

---

## Final readiness verdict

### **NEEDS ATTENTION** (ready to deploy **after** gates below)

Login code on `7b78f3b` is merged, tested, DB-safe, and compatible with single-instance Option A **without** Redis env changes.

**Before any production action, obtain:**
- Confirmation of current Hostinger git SHA / that pull scope is accepted  
- Explicit backend deploy approval  
- Explicit web deploy approval  

Android Play update and Redis Option B remain **separate** approvals.

**Production was not deployed. Redis was not changed. No AAB was generated.**
