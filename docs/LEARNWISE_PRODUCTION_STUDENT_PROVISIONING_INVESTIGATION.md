# Learn Wise — Production Student Provisioning Investigation

**Date:** 2026-11-20  
**Mode:** **READ ONLY** — no production accounts created · no DB writes · no deploy · no auth/source edits · no commit/push  
**Branch / commit:** `feature/student-id-login` @ `a4377fc`  
**APK:** VC29 retained (not rebuilt)  
**Stash / dirty tree:** preserved · staging empty  

**Classification key:** **VERIFIED** (code +/or production evidence) · **UNVERIFIED** (plausible, not proven end-to-end) · **BLOCKED** (cannot proceed under current constraints)

---

## Executive finding

**Production already exposes a non–Admin Direct Admin API** to create a Child under an **existing Parent** and optionally issue **Student ID + temporary password**:

`POST /api/student/auth/admin/parents/:parentId/children`

Production probe: **401 Unauthorized** (route present; auth required) — **not** 404.  
Admin Direct `POST /api/student/auth/admin/direct-children` remains **404**.

**However:** the only Admin mobile UI that issues Student IDs (`admin-create-student.tsx`) calls **Admin Direct only**, and that screen is **excluded from VC29**. No mobile screen in this tree calls the parent-scoped create or credential-issue endpoints.

**Conclusion:** Account creation **can work without Admin Direct at the API layer** (**VERIFIED** route existence + local service implementation), but **operator-usable Admin UX on VC29 for that path is absent** (**VERIFIED** UI gap). End-to-end production create was **not** executed (**BLOCKED** by read-only rules).

---

## 1. Existing student creation route

### 1.1 Primary non–Admin Direct route (recommended path)

| Item | Detail | Class |
|------|--------|-------|
| Route | `POST /api/student/auth/admin/parents/:parentId/children` | **VERIFIED** (local `student-auth.routes.ts`) |
| Service | `adminCreateChildForParent` in `student-auth.service.ts` | **VERIFIED** |
| Auth | `requireAuth` + `requireRoles("ADMIN", "SUPER_ADMIN")` | **VERIFIED** |
| Body | `createChildSchema` + optional `issueCredential` + optional `preferredStudentLoginId` | **VERIFIED** |
| Default credential issue | `issueCredential !== false` → issues Student ID + temp password (`mustChangePassword: true`) | **VERIFIED** |
| Production presence | Empty POST → **401** (not 404) | **VERIFIED** |
| End-to-end create on production | Not performed | **BLOCKED** (read-only) |

**What it does (code):**

1. Loads active `User` with `role: PARENT` by `:parentId` (404 if missing).  
2. Calls `createChild(parentId, { displayName, birthYear/birthDate, levelId|level, gradeId })` — **does not** use `skipSeatAssignment` (may assign a learning seat if parent subscription capacity allows).  
3. Unless `issueCredential: false`, calls `issueStudentCredential` → unique `studentLoginId`, bcrypt `passwordHash`, returns `temporaryPassword` once.

### 1.2 Credential-only route (existing Child)

| Item | Detail | Class |
|------|--------|-------|
| Route | `POST /api/student/auth/admin/children/:childId/credential` | **VERIFIED** (code) |
| Roles | `ADMIN`, `SUPER_ADMIN`, or owning `PARENT` | **VERIFIED** |
| Production presence | Empty POST → **401** | **VERIFIED** |
| Mobile UI caller | **None** found under `apps/mobile` | **VERIFIED** |

Use when a Child already exists (e.g. Parent used `POST /children`) and only Student ID/password must be issued.

### 1.3 Admin Direct (excluded)

| Item | Detail | Class |
|------|--------|-------|
| Route | `POST /api/student/auth/admin/direct-children` | **VERIFIED** (local code) |
| Service | `adminCreateDirectStudent` → system Sponsor Parent + `skipSeatAssignment: true` | **VERIFIED** |
| Production | **404 Not Found** | **VERIFIED** |
| VC29 APK | Screen held out / excluded | **VERIFIED** (prior prep reports) |

### 1.4 Shared-email OTP create (out of scope for this investigation’s “no OTP” rule)

| Item | Detail | Class |
|------|--------|-------|
| Routes | `/student/auth/admin/shared-email-otp/send|verify|children` | **VERIFIED** (code); prod empty POST → **401** |
| Behavior | OTP to shared Admin mailbox, then wraps `adminCreateChildForParent` | **VERIFIED** |
| Pilot recommendation | **Do not use** for this Grade 1 plan (operator said do not introduce OTP) | **VERIFIED** (policy) |

### 1.5 Parent creates Child (no Student ID)

| Item | Detail | Class |
|------|--------|-------|
| Route | `POST /api/children` (Parent JWT) | **VERIFIED** (mobile `parent.tsx` `addChild`) |
| Production | Empty POST → **401** | **VERIFIED** |
| Issues Student ID? | **No** — creates Child profile only | **VERIFIED** |

### 1.6 Git vs production note

| Item | Detail | Class |
|------|--------|-------|
| `a4377fc` committed tree | **No** `server/src/student-auth/**` tracked at HEAD | **VERIFIED** (`git ls-tree`) |
| Local worktree | Untracked student-auth + modified schema/routes mirror Architecture B | **VERIFIED** |
| Production API | Student-auth admin/login routes live (except Direct) | **VERIFIED** (probes) |

Production backend is **ahead of / divergent from** committed `a4377fc` for student-auth. Local untracked code is the best available map of that surface — **not** proof every production handler matches local line-for-line (**UNVERIFIED** binary equivalence).

---

## 2. Admin authorization requirements

| Requirement | Evidence | Class |
|-------------|----------|-------|
| Admin or Super Admin JWT | `requireAuth` + `requireRoles("ADMIN", "SUPER_ADMIN")` on parent-scoped create | **VERIFIED** |
| Admin login remains Email + Password | Existing `/auth/login` (and Admin mode on login UI); prod empty POST → **400** validation | **VERIFIED** |
| Valid Sponsor Parent `parentId` | `adminCreateChildForParent` requires active `role: PARENT` | **VERIFIED** |
| Parent directory for picking parents | `GET /children/admin/parents` used by admin dashboard; prod GET → **401** | **VERIFIED** |
| Unauthenticated call rejected | Prod parent-scoped create → **401** | **VERIFIED** |
| Successful authorized create | Not tested (would create data) | **BLOCKED** |

---

## 3. Existing Student ID login route

| Item | Detail | Class |
|------|--------|-------|
| Route | `POST /api/student/auth/login` | **VERIFIED** |
| Body | `studentLoginId`, `password`, `installationId`, `platform` (+ optional device fields) | **VERIFIED** |
| Email / phone required? | **No** — lookup by `studentLoginId` only | **VERIFIED** |
| Password handling | `verifyLoginPassword` against `passwordHash`; lockout fields on credential | **VERIFIED** |
| Production | Probe → **400** (route exists; validation/business reject — not 404) | **VERIFIED** |
| Client | VC29 / local `login.tsx` Student tab + `student-login.tsx` | **VERIFIED** (local); VC29 Student tab UI **VERIFIED** prior QA |
| Successful production login | Not tested this run | **BLOCKED** / **UNVERIFIED** |

Parent login remains Email + Password (`/auth/login`). Admin login remains Admin Email + Password. No OTP introduced for Student ID login path under investigation.

---

## 4. Production API compatibility evidence

Base: `https://api.siwiapp.shop/api` — empty/minimal bodies, **no credentials printed**, **no accounts created**.

| Method | Path | HTTP | Interpretation | Class |
|--------|------|------|----------------|-------|
| POST | `/student/auth/login` | **400** | Route mounted | **VERIFIED** |
| POST | `/student/auth/admin/direct-children` | **404** | Admin Direct **not** mounted / not supported | **VERIFIED** |
| POST | `/student/auth/admin/parents/:parentId/children` | **401** | Route mounted; auth required | **VERIFIED** |
| POST | `/student/auth/admin/children/:id/credential` | **401** | Route mounted | **VERIFIED** |
| POST | `/student/auth/admin/children/:id/credential/reset` | **401** | Route mounted | **VERIFIED** |
| PATCH | `/student/auth/admin/children/:id/student-login-id` | **401** | Route mounted | **VERIFIED** |
| POST | `/student/auth/admin/shared-email-otp/*` | **401** | Routes mounted | **VERIFIED** |
| POST | `/student/auth/foo` | **404** | Unknown student-auth path | **VERIFIED** |
| POST | `/children` | **401** | Parent child-create mounted | **VERIFIED** |
| POST | `/admin/children` | **404** | No generic admin children create | **VERIFIED** |
| GET | `/student/auth/me` | **401** | Student session route mounted | **VERIFIED** |
| GET | `/children/admin/parents` | **401** | Admin parent list mounted | **VERIFIED** |

---

## 5. Admin Direct dependencies

| Location | Dependency | Needed for non-Direct create? | Class |
|----------|------------|-------------------------------|-------|
| `apps/mobile/app/admin-create-student.tsx` | Calls `/student/auth/admin/direct-children` only | **N/A for non-Direct** — this UI is Direct-only | **VERIFIED** |
| `apps/mobile/app/admin.tsx` | Quick action href `/admin-create-student` | UX points at Direct; not required by API | **VERIFIED** |
| `server/src/config/env.ts` | `ADMIN_DIRECT_STUDENT_SPONSOR_EMAIL`, `ADMIN_SHARED_STUDENT_OTP_EMAIL` | Direct/OTP config; parent-scoped create does **not** call sponsor ensure | **VERIFIED** |
| `server/src/student-auth/admin-direct-sponsor.ts` | System Sponsor Parent ensure/guards | Used by Direct + login/subscription guards | **VERIFIED** |
| `adminCreateDirectStudent` | Imports sponsor module | Direct only | **VERIFIED** |
| `adminCreateChildForParent` | **No** sponsor import; uses real `parentId` | **Independent of Direct** | **VERIFIED** |
| `issueStudentCredential` | Shared helper | Used by Direct and non-Direct | **VERIFIED** |
| `admin-users.service.ts` | `assertNotAdminDirectSponsorMutation` | Protects sponsor user; not create path | **VERIFIED** |
| `auth.service.ts` | Blocks sponsor email login | Safety; not create path | **VERIFIED** |
| `subscription.service.ts` | Blocks grants to sponsor | Safety; not create path | **VERIFIED** |
| `children.service.ts` | Dynamic import of sponsor helpers (elsewhere) | Seat/create path for normal parents does not require Direct route | **VERIFIED** (createChild itself has no Direct call) |
| Production Direct route | 404 | Excluded | **VERIFIED** |

**Can standard Admin auth create Student ID accounts without Admin Direct?**  
**YES at API level** — via `POST .../admin/parents/:parentId/children` (and/or credential issue on existing child), with Admin JWT + real Parent id — **VERIFIED** from code + production 401/404 contrast.  
**NOT via VC29 Admin UI** — only Direct screen exists locally and is excluded — **VERIFIED**.

---

## 6. Whether account creation can work without Admin Direct

| Question | Answer | Class |
|----------|--------|-------|
| Does a non-Direct Admin create API exist in code? | **Yes** — `adminCreateChildForParent` | **VERIFIED** |
| Is it mounted on production? | **Yes** — 401 not 404 | **VERIFIED** |
| Does it issue Student ID + password? | **Yes** by default (`issueCredential` default true) | **VERIFIED** |
| Does it require system Sponsor Parent? | **No** | **VERIFIED** |
| Does VC29 expose Admin UI for it? | **No** | **VERIFIED** |
| Proven successful production create? | **No** — read-only | **BLOCKED** |
| Sufficient for five pilot families if Parents already exist + Admin uses API tooling? | **Plausible** | **UNVERIFIED** (needs approved dry-run under operator approval) |

---

## 7. Account requirements checklist

| Requirement | Support | Class |
|-------------|---------|-------|
| Unique Student ID | `studentLoginId` `@unique`; generate `LW…` or preferred 4–12 A–Z/0–9 | **VERIFIED** |
| Password | Temp password on issue; stored as `passwordHash` via `hashPassword` | **VERIFIED** |
| Grade 1 assignment | `level: "LEVEL_1"` or `levelId` of published Level 1; `createChild` asserts product grade published/active | **VERIFIED** (code); production Level 1 id value **UNVERIFIED** this run |
| Account status | Child `isActive`; credential `isActive`; `mustChangePassword` default true on Admin issue | **VERIFIED** |
| Secure password handling | Hash at rest; temp returned once in API response; login verify; lockout fields | **VERIFIED** (code) |
| Student login without email/phone | `loginStudent` by `studentLoginId` + password only | **VERIFIED** |
| Parent Email + Password unchanged | Separate `/auth/login` | **VERIFIED** |
| Admin Email + Password unchanged | Same | **VERIFIED** |
| No OTP for this path | Parent-scoped create does not require OTP | **VERIFIED** |

**Seat / subscription caveat:** Non-Direct `createChild` may auto-assign a learning seat if the Parent has capacity. Admin Direct deliberately skips seats (unpaid). Pilot families likely need an entitled Parent subscription — **UNVERIFIED** on production for specific pilot parents (no DB read of seats this run).

---

## 8. Backend or application changes required

| Change | Required for API-only provisioning? | Required for Admin-on-device UX on VC29? | Class |
|--------|--------------------------------------|------------------------------------------|-------|
| Enable Admin Direct on production | **No** (must remain excluded) | **No** | **VERIFIED** |
| New backend create endpoint | **No** — parent-scoped route already live | **No** | **VERIFIED** |
| Backend deploy from this dirty tree | **No** for using existing prod API | N/A | **VERIFIED** (policy + probes) |
| Mobile Admin UI: parent picker + call `.../parents/:parentId/children` | **No** if operator uses approved API tooling | **Yes** for in-app Admin create without Direct | **VERIFIED** gap |
| Wire Parent app to call `.../credential` after add child | Optional alternate | Optional | **VERIFIED** gap |
| Schema migrate on production | Appears already applied (login/credential routes live) | N/A | **UNVERIFIED** exact migration set |
| Commit local student-auth to git | Process/hygiene only; not required to use live API | Separate GitHub decision | **VERIFIED** (HEAD lacks files) |

---

## 9. Recommended safe implementation plan

**Do not enable Admin Direct. Do not introduce OTP. Do not modify production in this investigation.**

### Phase A — Operator confirmation (no code)

1. Confirm five pilot **Parent** accounts already exist on production (Email + Password).  
2. Confirm each Parent has Grade 1 entitlement / seat capacity (or approve subscription grant via **existing** Admin subscription tools — separate approval; not Direct).  
3. Approve a **controlled** Admin API provisioning dry-run (still not done here).

### Phase B — Provisioning procedure (API; no Admin Direct; no OTP)

1. Admin authenticates with Admin Email + Password → JWT.  
2. Resolve Parent user id (`GET /children/admin/parents` or known ids).  
3. `POST /api/student/auth/admin/parents/{parentId}/children` with body including:
   - `displayName`
   - `birthYear` or `birthDate`
   - `level: "LEVEL_1"` **or** production Level 1 `levelId`
   - optional `preferredStudentLoginId`
   - omit `issueCredential` or set `true`
4. Record returned `studentLoginId` + `temporaryPassword` securely (view-once); force change on first Student login.  
5. Student signs in on VC29 with Student ID + Password (no email/phone).  
6. Parent continues Email + Password login.

**Alternate:** Parent creates Child in Parent app (`POST /children` with Grade 1), then Admin or Parent calls `POST .../admin/children/{childId}/credential`.

### Phase C — Optional product work (only after approval)

1. Build Admin mobile screen that uses **parent-scoped** create (not Direct).  
2. Remove/hide Direct tile from `admin.tsx` for production builds.  
3. Rebuild APK only if UI changes are required for operators (VC29 can still be used by families for Student/Parent login).  
4. Align git tree with production student-auth (separate GitHub release task).

### Phase D — Explicit non-goals

- No Admin Direct production enablement  
- No shared-email OTP for this pilot path  
- No Grades 2–4 activation  
- No unapproved subscription/DB changes  

---

## Findings summary table

| # | Finding | Class |
|---|---------|-------|
| F1 | Non-Direct Admin create route exists in local code | **VERIFIED** |
| F2 | Same route mounted on production (401) | **VERIFIED** |
| F3 | Admin Direct production 404 / VC29 excluded | **VERIFIED** |
| F4 | Student login route live; ID+password only | **VERIFIED** |
| F5 | VC29/local Admin UI only wires Direct; no UI for parent-scoped create | **VERIFIED** |
| F6 | Credential issue API live; no mobile caller | **VERIFIED** |
| F7 | Successful production account create | **BLOCKED** (read-only) |
| F8 | Production handler ≡ local source line-for-line | **UNVERIFIED** |
| F9 | Pilot Parent seat/entitlement readiness | **UNVERIFIED** |
| F10 | Creation without Admin Direct is API-feasible | **VERIFIED** (mechanism) / **UNVERIFIED** (ops success) |

---

## Stop

Investigation complete. **No production accounts created. No source changes. No commit/push. VC29 retained. Stash intact.**

**Awaiting operator approval** before any provisioning dry-run, UI work, or distribution.
