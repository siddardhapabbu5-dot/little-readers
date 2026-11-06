# Little Readers — Phase 1–6 Master Pending Checklist

**Created:** 2026-11-06  
**Mode:** Inspection only (no code/DB/prod changes in this audit)  
**Branch:** `fix/phase-10c-critical-defects`  
**Accepted baseline commit:** `b1eb6ef` — *Complete Little Readers Phases 1–5*  
**Working tree note:** Privacy & Play-prep docs exist as **local uncommitted** work after `b1eb6ef` (not part of accepted commit)

**Priority for next work:** Application development & integration — **not** Google Play listing graphics.

---

## 0. How to read phase numbering (important)

Several numbering schemes exist. This checklist uses **Plan A** (go-live Phases 1–6).

| Plan | Source | Meaning |
|------|--------|---------|
| **A — Go-live Phases 1–6** | Commit `b1eb6ef`; ops docs for 4–6; original Phase 1–3 prompts recovered from prior session notes ([Recover go-live Phase 1-6](cac168b1-8a25-4964-86e1-edfb7db6ea18)) | 1 student journey · 2 rewards · 3 parent/teacher/admin/super-admin · 4 backend/business · 5 release prep · 6 audits/builds/store |
| **B — Batches 1–11** | `docs/audit/LITTLE-READERS-MASTER-PROGRESS-TRACKER.md` | Earlier mobile delivery plan (parallel history) |
| **C — PHASES.md 1–12** | `docs/PHASES.md` | **Legacy** SaaS roadmap; stale “Phase 1 Current” — not the go-live ladder |
| **Other “Phase N”** | Home P0/P1 notes; ANDROID_V8 ADB ladder | Micro-sequences / device QA only — do not confuse with Plan A |

**Canonical Plan A titles:** Complete student learning → Rewards & progress → Parent/Teacher/Admin → Backend & business → Production preparation → Release audits/builds.

**Shared hard gates (Phases 1–5):** no Hostinger DB writes; no prod VocabRound migrate; no prod Level-1 restore; no live Razorpay/SMS cutover; no APK/AAB/EAS until Phase 6 approval.

Plan B leftovers (curriculum quality, speech, Nest cutover) remain under **§ Cross-cutting**.

**Doc gap:** Repo ops docs fully spell Phases **4–6**. Phases **1–3** requirements live mainly in prior session prompts plus code under `b1eb6ef` (no `docs/ops/PHASE1_*.md`).

### Status legend

| Code | Meaning |
|------|---------|
| **COMPLETED AND VERIFIED** | Implemented + automated and/or documented local verification |
| **IMPLEMENTED BUT NOT VERIFIED** | Code present; no adequate device/prod/E2E proof |
| **PARTIALLY IMPLEMENTED** | Meaningful code, incomplete vs original requirement |
| **NOT IMPLEMENTED** | Missing product capability |
| **BLOCKED BY EXTERNAL CONFIGURATION** | Needs Hostinger/SMS/Razorpay/Apple/DB migrate approval or credentials |
| **EXPLICITLY DEFERRED** | Documented as out of current phase / later |

---

## Recommended execution order (development-first)

1. **Curriculum / Level-1 content integrity** (staging dry-run → approval → prod) — blocks real learning quality  
2. **VocabRound production migration** (after backup) — unblocks Matching/Quiz/Revision on live API  
3. **Device QA of Listen/Spell/Matching/Quiz/Revision + rewards + parent gate** on local/staging  
4. **SMS/OTP production credentials** (approval) — parent mobile login  
5. **Privacy module** — finish publish + deploy (currently local-only)  
6. **Razorpay sandbox E2E** then live cutover (last among payments)  
7. **Phase 6** device binaries / store — only after product paths above are solid  

---

## Phase 1–2 local validation log (2026-11-06)

**Scope:** Local Docker Postgres + API only. No Hostinger, no migrations, no Level-1 restore, no student wipe, no code changes.

| Suite / probe | Result |
|---------------|--------|
| `learning.test.ts` | **4/4 PASS** |
| `device-subscription.test.ts` | **4/4 PASS** |
| `child-seats.test.ts` | **2/2 PASS** |
| `learning-play.test.ts` | **FAIL suite setup** — `POST /auth/register` → **503 `PRIVACY_POLICY_UNPUBLISHED`** (6 tests skipped/failed before run) |
| Local DB `VocabRound` enum | `LISTEN, SPELL, LETTER, MATCHING, QUIZ, REVISION` present |
| Live HTTP journey on `localhost:4101` (current code) | **26/26 PASS** with `questionCount` ≥ 4 (mobile-aligned: 5/6/8) |

**Journey evidence (demo parent `parent@littlereaders.test`, child `SeatA_*`, additive attempts only):** Listen, Spell, Matching, Quiz, Revision start + correct attempt + duplicate suppressed; weak-words count 2 after incorrects; daily IST `2 → 7` (target 5); points `22 → 66`; achievements present; history OK; parent progress OK; missing-child 404; bad token 401.

**Integration defects found (fix plan — not fixed yet):**
1. `validate` middleware maps **ZodError → HTTP 500** (e.g. `questionCount: 3` or short register name) instead of **400**.
2. Unpublished privacy policy blocks **new** registration → breaks `learning-play` fixture setup (login still works).
3. No dedicated Vitest coverage for MATCHING / QUIZ / REVISION rounds.
4. Stale/long-lived API process on `:4100` can confuse probes; validate against current server code.

---

## Phase 1 — Complete student learning experience

**Original intent (recovered):** Full journey **Login → Register → Home → Learn → Listen → Spell → Matching → Quiz → Revision → Results → Progress**; all five activities live (not placeholders) on existing session/attempt APIs; parent mobile OTP + staff email; Home with real IST daily goal / Continue / activity entry / empty-loading-error (no fake streaks/coins); Level-1 curriculum integration (prod restore not executed); VocabRound `MATCHING|QUIZ|REVISION` migration in repo/local only.

**Out of Phase 1 scope (original):** APK/EAS, payments, Parent/Teacher/Admin rewrites, Hostinger DB.

**Sources:** Prior Phase 1 prompt (session recovery); `b1eb6ef` (`matching`/`quiz`/`revision`/`category-play`/`home`/`learn`/`games`); `server/src/learning/*`; `learning-play.test.ts`; migration `20261106180000_vocab_round_activities`.

| ID | Requirement | Status | Evidence | Remaining work | Blockers / deps | Prod approval? |
|----|-------------|--------|----------|----------------|-----------------|----------------|
| 1.1 | Parent register/login + JWT session | PARTIALLY IMPLEMENTED | Login verified locally; **register** returns 503 until privacy published (`PRIVACY_POLICY_UNPUBLISHED`); `learning-play` setup blocked | Publish policy for local/staging **or** test harness bypass; device matrix | Privacy draft empty | No for login |
| 1.2 | Student/child profile linked to parent | COMPLETED AND VERIFIED | `children` APIs; seats tests; demo children listed in Phase 1–2 probe | Physical UX | — | No |
| 1.3 | Home tab daily goal / continue / activities | IMPLEMENTED BUT NOT VERIFIED | API `summary.daily` verified IST; Home UI still device-untested | Physical Home open | Device | No |
| 1.4 | Listen activity + scoring + idempotent attempts | COMPLETED AND VERIFIED | Local HTTP 2026-11-06: LISTEN attempt + duplicate; `learning.test.ts` still PASS | Re-enable `learning-play` after privacy; physical UX | Privacy for Vitest register | No |
| 1.5 | Spell activity + scoring | COMPLETED AND VERIFIED | Local HTTP: SPELL attempt + duplicate | Same as 1.4 | Privacy for Vitest | No |
| 1.6 | Matching activity (client + API) | COMPLETED AND VERIFIED *(local)* | Local HTTP: MATCHING start/attempt/duplicate; enum present locally; mobile `matching.tsx` uses `questionCount: 6` | Vitest suite missing; **Hostinger enum** still gated | Prod VocabRound migrate | **Yes** (prod only) |
| 1.7 | Quiz activity | COMPLETED AND VERIFIED *(local)* | Local HTTP: QUIZ start/attempt/duplicate; mobile uses count 8 | Vitest missing; prod enum | Prod migrate | **Yes** (prod) |
| 1.8 | Revision activity | COMPLETED AND VERIFIED *(local)* | Local HTTP: REVISION after weak-word seed; revisionNote returned | Vitest missing; prod enum; device UX | Prod migrate | **Yes** (prod) |
| 1.9 | Games / category-play entry points | IMPLEMENTED BUT NOT VERIFIED | Screens exist; API journey OK | Device E2E through Games UI | — | No |
| 1.10 | Network / offline honesty (no fake offline progress) | COMPLETED AND VERIFIED | `NetworkBanner.tsx`; `PHASE5_RELEASE_PREPARATION.md` | — | — | No |
| 1.11 | Legacy `/reading` `/spelling` `/speech` attempt APIs | EXPLICITLY DEFERRED / NOT for Kids Zone | Routes return **501** in `routes/index.ts`; Kids use `/learning/sessions*` | Do not treat as Phase 1 incomplete if Kids Zone path works | Speech product = later | No |
| 1.12 | Speech / pronunciation product | NOT IMPLEMENTED | `server/src/speech` stubs; Plan B deferred list | Full speech product | Product decision | Later |

---

## Phase 2 — Rewards & learning progress

**Original intent (recovered):** All five activities feed **genuine** progress (no sample metrics); student dashboard (attempts, correct, weak words, accuracy, category/level, recent activity, daily goal); IST daily goals across five activities without double-count; stars/points idempotent; achievements (first activity, 10/50/100 words, category milestones) server-confirmed once per child; learning history; revision ↔ weak-word linkage; parent progress for authorized children only.

**Out of Phase 2 scope (original):** Prod migrate/restore, payments, SMS, APK, Phase 3.

**Sources:** Prior Phase 2 prompt; `b1eb6ef` (`rewards.tsx`, `progress-rewards.ts`, `learning-history.tsx`, `rewards-all.tsx`).

| ID | Requirement | Status | Evidence | Remaining work | Blockers | Prod approval? |
|----|-------------|--------|----------|----------------|----------|----------------|
| 2.1 | Progress + points on correct attempts | COMPLETED AND VERIFIED | Local HTTP: points 22→66 across five activities; duplicates do not re-award | — | — | No |
| 2.2 | Achievement catalog / unlocks | COMPLETED AND VERIFIED *(API)* | Local HTTP: achievements board 6 / earned 3 after journey | Device unlock UX | — | No |
| 2.3 | Rewards tab + see-all | IMPLEMENTED BUT NOT VERIFIED | API rewards data OK; mobile UI device-untested | Device QA | — | No |
| 2.4 | Learning history screen | COMPLETED AND VERIFIED *(API)* | `GET .../history` 200; progress payload includes history | Device UI | — | No |
| 2.5 | Daily goal (IST) across five activities | COMPLETED AND VERIFIED *(API local)* | Local: daily 2→7, target 5, timezone Asia/Kolkata after Listen/Spell/Matching/Quiz/Revision | Device Home badge; prod enum for Matching+ | Prod VocabRound | No (local) |
| 2.6 | Weak-word / revision linkage | COMPLETED AND VERIFIED *(API local)* | Incorrect Listen → weak count 2 → REVISION session started | Device UX | — | No |
| 2.7 | Parent progress for authorized children only | COMPLETED AND VERIFIED *(API partial)* | Parent token sees own child; missing child 404; bad token 401. Cross-parent register fixture blocked by privacy | Restore cross-parent Vitest after privacy test strategy | Privacy unpublished | No |

---

## Phase 3 — Parent, Teacher & Admin management

**Original intent (recovered):** **Parent** — children, progress/reports, achievements/history, weak words, devices + transfer/reset, **PIN gate**, own-children only. **Teacher** — classrooms, students, progress, assign/enroll, classroom-scoped authz. **Admin** — real stats; manage parents/teachers/students/schools; activate/deactivate without deleting learning history. **Super Admin** — platform/schools/admin accounts/org separation. Backend authz (not UI-only); roles PARENT/TEACHER/SCHOOL_ADMIN/ADMIN/SUPER_ADMIN; no new STUDENT UserRole.

**Out of Phase 3 scope (original):** Subscription/billing → Phase 4; no APK/prod ops.

**Sources:** Prior Phase 3 prompt; `b1eb6ef` (`parent`, `teacher`, `admin-users`, `admin-schools`, `super-admin`, `RequireParentGate`); Plan B Batches 3/8/9; parent PIN migration.

| ID | Requirement | Status | Evidence | Remaining work | Blockers | Prod approval? |
|----|-------------|--------|----------|----------------|----------|----------------|
| 3.1 | Parent dashboard / children CRUD UX | IMPLEMENTED BUT NOT VERIFIED | `parent.tsx`; children APIs | Physical parent flows | — | No |
| 3.2 | Child seats (base + extras) | COMPLETED AND VERIFIED | `child-seats.test.ts`; `batch8-lessons-seats.test.ts` | — | — | No |
| 3.3 | One-device student lock + transfer | COMPLETED AND VERIFIED | `device-subscription.test.ts` | Physical install proof | — | No |
| 3.4 | Parent PIN gate for adult tools | IMPLEMENTED BUT NOT VERIFIED | `ParentGateModal`; `parent-gate.service`; migration `20261106160000_parent_pin_gate` | Confirm migration on every env used; device UX | Local migrate history was messy earlier | Staging/prod migrate if missing |
| 3.5 | Teacher dashboard | IMPLEMENTED BUT NOT VERIFIED | `teacher.tsx`; `batch9-schools.test.ts` | Thicker enroll UX deferred in tracker | — | No |
| 3.6 | Admin users / schools mobile | IMPLEMENTED BUT NOT VERIFIED | `admin-users.tsx`, `admin-schools.tsx` | Broader admin E2E | — | No |
| 3.7 | Super Admin shell | IMPLEMENTED BUT NOT VERIFIED | `super-admin.tsx` | Device | — | No |
| 3.8 | School tenancy APIs | COMPLETED AND VERIFIED | `batch9-schools.test.ts` | Nest cutover still deferred (Plan C) | — | No |

---

## Phase 4 — Backend / business integration & production ops prep

**Original intent:** Harden SMS/OTP & payments code paths; prepare (not execute) VocabRound migrate, Level-1 restore, Razorpay live, Hostinger env; subscription/payment services; deployment plan.

**Sources:** `PHASE4_PRODUCTION_OPS_PLAN.md`; `DEPLOYMENT_SEQUENCE.md`; `b1eb6ef` (sms.provider, payment.service, devices routes, subscriptions).

| ID | Requirement | Status | Evidence | Remaining work | Blockers | Prod approval? |
|----|-------------|--------|----------|----------------|----------|----------------|
| 4.1 | SMS provider abstraction (console/msg91/http) | COMPLETED AND VERIFIED *(code)* | `sms.provider.ts`; env schema | Wire **production** credentials | Hostinger secrets | **Yes** |
| 4.2 | Parent OTP send/verify + device session | COMPLETED AND VERIFIED *(local/tests)* | `parent-otp-device.test.ts` | Live SMS delivery test | 4.1 prod config | **Yes** for live SMS |
| 4.3 | `OTP_DEV_MODE` / no OTP leak in prod JSON | COMPLETED AND VERIFIED *(code intent)* | env + otp service hardening in Phase 4 commit | Confirm Hostinger `OTP_DEV_MODE` unset | Ops verify | Ops check |
| 4.4 | Razorpay order/verify/webhook code | PARTIALLY IMPLEMENTED | `batch10-payments.test.ts` (stub); payment routes | Merchant sandbox UI + public webhook **NOT TESTED** | Keys; `PAYMENT_ENABLED` | **Yes** for live |
| 4.5 | Keep live payments off until approval | COMPLETED AND VERIFIED *(policy)* | `PAYMENT_ENABLED` default false; Phase 4/5 docs | Do not enable casually | — | Gate |
| 4.6 | VocabRound MATCHING/QUIZ/REVISION migration **file** | COMPLETED AND VERIFIED *(artifact)* | `migrations/20261106180000_vocab_round_activities/` | Apply staging → prod | Backup; enum irreversibility | **Yes** |
| 4.7 | VocabRound migration **on Hostinger** | BLOCKED BY EXTERNAL CONFIGURATION | Phase 4 plan “NOT executed”; runtime probe in `canUseExtendedRounds()` | Staging deploy then prod | Approval + backup | **Yes** |
| 4.8 | Level-1 750-word restore **script** | COMPLETED AND VERIFIED *(artifact)* | `db:restore-level1-vocab`; local Home P0/P1 ran on Docker | Staging dry-run → prod | Backup | **Yes** |
| 4.9 | Level-1 restore **on Hostinger** | BLOCKED BY EXTERNAL CONFIGURATION | Explicitly not executed | Approval + dry-run | 4.8 | **Yes** |
| 4.10 | Hostinger API/DB integration (ongoing prod) | PARTIALLY IMPLEMENTED | Live API `api.siwiapp.shop` used by mobile `.env` / EAS | Deploy latest `b1eb6ef`+ code; apply pending migrates | Ops | **Yes** for changes |
| 4.11 | Subscription plans / eligibility services | COMPLETED AND VERIFIED *(tests)* | `phase10b-academic-plans`; subscription service | Live checkout | 4.4 | Sandbox then live |

---

## Phase 5 — Release preparation (config & docs — not store launch)

**Original intent:** App identity, EAS profiles, network banner, ops documentation; **no** AAB/IPA generation.

**Sources:** `PHASE5_RELEASE_PREPARATION.md`; `eas.json`; `app.json`; `docs/ops/*_RELEASE.md`.

| ID | Requirement | Status | Evidence | Remaining work | Blockers | Prod approval? |
|----|-------------|--------|----------|----------------|----------|----------------|
| 5.1 | Android app id / versionCode / permissions | COMPLETED AND VERIFIED *(config)* | `app.json` `com.littlereaders.app` versionCode 10 | Bump when shipping | — | No |
| 5.2 | iOS bundle id / privacy plist stubs | PARTIALLY IMPLEMENTED | `app.json` ios block; `ascAppId` still placeholder in `eas.json` | Apple Developer + Asc App ID | Apple account | External |
| 5.3 | EAS project linked | COMPLETED AND VERIFIED *(config)* | `projectId` `05c9d4b3-…`; owner `tjgf-hjgl` | — | Expo login | No |
| 5.4 | EAS profiles (dev/preview/staging/production) | COMPLETED AND VERIFIED *(config)* | `eas.json` | Run builds only in Phase 6 | Approval | Phase 6 |
| 5.5 | Ops docs (Android/iOS/EAS/env/deploy/store checklist) | COMPLETED AND VERIFIED *(docs)* | `docs/ops/*` | Keep updated | — | No |
| 5.6 | Offline productization (queue/sync) | EXPLICITLY DEFERRED | Phase 5 honest limits | Not in Phase 5 scope | Product | Later |
| 5.7 | Privacy & children’s compliance (admin + public + consent) | PARTIALLY IMPLEMENTED | **Local uncommitted** `server/src/privacy/*`, schema/migration, mobile/web UI | Merge; local migrate already possible; **publish policy**; prod migrate | Legal content; admin publish | **Yes** for prod migrate |
| 5.8 | Generate store binaries | EXPLICITLY DEFERRED | Phase 5 forbids builds | Phase 6 | Approval | Phase 6 |

---

## Phase 6 — Verification, binaries, store path

**Original intent (from Phase 5 “next”):** Approved EAS Android AAB; iOS IPA after Apple creds; install testing; page-wise audits; store submission when checklist complete.

**Sources:** `PHASE5_RELEASE_PREPARATION.md` § Phase 6; `DEPLOYMENT_SEQUENCE.md` §4–5; `STORE_SUBMISSION_CHECKLIST.md`.

| ID | Requirement | Status | Evidence | Remaining work | Blockers | Prod approval? |
|----|-------------|--------|----------|----------------|----------|----------------|
| 6.1 | Readiness / API health audits | PARTIALLY IMPLEMENTED | Prior Phase 6 inspection steps in session history; API health 200 historically | Re-run after deploys | — | No |
| 6.2 | Android config review | PARTIALLY IMPLEMENTED | `ANDROID_RELEASE.md`; preview builds existed historically | Production AAB not this audit | — | Phase 6 |
| 6.3 | iOS config review | BLOCKED BY EXTERNAL CONFIGURATION | `IOS_RELEASE.md`; missing `ascAppId` / Apple | Apple enrollment | Apple | **Yes** |
| 6.4 | EAS Android production AAB | EXPLICITLY DEFERRED / NOT DONE in Phase 5 | Docs forbid until approval | Explicit approval then build | 4.x product readiness preferred first | **Yes** |
| 6.5 | EAS iOS production IPA | EXPLICITLY DEFERRED | Same | Apple + approval | 6.3 | **Yes** |
| 6.6 | Real-device install testing (Android + iOS) | NOT IMPLEMENTED *(as completed gate)* | ANDROID_V8 / screenshot env: **no emulator/device** often | Full smoke matrix | Device lab | No (testing) |
| 6.7 | Page-wise product audits | PARTIALLY IMPLEMENTED | Many `docs/audit/*` exist; not a closed Phase 6 sign-off | Fresh pass after Matching migrate + content | — | No |
| 6.8 | Store listing / Play–App Store submit | EXPLICITLY DEFERRED | Play prep docs exist; **not** product priority now | After 6.4–6.7 + privacy URL | Privacy publish; legal | **Yes** |

---

## Cross-cutting items (Plan B / content — still genuine pending app work)

These are **not** “Play Store tasks.” They block educational go-live even if Phases 1–5 code merged.

| ID | Requirement | Status | Evidence | Remaining | Prod approval? |
|----|-------------|--------|----------|-----------|----------------|
| X.1 | Remove/deactivate synthetic vocabulary from student sets | PARTIALLY / BLOCKED content | `FINAL-VOCABULARY-PUBLISHER-VALIDATION.md` | Human content ops | Careful prod edits |
| X.2 | Real GRADE_3 / GRADE_4 curriculum | NOT IMPLEMENTED *(content)* | Same validation report | Import/approve real words — **do not invent** | Yes if prod |
| X.3 | Publisher / programme mechanics | COMPLETED AND VERIFIED *(code/tests)* | publisher tests | Content quality separate | No |
| X.4 | NestJS `apps/api` customer cutover | EXPLICITLY DEFERRED | ARCHITECTURE / Batch 9 | Express is SoR | Product |
| X.5 | Native IAP / Play Billing | EXPLICITLY DEFERRED | Tracker | Web Razorpay handoff used | Later |
| X.6 | Tracing gameplay | NOT IMPLEMENTED | Tracker deferred | — | Later |

---

## Working tree vs accepted commit (`b1eb6ef`)

| Area | In `b1eb6ef`? | Notes |
|------|---------------|-------|
| Matching/Quiz/Revision UI + learning service | Yes | Prod enum migrate still gated |
| Rewards / progress-rewards | Yes | |
| Parent/Teacher/Admin expansions | Yes | |
| SMS/payment hardening + ops docs | Yes | |
| EAS/app.json Phase 5 | Yes | |
| Privacy compliance module | **No — local only** | Needs review/merge + migrate |
| Play Store asset prep | **No — docs only** | Deprioritize vs app work |

---

## Summary counts (Plan A go-live requirements above)

Approximate classification of Plan A rows (1.x–6.x):

| Status | Approx. count |
|--------|---------------|
| COMPLETED AND VERIFIED | ~15 |
| IMPLEMENTED BUT NOT VERIFIED | ~15 |
| PARTIALLY IMPLEMENTED | ~8 |
| NOT IMPLEMENTED | ~2 (speech product; closed device QA gate) |
| BLOCKED BY EXTERNAL CONFIGURATION | ~5 (VocabRound prod, Level-1 prod, SMS prod, Razorpay live, iOS Apple) |
| EXPLICITLY DEFERRED | ~5 (offline sync, legacy 501 APIs as product, Nest, IAP, Phase 6 builds/store) |

**Product readiness judgment:** Strong local/backend implementation for Phases 1–5 **code**, but **not** production-complete: content quality, Hostinger migrates, live SMS/payments, device verification, and privacy publish remain open.

---

## Correct next development task (recommendation)

**Do not start Play Store submission work.**

**Next approved development/integration task should be:**

1. **Confirm staging/local Matching–Quiz–Revision** against a DB that already has VocabRound extended enums (local Docker may already), with automated or manual test evidence; then  
2. **Prepare/execute VocabRound staging migrate + Level-1 dry-run** under explicit approval — these unblock live learning parity; **or**  
3. **Curriculum quality remediation (X.1–X.2)** if educational launch is the gate — per Master Progress Tracker.

If choosing a single “first” task after this audit:  
**→ Device/staging verification of Listen → Spell → Matching → Quiz → Revision + rewards, on local API with demo accounts, documenting failures** — pure development validation, no Play Console, no Hostinger writes until separately approved.

---

*End of checklist. No implementation started. Await approval before any next phase execution.*
