# Learn Wise VC31 — Student Subscription Navigation Fix Report

**Date:** 2026-11-20  
**Device (observed):** Samsung Galaxy S24 SM-S921B · `RZCX42381TM`  
**Package:** `com.littlereaders.app` · **versionCode:** 31  
**API:** `https://api.siwiapp.shop/api`  
**Existing test student (no new create):** `DEPPU1727` · child `cmwp3gbqr0008koeh8g3an87z`  
**Scope:** Identify root cause; fix in mobile source; verify locally/staging.  
**Not done (per limits):** no second student, no seat/subscription grant, no production data change, no backend deploy, no APK rebuild/distribution, no GitHub commit/push.

**Final assessment:** **ROOT CAUSE IDENTIFIED + SOURCE FIX COMPLETE + LOCAL VERIFY PASS.** On-device confirmation of the fix requires a later VC31+ rebuild (not in this task).

---

## 1. Observed failure

1. Student account created and logged in (temp password → password change → re-login).
2. Student home opened.
3. Tap **Subscription** → app returned to the **login** page (session cleared).

When this investigation began, the S24 was already on the login / welcome screen (session lost). No second production student was created. Reproduction of the **API/session-clear mechanism** was confirmed via route code + live `GET /subscriptions/me` → **401** for non-user tokens.

---

## 2. Root cause

### Primary (Subscription route)

| Layer | Finding |
|-------|---------|
| Navigation | Student Home (blocked / no seat) → `router.push("/subscription")` |
| Route guard (VC31) | `AuthGate roles={ROLE_SETS.parentFamily}` — **STUDENT not allowed** |
| AuthGate me probe | Source (and VC31 build window) uses `GET /student/auth/me` for `STUDENT`; `GET /auth/me` still rejects student JWTs with **401** |
| Billing APIs | `GET /subscriptions/me`, `/subscriptions/children`, `/payments/me` sit behind **`requireAuth` + PARENT/ADMIN/SUPER_ADMIN** (`server/src/devices/device.routes.ts`) |
| Session clear | Any authenticated `apiRequest` that returns **401** calls `notifyUnauthorized()` → `clearSession()` → `router.replace("/login")` (`api.ts` + `_layout.tsx`) |

**Exact loss point:** Student JWT hitting a **User-only** endpoint (or `/auth/me`) → **HTTP 401** → global unauthorized handler clears the student token.

If AuthGate only bounced with `forbidden` → `/(tabs)/home`, the session would survive. The **login** bounce requires a **401-driven clearSession**. That happens when:

1. Any code path still calls **`/auth/me`** with a student session (cold start `index.tsx`, Profile tab refresh, app-resume `checkParentSessionAlive`, older AuthGate), **or**
2. Subscription is allowed through and then **`useFocusEffect` calls `/subscriptions/me`** (parent billing) with the student JWT.

Subscription purchase/management is **Parent-only** by design. Students must not be redirected to login merely because they have no seat; they need a **student-safe status / parent guidance** screen that **does not** call parent billing APIs.

### Intended product behavior

| Role | Subscription screen |
|------|---------------------|
| Parent / Admin | Unchanged manage/purchase UI (`RequireParentGate` + `/subscriptions/*`) |
| Student | Read-only guidance: **“Ask your parent to manage your subscription”**; preserve session; back to home |

---

## 3. Endpoint / route evidence

| Call | Auth | Student JWT outcome |
|------|------|---------------------|
| `GET /api/student/auth/me` | `requireStudentAuth` | 200 when session valid |
| `GET /api/auth/me` | `requireAuth` (User) | **401** |
| `GET /api/subscriptions/me` | `requireAuth` + PARENT/ADMIN/SUPER_ADMIN | **401** (live check with non-user bearer → 401) |
| `GET /api/payments/me` | Parent/user auth | **401** for student |

**Route before fix:** `/subscription` → `AuthGate(parentFamily)` → parent UI + parent APIs.  
**Route after fix:** `/subscription` → `AuthGate(parentOrStudentBilling)` → STUDENT safe view **or** parent UI.

---

## 4. Files changed

| File | Change |
|------|--------|
| `apps/mobile/app/subscription.tsx` | AuthGate → `parentOrStudentBilling`; `StudentSubscriptionSafeView` (no billing APIs); parent UI unchanged under `RequireParentGate` |
| `apps/mobile/app/index.tsx` | Cold start: STUDENT uses `/student/auth/me` |
| `apps/mobile/app/(tabs)/profile.tsx` | Profile refresh: STUDENT uses `/student/auth/me` |
| `apps/mobile/services/api.ts` | Resume probe: STUDENT uses `/student/auth/me` |
| `apps/mobile/app/(tabs)/home.tsx` | Hide Parent dashboard CTA for STUDENT on blocked home |
| `apps/mobile/app/(tabs)/learn.tsx` | Remove Parent dashboard CTA from blocked gate (Subscription CTA remains) |
| `apps/mobile/components/AuthGate.tsx` | Already correct (STUDENT → `/student/auth/me`); unchanged this pass |

**Not changed:** backend, production DB, APK, Admin/Parent subscription workflows (parent branch preserved).

---

## 5. Local / staging verification

Script: `exports/vc31-sub-nav/local-verify-subscription-nav.mjs`

| Check | Result |
|-------|--------|
| `parentOrStudentBilling` includes STUDENT | PASS |
| Subscription AuthGate uses that role set | PASS |
| Student copy: “Ask your parent to manage your subscription” | PASS |
| Student view has no `/subscriptions/me` or `/payments/me` | PASS |
| Parent view still calls `/subscriptions/me` | PASS |
| AuthGate / index / profile / resume use `/student/auth/me` for STUDENT | PASS |
| Live `GET /subscriptions/me` non-user bearer → 401 | PASS |

**10/10 passed.**

### Test plan coverage (source-level)

| Scenario | Status |
|----------|--------|
| Student home → Subscription → remains authenticated + parent guidance | **PASS (source)** — needs APK rebuild for on-device |
| Back to student home; session valid | **PASS (source)** — safe view does not clear token |
| Parent/Admin subscription access unchanged | **PASS (source)** — `ParentFamilySubscriptionScreen` preserved |
| No seat / no subscription grant | **PASS** — no backend/data changes |
| On-device VC31 APK with this fix | **NOT RUN** — no APK rebuild per limits |

---

## 6. Stop / next owner approval

Stopped after local/staging verification.

**Next (needs owner approval):** rebuild/distribute a Level-1 production APK (VC32+) containing this fix; re-test on S24 with `DEPPU1727` only (no new student). Do not deploy backend changes for this issue.
