# LEARN WISE — Local Student Auth Staging Preparation

**Date (local):** 2026-11-20  
**Scope:** Investigation + proposed setup plan only.  
**Hard rules honored:** no file copy, no local overwrite, no VPS modification, no production DB access/writes, no production migrations, no deploy, no commit/push, no secrets exposed.

---

## 1. Local repository state

| Item | Value |
|------|--------|
| Worktree | `C:\Users\harsh\OneDrive\Documents\Desktop\SIWI-login-auth-only` |
| Branch | `feature/student-id-login` (tracks `origin/feature/student-id-login`) |
| HEAD | `a4377fc` — *docs: add Level-1 Android acceptance reports and staging helpers* |
| `server/src/student-auth/` | **Missing** |
| `/student/auth` route mount | **Missing** from `server/src/routes/index.ts` |
| Prisma `ChildStudent*` models | **Missing** from `server/prisma/schema.prisma` |
| Desktop sibling workspaces | **No** `student-auth` implementation found |
| Data plane | Docker `little-readers-db` → host **:5437** (healthy); `siwi-staging-redis` → **:6379** (up) |
| Root `.env` `DATABASE_URL` | Points at **`localhost:5437`** (staging-shaped; value not recorded here) |
| Local API `:4100` | Not required for this prep; previously observed **DOWN** during Stage 2 audit |

Uncommitted local work exists (mobile UI/API client, audit docs, exports). Any future restore must avoid blindly overwriting those paths.

---

## 2. Canonical VPS source (known location)

**Host path:** `/var/www/siwi/server`  
**Process:** pm2 `siwi-api` (`tsx src/index.ts`, cwd `/var/www/siwi/server`)  
**Public API prefix:** `/api/student/auth`  
**Mount:** `apiRouter.use("/student/auth", studentAuthRouter)` in `server/src/routes/index.ts`

### 2.1 Core Student Auth module (VPS)

| File | Role |
|------|------|
| `/var/www/siwi/server/src/student-auth/student-auth.routes.ts` | Express router + endpoint wiring |
| `/var/www/siwi/server/src/student-auth/student-auth.service.ts` | Create/issue/login/rename/reset credential logic |
| `/var/www/siwi/server/src/student-auth/student-id.ts` | Preferred / auto-generated Student ID helpers |
| `/var/www/siwi/server/src/student-auth/student-session.service.ts` | Latest-login-wins student sessions |
| `/var/www/siwi/server/src/student-auth/admin-shared-student-otp.service.ts` | Admin shared-email OTP create path |

### 2.2 Related middleware / wiring (VPS)

| File | Role |
|------|------|
| `/var/www/siwi/server/src/middleware/student-auth.ts` | `requireStudentAuth` + student request typing |
| `/var/www/siwi/server/src/middleware/dual-auth.ts` | `requireUserOrStudentAuth` (Parent/Admin **or** student JWT) |
| `/var/www/siwi/server/src/routes/index.ts` | Mounts `studentAuthRouter` at `/student/auth` |
| `/var/www/siwi/server/src/learning/learning.routes.ts` | Uses `requireUserOrStudentAuth` (needed for entitlement / learning gate tests) |
| `/var/www/siwi/server/src/lib/jwt.ts` | `StudentJwtPayload`, `signStudentAccessToken`, `verifyStudentAccessToken`, `isStudentJwtPayload`; rejects student tokens in `verifyAccessToken` |
| `/var/www/siwi/server/src/config/env.ts` | Declares `ADMIN_SHARED_STUDENT_OTP_EMAIL` (plus existing OTP/JWT/demo gates) |

### 2.3 Documented `/api/student/auth` endpoints (from VPS routes)

| Method | Path (under `/api/student/auth`) |
|--------|----------------------------------|
| POST | `/email-otp/send` |
| POST | `/email-otp/verify` |
| POST | `/self-register` |
| POST | `/login` |
| POST | `/change-password` |
| GET | `/me` |
| POST | `/admin/parents/:parentId/children` |
| POST | `/admin/shared-email-otp/send` |
| POST | `/admin/shared-email-otp/verify` |
| POST | `/admin/shared-email-otp/children` |
| PATCH | `/admin/children/:childId/student-login-id` |
| POST | `/admin/children/:childId/credential` |
| POST | `/admin/children/:childId/credential/reset` |

### 2.4 Module import dependencies (already present locally unless noted)

From VPS Student Auth / middleware imports:

- `@little-readers/validation` — `createChildSchema`, `passwordSchema` (**present** locally)
- `../children/children.service.js` — `createChild` (**present**)
- `../auth/email-otp.service.js` — OTP send/verify (**present**)
- `../lib/password.js`, `../lib/password-rate-limit.js`, `../lib/prisma.js`, `../lib/errors.js`, `../lib/email.js` (**present**; password-rate-limit exists locally)
- `../middleware/auth.js`, `../middleware/validate.js` (**present**)
- `../lib/jwt.js` — **student helpers missing locally**
- `../config/env.js` — **`ADMIN_SHARED_STUDENT_OTP_EMAIL` missing from local `env.ts` schema** (name already appears in local root `.env`)

### 2.5 Prisma models / migrations (VPS)

**Enum `EmailOtpPurpose` (VPS):**  
`REGISTER`, `RESET_PASSWORD`, `RESET_PIN`, `STUDENT_SELF_REGISTER`, `ADMIN_SHARED_STUDENT_CREATE`

**Models:**

- `ChildStudentCredential` — `childId`, `studentLoginId`, `passwordHash`, `mustChangePassword`, lockout fields, `sessionVersion`, `accountCreationMethod`, `verificationReference`, etc.
- `ChildStudentSession` — device-bound session rows; `ParentSessionStatus`; refresh hash; revoke fields
- Relations on `Child` (`studentCredential`, `studentSessions`) and `User` (`studentCredentialsCreated`)

**Migrations:**

| Migration | Purpose |
|-----------|---------|
| `20261119120000_child_student_credentials` | Creates credential + session tables; adds `STUDENT_SELF_REGISTER` |
| `20261119200000_admin_shared_student_otp` | Adds `ADMIN_SHARED_STUDENT_CREATE`; credential metadata columns |

### 2.6 Alternate incomplete local remnant (not sufficient alone)

Git `stash@{0}` untracked tree `10d68ae` contains Student Auth TS + both migration SQL files + Vitest suites, **but not**:

- `routes/index.ts` mount
- `schema.prisma` model/enum/relation updates
- `lib/jwt.ts` student helpers
- `config/env.ts` `ADMIN_SHARED_STUDENT_OTP_EMAIL`
- `learning.routes.ts` dual-auth switch

**Do not treat stash as a complete restore source.** Prefer VPS as canonical, with stash only as a secondary cross-check after explicit approval to copy.

---

## 3. Local dependencies missing (worktree vs VPS)

| Area | Local status | Required for staging API |
|------|--------------|--------------------------|
| `server/src/student-auth/*` (5 files) | Missing | Yes |
| `middleware/student-auth.ts` | Missing | Yes |
| `middleware/dual-auth.ts` | Missing | Yes (learning / entitlement path) |
| `routes/index.ts` mount `/student/auth` | Missing | Yes |
| `lib/jwt.ts` student principal helpers | Missing | Yes |
| `config/env.ts` `ADMIN_SHARED_STUDENT_OTP_EMAIL` | Missing | Yes for shared-OTP admin create |
| `learning.routes.ts` → `requireUserOrStudentAuth` | Still `requireAuth` only | Yes for test **15** (and student learning access) |
| `schema.prisma` ChildStudent models + enum values + relations | Missing | Yes (`prisma generate`) |
| Migration SQL files under `server/prisma/migrations/20261119*` | Missing from worktree | Needed for history alignment; **DB already partially applied** (see §4) |
| Focused Vitest (`student-auth.test.ts`, etc.) | Missing from worktree (in stash / not on VPS tests tree) | Optional for the six manual Stage 2 tests |

---

## 4. Database / schema requirements

### 4.1 Local staging DB (`localhost:5437`) — observed (read-only)

| Check | Result |
|-------|--------|
| Tables `ChildStudentCredential`, `ChildStudentSession` | **Exist** |
| Credential columns include `accountCreationMethod`, `verificationReference` | **Present** |
| `EmailOtpPurpose` includes `STUDENT_SELF_REGISTER`, `ADMIN_SHARED_STUDENT_CREATE` | **Present** |
| Credential row count | **1** |
| Session row count | **13** |
| `_prisma_migrations` has `20261119120000_child_student_credentials` | **Applied** |
| `_prisma_migrations` has `20261119200000_admin_shared_student_otp` | **Not recorded** (SQL effects appear present anyway) |

**Conclusion:** The **physical local schema already supports Student Auth** for staging mutations. The **worktree Prisma schema / client do not**, so the API cannot compile/run against these tables until schema + code are restored.

### 4.2 Schema drift risk

Local `schema.prisma` is behind the staging database. Naïve `prisma migrate deploy` after dropping migration folders into the tree may:

- try to re-apply already-applied SQL, or
- leave `_prisma_migrations` inconsistent for `20261119200000_*`.

**Proposed safe approach (future, approval-gated):** restore `schema.prisma` models to match VPS; restore migration folders for history; **resolve migration ledger carefully** (e.g. mark second migration applied only after verifying SQL already present) — **never** point migrate tools at production.

---

## 5. Compatible API startup & environment (names only)

Aligned with `docs/LEVEL1_STAGING_ENVIRONMENT_PLAN.md`.

### 5.1 Safe local commands (proposed — not executed in this prep)

```powershell
cd "C:\Users\harsh\OneDrive\Documents\Desktop\SIWI-login-auth-only"

# 1) Isolation gate (mandatory before any mutate)
$u = (Get-Content .env | Where-Object { $_ -match '^DATABASE_URL=' })
if ($u -notmatch 'localhost:5437|127\.0\.0\.1:5437') { throw "STOP: DATABASE_URL not local :5437" }
if ($u -match 'siwiapp|amazonaws|neon\.tech|supabase') { throw "STOP: prod-like DATABASE_URL" }

# 2) Data plane
docker compose up -d postgres redis

# 3) After approved code/schema restore only:
cd server
npm run db:generate
# migrate/seed ONLY if isolation gate passes AND owner approves local migrate
# npm run db:migrate:deploy
npm run dev
```

Health check:

```powershell
Invoke-WebRequest "http://127.0.0.1:4100/api/health" -UseBasicParsing
# Student Auth smoke (after restore): POST http://127.0.0.1:4100/api/student/auth/login
```

### 5.2 Environment variable **names** required / recommended

**Already expected for local staging:**  
`NODE_ENV`, `PORT`, `API_PORT`, `DATABASE_URL`, `REDIS_URL`, `REDIS_PORT`, `JWT_SECRET`, `JWT_EXPIRES_IN`, `ACCESS_TOKEN_EXPIRY`, `REFRESH_TOKEN_EXPIRY`, `BCRYPT_ROUNDS`, `ALLOW_DEMO`, `OTP_DEV_MODE`, `OTP_EXPIRY_SECONDS`, `OTP_RESEND_SECONDS`, `OTP_MAX_ATTEMPTS`, `SMS_PROVIDER`, `CORS_ORIGIN`, `APP_PUBLIC_URL`, `MOBILE_PUBLIC_URL`, `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`, `POSTGRES_PORT`, `RATE_LIMIT_WINDOW_MS`, `RATE_LIMIT_MAX`

**Student Auth–specific:**  
`ADMIN_SHARED_STUDENT_OTP_EMAIL`

**Email / support (shared OTP / resets):**  
`SUPPORT_EMAIL`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASSWORD` / `SMTP_PASS`, `SMTP_FROM_EMAIL`, `SMTP_FROM_NAME`, `PASSWORD_RESET_TOKEN_TTL_MINUTES`, `ADMIN_PASSWORD_RESET_TOKEN_TTL_MINUTES`

**Keep payments off for auth staging unless explicitly needed:**  
`PAYMENT_ENABLED` (prefer false); if true, test-only Razorpay/Cashfree names only — never live keys for this work.

---

## 6. Proposed local staging setup plan (approval-gated; not started)

| Step | Action | Restriction |
|------|--------|-------------|
| A | Diff VPS Student Auth files vs this worktree; list exact copy set (§2) | Read-only until approved |
| B | Copy **only** Student Auth–related server files into this worktree (or restore stash TS **plus** VPS patches for schema/jwt/routes/learning/env) | No blind overwrite of unrelated local mobile WIP |
| C | Align `schema.prisma` with VPS models/enums/relations | Do **not** run against production |
| D | Place migration folders; reconcile `_prisma_migrations` with already-applied local SQL | Prefer verify-then-mark over re-apply |
| E | Add `ADMIN_SHARED_STUDENT_OTP_EMAIL` to local `env.ts`; keep root `.env` on `:5437` | Never commit secrets |
| F | `npm run db:generate` then `npm run dev` on **:4100** | Isolation gate first |
| G | Use **dedicated QA parent/child** rows on local DB only | No production record access |
| H | Re-run Stage 2 six tests against local API | No prod writes |

**Preferred source order:** VPS `/var/www/siwi/server/...` (canonical) → stash `10d68ae` as incomplete cross-check only.

---

## 7. Risks and blockers

| Risk / blocker | Severity | Notes |
|----------------|----------|-------|
| Student Auth **code absent** from worktree/branch tips | **Blocker** | Cannot start `/api/student/auth` locally today |
| Prisma **schema/client drift** vs local DB | **Blocker** | Tables exist; client cannot see models until schema restored |
| Incomplete stash | High | Missing mount, schema, jwt, env, learning dual-auth |
| Migration ledger gap (`20261119200000_*` not in `_prisma_migrations`) | Medium | Careless `migrate deploy` can fail or double-apply |
| Overwriting local uncommitted mobile/auth WIP | Medium | Restore must be path-scoped |
| Accidental production `DATABASE_URL` / VPS mutate | Critical | Isolation gate + no VPS writes |
| Learning still on `requireAuth` locally | High for test 15 | Dual-auth wiring required for student entitlement path |
| VPS tests tree lacks preferred-ID Vitest suite | Low for manual Stage 2 | Manual/API checks still valid once API runs |

---

## 8. Can the six pending tests run locally?

| No. | Feature | Runnable on local staging **today**? | After approved restore + local API up? |
|-----|---------|--------------------------------------|----------------------------------------|
| 6 | Create new student under Sponsor Parent | **No** | **Yes** (local DB + admin create routes) |
| 7 | Issue Student ID for existing Child | **No** | **Yes** |
| 9 | Auto-generated Student ID | **No** | **Yes** |
| 11 | Rename Student ID + old ID rejected | **No** | **Yes** |
| 13 | Forced first-login password change | **No** | **Yes** (local fixture already has `mustChangePassword` inventory from prior audit) |
| 15 | Subscription / entitlement gates | **No** | **Yes, if** learning dual-auth + seat flags exercised on local API |

**Verdict:** Local Postgres/Redis **can** support the six tests **without production access**, but the six tests **cannot** execute until Student Auth source + Prisma schema/JWT/route/learning wiring are restored into this worktree and the API is started on `:4100` against `localhost:5437`.

---

## 9. Stop condition

This document completes the preparation investigation.  
**No files were copied. No VPS or production DB changes. No local application/config/database mutations. No deploy/commit/push.**

**Next action (out of scope here):** owner approval to perform Step A–H of §6 using VPS as the canonical source.
