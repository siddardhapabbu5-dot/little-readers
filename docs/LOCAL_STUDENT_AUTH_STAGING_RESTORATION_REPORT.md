# LEARN WISE — Local Student Auth Staging Restoration Report

**Date (local):** 2026-11-20  
**Worktree:** `C:\Users\harsh\OneDrive\Documents\Desktop\SIWI-login-auth-only`  
**Branch:** `feature/student-id-login` @ `a4377fc` (tracking `origin/feature/student-id-login`)  
**Canonical source:** VPS `/var/www/siwi/server` (read-only pull; **no VPS modifications**)  
**Scope completed:** Restore + local API verify. **Six Stage 2 write tests not executed** (awaiting approval).

---

## 1. Safety checks (passed)

| Check | Result |
|-------|--------|
| Git branch / worktree | `feature/student-id-login` in SIWI-login-auth-only |
| Existing stash preserved | `stash@{0}` still present (untouched) |
| Uncommitted mobile/auth WIP preserved | Still present (not discarded) |
| Pre-change backup | `exports/_backup_student_auth_restore_20261120-123737/` |
| VPS source access | SCP pull OK → `exports/_vps_student_auth_pull/` |
| `DATABASE_URL` isolation | **`localhost:5437` only** (prod-like hosts rejected) |
| Docker data plane | `little-readers-db` :5437 healthy; `siwi-staging-redis` :6379 up |
| Production DB / VPS mutate / migrate deploy / commit / push | **Not performed** |

---

## 2. Backup location

`exports/_backup_student_auth_restore_20261120-123737/`

Contains pre-restore copies of:

- `server/src/routes/index.ts`
- `server/src/lib/jwt.ts`
- `server/src/config/env.ts`
- `server/src/learning/learning.routes.ts`
- `server/prisma/schema.prisma`
- `server/src/middleware/` (directory snapshot)

Notes file: `_notes.txt` (branch, HEAD, stash preserved).

VPS pull cache (read-only source mirror): `exports/_vps_student_auth_pull/`.

---

## 3. Files restored (new in worktree)

| Path | Source |
|------|--------|
| `server/src/student-auth/student-auth.routes.ts` | VPS |
| `server/src/student-auth/student-auth.service.ts` | VPS |
| `server/src/student-auth/student-id.ts` | VPS |
| `server/src/student-auth/student-session.service.ts` | VPS |
| `server/src/student-auth/admin-shared-student-otp.service.ts` | VPS |
| `server/src/middleware/student-auth.ts` | VPS |
| `server/src/middleware/dual-auth.ts` | VPS |
| `server/prisma/migrations/20261119120000_child_student_credentials/migration.sql` | VPS (**reference only; not executed**) |
| `server/prisma/migrations/20261119200000_admin_shared_student_otp/migration.sql` | VPS (**reference only; not executed**) |

---

## 4. Files merged (surgical; local WIP preserved)

| Path | Change |
|------|--------|
| `server/src/lib/jwt.ts` | Replaced with VPS (local was strict subset; + student JWT helpers) |
| `server/src/routes/index.ts` | Added `studentAuthRouter` import + `apiRouter.use("/student/auth", …)` |
| `server/src/learning/learning.routes.ts` | Replaced with VPS dual-auth variant (`requireUserOrStudentAuth` + student actor helpers) |
| `server/src/learning/learning.service.ts` | **Minimal merge only:** optional `studentSessionId` on mobile options type (keeps local service body) |
| `server/src/config/env.ts` | Added `ADMIN_SHARED_STUDENT_OTP_EMAIL` schema field only |
| `server/prisma/schema.prisma` | Added enum values, `ChildStudentCredential` / `ChildStudentSession` models, `User`/`Child` relations |

**Not overwritten:** mobile Student ID UI/client work (`apps/mobile/...`), existing stashes, unrelated server modules, production/VPS files.

---

## 5. Prisma schema changes

- `EmailOtpPurpose`: `STUDENT_SELF_REGISTER`, `ADMIN_SHARED_STUDENT_CREATE`
- Models: `ChildStudentCredential`, `ChildStudentSession`
- Relations: `User.studentCredentialsCreated`, `Child.studentCredential`, `Child.studentSessions`

**Client generate:** `npm run db:generate` → success (Prisma Client v6.19.3).  
**Verified:** `prisma.childStudentCredential` and `prisma.childStudentSession` are present.

**Migrations:** SQL restored as **source references only**.  
**Not run:** `db:migrate`, `db:migrate:deploy`, reset, seed wipe, production migrate.

**Ledger note (non-blocking for current API):** local `_prisma_migrations` already has `20261119120000_child_student_credentials`; `20261119200000_admin_shared_student_otp` is **not** recorded there even though SQL effects (enum value + metadata columns) already exist in staging DB. Do **not** auto-apply; reconcile only with explicit approval later.

---

## 6. Database isolation evidence

| Evidence | Value |
|----------|-------|
| Root `.env` `DATABASE_URL` host | `localhost:5437` |
| Pre-start isolation gate | Passed (rejects non-local / prod-like hosts) |
| API boot log | `NODE_ENV=development` `PORT=4100` `isolation=OK` |
| Runtime host check | `db_host_port=localhost:5437` `is_local_5437=true` |

---

## 7. Existing record counts (preserved)

| Table | Before restore | After restore + API verify |
|-------|----------------|----------------------------|
| `ChildStudentCredential` | **1** | **1** |
| `ChildStudentSession` | **13** | **13** |

No reset, no deletes, no production access.

---

## 8. API startup result

| Item | Result |
|------|--------|
| Command | `cd server` → `npm run dev` |
| Port | **4100** |
| Process | Running (tsx watch) |
| Health | `GET http://127.0.0.1:4100/api/health` → **200** `status=ok` |
| Student Auth mount | Present under `/api/student/auth` |

### Route verification (non-destructive)

| Check | Result |
|-------|--------|
| `POST /api/student/auth/login` `{}` | **400** (validation — route alive, not 404) |
| `GET /api/student/auth/me` | **401** (auth required — route alive) |
| `PATCH /api/student/auth/admin/children/x/student-login-id` | **401** (mounted) |
| `POST /api/student/auth/admin/children/x/credential` | **401** (mounted) |
| `POST /api/auth/login` `{}` | **400** (general/Admin email-password path still available) |
| `POST /api/parent/auth/send-otp` `{}` | **400** (Parent OTP mount still available) |
| `POST /api/admin/auth/forgot-password` `{}` | **400** (Admin auth router still available) |

Prisma Client recognises Student Auth models; Student Auth module loads without boot crash.

---

## 9. Remaining blockers / notes

1. **Stage 2 six write tests not run** — awaiting explicit approval and staging-only QA account identification.
2. **Migration ledger drift** for `20261119200000_admin_shared_student_otp` — reconcile later; do not auto-migrate.
3. **Local API left running** on `:4100` for follow-up testing; stop/restart manually if needed.
4. **Uncommitted restore** — no git commit/push performed (as required).
5. **VPS / production** — untouched.
6. Optional later: restore Vitest suites from stash (`student-auth.test.ts`, etc.) if automated coverage is desired (not required for manual Stage 2).

---

## 10. Verdict

**Local Student Auth staging restore: SUCCESS.**  
Six pending functional tests **can now be attempted** against `http://127.0.0.1:4100/api` + `localhost:5437` after approval — still **without** production writes.

**STOP.** Waiting for approval before Stage 2 functional testing.
