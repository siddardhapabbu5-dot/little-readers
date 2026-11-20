# Learn Wise — Grade 1 Admin Student Provisioning Design

**Date:** 2026-11-20  
**Mode:** Design + code inspection only — **no** production creates · **no** DB/deploy · **no** source edits · **no** commit/push  
**Branch / commit:** `feature/student-id-login` @ `a4377fc`  
**APK baseline:** VC29 retained  
**Stash / dirty tree:** preserved  

**Related:** `docs/LEARNWISE_PRODUCTION_STUDENT_PROVISIONING_INVESTIGATION.md`

**Out of scope:** Admin Direct · OTP · Parent/Student login redesign · Grades 2–4 activation · backend changes for MVP (use existing APIs)

---

## 1. Design goal

Give production Admins a **mobile** workflow to create Grade 1 Student ID + temporary password accounts under an **existing authorised Parent**, using:

| Piece | Value | Evidence class |
|-------|--------|----------------|
| Create API | `POST /api/student/auth/admin/parents/:parentId/children` | **VERIFIED** (code + prod **401**≠404) |
| Service | `adminCreateChildForParent` | **VERIFIED** |
| Student login | `POST /api/student/auth/login` | **VERIFIED** |
| Parent directory | `GET /api/children/admin/parents` | **VERIFIED** (code + prod **401**) |

Preserve existing Admin / Parent / Student login behaviours. **Do not** call `/student/auth/admin/direct-children`.

---

## 2. Investigation findings (pre-UI)

### 2.1 Exact create request payload

Validated by `adminCreateForParentSchema` = `createChildSchema` **and** optional credential fields (`student-auth.routes.ts`).

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `displayName` | string | **Yes** | trim, 1–50 chars |
| `levelId` **or** `level` | string / enum | **Yes** (one of) | Prefer production `levelId` for `LEVEL_1`; `level: "LEVEL_1"` also accepted |
| `birthYear` | number | Optional* | 1980…current year |
| `birthDate` | string | Optional* | `DD/MM/YYYY` |
| `gradeId` | string \| null | Optional | Academic grade id; must match level if set |
| `issueCredential` | boolean | Optional | Default **issue** when not `false` |
| `preferredStudentLoginId` | string \| null | Optional | 4–12 A–Z/0–9 after normalize; else auto `LW……` |

\*If both birth fields omitted, server stores unspecified birth year `2000` (`resolveBirthFields`). Design **requires** Admin to enter birth year or birthday for pilot quality.

**Recommended Grade 1 create body (conceptual):**

```json
{
  "displayName": "Child Display Name",
  "birthYear": 2021,
  "levelId": "<production LearningLevel id where code=LEVEL_1>",
  "level": "LEVEL_1",
  "issueCredential": true
}
```

Sending both `levelId` and `level: "LEVEL_1"` is allowed; server resolves `levelId` first. UI must ensure selected `levelId` corresponds to `LEVEL_1` only.

Path param: `:parentId` = Parent **User.id** (not email).

### 2.2 Exact create response schema

HTTP **201** `{ data: { child, credentials } }` when credentials issued (**VERIFIED** return of `adminCreateChildForParent`).

**`child`** (from `createChild`):

| Field | Meaning |
|-------|---------|
| `id` | Child id |
| `displayName` | Display name |
| `birthYear` / `birthDate` | Birth fields |
| `level` | Level **code** (e.g. `LEVEL_1`) |
| `levelId` | LearningLevel id |
| `gradeId` / `grade` | Optional academic grade |
| `ageGroup` | Age band code |
| `hasLearningSeat` | `true` if seat assigned; may be `false` if Parent has no eligible capacity |

**`credentials`** (from `issueStudentCredential`, when issued):

| Field | Meaning |
|-------|---------|
| `credentialId` | Credential row id |
| `childId` | Same as child |
| `parentId` | Sponsor Parent user id |
| `studentLoginId` | Unique Student ID |
| `temporaryPassword` | Plain temp password **once** (omitted only if caller supplied password — Admin path does not) |
| `mustChangePassword` | **`true`** for Admin-issued temps |

If `issueCredential: false`, `credentials` is `null` — **not** used for this Grade 1 workflow.

### 2.3 Admin authentication

| Step | Requirement | Class |
|------|-------------|-------|
| Login | Existing Admin Email + Password → JWT (`/auth/login`) | **VERIFIED** unchanged |
| Create route | `requireAuth` + `requireRoles("ADMIN","SUPER_ADMIN")` | **VERIFIED** |
| Parent list | `childrenRouter` `requireAuth` + route `requireRoles("ADMIN","SUPER_ADMIN")` | **VERIFIED** |
| Mobile client | `apiRequest` attaches stored Admin bearer token | **VERIFIED** (`api.ts`) |
| Unauthenticated prod probe | Create/list → **401** | **VERIFIED** (presence only — not a success proof) |

**Not proven without authorized call:** full 201 create on production (**BLOCKED** by read-only rules).

### 2.4 Parent ownership and authorization

| Check | Behaviour | Class |
|-------|------------|-------|
| Parent must exist | `User` with `id = parentId`, `role: PARENT`, `isActive: true` else **404** “Sponsor parent not found” | **VERIFIED** |
| Child owned by that Parent | `createChild(parent.id, …)` sets `child.parentId` | **VERIFIED** |
| Cross-parent create | Impossible via this route without knowing another Parent’s id; Admin is trusted to pick from directory | **VERIFIED** |
| System Sponsor Parent | Hidden from `listParentsForAdmin` via Admin Direct email filter | **VERIFIED** (local); keeps Direct sponsor out of picker |
| Parent cannot call this Admin create | Role gate Admin/Super Admin only | **VERIFIED** |

There is **no** extra “authorised Parent” ACL beyond active Parent role + Admin selection. “Authorised” for the pilot means: **Operator-approved Parent appears in directory and has Grade 1 seat/entitlement readiness** (ops rule — **UNVERIFIED** per family until checked).

### 2.5 How mobile obtains `parentId`

| Source | Path | Class |
|--------|------|-------|
| Existing Admin dashboard fetch | `GET /children/admin/parents` → `ParentRow.id` | **VERIFIED** (`admin.tsx` already loads this) |
| Response fields (service) | `id`, `name`, `email`, `createdAt`, `childCount`, `children[]`, `subscription` | **VERIFIED** |
| Mobile type today | `{ id, name, email, childCount }` | **VERIFIED** — design should also surface `subscription` / children for entitlement warnings |

**Design:** Create-Student screen loads the same directory (or receives selected parent from a Students hub). `parentId` = selected row’s `id`.

### 2.6 Credential endpoint (secondary)

| Item | Detail | Class |
|------|--------|-------|
| Route | `POST /api/student/auth/admin/children/:childId/credential` | **VERIFIED** |
| Roles | Admin / Super Admin / owning Parent | **VERIFIED** |
| Use | Issue ID on **existing** Child (e.g. Parent already added child) | **VERIFIED** |
| Mobile callers today | **None** | **VERIFIED** |

**Primary Grade 1 Admin create** uses parent-scoped create with `issueCredential: true` (single call). Credential endpoint is **fallback / future**, not required for MVP screen flow.

### 2.7 Duplicates

| Case | Behaviour | Class |
|------|------------|-------|
| Preferred Student ID taken | **409** `STUDENT_ID_TAKEN` | **VERIFIED** |
| Child already has credential | **409** `STUDENT_CREDENTIAL_EXISTS` (credential-only path) | **VERIFIED** |
| Same display name under Parent | **Allowed** — no uniqueness on `displayName` | **VERIFIED** |
| Duplicate Parent accounts | Directory lists distinct User rows; Admin must pick correct email | **VERIFIED** |

### 2.8 Password change flow

| Step | Behaviour | Class |
|------|------------|-------|
| Issue | `mustChangePassword: true`, temp via `tempPassword()` (meets letter+number, len≥8) | **VERIFIED** |
| First Student login | `POST /student/auth/login` returns `student.mustChangePassword` | **VERIFIED** |
| Client | Route to `/student-change-password` | **VERIFIED** (`login.tsx` / `student-login.tsx`) |
| Change API | `POST /student/auth/change-password` (student auth) | **VERIFIED** |
| After change | Sessions revoked; client clears session; re-login with Student ID | **VERIFIED** |

**No OTP.**

### 2.9 Grade 1 entitlement handling

| Mechanism | Behaviour | Class |
|-----------|------------|-------|
| Level assignment | `createChild` requires published/active product level; `LEVEL_1` allowed if published | **VERIFIED** |
| Grades 2–4 HOLD (product) | UI **must only** offer Grade 1; do not send `LEVEL_2`–`LEVEL_4` | **Design rule** (HOLD) |
| Learning seat | `tryAssignLearningSeat` — if no eligible subscription/capacity → `hasLearningSeat: false` **without failing create** | **VERIFIED** |
| Learning access | `grade-access` uses family entitlement + seat | **VERIFIED** (pattern) |
| Admin Direct unpaid skip | **Not used** | **VERIFIED** |

**Design implication:** Before Create, show Parent subscription summary from directory. If no seat likely, warn: “Child may be created without a learning seat; Parent needs an active Grade 1 plan/seat.” Do **not** auto-grant subscriptions in this workflow (separate Admin tools / approval).

### 2.10 What 401 does *not* prove

Production **401** on empty calls proves **route mounting + auth middleware**, not:

- Successful create  
- Correct Level 1 `levelId` value  
- Seat assignment outcome  
- Handler ≡ local source line-for-line  

Those remain **UNVERIFIED** until an approved authenticated dry-run.

---

## 3. API contract (summary)

### 3.1 List parents (picker)

```
GET /api/children/admin/parents
Authorization: Bearer <admin_access_token>
→ 200 { data: ParentDirectoryRow[] }
```

### 3.2 Resolve Grade 1 `levelId`

Preferred (product grades):

```
GET /api/children/learn-wise-grades
Authorization: Bearer <admin_access_token>
→ 200 { data: [{ levelId, levelCode, gradeNumber, available, ... }] }
```

Select the row with `levelCode === "LEVEL_1"` and `available === true`.  
Alternate: `GET /api/admin/academic/levels?includeInactive=0` and filter `code === "LEVEL_1"`.

### 3.3 Create student under Parent

```
POST /api/student/auth/admin/parents/{parentId}/children
Authorization: Bearer <admin_access_token>
Content-Type: application/json

{
  "displayName": "...",
  "birthYear": 2021,
  "levelId": "<LEVEL_1 id>",
  "level": "LEVEL_1",
  "issueCredential": true,
  "preferredStudentLoginId": null
}

→ 201 {
  "data": {
    "child": { "id", "displayName", "level", "levelId", "hasLearningSeat", ... },
    "credentials": {
      "studentLoginId",
      "temporaryPassword",
      "mustChangePassword": true,
      "childId",
      "parentId",
      "credentialId"
    }
  }
}
```

### 3.4 Student login (unchanged)

```
POST /api/student/auth/login
{ "studentLoginId", "password", "installationId", "platform", ... }
→ 200 { data: { tokens, student: { mustChangePassword, ... } } }
```

### 3.5 Explicitly unused

| Endpoint | Reason |
|----------|--------|
| `POST .../admin/direct-children` | Admin Direct — **forbidden** |
| `POST .../admin/shared-email-otp/*` | OTP — **forbidden** for this design |

---

## 4. Authorization flow

```
Admin Email + Password
    → POST /auth/login
    → store Admin JWT (existing secure session)
    → Admin Dashboard (existing)
    → Students / Create Student (new)
    → GET /children/admin/parents  (Admin/Super Admin only)
    → select Parent.id as parentId
    → resolve LEVEL_1 levelId
    → POST /student/auth/admin/parents/:parentId/children
    → show secure handover (Student ID + temp password once)
    → Parent receives credentials out-of-band
    → Student: POST /student/auth/login → mustChangePassword → change-password
```

Parent Email + Password login and Student ID + Password login **unchanged**.

---

## 5. Screen flow (mobile)

**Preserve all existing Admin screens and quick actions** except: replace any Admin Direct “Create Student” entry with this workflow (Direct screen must not be linked in production builds).

### Proposed navigation

```
Admin Dashboard
  → Students (hub)                    [new lightweight hub OR section]
      → Create Student                [new screen — NOT admin-create-student Direct]
          → Step 1: Select Parent
          → Step 2: Child details
          → Step 3: Grade 1 confirm
          → Step 4: Create
          → Step 5: Secure credential handover
```

### Step details

| Step | UI | Behaviour |
|------|-----|-----------|
| **1 Select Parent** | Searchable list: name, email, childCount, subscription badge | Load `GET /children/admin/parents`. Require explicit selection. Block create if list empty. |
| **2 Child details** | `displayName`, birth year **or** birthday, optional preferred Student ID | Client validation before POST. |
| **3 Grade 1** | Single locked choice: Grade 1 / `LEVEL_1` | Resolve `levelId` from learn-wise-grades; show label only. **Do not** offer Grades 2–4. |
| **4 Create** | Confirm Parent email + child name + Grade 1 | Single POST; disable double-submit; map API errors to friendly copy. |
| **5 Handover** | Show Student ID + temporary password **once** | Copy / native Share to Parent; acknowledge “I have securely shared these credentials”; then clear sensitive fields from component state. Optional: allow Admin rename via existing `PATCH .../student-login-id` **after** create (same as prior Direct UX) — still no Direct API. |

### Dashboard integration

- Add / replace quick action: **“Create Student (Grade 1)”** → new route (e.g. `/admin-create-student-grade1` — name TBD).  
- **Do not** href `/admin-create-student` (Direct).  
- Leave schools, vocabulary, subscriptions, users, etc. untouched.

---

## 6. Validation rules (client + server)

| Rule | Client | Server |
|------|--------|--------|
| Admin session present | Yes | 401 if missing |
| Parent selected | Yes | 404 if invalid parentId |
| displayName 1–50 | Yes | Yes |
| Birth year/date | Require one for pilot UX | Optional server-side |
| Grade = LEVEL_1 only | Hard-lock UI | Server accepts other levels if sent — **client must not send them** |
| Preferred Student ID | Optional; charset/length | 400 invalid / 409 taken |
| issueCredential | Always `true` in UI | Default true |
| Grades 2–4 | Not selectable | HOLD — no activation |

---

## 7. Security

| Control | Design requirement |
|---------|-------------------|
| No Admin Direct | Never call `direct-children`; no Sponsor Parent create |
| No OTP | No shared-email-otp routes |
| Temp password logging | **Forbidden** in `console.log`, analytics, crash reporters, breadcrumbs |
| Transport | HTTPS production API only (VC29 already) |
| Storage | Keep temp password in **component state** only; do not write to AsyncStorage/SecureStore as long-lived secret |
| Handover | Prefer OS Share sheet / clipboard with clear warning; Admin confirms share before dismiss |
| Screen leave | Clear `temporaryPassword` from state on unmount / after acknowledge |
| Screenshots | Warn Admin that handover screen is sensitive |
| mustChangePassword | Preserve server `true`; do not offer “skip change” |
| Auth | Existing Admin JWT only; no new auth scheme |

---

## 8. Entitlement / seat UX (Grade 1)

1. When Parent selected, show latest `subscription` from directory (plan/status/expiry if present).  
2. If subscription missing/inactive or `childCount` already high, show **warning** (non-blocking or soft-block — product choice): learning may be unavailable until seat/plan fixed.  
3. After create, display `child.hasLearningSeat` clearly: **Seated** vs **No learning seat**.  
4. Do not activate Grades 2–4 or grant subscriptions from this screen.

---

## 9. Error mapping (friendly)

| Code / status | Admin-facing message |
|---------------|----------------------|
| 401 | Session expired — sign in again as Admin |
| 403 | Not allowed |
| 404 Sponsor parent | Parent not found or inactive — refresh list |
| 400 LEVEL_* / GRADE_* | Grade 1 is not available to assign — contact support |
| 409 STUDENT_ID_TAKEN | That Student ID is already in use — choose another |
| 409 STUDENT_CREDENTIAL_EXISTS | This child already has a Student ID |
| Network | Could not reach Learn Wise — retry |

---

## 10. Acceptance criteria

### Must pass before implementation sign-off

| ID | Criterion |
|----|-----------|
| AC1 | Admin Email + Password login unchanged |
| AC2 | Parent Email + Password login unchanged |
| AC3 | Student ID + Password login unchanged |
| AC4 | Workflow never calls Admin Direct or OTP endpoints |
| AC5 | Admin can select Parent from `GET /children/admin/parents` and uses that `id` as `parentId` |
| AC6 | Create sends Grade 1 via verified `LEVEL_1` `levelId` (and/or `level: "LEVEL_1"`) |
| AC7 | Response issues `studentLoginId` + `temporaryPassword` with `mustChangePassword: true` |
| AC8 | Temporary password never appears in application logs |
| AC9 | Handover supports secure share + clears secrets after acknowledge |
| AC10 | Grades 2–4 not offered or activated |
| AC11 | Existing Admin features remain reachable |
| AC12 | First Student login still forces password change via existing screen |

### Post-implementation QA (requires approved accounts — not this design phase)

| ID | Criterion |
|----|-----------|
| AQ1 | Authenticated create on production returns 201 for a pilot Parent |
| AQ2 | Student can log in on VC29 with issued ID + temp password |
| AQ3 | Password change succeeds; re-login works |
| AQ4 | Grade 1 learning accessible only when seat/entitlement allows |
| AQ5 | Grades 2–4 remain inaccessible under HOLD |

---

## 11. Implementation plan (for later approval only)

1. **New screen** implementing Steps 1–5 (parent-scoped API only).  
2. **Dashboard link** swap away from Direct.  
3. **Hold out** Direct screen from production builds (as with VC29).  
4. **No backend deploy required** for MVP if production handlers match local contracts (**UNVERIFIED** equivalence — confirm with one approved dry-run).  
5. Rebuild APK only after UI lands and QA passes — **VC29 remains** until then.  
6. Docs / GitHub commit of UI — separate operator approval.

---

## 12. Open items for operator

| # | Question | Class |
|---|----------|-------|
| O1 | Soft-warn vs hard-block create when Parent has no seat? | Product |
| O2 | Confirm production `LEVEL_1` `levelId` via Admin session | **UNVERIFIED** until authorized GET |
| O3 | Approve authenticated dry-run Parent for AQ1–AQ5 | **BLOCKED** until approval |
| O4 | Screen route name / Students hub vs single screen | UX |

---

## Stop

Design complete. **No source changes. No production provisioning. No commit/push.**

**Awaiting operator approval** before implementation.
