# Learn Wise – Login Auth Production Readiness Report

**Date:** 2026-11-18  
**Branch reviewed:** `fix/login-auth-reliability` (based on `feature/central-dictionary-expansion` @ `eb296fe`)  
**Mode:** READ-ONLY review — no code changes, no deploy, no prod env/DB changes  

**Sources:**  
`docs/LOGIN_AUTHENTICATION_AUDIT_REPORT.md`,  
`docs/LOGIN_FIX_PRE_IMPLEMENTATION_AUDIT.md`,  
`docs/LOGIN_FIX_POST_IMPLEMENTATION_AUDIT.md`,  
working-tree diffs for login paths, re-executed tests  

---

## Overall production readiness

### **NEEDS ATTENTION**

The login fixes themselves are **implementation-complete and security-aligned**, with **re-executed tests passing**. They are **not yet cleanly shippable** until:

1. Login-only files are isolated from the large unrelated dirty working tree.  
2. Backend + web are deployed intentionally (fixes are currently uncommitted local changes).  
3. An Android app update is planned so installed APKs stop mislabeling lockouts.  
4. Ops confirms single vs multi API instance and whether `REDIS_URL` is needed.

**Do not deploy the entire dirty branch tree as-is.**

---

## Findings vs original audit

| Original finding | Status | Notes |
|------------------|--------|-------|
| P0 Mobile maps all 429 → “too quickly” | **Fully resolved (new clients)** | `auth-errors.ts` branches on `ACCOUNT_LOCKED` / `RATE_LIMITED` |
| P0 Parent one-device unexplained failures | **Partially resolved** | Clearer `SESSION_CONFLICT` / revoked copy; policy unchanged; **no dedicated transfer UX (P2)** |
| P1 Web double-submit | **Fully resolved** | `loadingRef` + disabled fields |
| P1 Password trim asymmetry | **Fully resolved (compat)** | `verifyLoginPassword`; hashes not migrated |
| P1 No login timeout | **Fully resolved** | 25s client timeout |
| P1/P2 In-memory RL / multi-instance | **Partially resolved** | Redis path implemented; **prod Redis NOT TESTED**; optional |
| Inactive account opaque 401 | **Accepted / unchanged** | Still generic invalid credentials (anti-enumeration) |
| OTP login UI unwired | **Unresolved / out of scope** | Correct — not mixed into password login |

### New risks introduced

| Risk | Severity | Assessment |
|------|----------|------------|
| Dirty tree accidental deploy | **P0 process** | Unrelated content-quality/vocab/UI changes sit beside login fixes |
| Redis sticky `redisUnavailable` latch | **P2** | Safe (bounded memory) but shared RL won’t resume until process restart |
| Dual bcrypt compare when password has edge spaces | **P2** | Slight extra work; does not weaken hashing |
| Old Android APKs unchanged until store update | **P1 product** | P0 messaging fix incomplete for non-updated devices |

---

## Code review results

| Area | Status | Evidence |
|------|--------|----------|
| Backend error codes `ACCOUNT_LOCKED` vs `RATE_LIMITED` | **PASS** | Lockout still DB-backed 429 + `ACCOUNT_LOCKED`; limiter message includes `RATE_LIMITED` |
| Parent `SESSION_CONFLICT` | **PASS** | Message clarified; revoke-on-new-login preserved |
| Web single-flight | **PASS** | Early return on `loadingRef` before setState |
| Android error handling | **PASS** (code) | Distinct codes; tip only for `RATE_LIMITED` |
| Password compatibility | **PASS** | Exact then trimmed verify; no hash rewrite |
| 25s timeout | **PASS** | `LOGIN_REQUEST_TIMEOUT_MS` on web + mobile login |
| Redis-backed RL | **PASS** (code) | INCR + PEXPIRE; hashed email; dual-store fallback |
| Memory fallback bounded | **PASS** | Same max (20 prod / 200 non-prod); never unlimited |
| Auth middleware / sessions | **PASS** | `requireAuth` + `assertActiveParentSession` unchanged in behaviour |
| Reports match code | **PASS** | Post-audit file list matches inspected diffs |

Diff scope for login paths vs `HEAD` (`eb296fe`): ~12 tracked files changed (+ new untracked redis/rate-limit/tests/auth-errors). Reports match.

---

## Security review results

| Check | Status |
|-------|--------|
| Password hashes unchanged by login | **PASS** (tested) |
| Existing users can authenticate | **PASS** (compat tests) |
| Verify does not weaken hashing | **PASS** (still bcrypt; optional second compare only if whitespace differs) |
| Lockout cannot be bypassed | **PASS** (DB lockout independent of RL; tests cover 5-fail lock) |
| RL cannot be disabled by Redis loss | **PASS** (memory fallback) |
| Redis keys safe (no raw email) | **PASS** (`hashRateLimitIdentity`) |
| Redis expiry present | **PASS** (`pexpire` on first hit) |
| Parent one-device enforcement | **PASS** (revoke test) |
| Session revocation | **PASS** |
| Admin auth path protected | **PASS** (same `/auth/login` + lockout/RL) |
| OTP unchanged | **PASS** (no login-UI OTP wiring; OTP routes untouched by these edits) |
| Secrets not logged | **PASS** (warnings log Redis error messages only, not credentials) |
| Error responses avoid user enumeration | **PASS** (unknown email = same 401) |

---

## Test results (re-executed this review)

### Backend — **PASS**

Command: `npm run test --workspace=@little-readers/server -- tests/login-auth-fixes.test.ts tests/auth-lockout.test.ts tests/auth.test.ts`

| Suite | Result |
|-------|--------|
| `login-auth-fixes.test.ts` | 15 passed |
| `auth-lockout.test.ts` | 5 passed |
| `auth.test.ts` | 8 passed |
| **Total** | **28 passed** |

### Web / mobile unit — **PASS**

| Test | Result |
|------|--------|
| `apps/mobile/services/auth-errors.test.ts` | OK |
| `apps/web/src/lib/auth-errors.test.ts` | OK |
| `apps/web/src/lib/login-submit-guard.test.ts` | OK |

### Coverage matrix

| Scenario | Coverage | Status |
|----------|----------|--------|
| Account lockout | Backend + client message tests | **PASS** |
| Actual HTTP `RATE_LIMITED` from express limiter | Skipped when `VITEST`/`NODE_ENV=test` | **NOT TESTED** (integration) |
| Redis unavailable helper | Unit helper smoke | **PASS** (shallow) |
| Live Redis shared counters | No Redis in test env | **NOT TESTED** |
| Concurrent login / device revoke | Device session tests | **PASS** |
| Parent device conflict message | Code + client mapping; rare P2002 race | **NEEDS ATTENTION** (race path lightly covered) |
| Password compatibility | Backend tests | **PASS** |
| Login timeout | Client code path; unit maps `REQUEST_TIMEOUT` | **NEEDS ATTENTION** (no timed integration test) |
| Duplicate submissions | Web guard unit test | **PASS** |
| Admin login | Same endpoint; auth tests use parent; admin path unchanged | **PASS** (contract) / admin-specific UI **NOT TESTED** |
| Existing parent sessions | Revoke on new device tested | **PASS** |

---

## Redis readiness

| Question | Answer | Status |
|----------|--------|--------|
| Does production already support Redis? | **Unknown** — not probed (no prod changes/connections in this review) | **NOT TESTED** |
| Is `REDIS_URL` required? | **No** for single instance; **recommended** for multiple API instances | **NEEDS ATTENTION** (ops decision) |
| Connection loss handling | Falls back to bounded memory; may latch until restart | **PASS** (safe) / **NEEDS ATTENTION** (reconnect) |
| Fallback bounded? | Yes | **PASS** |
| Counters shared across instances? | Only when Redis healthy + `REDIS_URL` set | **NEEDS ATTENTION** |
| Reconnect behaviour | Sticky unavailable flag until restart | **NEEDS ATTENTION** |

Production config checklist is in `docs/LOGIN_AUTH_PRODUCTION_DEPLOYMENT_PLAN.md`. **Do not set prod env vars without approval.**

---

## Client compatibility

| Client | Compatibility | Status |
|--------|---------------|--------|
| Web after deploy | Gains all client fixes immediately | **PASS** |
| New Android build | Gains message/timeout fixes | **PASS** (pending separate AAB approval) |
| Older installed Android | Still hardcodes 429 → “too quickly” | **NEEDS ATTENTION** |
| API contract | Still 429 + codes; messages improved; additive | **PASS** (non-breaking for clients that already read `code`) |

---

## Production impact assessment

| Item | Status |
|------|--------|
| DB migration required | **No** — **PASS** |
| Password hash modification | **No** — **PASS** |
| User account changes | **No** — **PASS** |
| Session deletion required | **No** — **PASS** |
| Breaking API change | **No** — **PASS** |
| Unrelated features changed in deployable set | **Must exclude** unrelated dirty files — **NEEDS ATTENTION** |

---

## Deployment risks

| Risk | Priority | Mitigation |
|------|----------|------------|
| Shipping unrelated WIP with login | **P0** | Deploy login-only file set |
| Assuming Android users are fixed after API-only deploy | **P1** | Plan Play update |
| Multi-instance without Redis | **P2** | Accept per-process RL or add `REDIS_URL` |
| Redis latch after outage | **P2** | Restart API after Redis recovery if shared RL required |

Rollback: redeploy previous API/web artifacts; no session/password surgery. **Rollback readiness: PASS.**

---

## Remaining blockers (exact)

1. **P0 process:** Isolate + approve commit of **login-only** files; do not deploy full dirty tree.  
2. **P1 product:** Android release required for lockout messaging on existing installs.  
3. **P2 ops:** Confirm API instance count; decide on `REDIS_URL`.  
4. **P2 product:** Missing dedicated parent device-transfer / lost-phone UX (document only; no insecure bypass).  

No security-critical defect found that would block a **login-only** backend+web release after isolation.

---

## Findings by priority

### P0
- Working tree contamination risk (unrelated changes co-located with login fixes).

### P1
- Older Android APKs still show incorrect 429 copy until app update.  
- Live multi-instance Redis behaviour not verified in production/staging.

### P2
- No dedicated device-transfer UX.  
- Redis sticky fallback / no automatic resume of shared counters.  
- Express `RATE_LIMITED` HTTP path not integration-tested (skipped in Vitest).  
- Global `/api` limiter still memory-only.

---

## Recommended next action

1. **Approve commit** of login-only files on `fix/login-auth-reliability` (or a clean PR branch).  
2. **Approve deploy** backend → web using `docs/LOGIN_AUTH_PRODUCTION_DEPLOYMENT_PLAN.md`.  
3. Run post-deploy smoke tests.  
4. Separately approve Android production release for mobile P0 messaging.  
5. Separately approve `REDIS_URL` only if multiple API processes are confirmed.

**Awaiting your explicit approval before any commit, env change, AAB, or deploy.**

---

## Status legend used above

- **PASS** — Verified against code and/or re-run tests  
- **FAIL** — Broken or unsafe (none for core login fix logic)  
- **NEEDS ATTENTION** — Conditional gate / ops / client rollout  
- **NOT TESTED** — Not executed in this review (e.g. live Redis, old APK E2E)  
