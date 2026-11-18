# Learn Wise – Login Auth Production Deployment Plan

**Branch:** `fix/login-auth-reliability`  
**Date:** 2026-11-18  
**Mode:** Plan only — do not deploy until separately approved.

---

## 1. Deployment prerequisites

1. **Isolate the login changeset.** Working tree currently mixes login fixes with large unrelated dirty/untracked work (content quality, vocab, UI, docs). Deploy **only** login-related paths (see file list below). Do not ship the full dirty tree.
2. Commit (or cherry-pick) login files onto a clean release candidate after explicit commit approval.
3. Confirm staging/API host has Node deps including `ioredis`.
4. Confirm nginx `X-Forwarded-For` + API `trust proxy` = 1 remain correct (client IP for rate-limit keys).
5. No DB migration. No password resets. No session wipes.

### Login-only deploy file set (intended)

**Backend**
- `server/src/lib/password.ts`
- `server/src/lib/lockout.ts`
- `server/src/lib/redis.ts` (new)
- `server/src/lib/password-rate-limit.ts` (new)
- `server/src/auth/auth.service.ts`
- `server/src/auth/auth.routes.ts`
- `server/src/parent-auth/session.service.ts`
- `server/src/config/env.ts`
- `server/package.json` (+ lockfile entries for `ioredis`)
- `server/tests/login-auth-fixes.test.ts` (optional on server; needed in repo)

**Web**
- `apps/web/src/app/login/page.tsx`
- `apps/web/src/lib/api.ts`
- `apps/web/src/lib/auth-errors.ts` (new)

**Android / mobile**
- `apps/mobile/app/login.tsx`
- `apps/mobile/services/api.ts`
- `apps/mobile/services/auth-errors.ts`

**Docs** (optional on server)
- `docs/LOGIN_*`

---

## 2. Redis configuration requirements

| Item | Requirement |
|------|-------------|
| Redis for single API process | **Optional.** Bounded in-memory limiter remains active. |
| Redis for multiple API instances | **Recommended** so password-attempt counters are shared. |
| Env var | `REDIS_URL` (e.g. `redis://127.0.0.1:6379` or TLS URL). Never commit secrets. |
| Key prefix | `rl:pw:` + path + IP + hashed email |
| TTL | 15 minutes (`PEXPPIRE` on first INCR) |
| Failure mode | Bounded memory fallback; **never** unlimited login |

**Known limitation:** After Redis errors, process may latch to memory fallback until process restart (see readiness report). Plan a restart if Redis is restored mid-flight and shared counters must resume.

---

## 3. Environment-variable checklist

| Variable | Action |
|----------|--------|
| Existing `JWT_SECRET`, `DATABASE_URL`, etc. | Unchanged |
| `REDIS_URL` | Optional add — **do not set without approval** |
| `NODE_ENV=production` | Required on API |
| Do **not** set | `OTP_DEV_MODE`, `ALLOW_DEMO`, placeholder secrets |

No production env mutation in this plan until separately approved.

---

## 4. Backend deployment sequence

1. Install deps (`npm ci` / workspace install) so `ioredis` is present.  
2. Restart API process (e.g. `pm2 restart siwi-api` or equivalent) — **tsx/dist as currently used**.  
3. Hit `GET /api/health`.  
4. Smoke login endpoints (section 8).  
5. Watch logs for `[rate-limit] Redis` warnings.

---

## 5. Web deployment sequence

1. Build/deploy Next.js web with updated login page + `auth-errors` + API timeout.  
2. Hard-refresh `/login`.  
3. Smoke: success, wrong password, double-submit, timeout messaging if simulated.

Web receives P0/P1 client fixes **immediately** on web deploy (no store review).

---

## 6. Android release requirements

| Fix | Needs new AAB/Play update? |
|-----|----------------------------|
| Correct lockout vs rate-limit copy | **Yes** — old APKs hardcode all 429 as “too quickly” |
| Device-conflict friendly copy | **Yes** for best UX |
| Login timeout | **Yes** |
| Backend lockout message / codes | No (already on API) — but old apps ignore `code` |

**Do not create a production AAB in this readiness task.** Schedule a separate Android release after backend/web are stable.

Until users update the app, installed Android builds will still mislabel lockouts. Backend + web deploy still helps web users and prepares API for the new app.

---

## 7. Health checks

- `GET /api/health` → 200  
- API process up; no crash loop after restart  
- If `REDIS_URL` set: no continuous Redis error spam (occasional reconnect warnings OK)

---

## 8. Login smoke tests (post-deploy)

Use **non-production** or approved test accounts only. Never log passwords/OTPs/tokens.

1. Admin correct email/password → success  
2. Admin wrong password → “Email or password is incorrect.” (web)  
3. Five wrong passwords → `ACCOUNT_LOCKED` (not generic rate-limit tip on **new** clients)  
4. Wait / clear lockout on test account only if approved — or use a dedicated test user  
5. Parent mobile (updated build): login with deviceId → success  
6. Second device login → new device succeeds; old device session revoked  
7. Web: rapid double Enter → single request  
8. Optional: confirm `RATE_LIMITED` only after many attempts (careful on prod)

---

## 9. Rollback procedure

1. Redeploy previous API artifact / git revision **without** login-fix files.  
2. Redeploy previous web build.  
3. Leave Redis as-is (harmless if unused).  
4. Do **not** delete sessions or reset passwords as rollback.  
5. Android: Play rollback / previous track if a bad AAB was released (separate process).

Lockout DB fields remain compatible with old code (`failedLoginCount`, `loginLockedUntil`).

---

## 10. Monitoring

Watch for:
- Spikes of HTTP 429 with `ACCOUNT_LOCKED` vs `RATE_LIMITED`
- `[rate-limit] Redis` warning lines
- Elevated 401 login failures (credential stuffing)
- Parent `SESSION_REVOKED` / `SESSION_CONFLICT` rates (expected when switching devices)

---

## 11. Post-deployment verification

- [ ] Health OK  
- [ ] Web login OK  
- [ ] Lockout message correct on web  
- [ ] Parent one-device still enforced  
- [ ] No unrelated feature regressions spotted in admin/parent smoke  
- [ ] Android store update planned for P0 mobile messaging  

---

## 12. Known limitations

1. **P2 – No dedicated parent device-transfer / lost-phone UX.** Login on a new device revokes the old session (security preserved). Do **not** add an insecure multi-device bypass.  
2. Old Android APKs keep mislabeling lockouts until app update.  
3. Without `REDIS_URL`, multi-instance rate-limit counters are per-process.  
4. Redis failure latches to in-memory until process restart.  
5. Express password rate limiter is skipped under `VITEST`/`NODE_ENV=test` (test design); production path remains enabled.  
6. Global `/api` rate limiter is still memory-only (out of scope).

---

## Recommended release order (after approvals)

1. Commit/push **login-only** files  
2. Deploy **backend**  
3. Deploy **web**  
4. Validate smoke tests  
5. Separate approval → Android production AAB / Play rollout  
6. Optional separate approval → set `REDIS_URL` if running multiple API instances  
