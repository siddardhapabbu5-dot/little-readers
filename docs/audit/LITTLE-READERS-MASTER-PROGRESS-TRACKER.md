# Little Readers — Master Progress Tracker

**Audit date:** 2026-11-05  
**Scope:** Audit only — no application code, database, vocabulary, programme, or student-progress changes were made for this report.

**Primary sources inspected**
- `docs/audit/LITTLE_READERS_MOBILE_COMPLETE_AUDIT.md` (Batches 1–12 narrative)
- Batch plans/audits: `LITTLE_READERS_BATCH_8_PLAN.md` … `BATCH_12_REMEDIATION.md`, `BATCH_11_FINAL_LAUNCH_AUDIT.md`
- `docs/audit/ADMIN-UX-SIMPLIFICATION-REPORT.md`
- `docs/audit/DICTIONARY-PUBLISHER-PHASE-REPORT.md`
- `docs/audit/FINAL-VOCABULARY-PUBLISHER-VALIDATION.md`
- Supporting plans: dictionary schema, content structure, vocabulary, lessons, seats, payments
- Code/tests present under `apps/mobile`, `apps/web`, `server/src`, `server/tests` (20 Vitest files)
- Git history: only 3 commits on this clone (`84767ba` foundation → `c019021` learning/admin → `9edc5c9` stop tracking uploads); **batch detail lives in docs/audits, not fine-grained git commits**
- `docs/PHASES.md` (older 12-phase SaaS roadmap) — **not** the “yesterday’s 11 steps” plan; that plan is **Batches 1–11**

---

## 1. Original 11-step plan recovered

Yesterday’s sequential delivery plan is documented as **Batch 1 → Batch 11** in `LITTLE_READERS_MOBILE_COMPLETE_AUDIT.md` (with per-batch stop gates). Batch 5b (content structure CRUD) was a sub-step of the dictionary/content track and is rolled into **Step 5** below for the “11 steps” count.

| No. | Original step (Batch) | Original plan intent |
|----:|----------------------|----------------------|
| 1 | Batch 1 — Mobile auth & route safety | Role redirects, AuthGate, hide unfinished menus, Rewards See-all |
| 2 | Batch 2 — Password reset & level shells | Forgot/reset API + UI; LEVEL_2–4 shells; Super Admin seed; Teacher deferred |
| 3 | Batch 3 — Parent & Admin completion | Finish Parent/Admin mobile flows without fake data |
| 4 | Batch 4 — Learning experience | Listen/Spell completion, progress, kids learning UX |
| 5 | Batch 5 (+5b) — Dictionary & content structure | Four-grade dictionary upload/classify/approve/publish; Grade→Level→Group→Category Admin CRUD |
| 6 | Batch 6 — Vocabulary word management | Admin search/edit/deactivate/reclassify words |
| 7 | Batch 7 — Lesson management | Admin lesson CRUD + LessonVocabItem; publish/deactivate |
| 8 | Batch 8 — Kids lessons + seats | Kids lesson picker; subscription seats (base 2 + extras) |
| 9 | Batch 9 — School / Teacher / Classroom | School tenancy, teacher classroom APIs & mobile/web shells |
| 10 | Batch 10 — Payments | Razorpay orders/verify/webhook; checkout handoff |
| 11 | Batch 11 — Final security & launch readiness | Full security/regression audit; honest launch recommendation |

**After the original 11:** Batch 12 remediation, Admin UX simplification, Dictionary rehydrate + automatic publisher, and final vocabulary/publisher validation (tracked as steps 12–15 below so work is not double-counted inside 1–11).

---

## 2. Consolidated tracker

| No. | Development step | Original plan | Current status | Evidence | Remaining work |
|----:|------------------|---------------|----------------|----------|----------------|
| 1 | Mobile auth, AuthGate, role redirects, Rewards See-all | Batch 1 | **COMPLETED** | `apps/mobile/components/AuthGate.tsx`; `routeForRole` in `auth-errors.ts`; `rewards-all.tsx`; Batch 1 section in mobile audit | Physical deep-link / back-stack matrix still device-untested |
| 2 | Password reset + LEVEL_2–4 shells + Super Admin | Batch 2 | **COMPLETED** | `forgot-password.tsx` / web pages; `password-reset.test.ts`; `PasswordResetToken` migration; `super-admin.tsx` | Production Resend delivery; native deep-link reset **NOT TESTED** |
| 3 | Parent & Admin mobile completion | Batch 3 | **COMPLETED** | Parent/Admin screens + Batch 3 audit section; AuthGate retained | Admin was still thin on mobile until step 13 |
| 4 | Learning Listen/Spell experience | Batch 4 | **PARTIALLY COMPLETED** | `learning-play.test.ts`; `learn.tsx` / `play.tsx`; Batch 4 audit | Matching/tracing **Soon**; physical Listen/Spell UX **NOT TESTED** |
| 5 | Four-grade dictionary + content structure CRUD | Batch 5 + 5b | **PARTIALLY COMPLETED** | `dictionary.routes.ts`; `content-structure.routes.ts`; `dictionary-grade.test.ts`; `content-structure.test.ts`; schema docs | Production content quality **BLOCKED** (see Final Validation): G3/G4 curriculum empty of real words; category mis-assignments; synthetic fixtures; missing page refs |
| 6 | Vocabulary word management | Batch 6 | **COMPLETED** | `word-management.test.ts`; `admin-words.tsx`; vocab-import admin APIs | Ongoing human review of published words |
| 7 | Lesson management | Batch 7 | **COMPLETED** | `lesson.routes.ts`; `lesson-management.test.ts`; `admin-lessons.tsx`; web lessons page | Picture Matching / Quiz / Revision play still coming-soon chips only |
| 8 | Kids lessons + child seats / subscription gates | Batch 8 | **COMPLETED** | `batch8-lessons-seats.test.ts`; `child-seats.test.ts`; device-subscription suite | — |
| 9 | School / Teacher / Classroom | Batch 9 | **COMPLETED** | `school.routes.ts`; `batch9-schools.test.ts`; Batch 9 plan/audit | Enroll-by-Child-ID UX thinner than a full directory search; Nest cutover still deferred |
| 10 | Razorpay payment checkout | Batch 10 | **PARTIALLY COMPLETED** | `payment.routes.ts`; `batch10-payments.test.ts` (stub HMAC/verify) | Live/sandbox merchant Checkout UI + public webhook **BLOCKED / NOT TESTED**; approved plan amounts + `PAYMENT_ENABLED` |
| 11 | Final security / launch readiness audit | Batch 11 | **PARTIALLY COMPLETED** | `LITTLE_READERS_BATCH_11_FINAL_LAUNCH_AUDIT.md`; security suites green; launch **not** cleared | EAS `projectId` placeholder; physical devices; HTTPS/backups/monitoring; live payments — still launch blockers |
| 12 | Launch blocker remediation (Level 1 density + test hygiene) | Batch 12 | **PARTIALLY COMPLETED** | `LITTLE_READERS_BATCH_12_REMEDIATION.md`; reported Vitest 66/66 after Level 1 restore; `db:restore-level1-vocab` | EAS / physical / Razorpay merchant / prod ops **still open** |
| 13 | Admin UX simplification (phone-first IA) | Admin UX plan | **COMPLETED** | `ADMIN-UX-SIMPLIFICATION-REPORT.md`; `AdminTabBar.tsx` (Dashboard·Structure·Vocabulary·Lessons·More); grade-first `admin-structure`; vocabulary hub; web `AdminShell` aligned | Website Reports/Settings still thin; Matching/Quiz/Revision play deferred |
| 14 | Dictionary restore + six-month programmes + Kolkata publisher | Dictionary/Publisher phase | **PARTIALLY COMPLETED** | `DICTIONARY-PUBLISHER-PHASE-REPORT.md`; `publisher.service.ts`; migrations `…vocab_programme` + `…vocab_publisher`; tests: `vocab-programme*.ts`, `vocab-publisher`, `publisher-reliability`, `student-programme-visibility` | Content not production-ready (Final Validation); alerts DB-only (no email); day edit UX uses word IDs on phone |
| 15 | Vocabulary & publisher production-readiness validation | Validation audit | **COMPLETED** *(audit)* | `FINAL-VOCABULARY-PUBLISHER-VALIDATION.md`; quality scripts under `server/scripts/audit-*` | Findings make **launch content BLOCKED**; remediation is new work, not “step incomplete” |

---

## 3. Latest work included (post–Batch 11)

Already reflected in rows **12–15**. Highlights:

| Theme | Status | Notes |
|-------|--------|-------|
| Dictionary restoration / rehydrate | Done technically | Entries/senses preserved; no duplicate PDF upload (CSV/JSON only) |
| Grade-wise vocabulary | Partially usable | G1/G2 have real starter words; G3/G4 dominated by synthetic fixtures |
| Six-month programmes | Implemented | 180-day generate/approve/activate; repeats expected when pool &lt; days |
| Automatic Asia/Kolkata publisher | Implemented | DB jobs, pause/resume/stop, retry, missed-day recovery, expiry→COMPLETED without auto-next |
| Future-word student visibility | Implemented | Hidden until day publish; covered by visibility tests |
| Publisher recovery / regression | Tested | Reliability + Listen/Spell/lesson suites evidence in reports |
| Admin phone / website programme controls | Wired | Jobs, alerts, run-once, pause controls |

---

## 4. Deferred / out-of-scope features (do not invent new “fake complete” steps)

| Feature | Status |
|---------|--------|
| Picture Matching gameplay | **PENDING** (Admin “coming soon”; Games tab Soon) |
| Quiz gameplay | **PENDING** |
| Revision gameplay | **PENDING** |
| Tracing | **PENDING** |
| Speech / pronunciation assessment | **PENDING** (API stubs / phase stubs) |
| Offline sync productization | **PENDING / NOT TESTED** |
| Nest `apps/api` as live customer API | **PENDING** (Express is system of record) |
| Native IAP / Play Billing | **PENDING** (web Razorpay handoff used instead) |
| Store submission (EAS real project, privacy, COPPA, screenshots) | **BLOCKED** until EAS + content + device QA |

---

## 5. Actual remaining work (deduplicated)

### Content (blocks educational launch)
1. Remove/deactivate **synthetic/test** vocabulary from student-facing active sets.  
2. Human **NEEDS_REVIEW** pass: category + grade for starter words (not length-only).  
3. Import/approve **real GRADE_3 and GRADE_4** curriculum (do not invent).  
4. Prefer restoring **sourceRef / page** metadata where available.

### Publisher / Admin polish (non-blocking for internal demo)
5. Richer phone day-word picker (not raw IDs).  
6. Optional email/push for `AdminAlert`.  
7. Re-run Final Validation until critical content flags clear.

### Launch / ops (Batch 11–12 blockers still open)
8. Set real **EAS `projectId`** (`apps/mobile/app.json` still `replace-with-eas-project-id`).  
9. Physical **Android + iPhone** smoke (Listen/Spell, Admin, checkout handoff).  
10. Razorpay **merchant sandbox** Checkout + public webhook.  
11. Staging **HTTPS**, DB backup/restore drill, monitoring.  
12. Production env: Resend, CORS lock, plan paise, `PAYMENT_ENABLED` only when authorized.

---

## 6. Final summary answers

1. **How many total development steps were in the original plan?**  
   **11** (Batches 1–11).

2. **How many are fully completed?**  
   **7 of 11** (steps **1, 2, 3, 6, 7, 8, 9**).

3. **How many are partially completed?**  
   **4 of 11** (steps **4, 5, 10, 11**).

4. **How many are pending?**  
   **0 of 11** (all started; deferred play/features listed separately, not as unfinished original steps).

5. **How many are blocked?**  
   **0 of 11** as whole-step status. **Launch itself remains BLOCKED** by nested items (EAS, devices, live Razorpay, prod ops, curriculum quality). Follow-on step **14** is PARTIALLY COMPLETED with production content **BLOCKED**.

6. **What is the exact next step?**  
   **Curriculum & grade quality remediation** (Final Validation criticals): deactivate synthetic fixtures; human-review category/grade for G1–G2 starter words; import/approve real G3/G4 vocabulary — **without inventing words or wiping student progress**. Then re-run `FINAL-VOCABULARY-PUBLISHER-VALIDATION` criteria.

7. **What is the final step before launch?**  
   **Authorized production go-live checklist:** content validation green **and** EAS linked **and** physical device smoke **and** Razorpay merchant E2E **and** staging HTTPS/backups/monitoring **and** explicit approval for live payments/store submit. Until all clear, product stays **NOT production-ready** (consistent with Batch 11/12 and Final Vocabulary Validation).

---

## 7. Counts including follow-on work (12–15)

| Status | Original 11 | Follow-on (12–15) |
|--------|------------:|------------------:|
| COMPLETED | 7 | 2 (steps 13, 15 audit) |
| PARTIALLY COMPLETED | 4 | 2 (steps 12, 14) |
| PENDING | 0 | 0 |
| BLOCKED (whole step) | 0 | 0 |

**Overall product readiness:** **NOT production-ready.** Strong Express backend + Listen/Spell + Admin/programme/publisher plumbing; weak production curriculum (esp. G3/G4), no store/device/merchant/ops proof.

---

## 8. Evidence index (quick)

| Area | Path |
|------|------|
| Master mobile batch log | `docs/audit/LITTLE_READERS_MOBILE_COMPLETE_AUDIT.md` |
| Batch 11 launch audit | `docs/audit/LITTLE_READERS_BATCH_11_FINAL_LAUNCH_AUDIT.md` |
| Batch 12 remediation | `docs/audit/LITTLE_READERS_BATCH_12_REMEDIATION.md` |
| Admin UX | `docs/audit/ADMIN-UX-SIMPLIFICATION-REPORT.md` |
| Publisher phase | `docs/audit/DICTIONARY-PUBLISHER-PHASE-REPORT.md` |
| Content/publisher validation | `docs/audit/FINAL-VOCABULARY-PUBLISHER-VALIDATION.md` |
| Publisher worker | `server/src/programmes/publisher.service.ts` |
| EAS blocker | `apps/mobile/app.json` → `extra.eas.projectId` |
| Server tests | `server/tests/*.test.ts` (20 files) |

---

*End of audit tracker. No development started.*
