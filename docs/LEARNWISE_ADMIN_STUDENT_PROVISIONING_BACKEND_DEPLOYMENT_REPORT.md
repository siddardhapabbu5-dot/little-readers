# Learn Wise — Production Backend Deployment Report  
## Grade 1 Admin OTP Student Provisioning (no `parentId`)

**Date (UTC):** 2026-11-20  
**Approval:** Owner-approved controlled deploy per `docs/LEARNWISE_ADMIN_STUDENT_PROVISIONING_BACKEND_DEPLOYMENT_PREFLIGHT.md`  
**Host:** `srv2131305` (`201.18.220.29`) · app root `/var/www/siwi`  
**API process:** PM2 **`siwi-api`** (cwd `/var/www/siwi/server`, `tsx src/index.ts`)  
**Method:** SSH key `~/.ssh/siwi_vps` · path-scoped file copy (8 files only) · **no** full git pull  

**Final assessment:** **PASS** (deployed + recovered from brief restart window + smoke PASS; **no production student created**)

---

## 1. Phase 1 — Pre-deployment safety

| Check | Result |
|-------|--------|
| Preflight followed | **PASS** |
| Host / path / PM2 confirmed | **PASS** — `srv2131305`, `/var/www/siwi`, `siwi-api` online before deploy |
| 8 approved paths only | **PASS** — staged under `exports/_deploy_otp_sponsor_2026-11-20/server/...` |
| Unrelated files excluded | **PASS** — no mobile/APK/web/full-tree deploy |
| DB connectivity | **PASS** — Prisma to `localhost:5437` / `little_readers` |
| Schema / OTP enum | **PASS** — see §3 |
| Sponsor role conflict | **PASS** — sponsor user **absent** pre-deploy (OK; created only on first successful create) |
| File backups | **PASS** — 7 existing files backed up; `admin-direct-sponsor.ts` was missing (new) |
| DB backup | **PASS** — custom-format `pg_dump` from container `little-readers-db` |
| Rollback script | **PASS** — `$B/rollback.sh` written |

**STOP conditions:** none triggered.

### Backup location

| Item | Path |
|------|------|
| Backup root | `/root/backups/otp-sponsor-create-20261120T143309Z` |
| Pre-path copies | `…/pre-paths/` |
| Pre-path checksums | `…/SHA256SUMS-pre-paths.txt` |
| DB dump | `…/db/little_readers-20261120T143309Z.dump` (202,586 bytes) |
| DB dump SHA-256 | `4b408c317496ff3b5e789accf82b18b41dcb9548b28dde1a98f2e37419e721d3` |
| Rollback | `…/rollback.sh` |
| Smoke log | `…/smoke.jsonl` |

---

## 2. Exact deployed files and checksums (post-deploy)

All under `/var/www/siwi/`:

| Path | SHA-256 (lowercase) |
|------|---------------------|
| `server/src/student-auth/admin-direct-sponsor.ts` | `81b8114250ac6a197e5cf7f47be71b2c149ed608c5a400f06d129f4173826dc1` |
| `server/src/student-auth/admin-shared-student-otp.service.ts` | `943996c3bd60bc5fd19a537c45863c4487fb24cc7867d7063762d6e6ad377b1b` |
| `server/src/student-auth/student-auth.routes.ts` | `472b8cde5b9dd39c8980ac68fa64170f4f941b6a7725678611a1c8bad3ba2c51` |
| `server/src/student-auth/student-auth.service.ts` | `991a704454a3aecf4c09b2397a28ee2a5db31f616d5afe548096199f1cd6666e` |
| `server/src/student-auth/student-id.ts` | `357899c0bd90725a12f5141d3ba078e473010fac624cf95a8f0e1b798f3a73c6` |
| `server/src/children/children.service.ts` | `18109ffa1f0d50af21e1f8cc279183825f013cbaa20417617d40c8d9ae6febd2` |
| `server/src/config/env.ts` | `4dd9e198be7cd6570ffaa7116450efcda5ab73d2a749a60de8f7502ae8ce3ad6` |
| `server/src/lib/email.ts` | `ee5ebecc066f3a70ee442281522c9bd8b6d54e8161575060e6c7bd2d82403eac` |

Remote hashes matched the approved local staging manifest.  
Contract sniff: **`parentId: z.string().trim().min(1)` removed**; `skipSeatAssignment` + `ensureAdminDirectSponsorParent` + `GRADE_LOCKED` present.

---

## 3. Database schema and migration decision

| Item | Evidence | Decision |
|------|----------|----------|
| `20261119120000_child_student_credentials` | finished `2026-11-19T19:43:16.087Z` | Already applied |
| `20261119200000_admin_shared_student_otp` | finished `2026-11-19T19:43:17.550Z` | Already applied |
| Enum `ADMIN_SHARED_STUDENT_CREATE` | Present in `EmailOtpPurpose` | OK |
| Columns `accountCreationMethod`, `verificationReference`, `studentLoginId` | Present on `ChildStudentCredential` | OK |

**Migration run:** **NO** (`prisma migrate deploy` skipped).  
**Prisma generate:** **YES** (after file copy).

---

## 4. PM2 restart and health

| Step | Result |
|------|--------|
| `npx prisma generate` | **PASS** |
| `pm2 restart siwi-api --update-env` | **PASS** — process `online` |
| Brief public 502 | Observed for a few seconds during boot (health curl too early) |
| Recovery | API log: `LEARN WISE API listening on http://localhost:4100` |
| Local health | `{"status":"ok",…}` |
| Public health | `https://api.siwiapp.shop/api/health` → `ok` |
| Unstable restarts | `0` after settle |

**Note:** Pre-existing dictionary log noise `VocabularyGradeAssignment.meaningOverride` column missing appeared in error log; **not introduced by this 8-file deploy** (dictionary routes untouched). Does not block health or OTP create path.

**Rollback:** **Not executed** (service recovered; smoke PASS).

---

## 5. Smoke tests (non-destructive)

| # | Check | Result | Evidence |
|---|--------|--------|----------|
| 1 | Admin authentication | **PASS** | `POST /api/auth/login` → **200**, role `ADMIN` |
| 2 | OTP send available | **PASS** | `POST …/shared-email-otp/send` → **200**; destination hint present; **no 6-digit OTP in JSON** |
| 3 | Create **without** `parentId` accepted by schema | **PASS** | Forged verification token → **400** `EMAIL_NOT_VERIFIED` (not `parentId` Required) |
| 4 | Unauthorized rejected | **PASS** | No Bearer → **401** `Authentication required` |
| 5 | System sponsor not arbitrarily picking parents | **PASS** | No create completed; sponsor row still **null** after smoke (ensure runs only on successful create) |
| 6 | No auto seat/subscription via smoke create | **PASS** | No child created (`SmokeNoCreate` count **0**) |
| 7 | Grades 2–4 lock (runtime) | **PARTIAL** | `LEVEL_2` body with forged token also → `EMAIL_NOT_VERIFIED` (gate runs after valid OTP); **GRADE_LOCKED** verified in local suite + deployed source |
| 8 | Parent/Student auth routes alive | **PASS** | Bad parent login **401**; bad student login **401** (no 5xx) |
| 9 | Suggest Student ID route | **PASS** | **200** |

### Explicit confirmation

**No production student was created during this deployment or smoke testing.**  
DB check: `smokeChildren: 0`. Sponsor user not created.

OTP values, passwords, and access tokens were **not** written into this report.

---

## 6. Seat and sponsor behavior (deployed code)

| Behavior | Deployed |
|----------|----------|
| OTP create uses `ensureAdminDirectSponsorParent()` | Yes |
| Sponsor email default | `system.sponsor@internal.learnwise` (not OTP Gmail) |
| `skipSeatAssignment: true` | Yes |
| Auto subscription grant | No |
| Grade 1 / `LEVEL_1` only (`GRADE_LOCKED`) | Yes |

---

## 7. APK integrity (unchanged)

| APK | SHA-256 match |
|-----|----------------|
| VC29 | **Yes** `1F0322AE…4283` |
| VC30 | **Yes** `A34AAB7F…F38E` |
| VC31 | **Yes** `0B4B9E46…E49C` |

No APK rebuild, no mobile source deploy, no commit/push.

---

## 8. Errors / incidents

| Incident | Handling |
|----------|----------|
| Transient **502** for ~few seconds after `pm2 restart` | Waited for listen; health returned **ok**; no rollback |
| Dictionary `meaningOverride` Prisma errors in logs | Pre-existing / unrelated; documented; not rolled back for |

---

## 9. Stop / next approval gate

**Stopped after deployment and safe smoke testing.**

Awaiting further approval before:

1. Creating a controlled production test student (e.g. Prameela / PRAMEELA) via VC31 OTP flow  
2. Pilot distribution / family APK sharing  
3. Any Grades 2–4 work  

Rollback remains available at `/root/backups/otp-sponsor-create-20261120T143309Z/rollback.sh` if needed later.
