# Batch 11 — Final Security, Testing & Launch Readiness

**Date:** 2026-11-05  
**Constraint:** No live payments, no store submit, no production deploy, no DB wipe.

---

## Part A — Launch-readiness plan (locked before execution)

### Scope
Audit Batches 1–10. Fix only verified, low-risk defects. Honest PASS / FAIL / PARTIAL / NOT TESTED / BLOCKED.

### Architecture under audit

| Layer | Reality |
|-------|---------|
| Customer API | Express `server/` `:4100` |
| Nest `apps/api` | Health/jobs scaffold only — **not** live traffic |
| DB | PostgreSQL + Prisma (13 migrations applied) |
| Redis | Docker present; **unused** by Express learning/payments |
| Auth | JWT + roles + `isActive` |
| Seats | Base 2 + extras; Admin grant or Razorpay |
| Payments | Razorpay Orders; stub HMAC tests; live sandbox UI **not** merchant-run |
| Mobile | Expo + EAS profiles; `eas.projectId` still placeholder |

### Execution order
1. Security / seats / payments / school review  
2. Migrate status + full Vitest + tsc + next build  
3. Restore curriculum visibility if shared-DB pollution found  
4. Document EAS/device/Razorpay remaining work  
5. Final recommendation  
6. **Stop**

---

## Part B — Completed features (Batches 1–10)

| Area | Status |
|------|--------|
| Parent auth, register, password reset | Implemented |
| Child profiles + independent progress | Implemented |
| Kids Listen/Spell + lesson start/resume | Implemented |
| Vocabulary / dictionary / content structure Admin | Implemented |
| Lesson Admin + Kids Lessons picker | Implemented |
| Child seats (2 included + extras) | Implemented |
| One-device-per-child + transfer | Implemented |
| School / Teacher / Classroom overlay | Implemented |
| Razorpay checkout APIs + web checkout UI | Implemented (sandbox/stub verified) |
| Mobile checkout handoff to website | Implemented (no native IAP) |

---

## Part C — Security audit

| Check | Result | Notes |
|-------|--------|-------|
| JWT verify + inactive user rejected | **PASS** | `requireAuth` loads user + `isActive` |
| Password reset hashed tokens / one-time use | **PASS** | `password-reset.test.ts` |
| RBAC Admin vocab/lessons/seats | **PASS** | Parent/Teacher 403 in suites |
| Parent–child ownership | **PASS** | Learning/children services |
| Teacher classroom isolation | **PASS** | `batch9-schools` |
| School A/B isolation | **PASS** | batch9 |
| Upload size + extension/magic | **PASS** | `file-security.ts` + multer limit |
| Rate limit + helmet | **PASS** | Present in `app.ts` |
| CORS allowlist | **PARTIAL** | Env-driven; must tighten for production origins |
| Secrets in repo | **PASS** | `.env.example` only; no live keys committed |
| Payment signature / webhook HMAC | **PASS** | `batch10-payments` stub |
| Forged frontend payment success | **PASS** | No activation without verify |
| Nest tenant RLS | **NOT TESTED** / N/A | Nest not serving customers |

---

## Part D — Subscription & device

| Check | Result |
|-------|--------|
| Base 2 seats + extra seat gate | **PASS** (`child-seats`) |
| Admin grant vs paid grant distinct | **PASS** |
| Expired / ineligible blocks learning | **PASS** (service + device suite) |
| Grace / PAST_DUE policy preserved | **PASS** (code path) |
| Second device blocked | **PASS** |
| Transfer required for new phone | **PASS** |
| Logout does not release device | **PASS** |
| Parent/Teacher/Admin not device-locked | **PASS** (by design + docs) |
| Independent child sessions | **PASS** (`lesson-management`, `learning-play`) |

---

## Part E — Razorpay

| Check | Result |
|-------|--------|
| Stub order + valid verify activates yearly | **PASS** |
| Invalid signature rejected | **PASS** |
| Duplicate verify idempotent | **PASS** |
| Extra seat purchase + idempotent | **PASS** |
| Invalid webhook signature | **PASS** |
| Duplicate webhook | **PASS** |
| Refund marks REFUNDED (no auto seat wipe) | **PASS** (code + event handler) |
| Live Razorpay sandbox Checkout UI | **NOT TESTED** |
| Live merchant webhook on public URL | **NOT TESTED** / **BLOCKED** (no authorized live/sandbox merchant run this batch) |
| Production live mode | **BLOCKED** — not authorized |

**Remaining:** merchant approval, sandbox keys in env, dashboard webhook → `POST /api/payments/webhook`, approved price paise values, then authorized live cutover.

---

## Part F — Learning experience

| Check | Result |
|-------|--------|
| Listen/Spell session + progress APIs | **PASS** (`learning-play`) |
| Lesson start/resume + scoring idempotency | **PASS** |
| Kids Lessons visibility filters | **PASS** (batch8) |
| Teacher classroom progress | **PASS** (batch9) |
| Level 1 **content density** (10×≥75 words) | **FAIL** / **PARTIAL** |
| Matching / Tracing | Not offered (by design) |
| Offline recovery | **NOT TESTED** / not fully productized |
| Physical Listen/Spell UX | **NOT TESTED** |

### Critical content finding (executed)
After shared-DB pollution, Level 1 categories were unpublished and levels inactive. Restored via `server/scripts/restore-seed-curriculum.mjs` (republish/reactivate only — no wipe).

**Word inventory after restore:** Level 1 published categories exist, but active words are far below product target (~23 words in one category; others 0). Root cause: earlier intentional vocabulary clear + incomplete reseed — **not** an API regression.  
`learning.test.ts` (4) **FAIL** on ≥75 words/category. Listen/Spell **with fixture words** still **PASS**.

**Launch blocker (HIGH):** Reseed approved Level 1 vocabulary to product density before consumer launch.

---

## Part G — Exact automated results (this batch)

| Check | Result |
|-------|--------|
| `prisma migrate status` | **PASS** — 13 migrations, schema up to date |
| Vitest (sequential) | **62 PASS / 4 FAIL / 0 skipped** (of 66) |
| Failing file | `learning.test.ts` only — content density |
| Server `tsc --noEmit` | **PASS** |
| Mobile `tsc --noEmit` | **PASS** |
| Website `tsc --noEmit` | **PASS** |
| Website `next build` | **PASS** |
| Vitest config | Updated `fileParallelism: false` + singleFork to reduce shared-DB pollution |

---

## Part H — Android / iOS

| Item | Result |
|------|--------|
| `app.json` package / bundle id | **PASS** (`com.littlereaders.app`) |
| `eas.json` development / preview APK / production AAB | **PASS** (config present) |
| `extra.eas.projectId` | **BLOCKED** — still `replace-with-eas-project-id` |
| EAS Android APK/AAB build executed | **NOT TESTED** |
| EAS iOS / TestFlight | **NOT TESTED** |
| Physical Android install | **NOT TESTED** |
| Physical iPhone install | **NOT TESTED** |
| Audio / keyboard / safe area / back button on device | **NOT TESTED** |
| Checkout handoff on device | **NOT TESTED** |

---

## Part I — Production readiness (not deployed)

| Item | Status |
|------|--------|
| Hosting / domain / HTTPS | **NOT TESTED** |
| DB backups + restore drill | **NOT TESTED** |
| Redis ops | **N/A** for current Express path |
| `/api/health` | **PASS** |
| Error monitoring (Sentry etc.) | **NOT TESTED** / missing |
| Structured log aggregation | **NOT TESTED** |
| Upload storage durability | **PARTIAL** — local `storage/vocab-uploads` |
| Env checklist | **PASS** — `.env.example` updated (Razorpay, reset, mobile URLs) |
| Deployment / rollback runbook | **NOT TESTED** / incomplete |
| Production deploy | **BLOCKED** — not authorized |

---

## Part J — Issue register

### Critical (launch blockers)
1. **Level 1 vocabulary density** — categories empty/near-empty vs 75-word product target (**FAIL** content).  
2. **EAS projectId placeholder** — store builds cannot proceed (**BLOCKED**).  
3. **No physical device verification** (**NOT TESTED**).  
4. **Razorpay merchant sandbox end-to-end UI + webhook on public URL** (**NOT TESTED** / **BLOCKED** for go-live).  
5. **Production HTTPS, backups, monitoring** (**NOT TESTED**).

### High
- CORS must be locked to production web/app origins.  
- Password reset requires real `RESEND_*` in production (`PASSWORD_RESET_LOG_ONLY` forbidden).  
- Approved plan prices must be set in env before `PAYMENT_ENABLED=true`.  
- Nest cutover still deferred — document Express as system of record.  
- Shared test DB pollution risk — mitigated by sequential Vitest + restore script; still use dedicated CI DB.

### Medium
- Mobile Admin UX thinner than website.  
- School enroll-by-Child-ID UX (no parent directory search).  
- Refund does not auto-revoke occupied seats (intentional; Admin revoke).  
- Matching/Tracing not implemented.

### Low
- Games tab incomplete.  
- Redis unused.  
- Portal marketing copy still mentions future Nest phases.

---

## Part K — Store submission requirements (checklist only)

- [ ] Real EAS project + Apple Developer / Play Console accounts  
- [ ] Privacy policy / terms URLs live  
- [ ] Age rating + COPPA/parental disclosure  
- [ ] iOS IAP **or** documented reader/external-link compliance for subscriptions  
- [ ] Android Play Billing **or** compliant alternative for digital goods  
- [ ] Production API base URL in app builds  
- [ ] Crash reporting  
- [ ] Screenshots / metadata  

**Do not submit** until critical blockers above are cleared and authorized.

---

## Part L — Final launch recommendation

**Little Readers is NOT production-ready for public launch.**

**Reasons (verified):** incomplete Level 1 vocabulary content; no physical Android/iOS proof; EAS project unset; Razorpay live/sandbox merchant flow not executed on real keys; hosting/HTTPS/backups/monitoring unverified.

**What is solid for a closed internal demo (with caveats):** Express API security for roles/seats/devices/schools; Listen/Spell with available words; Admin content tools; website build; Razorpay **stub** payment security tests; TypeScript clean on server/mobile/web.

**Next authorized steps (outside Batch 11):**  
1) Reseed Level 1 vocabulary  
2) Configure EAS + run preview APK + physical smoke  
3) Razorpay sandbox keys + real checkout + webhook  
4) Staging host with HTTPS + backup drill  
5) Explicit approval for live payments / store submit  

**Batch 11 stop.** Live payments and store submission were not enabled.
