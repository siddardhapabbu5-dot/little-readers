# LITTLE READERS – PHASE 10C CRITICAL DEFECT CORRECTION REPORT

**Branch:** `fix/phase-10c-critical-defects`  
**Baseline:** Phase 10B score **62/100** · 85/101 tests passed · NOT production-ready  
**Date:** 2026-11-05

---

## 1. Defects fixed

| ID | Defect | Correction |
|----|--------|------------|
| D-01 | Child missing `gradeId` | Added `Child.gradeId` FK; create/update validate academic grade ↔ level; Parent + Child UI pick from `/parent/catalog/*` |
| D-02 | Dual grade catalogs inflate Admin counts | Dashboard Grades uses `/admin/academic/grades` filtered by `gradeNumber`; content grades remain for Structure/vocab; `canonicalGradeId` maps legacy → academic |
| D-04 | Child seats tests failing | Seat allocate/unassign lock parent `User` row; no seat without subscription; test resets all prior subs to capacity 2 |
| D-09 | Hardcoded Level-1 Home / web | Mobile Home + web kids curriculum use active child’s `level` code |
| D-10 | No parent grade catalog consumer | Parent Add Child + Child Edit load catalog grades/levels |
| D-03/D-12 (partial) | Unauth 501 stubs | Reading/Spelling/Speech stubs require auth; return `FEATURE_NOT_READY`; Games/Lessons UI marked Coming soon (no fake success) |
| D-06 (partial) | Demo logins in prod | Already skipped when `NODE_ENV=production` (`shouldEnsureDemoLogins`) — verified unchanged |
| PlanPurpose (10B) | TS2367 3/6 month | Already on audit branch; retained |

## 2. Defects remaining

| ID | Severity | Status | Notes |
|----|----------|--------|-------|
| D-05 / learning suite | P1 | **FAIL** | Curriculum volume / session fixtures still fail after seed (`learning.test`, parts of `content-structure`) — needs dedicated Level-1 vocab restore on clean DB |
| D-03 full implement | P1 | NOT IN SCOPE | Reading/Speech/Quiz backends still unfinished by design; gated not implemented |
| D-07 | P2 | OPEN | Parent email JWT without `sid` |
| Device lab / backup / live Razorpay | — | NOT TESTED / BLOCKED | Per Phase 9 rules |

## 3. Files modified (high level)

- `server/prisma/schema.prisma` + migration `20261105180000_phase10c_child_grade_canonical`
- `server/src/children/children.service.ts`
- `packages/validation/src/index.ts`
- `server/src/subscriptions/subscription.service.ts`
- `server/src/routes/index.ts`
- `server/tests/child-seats.test.ts`
- `apps/mobile/app/(tabs)/home.tsx`, `parent.tsx`, `child/[id].tsx`, `admin.tsx`, `games.tsx`, `admin-lessons.tsx`
- `apps/web/src/app/kids/level-1/page.tsx`
- Docs: `PHASE-10C-GRADE-MIGRATION-PLAN.md`, this report

## 4. Database migration

- **Name:** `20261105180000_phase10c_child_grade_canonical`
- **Adds:** `Child.gradeId`, `LearningGrade.canonicalGradeId` (+ FKs/indexes)
- **Data:** Links `GRADE_n` → academic `gradeNumber=n` when both exist
- **Does not:** Delete legacy grades; auto-assign child grades; re-seed G1–G12

**Applied on local DB:** YES (`prisma migrate deploy`).

## 5. Data migration results

- Canonical mapping UPDATE ran (0+ rows depending on whether academic G* exist alongside GRADE_*).
- `SEED_CURRICULUM=1` seed re-run to restore GRADE_1–4 structure after prior purge.
- Child `gradeId` left null for existing children (no silent reset).

## 6–8. Tests (executed)

### Critical regression (executed)

| Suite | Result |
|-------|--------|
| auth, parent-otp-device, admin-password-reset, phase10b-academic-plans, batch10-payments, child-seats | **42/42 PASS** |

### Server TypeScript

`tsc --noEmit` → **PASS** (exit 0)

### Learning / content (executed)

| Suite | Result |
|-------|--------|
| child-seats | PASS |
| learning.test / content-structure | **FAIL** (curriculum/session expectations) |

### Full suite (executed)

| Metric | Phase 10B | Phase 10C |
|--------|-----------|-----------|
| Passed | 85 | **95** |
| Failed | 8 | **6** |
| Skipped | 8 | 0 counted in summary* |
| Total | 101 | 101 |

\*Vitest summary: `6 failed | 95 passed (101)` — see `docs/audit/phase10c-test-run-raw.txt`.

**Overall Phase 10C score: ~71 / 100** (was 62). Test pass rate **94%** (was ~84%).

## 9–13. Other gates

| Gate | Status |
|------|--------|
| Performance lab | NOT TESTED |
| Security (OTP/device unchanged; stubs gated; demo skipped in prod) | PASS with P2 notes |
| Payment live Razorpay | BLOCKED (no live credentials exercise) |
| Backup/restore drill | NOT TESTED |
| Android/iOS device lab | NOT TESTED |

## 14. Updated audit score

| Area | 10B | 10C | Delta |
|------|-----|-----|-------|
| Auth & OTP | 88 | 88 | 0 |
| Academic APIs | 85 | 86 | +1 |
| Payments API | 78 | 78 | 0 |
| Admin grade UX | 55 | **72** | +17 |
| Parent Level/Grade journey | 45 | **70** | +25 |
| Learning sessions | 50 | 52 | +2 (hardcode fixed; tests still fail) |
| Stubs / 501 | 25 | **55** | +30 (gated + UI honesty) |
| Seats | (in payments/parent) | **80** | seats suite green |
| Security | 72 | 74 | +2 |
| Perf / backup / devices | 30–35 | same | NOT TESTED |

**Methodology:** Weighted average of the Phase 10B area weights, updated only where this phase produced evidence (code + executed tests). Areas NOT TESTED keep prior scores.

**Production readiness:** still **NOT READY** — remaining learning/curriculum test failures and unfinished Reading/Speech features remain release blockers.

---

## Migration plan reference

See `docs/audit/PHASE-10C-GRADE-MIGRATION-PLAN.md`.
