# Learn Wise – Redis Automatic Recovery Improvement Report

**Date:** 2026-11-18  
**Branch / worktree:** `release/login-auth-only`  
**Path:** `C:\Users\harsh\OneDrive\Documents\Desktop\SIWI-login-auth-only`  
**Restrictions:** no prod Redis changes, no deploy, no commit/push  

---

## Problem

Staging previously confirmed a **sticky** `redisUnavailable` latch: after Redis failed, `getRedisClient()` returned `null` forever until API process restart, so shared Redis rate limiting did not resume automatically.

## Implementation

### Files changed
| File | Change |
|------|--------|
| `server/src/lib/redis.ts` | Cooldown-based recovery; single client; shared in-flight connect; no permanent latch |
| `server/src/lib/password-rate-limit.ts` | Clear outage warning flag after successful Redis increment |
| `server/scripts/staging-redis-multi-instance-verify.mjs` | Assert auto-resume **without** API restart; second outage cycle; TTL after recovery |

### Behaviour
1. **One Redis client per process** (no duplicate clients on recovery).  
2. On error/end → set `unavailableUntil = now + 3s` and use **bounded memory** fallback.  
3. After cooldown, `ensureRedisConnected()` probes again (ping / reconnect).  
4. Concurrent callers share one `connectInFlight` promise.  
5. `ready` event clears cooldown immediately.  
6. Background `retryStrategy` capped at 5s backoff; commands still fail fast (`enableOfflineQueue: false`).  
7. Account lockout (Postgres) untouched.

---

## Test results (executed)

### Staging multi-instance harness — **20/20 PASS**

Command: `node server/scripts/staging-redis-multi-instance-verify.mjs`  
Redis: local Docker `siwi-staging-redis` @ `127.0.0.1:6379`  
APIs: ports 4111 + 4112 (same processes through outage/recovery)

| Requirement | Result |
|-------------|--------|
| Redis initially available | **PASS** |
| Redis becomes unavailable | **PASS** |
| Bounded fallback active | **PASS** (`401` responses during outage) |
| Redis available again | **PASS** |
| Auto reconnect **without API restart** | **PASS** (`keys=1 value=2`) |
| Both instances share counters again | **PASS** |
| `RATE_LIMITED` ≠ `ACCOUNT_LOCKED` | **PASS** |
| TTL after recovery | **PASS** |
| Repeated outage/recovery, same API processes | **PASS** (second cycle `value=2`) |

Raw JSON: `docs/LOGIN_REDIS_STAGING_RESULTS.json`

### Backend regression — **20/20 PASS**
`tests/login-auth-fixes.test.ts` + `tests/auth-lockout.test.ts` after the change.

---

## Remaining risks

| Risk | Severity | Notes |
|------|----------|-------|
| Up to ~3s cooldown after failure before Redis is probed again | P2 | Memory fallback remains bounded during cooldown |
| Memory counters and Redis counters are not merged on failover | P2 | Brief under/over-count possible around outages; never unlimited |
| ioredis reconnect noise in logs during outage | P2 | Harmless; commands fail fast |
| Production Redis still optional / unset | Ops | No prod config changed |

---

## Security controls preserved

- Rate limiting never disabled  
- Lockout policy unchanged  
- Hashed email keys + TTL unchanged  
- No production env mutation  

---

## STOP

Auto-recovery implemented and staging-verified.  
Awaiting approval before commit, push, or deploy.
