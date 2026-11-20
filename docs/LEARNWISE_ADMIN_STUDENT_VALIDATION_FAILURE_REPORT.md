# Learn Wise — Admin Create Student “Validation failed” (VC31 / PRAMEELA)

**Date:** 2026-11-20  
**Device evidence:** Samsung SM-S921B · VC31 · confirm step for Prameela / 2015 / PRAMEELA  
**Scope:** Investigation + local/staging fix + UI error clarity  
**Production deploy / APK rebuild / student create on prod:** **Not performed**

---

## Exact root cause

**Not the Student ID.** `PRAMEELA` is 8 characters, A–Z only, and passes the 3–12 alphanumeric rule on both client and current local backend.

**Root cause:** **API contract mismatch between VC31 app and the currently deployed production backend.**

| Side | Behavior |
|------|----------|
| **VC31 mobile** | `POST /student/auth/admin/shared-email-otp/children` **without** `parentId` (OTP + system sponsor flow) |
| **Production / VPS backend (still deployed)** | Zod schema **requires** `parentId: z.string().min(1)` |
| Result | HTTP **400** · `error: "Validation failed"` · `code: VALIDATION_FAILED` · `fieldErrors.parentId: ["Required"]` |

Device UI only showed the generic message **“Validation failed”** because the app mapped `ApiError.message` and did not surface Zod `fieldErrors`.

### Evidence

1. **On-device UI** (`exports/vc31-otp-functional/`): display name Prameela, birth year 2015, Student ID PRAMEELA, Grade 1, message “Validation failed”.
2. **Local Zod reproduce of production schema** (with `parentId` required, same payload VC31 sends):

```json
{
  "formErrors": [],
  "fieldErrors": {
    "parentId": ["Required"]
  }
}
```

3. **Same payload against current local schema** (no `parentId`): **parse success**.
4. **VPS pull** `exports/_vps_student_auth_pull/server/src/student-auth/student-auth.routes.ts` still has:

```ts
parentId: z.string().trim().min(1),
```

inside `sharedEmailCreateSchema`.

5. OTP send/verify on device **worked** (code entry screen reached) — so Admin auth and OTP gate were fine; failure is specifically on **create body validation**.

### Ruled out

| Hypothesis | Result |
|------------|--------|
| `PRAMEELA` invalid length/charset | **False** — 8 chars, `[A-Za-z0-9]+` |
| Missing Grade / LEVEL_1 | **False** — UI and payload include `level: "LEVEL_1"` + `levelId` |
| Seat / subscription required in UI | **False** — no Parent/subscription picker in VC31 flow |
| Expired OTP as “Validation failed” | **False** — that path returns `EMAIL_NOT_VERIFIED`, not Zod validation |
| Client-only validation rejecting PRAMEELA | **False** — form reached confirm + server call |

---

## Request payload (VC31 client)

```json
{
  "verificationToken": "<single-use token from OTP verify>",
  "displayName": "Prameela",
  "birthYear": 2015,
  "levelId": "<LEVEL_1 id from /children/learn-wise-grades>",
  "level": "LEVEL_1",
  "preferredStudentLoginId": "PRAMEELA"
}
```

No `parentId`. No subscription ID.

---

## Backend HTTP status / response shape

| Item | Value |
|------|--------|
| Status | **400** |
| Body `error` | `"Validation failed"` |
| Body `code` | `VALIDATION_FAILED` |
| Body `details.issues.fieldErrors` | `{ "parentId": ["Required"] }` on production schema |

(Prod probe without a real Admin session returns 401 with empty body; fieldErrors above are from schema parity with the deployed VPS routes + local Zod reproduce.)

---

## What was already fixed in local source (pre-device)

Local `server/src/student-auth/student-auth.routes.ts` already removed `parentId` from `sharedEmailCreateSchema`, and `adminCreateChildWithSharedEmailOtp` creates under the **system sponsor** with `skipSeatAssignment: true`, Grade 1 only.

**That backend change is not on production yet** — so VC31 against `https://api.siwiapp.shop/api` still fails.

---

## Files changed in this investigation

| File | Change |
|------|--------|
| `apps/mobile/app/admin-create-student-grade1.tsx` | Surface Zod `fieldErrors`; special readable message when server still requires `parentId` |
| `server/tests/admin-otp-student-provisioning.test.ts` | Regression: `PRAMEELA` create **without** `parentId`; assert validation fieldErrors do **not** require `parentId` |
| `docs/LEARNWISE_ADMIN_STUDENT_VALIDATION_FAILURE_REPORT.md` | This report |

No backend schema change in this pass (already correct locally). No APK rebuild. No production create. No deploy.

---

## Tests executed

| Test | Result |
|------|--------|
| Zod old schema + Prameela/PRAMEELA payload → `parentId` Required | **PASS** (reproduce) |
| Zod new schema + same payload → success | **PASS** (reproduce) |
| Vitest `regression: PRAMEELA Student ID + no parentId` | **PASS** (`npm test -- tests/admin-otp-student-provisioning.test.ts -t PRAMEELA`) |

---

## Security

- No OTP / password / token values logged in this report or UI strings.
- No validation/auth bypass.
- No additional production student created during investigation.

---

## Remaining blocker (device)

**Production backend deploy** of the OTP sponsor create (no `parentId`) is required for VC31 Create Student to succeed on the Samsung against `api.siwiapp.shop`.

Until then, improved UI (after next APK) will show that the server still expects a Parent ID instead of a bare “Validation failed”.

**APK rebuild:** not done (per instructions). UI fix is in source only until a later VC build is approved.

---

## Stop

Stopped after local/staging verification work. Awaiting approval before backend deploy and/or APK rebuild.
