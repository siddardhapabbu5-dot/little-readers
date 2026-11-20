# Learn Wise — Grade 1 Admin Student Provisioning Implementation Report

**Date:** 2026-11-20 (updated — operator **approved** QA; partial execution)  
**Design:** `docs/LEARNWISE_GRADE1_ADMIN_STUDENT_PROVISIONING_DESIGN.md` (**APPROVED**)  
**Investigation:** `docs/LEARNWISE_PRODUCTION_STUDENT_PROVISIONING_INVESTIGATION.md`  
**Primary code:** `apps/mobile/app/admin-create-student-grade1.tsx`  
**Dashboard:** `apps/mobile/app/admin.tsx`  
**Branch / commit:** `feature/student-id-login` @ `a4377fc` (HEAD unchanged)  
**Stash:** `stash@{0}` preserved · **no** commit/push · **no** deploy · **no** student accounts created · **VC29** not overwritten  

---

## Status: **PARTIAL QA EXECUTED · CREATE / UI STEPS BLOCKED**

| Gate | Result |
|------|--------|
| Operator approval for M1–M15 procedure | **Received** (`approved`) |
| Code-level checks 1–8 | **PASS** (static review) |
| Production Admin auth (API) | **PASS** — internal demo Admin role `ADMIN` |
| Parent directory load (API) | **PASS** — 17 parents returned (emails masked in logs) |
| Grade 1 `LEVEL_1` available (API) | **PASS** — `available=true` |
| In-app UI on installed VC29 | **BLOCKED** — versionCode **29** does not include `admin-create-student-grade1` |
| Create student (M7) | **BLOCKED** — no operator-designated **test Parent** (will not pick a live family Parent unilaterally) |
| Student login / password change / seat / G2–4 (M11–M14) | **BLOCKED** (depends on create) |
| Accounts created this run | **None** |

---

## QA execution log (2026-11-20, post-approval)

### Environment

| Item | Value |
|------|--------|
| Device | SM-S921B `RZCX42381TM` connected |
| Installed app | `com.littlereaders.app` **versionCode 29** (VC29 production APK) |
| New screen in VC29 binary | **No** |
| Local screen file | Present (uncommitted) |
| Create API call | **Not sent** |

### Checklist results

| Step | Result | Evidence |
|------|--------|----------|
| M1 Admin sign-in | **PASS** (API) | `POST /auth/login` → role `ADMIN` (password not recorded) |
| M2 Open Create Student (Grade 1) UI | **BLOCKED** | VC29 has no route/screen; dashboard in installed APK still predates this change |
| M3 Parent list loads | **PASS** (API) | `GET /children/admin/parents` → **17** rows |
| M4 Select approved test Parent | **BLOCKED** | Operator must name which Parent is the approved **test** account |
| M5–M6 Details / Grade 1 UI | **BLOCKED** | Needs build with new screen |
| M6 Grade mapping (API) | **PASS** (API) | `GET /children/learn-wise-grades` → `LEVEL_1` available; 3 other grades present (HOLD — unused by UI) |
| M7 Create Student | **BLOCKED** | No designated test Parent; no create performed |
| M8–M10 Handover / clear | **BLOCKED** | Depends on M7 + UI build |
| M11–M15 Login / learning / HOLD / network | **BLOCKED** | Depends on M7 |

### Intentional non-actions

- Did **not** call `POST .../parents/:parentId/children`  
- Did **not** use Admin Direct  
- Did **not** activate Grades 2–4  
- Did **not** rebuild or overwrite VC29  
- Did **not** deploy web/backend  
- Did **not** commit/push  

---

## What the operator must provide to unblock M4–M15

1. **Designated production test Parent** (email or Parent user id) — explicitly approved for one non-pilot student create.  
2. **Build path** for the new UI, one of:
   - Expo/dev client against this worktree, or  
   - New APK that includes `admin-create-student-grade1` (**without** deleting the existing VC29 artifact).  
3. Confirmation to proceed with **one** create under that Parent after the UI is available.

---

## Code-level verification evidence

### 1. Admin Dashboard navigation — **PASS**

| Check | Evidence |
|-------|----------|
| Quick action title | `admin.tsx` ~L329: `"Create Student (Grade 1)"` |
| Route | `admin.tsx` ~L331: `href: "/admin-create-student-grade1"` |
| Direct route unlinked | No dashboard href to `/admin-create-student` |
| Screen exists | `apps/mobile/app/admin-create-student-grade1.tsx` (Expo Router file route) |

**Expected operator path:** Admin login → Admin Dashboard → **Create Student (Grade 1)** → wizard steps Parent → Details → Confirm → Handover.

---

### 2. Parent-list API integration — **PASS**

| Check | Evidence |
|-------|----------|
| Endpoint | `GET /children/admin/parents` via `apiRequest` (`loadDirectory`, ~L168) |
| Auth | Screen requires Admin/Super Admin token (`getToken` / `getUser`, ~L194–201); `apiRequest` attaches bearer |
| Selection | `selectedParent.id` used as `parentId` (~L287) |
| UX | Search filter (`filteredParents`), refresh button, empty-state message (~L451–455) |
| Types | `ParentDirectoryRow`: `id`, `name`, `email`, `childCount`, optional `subscription` |

---

### 3. Student-creation request and response handling — **PASS**

**Request** (`onCreate`, ~L286–298):

```
POST /student/auth/admin/parents/{parentId}/children
{
  displayName,
  birthYear,
  levelId: grade1.levelId,
  level: "LEVEL_1",
  issueCredential: true,
  preferredStudentLoginId?  // optional
}
```

| Check | Evidence |
|-------|----------|
| Parent-scoped path only | Template string with `encodeURIComponent(selectedParent.id)` (~L287) |
| Double-submit guard | `if (loading) return` + disabled Create button (~L276, ~L615–616) |
| Response type | `CreateResponse` = `{ child, credentials }` (~L59–62) |
| Success path | Requires `credentials.studentLoginId`; then sets handover state (~L301–318) |
| Missing credentials | Error + `clearHandoverSecrets()` (~L301–305) |
| Errors | `catch` → `mapCreateError` (~L320–321) |

---

### 4. Secure one-time credential display and clearing — **PASS**

| Check | Evidence |
|-------|----------|
| Display only on handover step | `step === "handover" && issued` (~L629) |
| Shows Student ID + temp password | ~L638–644 |
| Copy / Share | `copyText`, `shareCredentials` (~L327–363) — UI only, no logging of values |
| No `console.log` of credentials | Grep: none in this file |
| Error sanitisation | Messages matching `/password\|temporary\|credential/i` replaced (~L140–143) |
| Clear on acknowledge | `completeHandover` → `clearHandoverSecrets` (~L365–374) |
| Clear on leave dashboard | `goBackToDashboard` (~L377–379) |
| Clear on unmount | `useEffect` cleanup (~L207–212) |
| Not persisted to SecureStore | Credentials only in React state |

---

### 5. No Admin Direct dependency — **PASS**

| Check | Evidence |
|-------|----------|
| No `direct-children` call | Grep on grade1 screen: **absent** |
| No OTP / shared-email-otp | Grep: **absent** |
| Comment / copy states Direct unused | File header ~L65–66; UI subcopy ~L409–410 |
| Dashboard no longer links Direct create | Points to `-grade1` only |

(`admin-create-student.tsx` Direct UI may still exist on disk for staging; it is **not** linked from the Admin dashboard.)

---

### 6. Grade 1 level mapping — **PASS**

| Check | Evidence |
|-------|----------|
| Resolve LEVEL_1 | `GET /children/learn-wise-grades` then `levelCode === "LEVEL_1" && available` (~L169–181) |
| Create payload | `levelId: grade1.levelId` + `level: "LEVEL_1"` (~L293–294) |
| UI lock | Grade chip shows Grade 1 only; “Grades 2–4 remain on HOLD” (~L544–551) |
| No G2–4 picker | No level chips for LEVEL_2–4 |

---

### 7. Seat warning behaviour — **PASS**

| Check | Evidence |
|-------|----------|
| Pre-create warning | `parentSeatWarning` when no subscription or non-active status (~L228–237); shown on parent/details/confirm |
| Post-create warning | `hasLearningSeat === false` → seat warn box (~L651–658) |
| Post-create OK | `hasLearningSeat === true` → green confirmation (~L660–661) |
| No automatic seat grant | No calls to seat assign / subscription grant APIs in this screen |

---

### 8. Error handling (401, 403, network) — **PASS**

| Condition | Mapped message | Lines |
|-----------|----------------|-------|
| 401 | “Your Admin session expired. Sign in again as Admin.” | ~L114–116 |
| 403 | “You are not allowed to create student accounts.” | ~L117–119 |
| Network / status 0 / `NETWORK_UNAVAILABLE` | “Could not reach Learn Wise…” | ~L108–110, ~L150–152 |
| Timeout | Timeout copy | ~L111–113, ~L147–149 |
| 404 / parent missing | Refresh parent list copy | ~L120–122 |
| Also covered | 409 ID taken, grade codes, 5xx | ~L123–139 |

---

## Safe manual production QA procedure

**Prerequisites (operator-provided — do not invent):**

1. Approved **production Admin** Email + Password.  
2. Approved **production test Parent** (authorised; prefer known seat/subscription state).  
3. Explicit approval to create **one non-pilot test student** under that Parent.  
4. A build that includes `admin-create-student-grade1` (Expo/dev or post-VC29 APK). **VC29 does not contain this screen.**

**Restrictions during QA:** No Grades 2–4 activation · no Admin Direct · no OTP · no pilot-family accounts · no APK distribution · no backend deploy · no git commit/push unless separately approved.

### Procedure (checklist)

| Step | Action | Pass criteria | Fail / Block |
|------|--------|---------------|--------------|
| M1 | Sign in as Admin (Email + Password) | Lands on Admin Dashboard | Auth failure |
| M2 | Tap **Create Student (Grade 1)** | Opens grade1 wizard (not Direct screen) | Wrong route |
| M3 | Confirm Parent list loads | Approved test Parent visible (search works) | Empty / 401 |
| M4 | Select approved test Parent only | Selection highlighted; seat warning if applicable | Wrong Parent |
| M5 | Enter test child name + birth year; leave preferred ID blank | Validation allows Continue → Review | Validation blocks wrongly |
| M6 | Confirm Grade shows **Grade 1 (LEVEL_1)** only | No G2–4 options | Grade picker wrong |
| M7 | Tap **Create Student** once | 201 path → handover; Student ID shown; temp password shown; `mustChangePassword` true | Error / missing credentials |
| M8 | Note `hasLearningSeat` UI | Warning if false; OK if true; **no seat grant attempted** | Unexpected seat mutation |
| M9 | Share/copy as needed; check acknowledge → **Clear credentials & finish** | Secrets leave the screen; returns to Parent step | Password still visible |
| M10 | Leave via Back to Dashboard mid-handover (optional) | Secrets cleared | Leak in state |
| M11 | Student login with issued ID + temp password | Login succeeds; forced password change | Login/change fails |
| M12 | After password change, re-login | Student session works | Blocked |
| M13 | Grade 1 learning | Access matches seat entitlement | Wrong access |
| M14 | Grades 2–4 | Remain unavailable / HOLD | Unlocked |
| M15 | Optional: airplane mode then Create | Network error copy shown | Crash / raw dump |

**Do not** record temporary passwords in tickets, chat, or this report. Mark incomplete steps **BLOCKED**, not PASS.

---

## Remaining blockers

1. **Designated test Parent** — operator must name the approved production Parent for the one non-pilot create.  
2. **Build gap:** installed VC29 lacks `admin-create-student-grade1` — need Expo/dev or a new APK (keep existing VC29 file).  
3. After create: Student login, `mustChangePassword`, seat warning, Grades 2–4 HOLD on device.  
4. GitHub commit of the new screen still **not** done (separate approval).

---

## Files (uncommitted)

| Path | Role |
|------|------|
| `apps/mobile/app/admin-create-student-grade1.tsx` | New Grade 1 create + handover |
| `apps/mobile/app/admin.tsx` | Dashboard href update |
| `docs/LEARNWISE_GRADE1_ADMIN_STUDENT_PROVISIONING_IMPLEMENTATION_REPORT.md` | This report |

---

## Stop

Operator approval received. Partial production API QA completed; **no student created**.  

**No deploy · no commit/push · no APK distribution · Grades 2–4 not activated · VC29 retained.**

**Awaiting:** (1) designated test Parent, (2) build/path that includes the new Admin Create Student screen.
