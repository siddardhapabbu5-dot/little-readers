# LEARN WISE — Admin Direct Student Creation (Design)

**Date:** 2026-11-20  
**Scope:** Inspection + recommended design only.  
**Environment inspected:** Local staging worktree `feature/student-id-login` (`localhost:5437`).  
**Hard rules honored:** no code changes, no schema changes, no migrations, no production records, no deploy, no commit/push.

**Business goal:** Admin creates unlimited Student ID accounts from **Create Student Account** without registering or selecting a real parent for every student. Subscription stays unpaid until purchase or explicit Admin entitlement.

**Admin / OTP mailbox (central Gmail):** `littlereaders.otp@gmail.com` — for Admin authentication and approved OTP delivery only (already wired as `ADMIN_SHARED_STUDENT_OTP_EMAIL`). **Do not** use this address as the system Sponsor Parent’s login identity.

---

## 1. Findings — Child.parentId

| Constraint | Detail |
|---|---|
| Schema | `Child.parentId String` is **required** (non-null) |
| FK | `parent User @relation(..., onDelete: Cascade)` |
| Index | `@@index([parentId])` |
| Implication | Every Child must point at a `User` row. Omitting `parentId` needs a **schema migration** (not required if we use a system Sponsor Parent). |

**Existing records:** All current Children already have a `parentId`. A system Sponsor Parent approach **does not rewrite** those rows.

**Cascade risk:** Deleting the Sponsor Parent `User` would cascade-delete **all** Children under it (and related progress/credentials/sessions). The system account must be **non-deletable** in practice (guards + ops policy).

---

## 2. Findings — Current student creation

### 2.1 APIs (Student Auth)

| Endpoint | Role | Parent required? | Notes |
|---|---|---|---|
| `POST /api/student/auth/admin/parents/:parentId/children` | ADMIN / SUPER_ADMIN | **Yes** (path param) | Calls `adminCreateChildForParent` → `createChild` + optional `issueStudentCredential` |
| `POST /api/student/auth/admin/shared-email-otp/children` | ADMIN / SUPER_ADMIN | **Yes** (body `parentId`) | OTP to shared Admin mailbox, still needs a Sponsor Parent |
| `POST /api/student/auth/admin/children/:childId/credential` | ADMIN / PARENT | Existing Child | Issue ID on existing Child |
| `POST /api/student/auth/self-register` | Public | Creates/finds PARENT by student email | Different product path |

### 2.2 Service rules

`adminCreateChildForParent` (`server/src/student-auth/student-auth.service.ts`):

- Resolves `parentId` with **`role: "PARENT"`** and `isActive: true`.
- Rejects Admin/Super-Admin users as sponsors (`Sponsor parent not found`).
- Defaults `issueCredential: true` → unique Student ID + temporary password + `mustChangePassword: true`.

`createChild` (`server/src/children/children.service.ts`):

- Always sets `hasLearningSeat: false` on insert.
- Then calls `tryAssignLearningSeat(parentId, childId)`.
- Seat assignment only succeeds with eligible family subscription capacity **or** staff-learner bypass.

### 2.3 Admin UI today

`apps/mobile/app/admin-create-student.tsx`:

- Loads parent directory via `GET /api/children/admin/parents`.
- **Requires** selecting a Sponsor Parent before create.
- Collects Student Name, birth year, Level, Grade, optional preferred Student ID.
- Calls `POST /student/auth/admin/parents/{parentId}/children`.

This UI **does not** match the new “no parent selection” workflow until updated.

### 2.4 Related but different: Admin Practice Child

`getOrCreateAdminPracticeChild(adminId)` attaches a “Practice” Child to the **Admin user id**.

- `isStaffLearnerAccount(ADMIN|SUPER_ADMIN)` → learning treated as entitled **without** paid plan.
- **Must not** be reused for unlimited unpaid Admin-direct students (would grant free learning).

---

## 3. Findings — Sponsor Parent, subscription, entitlement

| Mechanism | How access is decided |
|---|---|
| Family / legacy plan | `Subscription` rows with `userId = parent` and `childId = null` + `Child.hasLearningSeat` |
| Grade entitlement | `Subscription` with `childId` + `levelId` (per-child); Admin grant via `POST /api/subscriptions/admin/grade-grant` |
| Staff learner | Parent user role is ADMIN/SUPER_ADMIN → entitled without payment |

Student JWT carries `parentId` from `Child.parentId`. Learning gates use that Sponsor Parent for ownership/entitlement checks (`assertChildGradeAccess`).

**Unpaid default (desired):** Child with `hasLearningSeat=false` and **no** ACTIVE grade `Subscription` for that child → learning returns **402** `SUBSCRIPTION_REQUIRED` (confirmed in Stage 2 on local staging).

**Local staging inventory:** No existing `system` / `internal` Sponsor Parent user was found. Safe to introduce as a new dedicated row later (approval-gated).

---

## 4. Can one internal system-managed Sponsor Parent work?

### Verdict: **Yes — recommended**, with hard safeguards.

| Requirement | Fit |
|---|---|
| No real parent registration / email / selection / Parent login | Satisfied if system User is internal, non-login, auto-resolved server-side |
| Keep Student ID + password auth | Unchanged (`issueStudentCredential` / `loginStudent`) |
| Keep central Gmail for Admin + OTP only | System Sponsor uses a **different** non-mailbox identity; `littlereaders.otp@gmail.com` stays Admin/OTP only |
| Do not auto-grant subscription | Use **PARENT** role (not ADMIN); do not attach family plan; leave `hasLearningSeat=false`; no grade grant on create |
| Preserve existing Parent/Child/subscriptions/payments/progress | No backfill; existing rows untouched; new Children only point at system Sponsor |
| Unlimited students | No schema seat cap on Child count; family seat logic simply won’t assign seats without a plan |

### Why not make `parentId` optional?

- Touches every ownership, listing, JWT, cascade, and reporting path.
- Requires Prisma migration + broad regression.
- **Not needed** if a locked system Sponsor Parent exists.

### Why not attach Children to the Admin user?

- Triggers **staff learner** entitlement → free learning (violates unpaid-until-entitlement).
- Mixes Admin identity with student sponsor graph.
- `adminCreateChildForParent` already forbids non-PARENT sponsors.

---

## 5. Security, billing, entitlement risks

| Risk | Severity | Mitigation |
|---|---|---|
| Staff-learner free access if sponsor is ADMIN | **Critical** | System sponsor **must** be `role: PARENT` |
| Family subscription on system parent entitles many kids via seats | **High** | Never sell/grant family plan to system sponsor; entitlement only via **per-child grade-grant** or future explicit attach-to-real-parent |
| Parent login to system account lists/controls all direct students | **High** | Unusable password; no mobile OTP; hard-block login by email/flag in auth |
| Cascade delete of system parent wipes all direct students | **Critical** | Forbid delete/deactivate in admin-users flows; ops runbook; optional DB trigger later |
| System parent appears in Admin parent directory / mistaken selection | **Medium** | Hide from `listParentsForAdmin` **or** badge as “System (internal)” and exclude from normal search defaults |
| `createChild` auto-seat if someone later adds family capacity | **Medium** | Skip `tryAssignLearningSeat` when parent is system sponsor (or always leave unpaid on direct-create path) |
| Billing charged to system parent | **High** | Checkout/payment APIs must not treat system sponsor as a paying customer; Admin grade-grant remains the entitlement path for these students |
| Privacy / support confusion (shared sponsor) | **Low–Med** | Store `accountCreationMethod = ADMIN_DIRECT_SYSTEM_SPONSOR`; show “Admin direct” in Admin student views |
| Unlimited growth / abuse | **Med** | Rate-limit Admin direct-create; audit log `createdByUserId` |

**Existing records:** Remain unchanged. No migration of Demo Parent / real parent children onto the system sponsor.

---

## 6. Recommended implementation (awaiting approval)

### 6.1 Data model (no `Child.parentId` nullability change)

Create **one** system-managed User (staging first, then prod with approval):

| Field | Recommended value |
|---|---|
| `role` | `PARENT` |
| `email` | Internal only, e.g. `system.sponsor@internal.learnwise` (not a real inbox; **not** `littlereaders.otp@gmail.com`) |
| `name` | `System Sponsor (Admin Direct)` |
| `passwordHash` | Random high-entropy hash; login blocked in code |
| `mobileE164` | `null` |
| `isActive` | `true` |

Optional env (names only):

- `ADMIN_DIRECT_STUDENT_SPONSOR_EMAIL`
- or `ADMIN_DIRECT_STUDENT_SPONSOR_USER_ID`

Ensure-on-boot or explicit seed script (local/staging first): `ensureAdminDirectSponsorParent()`.

Credential metadata on create:

- `accountCreationMethod`: `ADMIN_DIRECT_SYSTEM_SPONSOR`
- `createdByUserId`: acting Admin

### 6.2 API changes

**Add** (preferred — keeps existing Sponsor Parent flow intact):

```
POST /api/student/auth/admin/direct-children
Auth: ADMIN | SUPER_ADMIN
Body: { displayName, birthYear?, birthDate?, levelId | level, gradeId?, preferredStudentLoginId? }
Behavior:
  1. Resolve system Sponsor Parent (create-if-missing under lock).
  2. createChild(systemParentId, …) with seat assignment skipped / forced unpaid.
  3. issueStudentCredential(mustChangePassword: true, preferred optional / else auto).
  4. Return { child, credentials } — temporaryPassword once; never log plaintext.
```

**Keep unchanged:**

- `POST /api/student/auth/admin/parents/:parentId/children` — real Sponsor Parent attach flow.
- Grade grant: `POST /api/subscriptions/admin/grade-grant` — explicit entitlement only.
- Student login: `POST /api/student/auth/login`.

**Auth hardening:**

- Block Parent email/password and Parent OTP login for the system sponsor identity.
- Reject delete/role-change of system sponsor in admin-user management.

### 6.3 Exact files likely to change (implementation phase)

| File | Change |
|---|---|
| `server/src/student-auth/student-auth.service.ts` | `ensureAdminDirectSponsorParent`, `adminCreateDirectStudent`, skip auto-seat |
| `server/src/student-auth/student-auth.routes.ts` | Mount `POST /admin/direct-children` |
| `server/src/children/children.service.ts` | Optional `skipSeatAssignment` flag **or** detect system sponsor inside `createChild` |
| `server/src/children/children.service.ts` (`listParentsForAdmin`) | Hide or badge system sponsor |
| `server/src/auth/auth.service.ts` (+ parent-auth if OTP) | Block system sponsor login |
| `server/src/config/env.ts` / `.env.example` | Sponsor email/id env names |
| `server/prisma/seed.ts` or `server/scripts/…` | Ensure system sponsor on staging |
| `server/tests/student-auth.test.ts` (or new) | Direct create → unpaid learning 402; login works; no parent picker needed |
| `apps/mobile/app/admin-create-student.tsx` | Remove required parent search for default flow; call `/admin/direct-children`; keep optional “Assign to existing parent” advanced mode if product still wants it |
| Docs | Update Admin create runbook / audit notes |

**Database:**

- **No migration required** for the recommended path (insert one `User` + new `Child` / credential rows only).
- **Do not** alter `Child.parentId` nullability unless a later decision rejects the system-parent approach.

### 6.4 Target Admin UX (after implementation)

1. Admin logs in.  
2. Opens **Create Student Account**.  
3. Enters **Student Name**.  
4. Selects **Level** and **Grade**.  
5. (Optional) Preferred Student ID — else auto-generate.  
6. Submit → unique Student ID + temporary password.  
7. Student logs in with Student ID + password; forced password change as today.  
8. Learning remains **unpaid** until Admin grade-grant or future purchase/attach-to-real-parent.  

No parent registration, parent email, parent selection, or Parent login in this path.

### 6.5 What stays preserved

- All existing Parent ↔ Child links.  
- Existing subscriptions, payments, learning progress, entitlements.  
- Architecture B Student ID / session / rename / reset flows.  
- Real-parent Admin create path (for schools/families that need a true Sponsor Parent).  
- Central Gmail for Admin + approved OTP only.

---

## 7. Implementation sequence (when approved)

1. **Local staging only:** ensure system Sponsor Parent + unit/API tests.  
2. Wire `POST /admin/direct-children` + skip auto-seat.  
3. Update Admin Create Student UI (default = direct).  
4. Verify: create → login → learning **402** → Admin grade-grant → learning allowed.  
5. Security review: login block, delete block, directory hide.  
6. **Separate approval** before any production User insert or `/app` publish.

---

## 8. Stop condition

This document is the inspection deliverable only.

**Recommended decision to approve next:**  
Implement the **single internal system-managed Sponsor Parent (`role: PARENT`)** + **`POST /api/student/auth/admin/direct-children`** + Admin UI simplification — **without** making `Child.parentId` optional and **without** attaching students to Admin users.

**Awaiting explicit approval before any implementation.**
