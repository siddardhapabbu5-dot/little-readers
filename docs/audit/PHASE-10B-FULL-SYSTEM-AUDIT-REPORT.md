# LITTLE READERS – PHASE 10B FULL SYSTEM AUDIT REPORT

**Branch:** `audit/phase-10b-full-system`  
**Audit date:** 2026-11-05  
**Scope:** Admin website, Parent mobile, Backend APIs, Prisma/DB, Auth, Academic Level/Grade, Subscriptions/Payments, Vocabulary, Learning, Security, Performance (static), Backup/Deployment (config review)  
**Rules followed:** No rebuild; no unnecessary redesign; no production credential changes; no production data mutation beyond local audit DB inspection; tests claimed only when executed.

---

## Executive verdict

| Area | Status | Evidence |
|------|--------|----------|
| Production readiness | **NOT READY** | Failed learning/content tests on current DB; Child lacks school-grade field; reading/spelling/speech still 501 stubs; child-seats regressions; dual grade catalogs |
| Core auth (email Admin + Parent OTP device) | **PASS** (automated) | `parent-otp-device`, `admin-password-reset`, `auth` — 40 critical tests green after targeted run |
| Phase 10B academic + plans APIs | **PASS** (automated) | `phase10b-academic-plans.test.ts` 8/8 |
| Payments API (batch 10) | **PASS** (automated) | Included in critical suite |
| Full server suite | **FAIL** | 85 passed · **8 failed** · 8 skipped (101 total) — see §14 |
| Server TypeScript | **PASS** after fix | `tsc --noEmit` exit 0 (was failing on `PlanPurpose`) |

---

## 1. Project inventory (Phase 1)

### 1.1 Applications

| App | Path | Role |
|-----|------|------|
| Legacy Express API | `server/` | Primary backend used by mobile/web (`@little-readers/server`) |
| Expo mobile | `apps/mobile/` | Admin + Parent + Kids surfaces |
| Next.js web | `apps/web/` | Marketing, Admin shell, Parent checkout |
| Workspace packages | `packages/*` | `validation`, `shared`, `types`, `ui`, `config` |
| Alternate API workspace | `apps/api/` | Present in workspaces; not the active mobile backend in this audit |

### 1.2 Backend modules (mounted in `server/src/routes/index.ts`)

| Module | Route prefix | Key files | Prisma models (primary) | Tests | Status |
|--------|--------------|-----------|-------------------------|-------|--------|
| Health | `GET /api/health` | `routes/index.ts` | — | — | IMPLEMENTED |
| Auth | `/api/auth` | `auth/*` | User, PasswordResetToken | `auth.test.ts`, `password-reset.test.ts` | IMPLEMENTED |
| Parent OTP / device | `/api/parent/auth` | `parent-auth/*` | ParentOtpVerification, ParentDeviceSession | `parent-otp-device.test.ts` | IMPLEMENTED |
| Admin password reset | `/api/admin/auth` | `admin-auth/*` | AdminPasswordResetToken | `admin-password-reset.test.ts` | IMPLEMENTED |
| Admin parent sessions | `/api/admin/parents` | `parent-auth/admin-parent-sessions.routes.ts` | ParentDeviceSession | covered in OTP suite | IMPLEMENTED |
| Academic Level/Grade/Plans | `/api/admin/academic`, `/api/parent/catalog` | `academic/*` | LearningLevel, LearningGrade, SubscriptionPlan | `phase10b-academic-plans.test.ts` | IMPLEMENTED |
| Content structure | `/api/admin/content` | `content-structure/*` | LearningGrade/Level/Group/Category | `content-structure.test.ts` | IMPLEMENTED (dual-use grades) |
| Dictionary | `/api/admin/dictionary` | `dictionary/*` | Dictionary* | `dictionary-grade.test.ts` | IMPLEMENTED |
| Vocab import | `/api/admin/vocabulary` | `vocab-import/*` | VocabImportBatch, VocabularyWord | `vocab-import`, `word-management`, sheet tests | IMPLEMENTED |
| Learning play | `/api/learning`, `/api/parent/dashboard` | `learning/*` | LearningSession, QuestionAttempt, progress | `learning.test.ts`, `learning-play.test.ts` | IMPLEMENTED (DB-dependent) |
| Lessons | `/api/admin/lessons` | `lessons/*` | Lesson* | `lesson-management`, `batch8` | IMPLEMENTED |
| Programmes / publisher | `/api/admin/programmes`, `/publisher` | `programmes/*` | VocabProgramme* | publisher/programme tests | IMPLEMENTED |
| Schools / teacher | `/api/admin/schools`, `/api/teacher` | `schools/*` | School, Classroom* | `batch9-schools.test.ts` | IMPLEMENTED |
| Devices / subscriptions | `/api/devices`, `/api/subscriptions` | `devices/*`, subscription services | Subscription, StudentDevice | `device-subscription`, `child-seats` | PARTIAL (seat tests failing) |
| Payments | `/api/payments` | `payments/*` | Payment, SubscriptionPlan | `batch10-payments.test.ts` | IMPLEMENTED |
| Children | `/api/children` | `children/*` | Child | `children-admin-authz` | IMPLEMENTED (no school grade FK) |
| Reading / Spelling / Speech | `/api/reading|spelling|speech` | stubs in `routes/index.ts` | LearningAttempt, SpeechAssessment exist | — | **STUB (501)** |

### 1.3 Database

- **Schema:** `server/prisma/schema.prisma` — 50+ models including User, Child, Parent OTP/session, LearningGrade/Level/Group/Category, Vocabulary*, Dictionary*, Lesson*, VocabProgramme*, Subscription, SubscriptionPlan, Payment, School*.
- **Migrations of note (Phase 9–10B):**
  - `20261105120000_parent_otp_device_sessions`
  - `20261105140000_admin_password_reset_tokens`
  - `20261105150000_phase10b_academic_subscription_plans`
- **Overlap risk:** One `LearningGrade` table serves both content grades (`GRADE_*`) and academic school grades (`G1`… / `gradeNumber`). Admin Structure lists all rows → dashboard “Grades” count mixes catalogs.

### 1.4 Environment

Documented in `.env.example` (and `server/src/config/env.ts`): `DATABASE_URL`, `JWT_SECRET`, OTP/SMS, Razorpay, tax, plan amount envs, demo login flags.  
**Not audited against production secrets** (rule: do not change production credentials).

---

## 2–4. Admin / Level-Grade / Subscription (code + test evidence)

### Level mapping (intended)

| Level | Grades |
|-------|--------|
| Level-1 | 1–3 |
| Level-2 | 4–6 |
| Level-3 | 7–12 |

**Evidence:** `academic.service.ts` `ensureAcademicDefaults` / admin Levels UI presets; conflict detection via `previewLevelRangeImpact` / overlapping range errors.

| Check | Status | Notes |
|-------|--------|-------|
| Admin Level CRUD APIs | PASS (automated) | phase10b suite |
| Grade assign to Level | PASS (automated) | phase10b |
| Duplicate / outside-range guards | PASS (automated) | 400/409 cases in phase10b |
| Parent catalog levels/grades/plans | PASS (automated) | GET `/parent/catalog/*` in phase10b |
| Auto re-seed G1–G12 on boot / Levels open | PASS (fixed earlier on main) | Boot call removed; Levels no longer POSTs ensure-defaults; `seedGrades` opt-in only |
| Content grades vs academic grades UX | **FAIL (P1)** | Single list/count confuses Admin (“13 grades”) |
| Admin UI desktop/tablet manual | NOT TESTED | No browser device matrix run in this pass |

### Subscription

| Check | Status | Notes |
|-------|--------|-------|
| Durations 1/3/6/12 | PASS (code + admin UI) | `ALLOWED_DURATIONS` |
| Draft hidden from parents | PASS (by design) | `listPublishedPlans` requires `isPublished` |
| Publish makes visible | PASS | Local drafts published during prior fix; parent catalog uses published only |
| Historical payment snapshot | PASS (code review) | checkout stores plan snapshot fields on Payment |
| PlanPurpose 3/6 month typing | **FAIL → FIXED** | See §15 |
| Live Razorpay success/fail/pending | BLOCKED | Requires gateway keys + sandbox; not exercised against live provider |
| Renewal / expiry enforcement E2E | NOT TESTED (manual) | Covered partially by subscription entitlement services + batch10 |

---

## 5. Parent app journey

| Step | Status | Evidence |
|------|--------|----------|
| OTP login | PASS (automated) | `parent-otp-device.test.ts` |
| Child list / seats UI | PARTIAL | `parent.tsx` loads `/subscriptions/me`; seat assign APIs exist; seat tests failing |
| Level selection from Admin catalog | PARTIAL | Subscription screen uses `/parent/catalog/levels`; **child create** still uses level codes / birth-year inference (`children.service.ts`), not school-grade picker |
| Grade selection stored on child | **FAIL (P1)** | `Child` model has `levelId` / `ageGroupId` only — **no `gradeId`** |
| Learning dashboard | PARTIAL | `/parent/dashboard` + learn tabs; depends on content grades/curriculum |
| Hardcoded prices | PASS | Mobile subscription formats server `totalPaise` |

---

## 6. Parent OTP / device session

| Check | Status | Evidence |
|-------|--------|----------|
| Send/verify OTP, cooldown, expiry, invalid | PASS | Automated suite |
| Rate limiting | PASS | `express-rate-limit` on parent-auth routes |
| Single active device / revoke | PASS | Session service + tests |
| Admin view/revoke sessions | PASS | Admin routes + tests |
| Legacy email Parent JWT without `sid` | PASS (documented risk) | `requireAuth` skips device assert without `sid` — intentional for web email parents (**P2** tighten later) |
| OTP logged in DEV SMS mode | PASS for local / **P2** for prod misconfig | `sms.provider.ts` `[OTP_DEV]` |

---

## 7–8. Learning content & Listen/Spell/TTS

| Check | Status | Evidence |
|-------|--------|----------|
| Categories / words / import | PARTIAL | Modules exist; several vocab/publisher tests skipped or failed when `GRADE_1` missing |
| Listen session API | **FAIL** on current DB | `learning.test.ts` expected 201, got 400/404 after GRADE_1 absence |
| TTS mobile | PASS (code) | `apps/mobile/services/speech.ts` |
| `/api/reading/attempt`, `/spelling/attempt`, `/speech/assess` | **FAIL (stub)** | Explicit `501` phase stubs in `routes/index.ts` |
| Progress dashboard accuracy E2E | NOT TESTED | Blocked by curriculum/session failures |

**Root cause note for learning failures:** Local DB was purged of auto `G1–G12` and content `GRADE_1` ladder is incomplete (`GRADE` only). Tests assume seeded `GRADE_1` + Level 1 categories. Treat as **environment FAIL**, not necessarily production code regression — restore with `SEED_CURRICULUM=1` seed on a **test** database before re-run.

---

## 9. Backend / database

| Check | Status | Notes |
|-------|--------|-------|
| Auth middleware + roles | PASS (code + tests) | `requireAuth` / `requireRoles` |
| Parent ownership | PASS (code) | `assertChildAccess` |
| Unique constraints | PASS (schema review) | codes, gradeNumber unique, plan code unique |
| Fresh migrate on isolated DB | NOT TESTED | Not run against empty disposable DB this pass |
| Orphan / dual-catalog hygiene | **FAIL (P1)** | Dual semantics on `LearningGrade` |

---

## 10. Security

| Finding | Severity | Status |
|---------|----------|--------|
| Password hashing (bcrypt) + admin reset token + `passwordChangedAt` JWT revoke | — | PASS (tests) |
| OTP hashed at rest (salt$hash) | — | PASS (code) |
| Session revocation codes | — | PASS (tests) |
| Rate limits on OTP | — | PASS (code) |
| File upload security helpers | — | PASS (code present in vocab/dictionary) |
| CORS / Helmet | — | PASS (app bootstrap — review only) |
| Demo logins auto-restored on API start | **P2** | `ensureDemoLogins` — must be disabled in production |
| OTP console log in DEV SMS | **P2** | Ensure production SMS provider |
| SQL injection | — | PASS (Prisma parameterized) |
| Live XSS / penetration | NOT TESTED | No dynamic browser XSS suite |
| HTTPS / domain / secret vault in prod | BLOCKED | No production access |

---

## 11. UI / device

| Check | Status |
|-------|--------|
| Admin mobile Structure / Plans polish | PASS (recent fixes; visual re-check recommended) |
| Admin web desktop/tablet matrix | NOT TESTED |
| Parent Android/iOS device lab | NOT TESTED |
| PhoneFrame web preview | PASS (exists) |

---

## 12. Performance

| Check | Status |
|-------|--------|
| Instrumented timing / load tests | NOT TESTED |
| Static risk: dashboard N+1 grade/content loads | Noted | Admin dashboard fans out multiple GETs |

---

## 13. Backup & deployment

| Check | Status |
|-------|--------|
| `docker-compose.yml` present | PASS (file exists) |
| Restore drill | NOT TESTED |
| Production URLs / Play Store / privacy | BLOCKED / NOT TESTED | Do not change prod credentials |
| Migration + rollback plan documented | PARTIAL | Migrations exist; formal rollback runbook not verified |

---

## 14. Automated testing (executed)

### Full server suite (`npm run test` in `server/`)

| Metric | Result |
|--------|--------|
| Test files | 7 failed · 17 passed (24) |
| Tests | **8 failed · 85 passed · 8 skipped (101)** |
| Duration | ~38s |
| Raw log | `docs/audit/phase10b-test-run-raw.txt` |

**Failed tests (executed):**

1. `content-structure.test.ts` — expects `GRADE_1` (missing in local DB)  
2. `content-structure.test.ts` — grade1 truthy  
3. `content-structure.test.ts` — delete suggest assertion  
4–7. `learning.test.ts` — Level 1 curriculum / sessions (depends on Grade 1 content)  
8. `vocab-programme-grades.test.ts` — expects 4 grades `GRADE_1`–`4`

**Skipped suites (framework skip, not pass):** publisher-reliability, student-programme-visibility, vocab-publisher, word-management (partial skips).

### Critical suite (re-run after PlanPurpose fix)

```
tests/phase10b-academic-plans.test.ts
tests/parent-otp-device.test.ts
tests/admin-password-reset.test.ts
tests/batch10-payments.test.ts
tests/auth.test.ts
→ 5 files, 40 passed
```

### Child seats (executed)

`child-seats.test.ts` — **2 failed** (seat capacity / unseated child expectations). Treat as **P1** until re-verified on clean seeded DB.

### TypeScript

| Target | Result |
|--------|--------|
| `server` `tsc --noEmit` | **PASS** (exit 0) after PlanPurpose fix |
| Root `npm run typecheck` | **FAIL** — Windows path break (`SIWI-Read IT & Spell IT` → `Spell` not recognized) + prior PlanPurpose error |

### Frontend / mobile automated tests

**NOT TESTED** — no dedicated Jest/Detox suite executed this pass.

### Lint

**NOT TESTED** this pass.

---

## 15. Defect correction (this audit branch)

### P1 — `PlanPurpose` missing 3/6 month (TypeScript + runtime typing)

- **Defect:** `payment.service.ts` compared `purpose` to `FAMILY_3_MONTH` / `FAMILY_6_MONTH` but `PlanPurpose` only allowed monthly/yearly/extra → `tsc` error TS2367.  
- **Root cause:** Phase 10B durations added to academic plans / payment routes without extending `plans.ts` union.  
- **Fix:** Extended `PlanPurpose` in `server/src/payments/plans.ts`.  
- **Files:** `server/src/payments/plans.ts`  
- **Re-test:** `tsc --noEmit` exit 0; critical 40 tests passed.

### Prior fixes already on `main` (context, not re-audited as new work)

- Stop G1–G12 resurrection (boot + Levels ensure-defaults).  
- Publish subscription plans by default; parent catalog polish; duration sort.

### Not fixed in this pass (documented only — avoid feature expansion)

| ID | Severity | Item |
|----|----------|------|
| D-01 | P1 | Child has no `gradeId`; Parent cannot persist Admin school grade per child |
| D-02 | P1 | Dual `LearningGrade` catalogs (content vs academic) drive wrong Admin counts |
| D-03 | P1 | `/reading`, `/spelling`, `/speech` still 501 stubs |
| D-04 | P1 | `child-seats.test.ts` failing — verify on clean DB then fix if real |
| D-05 | P1 | Learning/content tests fail without `GRADE_1` seed — restore test DB |
| D-06 | P2 | Demo login ensure on API start unsafe for production |
| D-07 | P2 | Parent email JWT without `sid` bypasses device binding |
| D-08 | P3 | Admin lessons still hardcodes Grade 1–4 picker labels |

---

## Final summary table (required statuses)

| # | Module / theme | Status |
|---|----------------|--------|
| 1 | Admin auth + reset | PASS |
| 2 | Parent OTP + device session | PASS |
| 3 | Academic Level/Grade/Plan APIs | PASS |
| 4 | Parent subscription catalog UI | PASS (code; manual device NOT TESTED) |
| 5 | Content structure CRUD | FAIL (current DB) / BLOCKED for clean claim |
| 6 | Learning listen/spell sessions | FAIL (current DB) |
| 7 | Dictionary / vocab import | PARTIAL / skipped tests |
| 8 | Programmes / publisher | SKIPPED / FAIL hooks |
| 9 | Payments (batch 10 automated) | PASS |
| 10 | Live payment gateway | BLOCKED |
| 11 | Child seats | FAIL |
| 12 | Schools | NOT TESTED (suite exists; not singled out this pass) |
| 13 | Reading/Spelling/Speech APIs | FAIL (stubs) |
| 14 | Child school-grade persistence | FAIL |
| 15 | Security (core) | PASS with P2 notes |
| 16 | Performance lab | NOT TESTED |
| 17 | Backup/restore drill | NOT TESTED |
| 18 | Production deploy readiness | **NOT READY** |

### Counts

| Metric | Value |
|--------|-------|
| Modules audited (inventory rows) | 20+ |
| PASS | Auth, OTP, Academic 10B APIs, Payments batch10, server tsc (post-fix) |
| FAIL | Learning content tests (DB), child-seats, speech/read/spell stubs, child grade field, dual-grade UX |
| BLOCKED | Live Razorpay, production HTTPS/secrets, clean migrate drill |
| NOT TESTED | Device lab, web Admin matrix, lint, load tests, Play Store |

### Production readiness

**Little Readers is not production-ready** based on this audit. Automated auth/OTP/academic/payment unit coverage is strong, but curriculum DB integrity, child grade model gap, seat regressions, and unimplemented reading/spelling/speech endpoints block release.

### Recommended next actions (priority)

1. Provision a **fresh test database**, run migrations + `SEED_CURRICULUM=1` seed, re-run full `server` vitest.  
2. Resolve dual-grade Admin UX (separate Structure content grades vs Academic Setup school grades in counts/lists).  
3. Design + implement Child↔Grade persistence using published catalog (schema + Parent UI) as a dedicated feature ticket — not a silent schema drop.  
4. Fix or quarantine `child-seats` failures with evidence on clean DB.  
5. Replace 501 learning stubs only when product phase plans require — do not fake PASS.  
6. Disable demo login ensure and DEV OTP logging in production configs.

---

## Appendix — commands executed

```text
git checkout -b audit/phase-10b-full-system
cd server && npm run test
  → 85 passed, 8 failed, 8 skipped
cd server && npm run test -- tests/phase10b-academic-plans.test.ts tests/parent-otp-device.test.ts tests/admin-password-reset.test.ts tests/batch10-payments.test.ts tests/auth.test.ts
  → 40 passed
cd server && npm run test -- … child-seats …
  → 2 failed
cd server && node ../node_modules/typescript/bin/tsc --noEmit
  → exit 0 (after PlanPurpose fix)
```

**Report file:** `docs/audit/PHASE-10B-FULL-SYSTEM-AUDIT-REPORT.md`  
**Raw full test capture:** `docs/audit/phase10b-test-run-raw.txt`
