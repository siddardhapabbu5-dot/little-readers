# Learn Wise — Admin OTP Student Provisioning + Student ID + Login Fix Report

**Date:** 2026-11-20  
**Scope:** Local / staging verification only  
**Branch context:** existing worktree (no commit / push / production deploy / APK)

---

## Root causes

### 1. Student login fails after password change (CONFIRMED)

After a successful temporary-password change, the app clears the session and returns to login. Relogin with Student ID + new password **succeeds on the API**, but the mobile **AuthGate** then calls `GET /auth/me` with the **student JWT**.

- Student tokens are CHILD principals.
- `GET /auth/me` only accepts User access tokens → **401**.
- AuthGate treats 401 as invalid session → `clearSession()` → bounce to login.

**This is the post–password-change “login does not open the student account” loop.**

Password hashing/persistence was not the failure mode: change-password updates the hash, sets `mustChangePassword=false`, increments `sessionVersion`, and revokes prior sessions as designed.

### 2. Admin Grade 1 create required Parent picker (PRODUCT GAP)

The previous Grade 1 Admin UI used `POST /student/auth/admin/parents/:parentId/children`, which forced selecting an existing Parent and could attach students to real parents / seat logic. The agreed workflow is OTP-gated create under a **system-managed sponsor**, without Parent/subscription picker and without Admin Direct UI.

### 3. Kid-friendly Student IDs rejected (PRODUCT GAP)

Preferred Student IDs were limited to **4–12** characters, so short IDs like `sam` failed validation. Uniqueness errors did not suggest alternatives.

---

## What was implemented

### Part 1 — Admin email OTP verification

- Reuses existing `ADMIN_SHARED_STUDENT_CREATE` OTP pipeline (`send` / `verify` / single-use `verificationToken`).
- Shared mailbox remains `ADMIN_SHARED_STUDENT_OTP_EMAIL` (default `littlereaders.otp@gmail.com`).
- OTP never returned in API responses; hashed at rest; expiry, attempt limits, one-time use, Admin-session binding unchanged.
- Create consumes the verification token before create (no replay).
- Mobile Grade 1 flow: email → OTP → details → confirm → handover.

### Part 2 — Student ID editing

- Default ID suggested via `POST /student/auth/admin/suggest-student-login-id`.
- Editable preferred ID before create (3–12 A–Z/0–9, normalized uppercase).
- Backend uniqueness with `STUDENT_ID_TAKEN` + `suggestions` (e.g. `ARJUN02`).
- Concurrent duplicate create/rename maps Prisma `P2002` to the same error.
- Post-create rename on handover screen + Admin **Edit Student ID** screen (`/admin-edit-student-id`).
- Rename updates login identity only (no password reset, no seat/subscription change).

### Part 3 — Student account creation

- `POST /student/auth/admin/shared-email-otp/children` no longer requires `parentId`.
- Creates under system Sponsor Parent (`ensureAdminDirectSponsorParent`) with `skipSeatAssignment: true`.
- Method tag: `ADMIN_SHARED_EMAIL_OTP` (not Admin Direct UI / not `ADMIN_DIRECT_SYSTEM_SPONSOR` path for this screen).
- Forces Grade 1 / `LEVEL_1`; Grades 2–4 rejected with `GRADE_LOCKED`.
- Issues unique Student ID + temporary password; `mustChangePassword: true`.

### Part 4 — Login-after-password-change fix

- `AuthGate` uses `GET /student/auth/me` when cached role is `STUDENT`.
- `student-login.tsx` now saves `activeChild` (aligned with main login student path).
- Password-change still requires re-login (sessions revoked); new password + Student ID then open home via AuthGate.

### Part 5 — Automated tests

File: `server/tests/admin-otp-student-provisioning.test.ts`

| # | Scenario | Result |
|---|----------|--------|
| 1 | OTP send + verify (OTP absent from API body) | **PASS** |
| 2 | Invalid / expired / reused / excessive OTP attempts | **PASS** |
| 3 | Non-Admin cannot provision; forged token rejected | **PASS** |
| 4 | Multiple independent student creates | **PASS** |
| 5 | Editable Student ID before create (preferred ID) | **PASS** |
| 6 | Uniqueness + suggestions on duplicate | **PASS** |
| 7 | Student ID rename after create (password hash unchanged) | **PASS** |
| 8 | Login with updated Student ID; old ID fails | **PASS** |
| 9 | No automatic learning seat / unpaid | **PASS** |
| 10 | Grade 2 (`LEVEL_2`) create rejected (`GRADE_LOCKED`) | **PASS** |
| 11 | Temporary password change persists | **PASS** |
| 12 | Login with new password; `/auth/me` rejects student JWT; `/student/auth/me` works | **PASS** |
| 13 | Parent email + password login still works | **PASS** |
| 14 | Admin email + password login still works | **PASS** |

**Command executed (local):**

```text
NODE_ENV=test TEST_DB_SKIP_RESET=1 npm test -- tests/admin-otp-student-provisioning.test.ts
→ 6 tests passed (covers items 1–14 above)
```

**Not claimed as PASS:** on-device Android UI E2E, production SMTP delivery to Gmail, production DB, APK install QA.

---

## Files changed

### Backend

- `server/src/lib/email.ts` — OTP purpose types/templates for Admin shared create; test outbox helper
- `server/src/student-auth/student-id.ts` — 3–12 IDs; alternative suggestions
- `server/src/student-auth/admin-shared-student-otp.service.ts` — sponsor + skip-seat create; Grade 1 lock
- `server/src/student-auth/student-auth.service.ts` — lookup; P2002 handling; rename safety notes
- `server/src/student-auth/student-auth.routes.ts` — OTP create schema (no parentId); suggest + lookup routes; SID min length 3
- `server/tests/vitest.setup.ts` — force `NODE_ENV=test` / non-placeholder JWT for host shells
- `server/tests/admin-otp-student-provisioning.test.ts` — **new** focused suite

### Mobile

- `apps/mobile/components/AuthGate.tsx` — student `/student/auth/me` path
- `apps/mobile/app/admin-create-student-grade1.tsx` — OTP-gated Grade 1 create UI
- `apps/mobile/app/admin-edit-student-id.tsx` — **new** post-create SID management
- `apps/mobile/app/admin.tsx` — quick actions updated
- `apps/mobile/app/student-login.tsx` — save active child
- `apps/mobile/app/student-change-password.tsx` — clearer re-login copy

### Docs

- `docs/LEARNWISE_ADMIN_OTP_STUDENT_ID_AND_LOGIN_FIX_REPORT.md` — this report

---

## API changes

| Method | Path | Change |
|--------|------|--------|
| POST | `/api/student/auth/admin/shared-email-otp/send` | Unchanged contract (Admin-only) |
| POST | `/api/student/auth/admin/shared-email-otp/verify` | Unchanged contract |
| POST | `/api/student/auth/admin/shared-email-otp/children` | **Breaking for prior client:** `parentId` removed; creates under system sponsor; Level 1 only |
| POST | `/api/student/auth/admin/suggest-student-login-id` | **New** — returns unused `LW……` ID |
| GET | `/api/student/auth/admin/by-student-login-id/:studentLoginId` | **New** — Admin lookup |
| PATCH | `/api/student/auth/admin/children/:childId/student-login-id` | Unchanged; SID length 3–12 |
| GET | `/api/student/auth/me` | Used by AuthGate for STUDENT (existing) |
| POST | `/api/student/auth/login` | Student ID min length 3 |

Parent-scoped create `POST /student/auth/admin/parents/:parentId/children` remains available (not used by the Grade 1 OTP screen).

---

## Database / migration changes

**None.** Reuses existing `EmailOtp` purpose `ADMIN_SHARED_STUDENT_CREATE`, `ChildStudentCredential`, and system sponsor Parent ensure.

---

## Security considerations

- OTP hashed (HMAC); never logged or returned in JSON.
- Verification token single-use, short-lived, bound to Admin `userId`.
- Shared Gmail is delivery target only — not a student/parent login identity; not stored on student credentials.
- System sponsor Parent is internal (`system.sponsor@internal.learnwise` by default); not exposed as a picker.
- No automatic seat/subscription grant on OTP create.
- Student JWT still cannot call `/auth/me`; AuthGate now uses the correct endpoint instead of weakening auth.
- Password rules unchanged; change-password still revokes sessions (`mustReLogin`).
- Shared mailbox SMTP credentials remain env-only (not in source).

---

## Remaining blockers

1. **On-device Android confirmation** of AuthGate + OTP UI not run in this session (no new APK built/distributed per restrictions).
2. **Real SMTP to `littlereaders.otp@gmail.com`** depends on staging/local SMTP env; vitest uses in-memory test outbox.
3. **Backend deploy to staging/production** not performed — wait for explicit approval.
4. **Existing Parent-scoped Grade 1 clients** that still send `parentId` to `/shared-email-otp/children` need the updated mobile screen (this repo’s Grade 1 screen is updated).
5. Grades 2–4 remain locked by design.

---

## Is a new APK required?

**Yes, for the mobile fixes to reach devices.**

- AuthGate student `/me` fix
- OTP Grade 1 create UI
- Edit Student ID screen
- Student login `activeChild` save

Backend API changes alone do not update already-installed VC29/VC30 APKs.  
**VC29/VC30 APK files were not modified.** No APK was built or distributed in this work. Wait for approval before any production action or APK release.

---

## Stop point

Local automated verification complete. Awaiting approval before staging deploy, production changes, or APK build/distribution.
