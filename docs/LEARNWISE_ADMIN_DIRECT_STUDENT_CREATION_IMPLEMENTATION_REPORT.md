# LEARN WISE — Admin Direct Student Creation (Implementation Report)

**Date:** 2026-11-20  
**Branch / worktree:** `feature/student-id-login` · local staging only  
**Design:** `docs/LEARNWISE_ADMIN_DIRECT_STUDENT_CREATION_DESIGN.md`  
**API:** `http://127.0.0.1:4100` · **DB:** `localhost:5437`  
**Restrictions honored:** no production changes, no prod migrations, no deploy/APK/commit/push, existing customer rows preserved.

---

## 1. Summary

Admin can create unlimited Student ID accounts via **`POST /api/student/auth/admin/direct-children`** without selecting or registering a real Parent. Children link to one internal **system Sponsor Parent** (`role: PARENT`). Subscription stays **UNPAID** until explicit Admin grade entitlement or purchase.

Local staging verification: **12/12 checks PASS**.

---

## 2. Files changed

| File | Change |
|---|---|
| `server/src/student-auth/admin-direct-sponsor.ts` | **New** — ensure/reuse system sponsor; email helpers; mutation guard |
| `server/src/student-auth/student-auth.service.ts` | `adminCreateDirectStudent` (skip seat assignment; `ADMIN_DIRECT_SYSTEM_SPONSOR`) |
| `server/src/student-auth/student-auth.routes.ts` | `POST /admin/direct-children` |
| `server/src/children/children.service.ts` | `createChild(..., { skipSeatAssignment })`; hide system sponsor from Admin parent directory |
| `server/src/config/env.ts` | `ADMIN_DIRECT_STUDENT_SPONSOR_EMAIL` (default `system.sponsor@internal.learnwise`) |
| `server/src/auth/auth.service.ts` | Block system sponsor email/password login |
| `server/src/admin-users/admin-users.service.ts` | Block deactivate/activate of system sponsor |
| `server/src/subscriptions/subscription.service.ts` | Block family plan / extra seats on system sponsor |
| `apps/mobile/app/admin-create-student.tsx` | Removed Sponsor Parent search/selection; calls direct-children; shows **UNPAID** |

**Not changed:** Parent login flows (except system-sponsor block), existing Parent/Child data, Student login/password/session modules, Grade 1–4 content, payment schemas, production VPS.

---

## 3. API evidence (local staging)

### 3.1 Create without parent

`POST /api/student/auth/admin/direct-children` → **201**

| Field | Value |
|---|---|
| Child | `cmwooajtj0005htu4fkpeol64` (`Direct Auto OAJD8`) |
| Sponsor Parent | `cmwooajsz0003htu4oz5jizg9` |
| Student ID | `LWS8TGE355` (auto) |
| `subscriptionStatus` | `UNPAID` |
| `hasLearningSeat` | `false` |
| `mustChangePassword` | `true` |
| Temporary password | Returned once (redacted in evidence; length 13) |
| `sponsorParent.kind` | `SYSTEM_ADMIN_DIRECT` |

### 3.2 Preferred ID + same sponsor

Second create with preferred `ADOAJD8` → **201**  
Same `parentId` / `sponsorParent.id` · Student ID `ADOAJD8`

### 3.3 Duplicate ID

Third create with preferred `ADOAJD8` → **409** `STUDENT_ID_TAKEN`

### 3.4 Unpaid learning

Student login **200** → `POST /learning/sessions` → **402** `SUBSCRIPTION_REQUIRED`

### 3.5 Protections

| Check | Result |
|---|---|
| `POST /auth/login` as system sponsor | **401** `SYSTEM_SPONSOR_LOGIN_BLOCKED` |
| `POST /subscriptions/admin/grant` to system email | **403** `SYSTEM_SPONSOR_NO_FAMILY_PLAN` |
| `POST /admin/users/:id/deactivate` | **403** `SYSTEM_SPONSOR_PROTECTED` |
| `GET /children/admin/parents` | System email **not listed** |

Evidence JSON: `exports/_admin_direct_create_evidence.json`

---

## 4. Database verification (local `:5437`)

### System Sponsor Parent

| Field | Value |
|---|---|
| id | `cmwooajsz0003htu4oz5jizg9` |
| email | `system.sponsor@internal.learnwise` |
| name | `System Sponsor (Admin Direct)` |
| role | `PARENT` |
| mobile | null |
| isActive | true |

### Direct-created students

| Child | Student ID | Method | Hash | Seat |
|---|---|---|---|---|
| `cmwooajtj0005htu4fkpeol64` | `LWS8TGE355` | `ADMIN_DIRECT_SYSTEM_SPONSOR` | `$2a$` / len 60 | false |
| `cmwooak0g000bhtu4b40rdi5n` | `ADOAJD8` | `ADMIN_DIRECT_SYSTEM_SPONSOR` | `$2a$` / len 60 | false |

### Existing records preserved

| Check | Result |
|---|---|
| Demo Parent children (`cmvz4kkxj…`) | Still **106** |
| Original credential `LWQNQD6FSA` | Still **1** |
| New PARENT user | +1 system sponsor only (1040 parents) |

No database reset; no production access.

---

## 5. UI

### Source changes

`apps/mobile/app/admin-create-student.tsx`:

- Removed Sponsor Parent search, selection chips, and “existing child under parent” issue path from this screen.
- Kept Student Name, Birth year, Level, Grade, optional Preferred Student ID.
- Primary CTA: **Create Student Account** → `/student/auth/admin/direct-children`.
- Result card shows Student ID, temporary password (once), and **Subscription: UNPAID**.
- Rename / copy / share retained.

### Screenshot (layout mock of updated screen)

![Admin Direct Create Student UI](../exports/admin-direct-create-student-ui.jpg)

> Illustrative mock of the updated Create Student Account layout (no parent picker; UNPAID badge). Expo web/APK was **not** rebuilt or published in this task (per restrictions).

---

## 6. Local staging test matrix

| # | Test | Status |
|---|---|---|
| 1 | Admin creates student without selecting a Parent | **PASS** |
| 2 | Child record created | **PASS** |
| 3 | System Sponsor Parent linked automatically | **PASS** |
| 4 | Multiple students reuse same system Sponsor Parent | **PASS** |
| 5 | Each Student ID unique | **PASS** |
| 6 | Preferred Student ID works | **PASS** |
| 7 | Duplicate Student ID rejected (409) | **PASS** |
| 8 | Temporary password securely hashed (`$2a$`/60) | **PASS** |
| 9 | New student remains unpaid (learning 402) | **PASS** |
| 10 | Existing customer Parent/Child records unchanged | **PASS** |
| 11 | System Sponsor cannot log in / cannot be deactivated | **PASS** |
| 12 | System Sponsor hidden from Admin parent directory + no family grant | **PASS** |

---

## 7. Remaining / next (out of scope)

- Rebuild/publish Expo web or Android APK when approved.
- Production ensure of system Sponsor Parent + env `ADMIN_DIRECT_STUDENT_SPONSOR_EMAIL` (separate approval).
- Optional: Vitest coverage for `adminCreateDirectStudent`.
- No Git commit/push performed.

---

## 8. Stop

Implementation and local staging verification complete. **No APK build. No production deploy.** Awaiting further approval for packaging/release.
