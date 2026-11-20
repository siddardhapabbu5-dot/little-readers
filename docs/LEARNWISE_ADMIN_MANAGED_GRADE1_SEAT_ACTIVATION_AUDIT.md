# Learn Wise — Admin-Managed Grade 1 Seat Activation Audit

**Date:** 2026-11-20  
**Scope:** Read-only readiness audit for Admin/Super Admin activation of Grade 1 learning access for production student **DEPPU1727**  
**Business rule:** Parent involvement / parent approval / parent login / parent OTP are **not** required. Admin owns seat/entitlement assignment.  
**Production activation:** **Not performed** — awaiting separate approval  

**Final recommendation:** **READY** (use Admin **grade entitlement** path only; see caveats)

---

## 1. DEPPU1727 account findings

| Field | Value | Evidence |
|-------|--------|----------|
| Student ID | `DEPPU1727` | VC31–VC33 device/API QA |
| Display name | Deepika | Authenticated Home / Profile |
| Child ID | `cmwp3gbqr0008koeh8g3an87z` | Prior provisioning / login payload (session evidence) |
| Parent / sponsor ID | `cmwp3gbqf0006koehvbx2uunp` | Same (technical sponsor parent row) |
| Level | Grade 1 / `LEVEL_1` (`levelId` present; `gradeId` null) | Login / Home “Grade 1” |
| Account status | Active student login works on VC33 | S24 install/test report |
| `mustChangePassword` | `false` (password already changed) | Prior login payload |
| Creation path | Admin-created Student ID + Password (OTP Grade-1 provisioning under system sponsor) | Admin OTP / VC31 one-student lineage |

Passwords, OTPs, and tokens are **not** recorded here.

---

## 2. Existing sponsor relationship

| Item | Finding |
|------|---------|
| Technical parent | Internal **system sponsor** Parent (`system.sponsor@internal.learnwise` by default) |
| Role of sponsor | **Internal DB ownership only** (`Child.parentId` → Parent role user). Not a real family mailbox; not OTP Gmail |
| Real parent account | **Not required** for student login or Admin grade grant |
| Family plan on sponsor | **Blocked** — `SYSTEM_SPONSOR_NO_FAMILY_PLAN` on manual family grant and extra-seat grant |
| This audit | **Did not** change or reattach sponsor |

Code: `server/src/student-auth/admin-direct-sponsor.ts`, guards in `subscription.service.ts` (`grantManualSubscription`, `grantExtraSeats`).

---

## 3. Current seat and subscription status

| Item | Current state |
|------|----------------|
| `Child.hasLearningSeat` | **false** (created with `skipSeatAssignment: true`) |
| Eligible Grade 1 `Subscription` (`childId` + `LEVEL_1`) | **None** (learning locked) |
| Device UX | Home: **“Ask a parent to unlock Grade 1”** / subscription needed (copy only; Admin can unlock without a parent) |
| Learning access | **Not entitled** — expected until Admin grade grant |

Evidence: VC33 S24 report (`docs/LEARNWISE_VC33_SAMSUNG_S24_INSTALL_AND_STUDENT_TEST_REPORT.md`); provisioning design (`skipSeatAssignment` / unpaid until entitled).

**Important model note:** For Admin OTP / system-sponsor students, unlocking Grade 1 is **not** primarily flipping `hasLearningSeat`. The supported Admin path creates a **per-child grade `Subscription`**. Access then unlocks via `getChildGradeAccess` → `via: "GRADE"` **without** requiring `hasLearningSeat`.

---

## 4. Admin activation workflow (as implemented)

Intended business flow maps to code as follows:

| Business step | Existing implementation |
|---------------|-------------------------|
| Admin creates student | `admin-create-student-grade1` + OTP APIs → Student ID + temp password; **no** entitlement |
| Student logs in independently | Student ID + password → `/student/auth/login` |
| Admin opens seat / subscription tools | Admin Settings → **Child seats** → `/admin-seats` |
| Admin selects student | **Grade access (test entitlements)** card: lookup by sponsor Parent email → list children → select **Deepika** |
| Admin assigns Grade 1 access | **Grant 1 month** or **Grant 12 months** (posts immediately) |
| System activates Grade 1 | `POST /api/subscriptions/admin/grade-grant` |
| Student learns | Learn/Home: `getChildGradeAccess` → entitled `via: "GRADE"` |

**Screens**

| Screen | Path | Role |
|--------|------|------|
| Admin Settings | `apps/mobile/app/admin-settings.tsx` | Link **Child seats** |
| Seats admin | `apps/mobile/app/admin-seats.tsx` | Extra-seat capacity UI + embeds grade card |
| **Grade access card** | `apps/mobile/components/AdminGradeAccessCard.tsx` | **Canonical Admin unlock for sponsor students** |

**Confirmation UX:** No separate confirm dialog — SoftButton calls grant immediately. Operator must select the correct child row.

**Do not use for DEPPU1727**

| Path | Why |
|------|-----|
| `POST /subscriptions/seats/grant` (extra seats on family plan) | Blocked / wrong model for system sponsor |
| `POST /subscriptions/admin/grant` (manual family subscription) | Blocked: `SYSTEM_SPONSOR_NO_FAMILY_PLAN` |
| Parent app `seats/assign` | Requires real parent session; not the Admin-managed sponsor workflow |

---

## 5. API and database flow

### Activation API

| Item | Detail |
|------|--------|
| Endpoint | `POST /api/subscriptions/admin/grade-grant` |
| Auth | `ADMIN` / `SUPER_ADMIN` |
| Body | `{ childId, levelId, months }` where `months ∈ {1,3,6,12}` (UI exposes 1 and 12) |
| Service | `grantChildGradeSubscription` in `server/src/subscriptions/grade-subscription.service.ts` |
| Lookup (UI) | `GET /api/subscriptions/admin/grade-access?email=` → `listChildGradeAccessByParentEmail` |
| Reverse | `POST /api/subscriptions/admin/grade-subscriptions/:id/expire` → `expireChildGradeSubscription` |

### Tables updated on grant

| Model | Change |
|-------|--------|
| `Subscription` | New row: `userId = child.parentId` (sponsor), `childId`, `levelId` (Grade 1), `status=ACTIVE`, `startedAt=now`, `expiresAt=base+months`, `provider=manual_admin`, `includedSeats=1` |
| `Payment` | ₹0 `MANUAL_ADMIN` ledger row |
| `SubscriptionAuditEvent` | `GRADE_GRANT` |
| `Child.hasLearningSeat` | **Unchanged** (remains false; not required for `via: "GRADE"`) |

### Validity calculation

- If an eligible same child+level sub exists: `base = current.expiresAt`, else `base = now`
- `expiresAt = base + months` (calendar `setMonth`)
- Plan code e.g. `GRADE_1_1M` / `GRADE_1_12M`
- Stacking extends time rather than creating conflicting parallel access for the same child+level eligibility check

### How lessons unlock

`server/src/learning/grade-access.ts` → `getChildGradeAccess` / `assertChildGradeAccess`:

1. Staff learner bypass (N/A for DEPPU1727)  
2. Eligible **grade** subscription for child’s effective level → **entitled** (`via: "GRADE"`) — **no seat flag required**  
3. Else legacy family + `hasLearningSeat` (N/A / blocked for sponsor)  
4. Else locked → `SUBSCRIPTION_REQUIRED` (402)

Learning sessions/catalog call `assertChildGradeAccess`. Mobile Home/Learn show the unlock banner when `!entitled`.

---

## 6. Parent-independent activation verification

| Requirement | Result |
|-------------|--------|
| No mandatory parent account for student login | **PASS** — Student ID + password |
| No parent OTP / parent approval for Admin unlock | **PASS** — Admin JWT + grade-grant |
| No real parent mailbox required | **PASS** — system sponsor is technical only |
| Admin/Super Admin can grant without parent login | **PASS** — `AdminGradeAccessCard` |
| Student remains independent after grant | **PASS** — student session unchanged; entitlement is server-side on `childId`+`levelId` |
| UI label “Parent email” | **Cosmetic/technical** — for DEPPU1727 enter **system sponsor email**, then pick **Deepika / DEPPU1727**. Does **not** imply parent approval |

Copy on student Home (“Ask a parent to unlock…”) is **user-facing messaging**, not a hard requirement that a parent must act. Admin grade grant clears the lock.

---

## 7. Grade 1 access-control verification

| Check | Result |
|-------|--------|
| Grade 1 / `LEVEL_1` grant supported | **PASS** (service + tests) |
| Entitlement scoped to child’s own level | **PASS** — grant uses `child.level.id` from lookup |
| Grade 1 grant does not unlock Grade 2–4 | **PASS** — `grade-access.test.ts` #9/#10 |
| Wrong-grade content blocked | **PASS** — `GRADE_CONTENT_FORBIDDEN` |
| Progress/content preserved | **PASS** — grant writes subscription/payment/audit only; does not wipe progress |

---

## 8. Duplicate and ownership protection

| Control | Behavior |
|---------|----------|
| Child row lock | `SELECT … FOR UPDATE` on `Child` during grant |
| Same child + grade stacking | Extends from current eligible expiry |
| Wrong child risk | **Operational** — sponsor may list multiple children; Admin must tap grant on **Deepika** only |
| Cross-parent grant by `childId` | Allowed for Admin (by design); ownership recorded as `userId = child.parentId` |
| Family seat reassignment | N/A for unlock path; do not unassign/reassign family seats for this student |
| Expire | Instantly ends eligibility for that subscription id (safe reverse for test/support) |

There is **no** unique DB constraint beyond eligibility logic; duplicate rapid taps stack duration rather than creating two simultaneous conflicting entitlements for access checks.

---

## 9. Test results (non-production)

| Suite | Result |
|-------|--------|
| `server/tests/grade-access.test.ts` | **PASS** (included in run) |
| `server/tests/child-seats.test.ts` | **PASS** (included in run) |
| Combined | **17/17 PASS** (local vitest, 2026-11-20) |

Covered locally: admin grade-grant, cross-grade denial, expire → lock, content isolation, seat capacity (separate path).

**Not run:** production grant for DEPPU1727; mobile E2E Admin → grant → Learn on S24.

---

## 10. Missing functionality / risks

| Risk / gap | Severity | Mitigation |
|------------|----------|------------|
| No confirm dialog before grant | Medium | Careful operator procedure; prefer **Grant 1 month** first |
| Lookup by sponsor email lists **all** sponsor children | Medium | Match display name **Deepika** + Student ID context before grant |
| Home copy still says “Ask a parent…” | Low (UX) | Expected until entitled; optional future copy for Admin-managed students |
| Family / extra-seat UI on same screen | Medium | Do **not** use seat grant/revoke for system sponsor |
| `hasLearningSeat` stays false after grade grant | Low | By design for `via: "GRADE"`; do not treat as failure |
| No production dry-run of grant in this audit | Info | Separate approval required |

---

## 11. Final recommendation

### **READY**

Admin/Super Admin can safely unlock Grade 1 for **DEPPU1727** using the **existing** Admin grade entitlement workflow, **without** parent involvement, **without** attaching a real parent, and **without** changing the system sponsor relationship.

**Approved activation procedure (when separately authorized):**

1. Admin login on production app.  
2. Settings → **Child seats** (`/admin-seats`).  
3. In **Grade access (test entitlements)**, look up Parent email = system sponsor (`system.sponsor@internal.learnwise`).  
4. Select child **Deepika** (Student ID `DEPPU1727` / child `cmwp3gbqr0008koeh8g3an87z`).  
5. Tap **Grant 1 month** (recommended first) or **Grant 12 months**.  
6. Confirm UI shows entitled via grade subscription + expiry.  
7. On S24 as DEPPU1727: Home unlock banner should clear; Grade 1 lessons should start; Grades 2–4 remain locked.

**Do not activate until separate owner approval.**

---

## Restrictions compliance (this audit)

| Restriction | Status |
|-------------|--------|
| No seat/subscription activation for DEPPU1727 | Observed |
| No production DB/student/sponsor changes | Observed |
| No backend deploy / APK rebuild-install | Observed |
| No new student / Grades 2–4 changes | Observed |
| No commit / push | Observed |

**Stopped after this report.**
