# Learn Wise – Login Authentication Production Deployment Checklist

**Merge commit:** `7b78f3b0d6a98cc80088b8f81a6815c6db2997b9`  
**Approved login commit:** `122c6275c6ca0150e54c5c47d9464d83ea4c84f5`  
**Target branch:** `feature/central-dictionary-expansion`  
**Companion report:** `docs/LOGIN_PRODUCTION_DEPLOYMENT_READINESS.md`  

Status legend for findings: **PASS** / **FAIL** / **NEEDS ATTENTION** / **NOT TESTED**

Do not check deploy boxes until the matching approval is granted and the step is actually performed.

---

## A. Pre-flight verification

- [x] PR #1 merged into `feature/central-dictionary-expansion` — **PASS**
- [x] Merge commit `7b78f3b` present on target tip — **PASS**
- [x] Approved commit `122c627` is ancestor of target — **PASS**
- [x] Login delta is 31 files (no unexpected replacement commits) — **PASS**
- [x] Unrelated WIP on `fix/login-auth-reliability` preserved locally — **PASS**
- [x] Backend tests 28/28 — **PASS**
- [x] Web/mobile unit tests — **PASS**
- [x] Redis staging multi-instance + auto-recovery 20/20 — **PASS** (staging)
- [ ] Production Hostinger `git rev-parse HEAD` recorded as `$PRE_SHA` — **NOT TESTED**
- [ ] Deploy scope confirmed (full tip vs login-only) — **NEEDS ATTENTION**
- [ ] Explicit backend deploy approval received — *(gate)*
- [ ] Explicit web deploy approval received — *(gate)*
- [ ] Explicit Redis Option B approval received (if needed) — *(gate; default skip)*
- [ ] Explicit Android AAB/Play approval received — *(gate; later)*

---

## B. Database / user safety

- [x] No migration required for login fixes — **PASS**
- [x] No password hash modifications — **PASS**
- [x] No user record changes required — **PASS**
- [x] No parent session deletions required — **PASS**
- [x] No OTP changes required — **PASS**
- [ ] Compared full branch delta vs live `$PRE_SHA` for surprise migrations — **NOT TESTED** (do before pull)

---

## C. Redis decision

### Option A (single instance — default)

- [x] `ecosystem.config.cjs` documents `siwi-api` `instances: 1` — **PASS**
- [ ] Live `pm2 list` confirms single API process — **NOT TESTED**
- [ ] Proceed **without** setting production `REDIS_URL` — **PASS** (plan) / awaiting deploy approval
- [x] Bounded memory fallback understood — **PASS**
- [x] DB lockout independent of Redis understood — **PASS**

### Option B (multi-instance — separate approval only)

- [ ] Redis bound to localhost / private network — **NEEDS ATTENTION**
- [ ] Redis auth or TLS configured — **NEEDS ATTENTION**
- [ ] `REDIS_URL` set on all API instances (secrets not logged) — **NOT TESTED**
- [ ] Shared counters verified — **NOT TESTED**
- [ ] Outage + bounded fallback verified — **NOT TESTED**
- [ ] Auto-recovery without API restart verified — **NOT TESTED**

---

## D. Backend deploy (execute only after approval)

- [ ] Backup / Hostinger snapshot or `pg_dump` completed
- [ ] `$PRE_SHA` written under `/root/backups/`
- [ ] `cd /var/www/siwi`
- [ ] `git fetch origin feature/central-dictionary-expansion`
- [ ] `git checkout feature/central-dictionary-expansion`
- [ ] `git pull --ff-only origin feature/central-dictionary-expansion`
- [ ] `git rev-parse HEAD` equals `7b78f3b…` (or approved login-only SHA)
- [ ] `npm ci`
- [ ] `pm2 restart siwi-api --update-env` (or documented fallback)
- [ ] `curl -fsS http://127.0.0.1:4100/api/health` (or `:3001`) OK
- [ ] `curl -fsS https://api.siwiapp.shop/api/health` OK
- [ ] No crash loop in `pm2 logs siwi-api`
- [ ] No continuous Redis error spam (unless Option B misconfigured)

### Backend rollback (if needed)

- [ ] `git checkout "$PRE_SHA"` (or established hard-reset practice)
- [ ] `npm ci`
- [ ] `pm2 restart siwi-api --update-env`
- [ ] Public health OK
- [ ] No session/password wipe performed

---

## E. Web deploy (execute only after approval)

- [ ] Same git revision as approved backend deploy
- [ ] `npm run build --workspace=@little-readers/web`
- [ ] `pm2 restart siwi-web --update-env`
- [ ] `https://siwiapp.shop/login` loads
- [ ] Hard-refresh login page

### Web rollback (if needed)

- [ ] Return web tree to `$PRE_SHA`, rebuild, restart `siwi-web`
- [ ] Login page usable

---

## F. Production smoke tests

### Admin
- [ ] Correct credentials — **NOT TESTED** (prod)
- [ ] Incorrect password — **NOT TESTED**
- [ ] Account lockout — **NOT TESTED**
- [ ] Rate limiting — **NOT TESTED**
- [ ] Login after lockout expiry — **NOT TESTED**

### Parent
- [ ] Existing parent login — **NOT TESTED**
- [ ] Incorrect password — **NOT TESTED**
- [ ] Existing-device login — **NOT TESTED**
- [ ] New-device session conflict / revoke — **NOT TESTED**
- [ ] Session refresh — **NOT TESTED**
- [ ] Logout + login again — **NOT TESTED**

### Web client
- [ ] Single request per submit — **NOT TESTED**
- [ ] Loading indicator — **NOT TESTED**
- [ ] Correct lockout vs rate-limit messages — **NOT TESTED**
- [ ] Timeout messaging — **NOT TESTED**
- [ ] Retry after failure — **NOT TESTED**
- [ ] No duplicate submissions — **NOT TESTED**

### Android (after separate AAB approval)
- [ ] versionCode incremented (27 → **28**)
- [ ] EAS production AAB built and validated
- [ ] Internal track install login checklist
- [ ] Play rollout started only after internal pass
- [ ] Rollback plan noted (no automatic downgrade)

### Redis (Option B only)
- [ ] Shared counters
- [ ] TTL expiry
- [ ] Outage path
- [ ] Bounded fallback
- [ ] Auto-recovery
- [ ] `ACCOUNT_LOCKED` ≠ `RATE_LIMITED`

---

## G. Findings summary

| ID | Priority | Item | Status |
|----|----------|------|--------|
| R-01 | P0 | Confirm production HEAD / deploy scope before `git pull` | **NEEDS ATTENTION** |
| R-02 | P0 | No production deploy until explicit approval | **PASS** (held) |
| R-03 | P1 | Android update required for installed-app lockout copy | **NEEDS ATTENTION** |
| R-04 | P1 | Harden Redis before enabling Option B | **NEEDS ATTENTION** |
| R-05 | P1 | Verify live single-instance PM2 topology | **NOT TESTED** |
| R-06 | P2 | No GitHub CI on auth PR | **NEEDS ATTENTION** |
| R-07 | P2 | Parent device-transfer UX still missing | **NEEDS ATTENTION** |
| R-08 | P2 | Off-site backup automation historically incomplete | **NEEDS ATTENTION** |
| R-09 | — | Login merge + tests | **PASS** |
| R-10 | — | DB migration not required | **PASS** |
| R-11 | — | Option A acceptable without `REDIS_URL` | **PASS** |

---

## H. Stop condition

- [x] Readiness report written: `docs/LOGIN_PRODUCTION_DEPLOYMENT_READINESS.md`
- [x] This checklist written: `docs/LOGIN_PRODUCTION_DEPLOYMENT_CHECKLIST.md`
- [x] No backend/web deploy executed
- [x] No production `REDIS_URL` change
- [x] No Android AAB/APK generated or uploaded
- [x] No production DB / user / session changes
- [x] No commit/push of these docs (local only unless separately requested)

**Await separate approval before any production configuration change, Android build, or deployment.**
