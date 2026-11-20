# Learn Wise VC32 — Student Profile Authentication Fix Report

**Date:** 2026-11-20  
**Reference:** `docs/LEARNWISE_VC32_SAMSUNG_S24_INSTALL_AND_STUDENT_TEST_REPORT.md`  
**Scope:** Source-only fix for Student Profile session clear  
**Not done:** backend deploy, APK rebuild/install/distribution, new students, production data changes, Grades 2–4 unlock, commit/push  

**Final assessment:** **SOURCE FIX COMPLETE** + focused unit/contract tests **PASS**. On-device / VC33 verification awaits separate approval.

---

## 1. Exact root cause

| Step | What happens |
|------|----------------|
| 1 | Student opens Profile (`/(tabs)/profile`) or header “Profile” → same tab |
| 2 | Profile renders `<ProfilePhoto />` |
| 3 | `useMyAvatar()` always called `GET /auth/me/avatar` when cache empty |
| 4 | Backend `/auth/me/avatar` uses **User** `requireAuth` — **no student avatar route exists** |
| 5 | Student JWT → **HTTP 401** |
| 6 | `apiRequest` → `handleAuthFailure` → `notifyUnauthorized()` → `clearSession()` → `/login` |

**Important:** Profile’s user refresh was already fixed to `GET /student/auth/me` for STUDENT. That was **not** sufficient — the avatar fetch still hit a Parent/User-only endpoint. Changing only a URL without a real student avatar API would still 401; the correct fix is **do not call** User-only avatar APIs for STUDENT.

Secondary risk (also addressed): “Edit name & email” used `PATCH /auth/me`, which would likewise 401 and clear a student session if tapped.

---

## 2. Files changed

| File | Change |
|------|--------|
| `apps/mobile/services/avatar-auth.ts` | **New** — `canUseUserAvatarApi(role)`; `USER_AVATAR_PATH` |
| `apps/mobile/services/avatar-auth.test.ts` | **New** — unit tests for STUDENT vs Parent/Admin roles |
| `apps/mobile/components/ProfilePhoto.tsx` | `useMyAvatar` skips `/auth/me/avatar` for STUDENT (publish default `null`); upload/remove guarded |
| `apps/mobile/app/(tabs)/profile.tsx` | `editable={allowUserProfileTools}`; hide Edit name/email for STUDENT |
| `server/tests/profile-avatar.test.ts` | Documents backend: student JWT → 401 on `/auth/me/avatar`; `/student/auth/me` still 200 |

---

## 3. Before / after authentication flow

### Before (VC32 on device)

```
Profile mount
  → GET /student/auth/me          ✅ (already fixed)
  → GET /auth/me/avatar           ❌ 401 (User-only)
  → notifyUnauthorized → login
```

### After (source)

```
Profile mount
  → GET /student/auth/me          ✅
  → role === STUDENT?
       yes → show default avatar; NO avatar HTTP call
       no  → GET /auth/me/avatar  ✅ Parent/Admin unchanged
```

Parent/Admin `ProfilePhoto` / `AvatarImage` (e.g. Admin dashboard) still use `/auth/me/avatar` when `canUseUserAvatarApi(role)` is true.

---

## 4. Student avatar handling

| Item | Behavior |
|------|----------|
| Student avatar API | **None** in current backend (`server/src/student-auth` has no avatar routes) |
| UI | Default/fallback emoji avatar |
| Camera / Gallery / Remove | Hidden (`editable={false}` for students) |
| Upload attempt guard | `canUseUserAvatarApi` blocks PUT even if UI were forced |

---

## 5. Parent / Admin behavior

| Role | Expected | Source status |
|------|----------|---------------|
| PARENT | `/auth/me/avatar` GET/PUT unchanged | Preserved |
| ADMIN / SUPER_ADMIN | Same + Admin `AvatarImage` | Preserved |
| TEACHER / SCHOOL_ADMIN | Treated as user-avatar-capable (not STUDENT) | Unchanged path |

No Parent/Admin auth routes or session handling were modified.

---

## 6. Regression test results

| Check | Result |
|-------|--------|
| `node --import tsx apps/mobile/services/avatar-auth.test.ts` | **PASS** |
| Source contract (6 checks: gate, publish null, profile editable, hide edit, student me) | **6/6 PASS** |
| `server/tests/profile-avatar.test.ts` student JWT reject case | **Added**; not executed here (`DATABASE_URL` unavailable in this shell) |
| On-device VC32 retest | **Not run** — no APK rebuild per restrictions |
| Parent/Admin live Profile | **Not re-run on device** — code paths unchanged for non-STUDENT |

### Requirement matrix (source-level)

| # | Requirement | Status |
|---|-------------|--------|
| 1 | Student ID + password login | Unchanged (no touch) |
| 2 | Student Home | Unchanged |
| 3 | Student Profile without login redirect | **Fixed in source** (avatar + edit gates) |
| 4 | Session after open/close Profile | **Fixed in source** |
| 5 | Subscription parent guidance | Unchanged (prior VC32 fix) |
| 6–7 | Cold start / resume | Unchanged (prior `/student/auth/me` paths) |
| 8–9 | Grade 1 / Grades 2–4 locked | Unchanged |
| 10–11 | Parent/Admin Profile | Unchanged for non-STUDENT |

---

## 7. Remaining limitations

1. **Not in any APK yet** — S24 still runs VC32 binary without this fix until a future VC33+ build is approved.  
2. Server vitest for student→avatar 401 was added but not executed in this environment (no `DATABASE_URL`).  
3. Students still cannot upload a custom avatar (by design until a real student avatar API exists).

---

## 8. Production safety confirmation

| Restriction | Confirmed |
|-------------|-----------|
| Source-code changes only | **Yes** |
| No backend deployment | **Yes** |
| No APK rebuild / install / distribute | **Yes** |
| VC29–VC32 APK files unmodified | **Yes** |
| No new students / no prod data / no seats | **Yes** |
| No Grades 2–4 access changes | **Yes** |
| No commit / push | **Yes** |

---

## 9. Stop

Stopped after source fix + focused testing.  
**Do not prepare VC33** until this report is reviewed and separately approved.
