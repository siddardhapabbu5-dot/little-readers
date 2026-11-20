# Learn Wise — Backend Deployment Preflight  
## Grade 1 Admin OTP student provisioning (no `parentId`)

**Date:** 2026-11-20  
**Mode:** Prepare only — **NO deploy**, **NO production migrate**, **NO account creation**, **NO APK rebuild**  
**Related:** `docs/LEARNWISE_ADMIN_STUDENT_VALIDATION_FAILURE_REPORT.md`  
**Target API:** `https://api.siwiapp.shop` · VPS `/var/www/siwi` (historical ops path)  
**Local branch / HEAD:** `feature/student-id-login` @ `a4377fc` (worktree dirty; deploy from reviewed file set, not blind full tree)

**Final assessment:** **READY FOR APPROVAL** (code + tests locally verified; production apply blocked until explicit go-ahead)

---

## 1. Problem being fixed

| Item | Detail |
|------|--------|
| Symptom (VC31 device) | Create Student → HTTP **400** `Validation failed` |
| Exact field | `parentId: Required` |
| Client | VC31 omits `parentId` (OTP + system sponsor) |
| Production today | Zod still requires `parentId` on `POST …/shared-email-otp/children` |
| Desired | OTP-verified create under **system sponsor**; no Parent picker; no seat grant; Grade 1 only |

---

## 2. Exact backend change set (deploy candidates)

### 2.1 Required files (minimal)

| # | Path | Why |
|---|------|-----|
| 1 | `server/src/student-auth/admin-shared-student-otp.service.ts` | Remove parent-scoped create; `ensureAdminDirectSponsorParent` + `skipSeatAssignment`; Grade 1 lock; method `ADMIN_SHARED_EMAIL_OTP` |
| 2 | `server/src/student-auth/student-auth.routes.ts` | Drop `parentId` from `sharedEmailCreateSchema`; wire create; SID min 3; suggest/lookup routes |
| 3 | `server/src/student-auth/admin-direct-sponsor.ts` | **New vs older VPS pull** — idempotent system Sponsor Parent (`system.sponsor@internal.learnwise`) |
| 4 | `server/src/student-auth/student-id.ts` | 3–12 IDs; uniqueness suggestions |
| 5 | `server/src/student-auth/student-auth.service.ts` | Lookup by Student ID; P2002 → `STUDENT_ID_TAKEN`; rename safety |
| 6 | `server/src/children/children.service.ts` | **`skipSeatAssignment` option** — required so OTP create does not auto-seat |
| 7 | `server/src/config/env.ts` | `ADMIN_DIRECT_STUDENT_SPONSOR_EMAIL` (default internal sponsor; must not equal OTP Gmail) |
| 8 | `server/src/lib/email.ts` | `ADMIN_SHARED_STUDENT_CREATE` OTP email purpose/template (typing + delivery) |

### 2.2 Explicitly out of this deploy (unless separately approved)

| Path / feature | Reason |
|----------------|--------|
| Mobile / APK | UI already on VC31; validation toast improvement is source-only until next APK |
| Admin Direct UI (`admin-create-student.tsx`) | Policy: do not ship Direct UI; route may exist in routes file — review before go-live |
| Unrelated dirty tree (`auth.service`, learning, subscriptions, web, etc.) | Do **not** deploy whole worktree |
| Grades 2–4 activation | HOLD |

### 2.3 API surface after deploy

| Method | Path | Contract |
|--------|------|----------|
| POST | `/api/student/auth/admin/shared-email-otp/send` | Admin-only; OTP to `ADMIN_SHARED_STUDENT_OTP_EMAIL` (already live on prod — device proved send) |
| POST | `/api/student/auth/admin/shared-email-otp/verify` | Returns single-use `verificationToken` |
| POST | `/api/student/auth/admin/shared-email-otp/children` | **Breaking vs current prod:** **no `parentId`**; body = `createChildSchema` + `verificationToken` + optional `preferredStudentLoginId` |
| POST | `/api/student/auth/admin/suggest-student-login-id` | New helper (Admin) |
| GET | `/api/student/auth/admin/by-student-login-id/:id` | New lookup (Admin) |
| PATCH | `/api/student/auth/admin/children/:childId/student-login-id` | Existing rename (SID 3–12) |

Parent-scoped create `POST /api/student/auth/admin/parents/:parentId/children` remains available and unchanged for other Admin flows.

### 2.4 Services / DTO / validation

| Layer | Component |
|-------|-----------|
| Validation | `createChildSchema` (`@little-readers/validation`) + `sharedEmailCreateSchema` (no `parentId`) |
| OTP | `EmailOtp` purpose `ADMIN_SHARED_STUDENT_CREATE`; HMAC hash; attempt/expiry/consume |
| Create | `adminCreateChildWithSharedEmailOtp` → `createChild(sponsorId, …, { skipSeatAssignment: true })` → `issueStudentCredential` |
| Sponsor | `ensureAdminDirectSponsorParent()` — role **PARENT**, email from `ADMIN_DIRECT_STUDENT_SPONSOR_EMAIL` |
| Grade gate | Rejects non-`LEVEL_1` with `GRADE_LOCKED` before token consume |

---

## 3. Safety confirmations (code review)

| Requirement | Status | How |
|-------------|--------|-----|
| No arbitrary existing Parent selected | **PASS (code)** | Sponsor ensure by fixed internal email only; not from request body |
| No Parent / subscription picker required | **PASS (API)** | `parentId` removed from OTP create body |
| No automatic learning seat | **PASS (code)** | `skipSeatAssignment: true`; response `hasLearningSeat: false` |
| No automatic subscription grant | **PASS (code)** | No subscription service call in OTP create path |
| Grade 1 / LEVEL_1 only | **PASS (code)** | Explicit `GRADE_LOCKED` for other levels; forced `level: "LEVEL_1"` |
| OTP bound to Admin session | **PASS (code)** | `EmailOtp.userId = adminUserId`; token single-use |
| Shared Gmail ≠ sponsor login | **PASS (design)** | OTP mailbox `littlereaders.otp@gmail.com`; sponsor `system.sponsor@internal.learnwise` |

**Production DB check (to run at deploy time, read-only before write):**

```sql
-- Expect 0 or 1 sponsor; role must be PARENT if present
SELECT id, email, role, "isActive"
FROM "User"
WHERE lower(email) = lower(coalesce(
  nullif(current_setting('app.sponsor_email', true), ''),
  'system.sponsor@internal.learnwise'
));
```

If a User already exists at that email with a non-PARENT role → **STOP** (code throws `SYSTEM_SPONSOR_ROLE_INVALID`).

---

## 4. Database / migrations

| Migration | Purpose | Likely prod status |
|-----------|---------|-------------------|
| `20261119120000_child_student_credentials` | Student ID credentials | Required for Student login (already in use) |
| `20261119200000_admin_shared_student_otp` | Enum `ADMIN_SHARED_STUDENT_CREATE`; credential metadata columns | **Likely already applied** — production OTP **send** succeeded from VC31 (enum must exist) |

**This fix is primarily application code.** Do **not** invent new migrations for the `parentId` removal (schema-only Zod/API change).

**Deploy-time verify (read-only):**

```sql
SELECT migration_name, finished_at
FROM "_prisma_migrations"
WHERE migration_name LIKE '%admin_shared_student_otp%'
   OR migration_name LIKE '%child_student_credentials%';
```

If `20261119200000_admin_shared_student_otp` is **missing**, schedule `prisma migrate deploy` **before** restart (additive, IF NOT EXISTS columns). If present → **skip migrate**.

**No destructive SQL.** No backfill of existing children required.

---

## 5. Production environment requirements

| Variable | Required | Notes |
|----------|----------|-------|
| `ADMIN_SHARED_STUDENT_OTP_EMAIL` | Yes (or default) | Default `littlereaders.otp@gmail.com`; already used by live OTP send |
| `ADMIN_DIRECT_STUDENT_SPONSOR_EMAIL` | Recommended | Default `system.sponsor@internal.learnwise`; **must not** equal OTP Gmail |
| `JWT_SECRET` | Yes | Unchanged; production must not be placeholder |
| `OTP_DEV_MODE` | Must be off | Production guard |
| SMTP (`SMTP_HOST`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM_EMAIL`) | Yes for real OTP | Already delivering Admin OTP |
| `DATABASE_URL` | Yes | Unchanged |
| `NODE_ENV` | `production` | Unchanged |

**Do not** put Gmail credentials in source. Confirm `.env` on VPS already has SMTP (device OTP send proved delivery path).

---

## 6. Tests executed (local)

Command:

```bash
cd server
NODE_ENV=test TEST_DB_SKIP_RESET=1 npm test -- tests/admin-otp-student-provisioning.test.ts
```

| Result | Count |
|--------|--------|
| **PASS** | **7 / 7** |
| FAIL | 0 |

Coverage includes:

1. OTP send/verify; invalid / expired / reused / max attempts  
2. Non-Admin **403**; forged token rejected  
3. Multiple creates; uniqueness; **no seat**; Grade 2 **GRADE_LOCKED**  
4. Suggest ID; rename; login with updated ID  
5. Password change + `/student/auth/me`  
6. Parent + Admin email login still work  
7. **Regression:** PRAMEELA-style preferred ID **without `parentId`** → **201**; validation without `displayName` does **not** require `parentId`

---

## 7. Deployment plan (execute only after explicit approval)

Mirror prior login-only ops style: backup → copy reviewed files → build/generate → restart API → smoke. **Do not** `git pull` full dirty feature branch onto production.

### 7.1 Pre-flight on VPS (read-only)

```bash
ssh root@<vps>
cd /var/www/siwi
git rev-parse HEAD | tee /root/backups/otp-sponsor-preflight-$(date -u +%Y%m%dT%H%M%SZ)-PRE_SHA.txt
pm2 list
curl -sS http://127.0.0.1:4100/api/health
# Confirm migrations (psql or prisma) — see §4
# Confirm ADMIN_SHARED_STUDENT_OTP_EMAIL / SMTP present (do not print secrets)
```

### 7.2 Backup

```bash
TS=$(date -u +%Y%m%dT%H%M%SZ)
B=/root/backups/otp-sponsor-create-$TS
mkdir -p "$B/pre-paths"
cd /var/www/siwi
# Copy each existing deploy-candidate path if present
for f in \
  server/src/student-auth/admin-shared-student-otp.service.ts \
  server/src/student-auth/student-auth.routes.ts \
  server/src/student-auth/student-auth.service.ts \
  server/src/student-auth/student-id.ts \
  server/src/children/children.service.ts \
  server/src/config/env.ts \
  server/src/lib/email.ts
 do
  if [ -f "$f" ]; then mkdir -p "$B/pre-paths/$(dirname "$f")"; cp -a "$f" "$B/pre-paths/$f"; fi
done
# admin-direct-sponsor.ts may be absent pre-deploy — record that
ls -la server/src/student-auth/admin-direct-sponsor.ts 2>"$B/sponsor-missing.txt" || true
(cd /var/www/siwi && find "$B/pre-paths" -type f -print0 | sort -z | xargs -0 sha256sum) > "$B/SHA256SUMS.txt"
```

### 7.3 Apply files

Copy **only** the eight files from §2.1 from the approved local revision (scp/rsync of those paths).  
Verify SHA-256 of each remote file against the approved local hashes (record in deploy result doc).

### 7.4 Migrate (conditional)

```bash
cd /var/www/siwi/server
# ONLY if §4 shows migration missing:
# npx prisma migrate deploy
npx prisma generate
```

### 7.5 Restart API

```bash
cd /var/www/siwi
pm2 restart siwi-api --update-env
pm2 logs siwi-api --lines 80 --nostream
curl -sS http://127.0.0.1:4100/api/health
curl -sS https://api.siwiapp.shop/api/health
```

### 7.6 Post-deploy smoke (no unnecessary prod students if avoidable)

| Check | Expect |
|-------|--------|
| Health | `ok` |
| Admin OTP send (existing VC31 flow) | 200; code email arrives |
| Create **without** `parentId` after verify | **201** (not 400 `parentId`) |
| Response | `hasLearningSeat: false`; `accountCreationMethod: ADMIN_SHARED_EMAIL_OTP` |
| Child.parent | Sponsor email only |
| Parent email login | Still works |
| Admin email login | Still works |
| Unauthorized create | 401/403 |

Prefer a controlled staging-like smoke account; if production create is required for smoke, use a clearly marked test Student ID and document it.

---

## 8. Rollback procedure

1. `pm2 stop` not required if copy-back is fast; otherwise keep API up while restoring files from `$B/pre-paths`.  
2. Restore every backed-up file to `/var/www/siwi/…`.  
3. If `admin-direct-sponsor.ts` was **new**, remove it only if nothing else imports it after restore (routes/service rollback together).  
4. `npx prisma generate` (if client changed).  
5. `pm2 restart siwi-api --update-env`.  
6. Confirm health + that create **without** `parentId` again returns **400** (old behavior) — proves rollback.  
7. **Do not** roll back additive migrations (`ADMIN_SHARED_STUDENT_CREATE` enum / columns) unless a DBA-approved reverse plan exists — leaving them is safe.

---

## 9. Risks

| Risk | Severity | Mitigation |
|------|----------|------------|
| Deploying unrelated dirty-tree files | High | Strict §2.1 file list only |
| `children.service.ts` drift vs prod | Medium | Diff review before copy; ensure `skipSeatAssignment` present |
| Sponsor email collision / wrong role | High | Pre-check User row; default internal email |
| Admin Direct route exposed with Admin JWT | Medium | Accept or strip `direct-children` route in a follow-up; not required for VC31 OTP fix |
| Brief API restart / 502 | Low | Health watch; prior login deploy needed `prisma generate` |
| First create inserts Sponsor Parent row | Low | Expected; single idempotent ensure |
| Old Admin clients still sending `parentId` | Low | Extra `parentId` is typically stripped by Zod object parse; confirm with smoke — if strict reject, document temporary dual-accept (not in current code) |

---

## 10. What will **not** be done in this preflight

- Production deploy  
- Production DB migrate (unless later approved and §4 requires it)  
- Creating production students from this session  
- APK rebuild / install  
- Git commit / push  
- Full product audits  

---

## 11. Approval gate

**Stopped. Awaiting explicit approval before any production action.**

Approve with clear scope, e.g.:

> Deploy §2.1 file set to `/var/www/siwi`, conditional migrate only if `20261119200000_admin_shared_student_otp` missing, restart `siwi-api`, run smoke checks. No APK rebuild. No Grades 2–4.

---

## 12. Suggested post-approval success criteria

1. VC31 Create Student with OTP completes without `parentId` / without “Validation failed”.  
2. Handover shows Student ID + temporary password.  
3. `hasLearningSeat` remains false until separately entitled.  
4. Parent/Admin login unchanged.  
5. Backup retained under `/root/backups/otp-sponsor-create-*`.
