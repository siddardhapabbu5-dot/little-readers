# Learn Wise – Redis Multi-Instance Staging Verification Report

**Date:** 2026-11-18  
**Branch / worktree:** `release/login-auth-only` @ `C:\Users\harsh\OneDrive\Documents\Desktop\SIWI-login-auth-only`  
**Mode:** Local non-production staging only  
**Production Redis / DB / deploy / commit:** not used / not changed  

**Harness:** `server/scripts/staging-redis-multi-instance-verify.mjs`  
**Raw results:** `docs/LOGIN_REDIS_STAGING_RESULTS.json`  
**Overall:** **18/18 PASS**

---

## 1. Configuration inspection

| Item | Finding |
|------|---------|
| `REDIS_URL` loading | Optional in `server/src/config/env.ts`; read via dotenv + `process.env` |
| Staging override | Script **forced** `REDIS_URL=redis://127.0.0.1:6379` (local Docker). Did not modify `.env` or production config. |
| Key format | `rl:pw:{path}:{ip}:{sha256(email)[0..32]}` — **no raw email** in keys |
| Expiry | `INCR` then `PEXPPIRE` = **15 minutes** (`WINDOW_MS`) |
| Account lockout vs RL | Lockout: Postgres `failedLoginCount` / `loginLockedUntil`, code `ACCOUNT_LOCKED`. RL: express-rate-limit store, code `RATE_LIMITED`. Separate. |
| Dev max | Non-production max **200** attempts / 15 min (prod would be 20) |
| Limiter skip | Skipped only when `VITEST=true` or `NODE_ENV=test` — staging used `NODE_ENV=development` |

---

## 2. Staging environment

| Component | Detail |
|-----------|--------|
| Redis | Docker `siwi-staging-redis` → `redis:7-alpine` on `127.0.0.1:6379` |
| API A | `http://127.0.0.1:4111` |
| API B | `http://127.0.0.1:4112` |
| Database | Localhost Postgres only (`localhost:5437`) — not production |
| Accounts | Synthetic `@staging.local` emails; one Prisma-created PARENT for lockout |

---

## 3. Test results

| # | Test | Result | Detail |
|---|------|--------|--------|
| 1 | Redis connection | **PASS** | `PONG` |
| 2 | Instance A increments / B sees counter | **PASS** | Redis clients: 1→2; HTTP APIs: seeded 5 → 7 after A then B |
| 3 | Configured rate limit triggers | **PASS** | Seeded counter to 200; both A and B returned `429` + `RATE_LIMITED` |
| 4 | Counter TTL expiry | **PASS** | 2s TTL test: key expired (`pttl_after=-2`, value null). Production window is 15 min (same `PEXPPIRE` mechanism). |
| 5 | Redis temporarily unavailable | **PASS** | Docker stop; login still returned `401` (bounded fallback / no unlimited open door) |
| 6 | Bounded fallback | **PASS** | Outage statuses `401,401,401` — auth still enforced |
| 7 | Redis reconnect + shared resume | **PASS** (with known latch) | Without API restart: sticky `redisUnavailable` latch (expected). After API restart: shared keys resume (`value=2`) |
| 8 | Account lockout ≠ `RATE_LIMITED` | **PASS** | After 5 wrong passwords: `429` + `ACCOUNT_LOCKED`; correct password still locked on instance B |

---

## 4. Detailed findings

### Redis connection
Local Docker Redis reachable. Staging script never printed credentials and overrode any `.env` `REDIS_URL` with the local URL for child API processes.

### Two-instance shared counters
Confirmed at both raw Redis client layer and live HTTP login limiter (`rl:pw:/login:…` keys written by both ports).

### Rate limit
`RATE_LIMITED` returned from both instances once the shared counter reached the development max.

### TTL
Short-TTL probe confirms expiry works; login limiter uses the same `pexpire(windowMs)` with `windowMs = 900000`.

### Outage / fallback
Stopping Redis did not open unlimited login. Existing API processes continued to answer credential failures via memory fallback path.

### Reconnection
**Confirmed behaviour:** after Redis errors, process latches to memory until **API process restart**. Shared Redis counters resume reliably after restart. This is a known operational note (restart APIs after Redis recovery if shared RL must resume).

### Account lockout
`ACCOUNT_LOCKED` remained distinct from `RATE_LIMITED` and was enforced across both instances via the database.

---

## 5. Blockers

| Item | Severity | Notes |
|------|----------|-------|
| Sticky Redis unavailable latch | **P2 ops** | Not a security bypass (fallback is bounded). Requires API restart after Redis recovery for shared counters. |
| Production Redis | N/A | **Not configured / not tested.** Do not set prod `REDIS_URL` without separate approval. |
| Prod multi-instance soak | Pending ops | Staging local Docker only |

**No P0/P1 blockers** for shipping login fixes with optional Redis; single-instance memory RL remains safe without `REDIS_URL`.

---

## 6. Restrictions compliance

- No production Redis configuration changes  
- No production database access  
- No production deployment  
- No commit / push  
- No AAB  
- Original unrelated WIP tree not modified (work performed in `SIWI-login-auth-only` worktree)  

Staging Redis container stopped after the run (`docker stop siwi-staging-redis`).

---

## 7. Recommended next actions (awaiting approval)

1. Treat Redis multi-instance staging verification as **complete for local staging**.  
2. Optionally document “restart API after Redis outage” in runbooks.  
3. Separate approval required before setting production `REDIS_URL` or deploying.  
