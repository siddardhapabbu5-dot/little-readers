# Level-1 — Staging Environment Plan (Android acceptance)

**Date:** 2026-11-19  
**Status:** **PHASES 1–3 EXECUTED — awaiting owner approval to install staging APK on SM-S921B**  
**Purpose:** Unblock remaining Grade-1 Android AD cases safely on a **non-production** stack.  
**Current Android gate:** 23 PASS / 0 FAIL / 10 BLOCKED (`LEVEL1_ANDROID_DEVICE_ACCEPTANCE.md`)

**Install / AD-06…33 execution not started** until owner approves replacing prod-pointed VC27 on the phone.

---

## 1. Environment audit summary

| Area | Current state | Implication |
|------|---------------|-------------|
| Device under test | Samsung SM-S921B · `com.littlereaders.app` VC27 | Points at **production** API |
| Mobile default API | `apps/mobile/services/api.ts` → `EXPO_PUBLIC_API_URL` or fallback `https://api.siwiapp.shop/api` | Release APK without override = prod |
| EAS `staging` / `preview` / `production` / `development` | All set `EXPO_PUBLIC_API_URL=https://api.siwiapp.shop/api` | Named “staging” profile is **not** isolated |
| EAS `smoke-local` | `http://192.168.1.20:4100/api` + `LR_ALLOW_CLEARTEXT=1` | Only profile designed for LAN HTTP API |
| Cleartext | `apps/mobile/app.config.js` enables `usesCleartextTraffic` when `LR_ALLOW_CLEARTEXT=1` | Required for `http://` LAN API APKs |
| Local Postgres | Docker `little-readers-db` · host port **5437** (compose) | **Healthy** (observed) |
| Local Redis | Compose service `redis` → **6379**; container `siwi-staging-redis` observed up | Login rate-limit shared counters |
| Local API process | Default `PORT=4100` (`server/src/config/env.ts`) | **Not running** at last check (`127.0.0.1:4000/4100` health failed) |
| Staging APK on disk | None (only prod-API VC27 APK) | Must build after approval |
| Production API | `https://api.siwiapp.shop/api` health OK | Must remain read-only / untouched |

---

## 2. Target architecture (isolated)

```
SM-S921B  --HTTP LAN-->  Host:4100/api  -->  Postgres localhost:5437
                              |                    (Docker little-readers-db)
                         Redis localhost:6379
                         (Docker / siwi-staging-redis)
```

| Rule | Enforcement |
|------|-------------|
| Staging DB only | `DATABASE_URL` must use `localhost` / `127.0.0.1` and port **5437** (or other explicitly approved local port) |
| No prod DB URL | Abort if `DATABASE_URL` contains `siwiapp`, production hostnames, or non-local hosts |
| Staging API only | Mobile APK baked with LAN `EXPO_PUBLIC_API_URL` (never `api.siwiapp.shop`) |
| No prod payments | `PAYMENT_ENABLED` optional; if on, **`rzp_test_` only** — never live keys |
| No prod mutate | No scripts against production; no deploy; no Play upload |

---

## 3. How to run a separate staging API

### 3.1 Dependencies

- Docker Desktop (Postgres + Redis already compose-defined)
- Node / npm workspace (`@little-readers/server`)
- Local `.env` at repo root (from `.env.example`) — **never commit secrets**
- Phone and PC on **same LAN**; Windows Firewall allow inbound TCP **4100**

### 3.2 Bring up data plane

```powershell
cd "C:\Users\harsh\OneDrive\Documents\Desktop\SIWI-login-auth-only"
docker compose up -d postgres redis
docker ps --format "{{.Names}}`t{{.Ports}}`t{{.Status}}"
```

Expected: Postgres `0.0.0.0:5437->5432`, Redis `0.0.0.0:6379->6379`.

### 3.3 Required / recommended server env (local `.env`)

| Variable | Staging value (plan) | Notes |
|----------|----------------------|-------|
| `NODE_ENV` | `development` | Enables safe local switches |
| `PORT` | `4100` | Matches `smoke-local` / server default |
| `DATABASE_URL` | `postgresql://…@localhost:5437/little_readers?schema=public` | **Isolation gate** |
| `REDIS_URL` | `redis://localhost:6379` | Lockout / rate-limit counters |
| `JWT_SECRET` | local ≥32 char non-placeholder | Distinct from production |
| `ALLOW_DEMO` | `1` | Demo logins allowed locally only; boot refuses in production |
| `OTP_DEV_MODE` | `1` | Console OTP for local testing |
| `PASSWORD_RESET_LOG_ONLY` | `true` | Reset tokens logged, not emailed |
| `SMS_PROVIDER` | `console` | No real SMS |
| `CORS_ORIGIN` | include Metro / web local origins as needed | |
| `APP_PUBLIC_URL` | `http://localhost:3100` (or LAN web) | Reset links |
| `PAYMENT_ENABLED` | `false` unless sandbox required | If true: `rzp_test_` only |
| `RAZORPAY_KEY_ID` | unset or `rzp_test_…` | Never live |

**Pre-start isolation check (mandatory before any mutate):**

```powershell
# Fail closed if DATABASE_URL is not local staging
$u = $env:DATABASE_URL
if ($u -notmatch 'localhost:5437|127\.0\.0\.1:5437') { throw "STOP: DATABASE_URL not local :5437" }
if ($u -match 'siwiapp|amazonaws|neon\.tech|supabase') { throw "STOP: prod-like DATABASE_URL" }
```

(Prior acceptance scripts used the same class of gate, e.g. `_staging-admin-acceptance.ts`.)

### 3.4 Start API (after approval)

```powershell
cd "C:\Users\harsh\OneDrive\Documents\Desktop\SIWI-login-auth-only\server"
# Ensure root .env loaded (server env.ts loads ../../../.env)
npm run db:generate
# Migrate/seed only on local DB after isolation check — approval required
# npm run db:migrate:deploy
# npm run db:seed
npm run dev
```

Health:

```powershell
Invoke-WebRequest "http://127.0.0.1:4100/api/health" -UseBasicParsing
# From phone LAN IP (example — replace with current host IP):
# http://<HOST_LAN_IP>:4100/api/health
```

### 3.5 Discover host LAN IP for the phone

```powershell
Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.IPAddress -notlike '127.*' } |
  Select-Object IPAddress, InterfaceAlias
```

Update the staging APK URL to `http://<HOST_LAN_IP>:4100/api` (do **not** assume `192.168.1.20` without verifying).

---

## 4. How to build a staging-pointed Android APK (plan — not executed)

### 4.1 Preferred profile

Reuse **`smoke-local`** semantics:

- `EXPO_PUBLIC_API_URL=http://<HOST_LAN_IP>:4100/api`
- `LR_ALLOW_CLEARTEXT=1` (HTTP cleartext)
- `EXPO_PUBLIC_ENABLE_DEMO=0` (use dedicated test parent, not demo affordances, unless approved)
- Same package `com.littlereaders.app` (overwrites device VC27 when installed — **approval required**)

**Do not use EAS profile name `staging` as-is** — it currently points at production API.

### 4.2 Planned local assemble (mirrors VC27 method; secrets redacted)

```bat
set EXPO_PUBLIC_API_URL=http://<HOST_LAN_IP>:4100/api
set EXPO_PUBLIC_ENABLE_DEMO=0
set LR_ALLOW_CLEARTEXT=1
set EXPO_NO_METRO_WORKSPACE_ROOT=1
cd apps\mobile\android
gradlew.bat assembleRelease ^
  -PLW_UPLOAD_STORE_FILE=<release.jks path> ^
  -PLW_UPLOAD_KEY_ALIAS=<redacted> ^
  -PLW_UPLOAD_STORE_PASSWORD=<redacted> ^
  -PLW_UPLOAD_KEY_PASSWORD=<redacted>
```

Post-build verification (mandatory):

1. Strings in `index.android.bundle`: LAN API host present; **`api.siwiapp.shop` absent** (or document if residual unused string).  
2. `ACCOUNT_LOCKED` / `RATE_LIMITED` present if testing AD-06.  
3. Artifact copied to `exports/` with clear name, e.g. `LearnWise-staging-lan-vc27.apk`.  
4. **Do not** Play-upload.

### 4.3 Install policy (after separate approval)

- Prefer installing staging APK only when owner agrees to replace prod VC27 temporarily.  
- Keep `exports/LearnWise-1.0.0-vc27-login-only.apk` to reinstall production-pointed binary afterward.  
- **No** `adb shell pm clear` (app-data clear forbidden unless explicitly approved later).

Optional future (needs separate product approval): distinct `applicationId` suffix so staging and prod coexist — **out of scope** unless requested (touches app identity).

---

## 5. Confirm staging cannot touch production

| Control | How |
|---------|-----|
| DB isolation | Local Docker volume only; URL gate before scripts |
| API bind | Listen on LAN/localhost; no tunnel to prod DB |
| Mobile binary | Staging APK URL ≠ `api.siwiapp.shop` |
| Secrets | Distinct `JWT_SECRET`; no prod `.env` reuse |
| Payments | Test keys only / payments off |
| Deploy | No VPS/Hostinger deploy; no migrate against prod |
| Accounts | Create parents only in local DB (Phase 2 plan — not yet) |

**Production remains:** `https://api.siwiapp.shop` + existing prod VC27 artifact for rollback install.

---

## 6. Risks and rollback

| Risk | Mitigation / rollback |
|------|------------------------|
| Wrong `DATABASE_URL` | Hard abort gate; never run seed/migrate without check |
| Staging APK still hits prod | Bundle string audit before install |
| Phone cannot reach LAN API | Firewall, correct IP, cleartext flag, same Wi‑Fi |
| Overwriting prod VC27 on device | Keep prod APK; `adb install -r` prod artifact to restore |
| Redis conflict between projects | Use compose Redis on 6379; avoid pointing staging at unknown Redis DBs |
| Seed wipes local curriculum | Prefer additive test fixtures; backup volume or document restore via `db:restore-curriculum` if needed |
| Cleartext HTTP MITM on LAN | Use only trusted Wi‑Fi; staging credentials only |

**Rollback steps (API/DB):**

```powershell
# Stop API process (Ctrl+C / stop npm run dev)
docker compose stop   # or stop only if approved — data volume retained by default
```

**Rollback steps (device):**

```powershell
adb install -r "…\exports\LearnWise-1.0.0-vc27-login-only.apk"
```

---

## 7. Approval checklist (Phase 1)

- [ ] Approve local API on `:4100` + Docker Postgres/Redis as the Android staging backend  
- [ ] Approve staging APK build with LAN URL + cleartext (no Play upload)  
- [ ] Approve temporary device install replacing VC27 (or wait for alternate applicationId)  
- [ ] Confirm current host LAN IP for bake-in URL  
- [ ] Explicitly forbid any production DB URL, deploy, or owner-account lockout  

---

## 8. Execution status (2026-11-19) — Phases 1–3

### Phase 1 — Isolated local staging API

| Check | Result |
|-------|--------|
| Postgres `localhost:5437` | **UP** (`little-readers-db`) |
| Redis `localhost:6379` | **UP** (`siwi-staging-redis`) |
| `.env` `DATABASE_URL` | **localhost:5437** only (isolation OK) |
| Razorpay | `rzp_test_` only |
| API process | **RUNNING** `NODE_ENV=development` `PORT=4100` |
| Health `127.0.0.1:4100` | **200** |
| Health `192.168.1.20:4100` | **200** |
| EAS production profile | **Unchanged** |
| Production DB/API mutate | **None** |

Note: Host shell had `NODE_ENV=production` override; API started with explicit `NODE_ENV=development`.

### Phase 2 — Fixtures (local DB only)

| Fixture | Result |
|---------|--------|
| Parent email (masked) | `qa.***@test.local` |
| Child | `AD Child G1` · LEVEL_1 · `hasLearningSeat=true` |
| Subscription | ACTIVE yearly · `providerRef=staging_android_ad_yearly` · local only |
| Content | 10 published L1 categories · 750 active L1 words |
| Login smoke | HTTP 200 + access token (password not logged) |
| Credentials file | `.secrets/android-ad-staging-credentials.env` (gitignored) |
| Reset method | `.secrets/android-ad-reset-README.txt` + re-run `server/scripts/_staging-android-ad-fixtures.ts` |

### Phase 3 — Staging APK (built; **not installed**)

| Field | Value |
|-------|--------|
| Artifact | `exports/LearnWise-1.0.0-vc27-staging-lan.apk` |
| SHA-256 | `FAF5190FA21581970F85FEBE5BFED354CD39C915929BF8365F191A2D327FFEAA` |
| Package | `com.littlereaders.app` |
| versionName / versionCode | `1.0.0` / **27** |
| Signing cert SHA-256 | `6d283c941deb3a2823ea1c11d9dd5c2e7b8ba9e044dbaf0de00e878c32e2707a` (matches release.jks / prod VC27) |
| API in JS bundle | **`http://192.168.1.20:4100/api` (1)** |
| `https://api.siwiapp.shop/api` in bundle | **0** (absent) |
| Cleartext HTTP | `usesCleartextTraffic=true` in release manifest |
| Lockout strings | `ACCOUNT_LOCKED` / `RATE_LIMITED` present |
| Prod recovery APK | `exports/LearnWise-1.0.0-vc27-login-only.apk` SHA-256 `709D9999…FBA4` (preserved) |
| Play upload | **No** |

### STOP — owner install approval required

Before Phase 4 (10 blocked AD tests):

1. Reconnect Samsung SM-S921B on the **same Wi‑Fi** as the PC (`192.168.1.20`).  
2. Approve: `adb install -r` of `LearnWise-1.0.0-vc27-staging-lan.apk` (**no** `pm clear`).  
3. Keep local API running on `:4100` during tests.  
4. After suite: optional reinstall prod VC27 recovery APK.

**Do not install without explicit owner approval.**
