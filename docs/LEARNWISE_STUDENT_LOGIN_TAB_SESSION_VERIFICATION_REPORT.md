# LEARN WISE – Student Login Tab and Session Verification Report

**Date:** 2026-11-20  
**Package on device:** `com.littlereaders.app` · **versionCode 34** (installed APK)  
**Test student:** **DEPPU1727** / Deepika · role `STUDENT` (no password/token logged)  
**Scope:** Source investigation + focused client fixes; on-device **tab UI** verification only  

**Final status:** **SOURCE FIXES COMPLETE** · **VC34 tab UI PASS** · **live Student credential login NOT re-run in this pass** (operator password; no rebuild)

---

## 1. Exact root cause (immediate bounce to login)

### Observed operator symptom
After Admin Grade 1 grant, switching to Student on the S24: login then immediate return to the login page.

### Confirmed causes / contributing factors

| # | Cause | Evidence | Status |
|---|--------|----------|--------|
| A | **Wrong login tab** | Device dump defaulted to **Parent** (“Enter your email address”). DEPPU1727 must use **Student** + Student ID | Operator guidance; tabs verified on VC34 |
| B | **Stale 401 clears new Student JWT** | Any in-flight Admin/Parent request that 401s after a new Student token is saved called `notifyUnauthorized()` → `clearSession()` → `/login` with **no check** that the failing bearer was still current | **Fixed in source** (not in installed VC34 binary) |
| C | Prior Profile avatar `/auth/me/avatar` 401 | Already fixed in VC32–VC34 lineage (`avatar-auth` / `ProfilePhoto`) | Present on VC34 |
| D | AuthGate / index calling `/auth/me` with Student JWT | Already branched to `/student/auth/me` for `STUDENT` | Present on VC34 |

**Primary code bug addressed this pass:** (B) global unauthorized handler treated every authenticated 401 as “kill current session,” including **stale** Admin bearers after Student login.

---

## 2. Files changed

| File | Change |
|------|--------|
| `apps/mobile/services/session.ts` | Added `shouldClearSessionForUnauthorized(requestAuth, currentToken)` |
| `apps/mobile/services/api.ts` | `handleAuthFailure` only `notifyUnauthorized` when failing bearer **still matches** `getToken()` |
| `apps/mobile/app/login.tsx` | Tab switch clears the other role’s identity field (email ↔ Student ID); password already cleared |
| `apps/mobile/components/AuthGate.tsx` | Docstring: Student uses `/student/auth/me` |
| `apps/mobile/services/session.test.ts` | **New** unit tests for stale vs matching 401 |

**Not changed:** backend, DB, APK, Play, Parent/Admin login endpoints, student records, seats/subscriptions.

---

## 3. Login tab verification (VC34 on S24)

Device: `RZCX42381TM` · artifacts under `exports/vc34-student-login-verify/`

| Check | Result |
|-------|--------|
| Tabs visible: Student \| Parent \| Admin | **PASS** |
| Student selectable | **PASS** |
| Student: Student ID + Password placeholders | **PASS** — `Student ID (e.g. LWXXXXXXXX)` + `Enter your password` + `Create Student Account` |
| Parent: Email + Password | **PASS** — `Enter your email address` |
| Admin: Admin email + Password | **PASS** — `Enter admin email address` · no Create account |
| Source: tab switch clears cross-role ID fields | **PASS** (source; ships in next APK) |

---

## 4. Authentication API verification (source)

| Step | Expected | Source status |
|------|----------|---------------|
| Student submit | `POST /student/auth/login` with `studentLoginId` + password + `installationId` | **PASS** (`login.tsx` `onStudentLogin`) |
| Persist session | access (+ refresh) token; user `{ role: "STUDENT", id: childId, email: studentLoginId }` | **PASS** |
| Active child | `saveActiveChild` from login payload | **PASS** |
| Navigate | `/(tabs)/home` (or `student-change-password` if required) | **PASS** |
| Must not use Parent login | Parent uses `POST /auth/login` only on Parent tab | **PASS** |
| AuthGate refresh | STUDENT → `GET /student/auth/me` | **PASS** |
| Index cold start | STUDENT → `GET /student/auth/me` | **PASS** |
| Resume probe | `checkParentSessionAlive` uses `/student/auth/me` for STUDENT | **PASS** |

---

## 5. Session persistence results

| Area | Result |
|------|--------|
| JWT storage | Secure store via `saveToken` / `saveUser` / `saveActiveChild` |
| AuthGate role detection | Cached role + student me refresh |
| Global 401 | **Updated:** clear only if request bearer === current token |
| Profile | STUDENT me + no `/auth/me/avatar` (VC34) |
| Subscription | `StudentSubscriptionSafeView` — no `/subscriptions/*` / `/payments/*` |
| Cold start / resume | Student-safe me paths; fresh-build wipe is one-shot marker `client-v1` |
| Installed APK includes stale-401 fix? | **NO** — source only until next production APK (VC35+) |

---

## 6. Parent / Admin regression (source + UI)

| Check | Result |
|-------|--------|
| Parent tab fields unchanged | **PASS** (on-device) |
| Admin tab fields unchanged | **PASS** (on-device) |
| Parent `POST /auth/login` + role gate | Unchanged |
| Admin `POST /auth/login` + ADMIN/SUPER_ADMIN gate | Unchanged |
| ROLE_SETS still separate Student vs Parent billing | Unchanged |
| Live Parent/Admin password login this pass | **Not re-run** (Admin already used earlier for grade grant; no credential logging) |

---

## 7. Test results

| # | Test | Result |
|---|------|--------|
| 1 | Student tab selection | **PASS** (VC34 UI) |
| 2 | Student ID field visibility | **PASS** |
| 3 | Student password field visibility | **PASS** |
| 4 | Student auth API (source contract) | **PASS** |
| 5 | Student Dashboard navigation | **NOT RUN** live (no credential entry this pass) |
| 6 | Cold start | **NOT RUN** live post-fix |
| 7 | App resume | **NOT RUN** live post-fix |
| 8 | Profile navigation | Source **PASS**; live **NOT RUN** |
| 9 | Subscription navigation | Source **PASS** (student-safe); live **NOT RUN** |
| 10 | Parent authentication | UI tab **PASS**; live login **NOT RUN** |
| 11 | Admin authentication | UI tab **PASS**; grant earlier **PASS**; live re-login **NOT RUN** |
| — | `session.test.ts` | **PASS** |
| — | `avatar-auth.test.ts` | **PASS** |
| — | `auth-errors.test.ts` | **PASS** |

---

## 8. Remaining issues

1. **Stale-401 + tab field-clear fixes are source-only** — installed VC34 will still clear a new Student session if a late Admin 401 arrives. Needs **approved VC35 (or later) APK** to ship on device.  
2. **Live DEPPU1727 login + dashboard/profile/subscription/cold-start** after Admin→Student switch still needs an operator password entry once VC35 is installed (or on VC34 after a clean Admin logout with no in-flight Admin calls).  
3. Student Subscription copy still says “ask your parent” even when Admin grade-grant unlocked learning — **copy only**, not a session clear; out of scope for this fix.  
4. Grade 1 entitlement for Deepika is **already ACTIVE** until 20/12/2026 (Admin grant); this task did **not** modify seats/subscriptions.

---

## 9. Restrictions compliance

| Restriction | Status |
|-------------|--------|
| Existing DEPPU1727 only | Observed |
| No password reset / ID change / new student | Observed |
| No sponsor / seat / subscription writes | Observed |
| No backend deploy / APK rebuild / Play / commit | Observed |
| No secrets in report | Observed |

---

## Next step (separate approval)

1. Approve **VC35** production APK including this session fix.  
2. Install on S24 → Student tab → `DEPPU1727` → confirm Home stays up → Profile + Subscription without bounce.  
3. Then continue Grade 1 journey verification (Learn → Speak → Understand → Play → Complete).
