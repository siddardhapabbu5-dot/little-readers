# Learn Wise — GitHub Release File Manifest (SAFE CLASSIFICATION)

**Date:** 2026-11-20  
**Branch:** `feature/student-id-login` @ `a4377fc`  
**Mode:** Classification only — **no staging, commit, push, delete, move, or source edits**  
**Inventory (measured):** **17** modified tracked · **990** untracked · **1,007** total paths classified · **stash@{0} preserved**  
**Preflight:** `docs/LEARNWISE_GITHUB_RELEASE_PREFLIGHT_REPORT.md`

**Rules observed:** No file deletions, moves, source edits, git reset/clean, branch switches, stash changes, staging, commit, or push.

**Legend — Required for current Grade 1 release:** YES / NO / UNCERTAIN  
Each path has exactly **one primary** category (A–F) so counts sum to the inventory.

---

## Exact category counts

| Category | Description | Count |
|----------|-------------|------:|
| **A** | Required for Grade 1 release | **7** |
| **B** | Required for student-ID login | **15** |
| **C** | Documentation and QA reports | **12** |
| **D** | Generated or sensitive — exclude | **962** |
| **E** | Unrelated development work — preserve, out of G1 release | **4** |
| **F** | Uncertain — operator review | **7** |
| **Total** | | **1,007** |

| Inventory check | Count |
|-----------------|------:|
| Modified tracked | 17 |
| Untracked | 990 |
| Sum | 1,007 |

---

## Step 3 — Explicit exclusion review (do not print secret values)

| Pattern / path | Status | Reason |
|----------------|--------|--------|
| `.env` (local; gitignored) | **EXCLUDE** | Production/staging secrets |
| `exports/_stage2_secrets_local_only.json` | **EXCLUDE** | Staging secrets / IDs |
| `exports/_prod_probe_body.json`, `_prod_probe_empty.json`, other `*_probe*` | **EXCLUDE** | Probe / temporary test outputs |
| `exports/_stage2_*.json`, `_vc28_*_evidence.json`, parent-children probe | **EXCLUDE** | QA evidence may contain IDs |
| `*.apk` / `*.aab` under `exports/` (gitignored) | **EXCLUDE** | Binaries; never force-add |
| Keystores (`~/.lr-keystore/**`, outside repo) | **EXCLUDE** | Signing keys |
| `server/storage/vocab-media/pilot/batch-d1/*.jpg` (**750**) | **EXCLUDE** | Batch-D1 generated/restored media |
| `exports/prod-app-web-dist/**` (**113**) | **EXCLUDE** | Built web dist dump |
| `exports/_backup_*`, `_recovered*`, `_vps_student_auth_pull/**` | **EXCLUDE** | Recovery copies / leakage risk |
| `exports/_prod_apk_holdout_vc29/` | **EXCLUDE** | Temp build holdout |
| Private parent/student data in evidence JSON | **EXCLUDE** | PII / privacy |
| Admin Direct create evidence / UI screenshot under `exports/` | **EXCLUDE** | Generated evidence |

**No secret values are printed in this document.**

---

## Category A — Required for Grade 1 release (7)

| Path | Tracked | Purpose | Feature | G1 | Sensitive/gen | Action |
|------|---------|---------|---------|----|---------------|--------|
| `apps/mobile/app/login.tsx` | Modified | Login UI (Parent/Admin/Student entry) | Auth / G1 | YES | NO | Include in future client PR |
| `apps/mobile/services/api.ts` | Modified | API client / base URL wiring | Networking | YES | NO | Include |
| `apps/mobile/services/auth-errors.ts` | Modified | Auth error mapping | Auth | YES | NO | Include |
| `apps/mobile/services/auth-errors.test.ts` | Modified | Auth error tests | Auth | YES | NO | Include |
| `server/src/auth/auth.service.ts` | Modified | Parent/admin auth service | Auth | YES | NO | Include if server ships |
| `server/src/subscriptions/subscription.service.ts` | Modified | Entitlement / unpaid gates | Subscriptions | YES | NO | Include if server ships |
| `apps/mobile/assets/login-siwi-hero.jpg` | Untracked | Login hero asset | Login UI | YES | NO (binary asset) | Include |

---

## Category B — Required for student-ID login (15)

| Path | Tracked | Purpose | Feature | G1 | Sensitive/gen | Action |
|------|---------|---------|---------|----|---------------|--------|
| `apps/mobile/app/student-login.tsx` | Untracked | Student ID + password screen | Student ID | YES | NO | Include (Student pilot) |
| `apps/mobile/app/student-change-password.tsx` | Untracked | First-login password change | Student ID | YES | NO | Include |
| `server/prisma/schema.prisma` | Modified | Student credentials fields | Student ID | YES* | NO | Include if backend ships |
| `server/src/children/children.service.ts` | Modified | Child / seat / sponsor hooks | Students | YES* | NO | Include if backend ships |
| `server/src/learning/learning.routes.ts` | Modified | Dual-auth learning routes | Learning + student | YES* | NO | Include if backend ships |
| `server/src/learning/learning.service.ts` | Modified | Learning service hooks | Learning | YES* | NO | Include if backend ships |
| `server/src/lib/jwt.ts` | Modified | Student JWT / principal | Student ID | YES* | NO | Include if backend ships |
| `server/src/routes/index.ts` | Modified | Mount student-auth router | Student ID | YES* | NO | Include if backend ships |
| `server/src/middleware/dual-auth.ts` | Untracked | Parent+student dual auth | Student ID | YES* | NO | Include if backend ships |
| `server/src/middleware/student-auth.ts` | Untracked | Student JWT middleware | Student ID | YES* | NO | Include if backend ships |
| `server/src/student-auth/student-auth.routes.ts` | Untracked | Student auth HTTP routes | Student ID | YES* | NO | Include if backend ships |
| `server/src/student-auth/student-auth.service.ts` | Untracked | Login / password / IDs | Student ID | YES* | NO | Include if backend ships |
| `server/src/student-auth/student-id.ts` | Untracked | ID validation/generation | Student ID | YES* | NO | Include if backend ships |
| `server/src/student-auth/student-session.service.ts` | Untracked | Device session | Student ID | YES* | NO | Include if backend ships |
| `server/prisma/migrations/20261119120000_child_student_credentials/migration.sql` | Untracked | Credentials migration | Student ID | YES* | NO | Include if migrate approved |

\*YES for a **Student-ID backend** release; not required for **APK-only** pilot distribution of the already-built VC29 artifact.

---

## Category C — Documentation and QA reports (12)

| Path | Tracked | Purpose | Feature | G1 | Sensitive/gen | Action |
|------|---------|---------|---------|----|---------------|--------|
| `docs/LEARNWISE_GITHUB_RELEASE_FILE_MANIFEST.md` | Untracked | This classification | Release process | YES | NO | Docs PR candidate |
| `docs/LEARNWISE_GITHUB_RELEASE_PREFLIGHT_REPORT.md` | Untracked | Preflight (NOT READY) | Release process | YES | NO | Docs PR candidate |
| `docs/LEARNWISE_LEVEL1_PRODUCTION_APK_PREPARATION_REPORT.md` | Untracked | VC29 APK prep | G1 APK | YES | NO | Docs PR candidate |
| `docs/LEARNWISE_LEVEL1_PRODUCTION_GO_LIVE_READINESS.md` | Untracked | Go-live NOT READY | G1 | YES | NO | Docs PR candidate |
| `docs/LEARNWISE_LEVEL1_VC29_PHYSICAL_ANDROID_QA_REPORT.md` | Untracked | Physical QA (partial/BLOCKED) | G1 QA | YES | NO | Docs PR candidate |
| `docs/LEARNWISE_LEVEL1_FINAL_PRODUCTION_READINESS.md` | Untracked | Production readiness | G1 | YES | NO | Docs PR candidate |
| `docs/LEARNWISE_LEVEL1_VC28_RELEASE_QA_REPORT.md` | Untracked | VC28 staging QA history | Staging QA | NO | NO | Archive / optional docs |
| `docs/LEARNWISE_LEVEL1_IMAGE_RESTORATION_REPORT.md` | Untracked | Batch-d1 restore report | Staging media | NO | NO | Archive / optional docs |
| `docs/LEARNWISE_COMPLETE_ANDROID_STAGING_BUILD_REPORT.md` | Untracked | Staging APK build | Staging | NO | NO | Archive / optional docs |
| `docs/LEARNWISE_TARGETED_FEATURE_AUDIT.md` | Untracked | Feature audit notes | Audit | UNCERTAIN | NO | Docs PR or hold |
| `docs/LOCAL_STUDENT_AUTH_STAGING_PREPARATION.md` | Untracked | Local staging prep | Student auth staging | NO | NO | Archive / optional |
| `docs/LOCAL_STUDENT_AUTH_STAGING_RESTORATION_REPORT.md` | Untracked | Staging restoration | Student auth staging | NO | NO | Archive / optional |

**Recommended first docs PR (6):** preflight, this manifest, APK prep, go-live readiness, VC29 physical QA, final production readiness.

---

## Category D — Generated or sensitive — exclude (962)

| Bucket | Paths | Count | Action |
|--------|-------|------:|--------|
| Batch-D1 media | `server/storage/vocab-media/pilot/batch-d1/**` | **750** | Exclude; keep local for staging |
| Prod web dist dump | `exports/prod-app-web-dist/**` | **113** | Exclude |
| VC29 physical QA exports | `exports/vc29-physical-qa/**` | **20** | Exclude (evidence; APKs gitignored) |
| VPS student-auth pull | `exports/_vps_student_auth_pull/**` | **15** | Exclude |
| Backup restore tree | `exports/_backup_student_auth_restore_20261120-123737/**` | **9** | Exclude |
| VC28 QA evidence | `exports/vc28-level1-qa-evidence/**` | **8** | Exclude |
| Prod APK holdout | `exports/_prod_apk_holdout_vc29/**` | **5** | Exclude |
| Recovered copies | `exports/_recovered*/**` | **7** | Exclude |
| Prod access probe | `exports/_prod_access_probe/**` | **1** | Exclude |
| Root `exports/` scripts, probes, SQL, secrets, manifests, Admin Direct evidence | remaining `exports/*` root files | **34** | Exclude |

**D total = 750 + 113 + 20 + 15 + 9 + 8 + 5 + 7 + 1 + 34 = 962**

Includes explicitly: `_stage2_secrets_local_only.json`, probe JSON, image restore SQL/scripts, stage2 entitlement evidence, classification helper manifests.

APK/AAB binaries are **gitignored** (may not appear in the 990) and must still never be force-added.

---

## Category E — Unrelated development work to preserve (4)

| Path | Tracked | Purpose | Feature | G1 | Sensitive/gen | Action |
|------|---------|---------|---------|----|---------------|--------|
| `apps/mobile/app/admin-create-student.tsx` | Untracked | Admin Direct create UI | Admin Direct | **NO** | NO | Preserve locally; **exclude** from G1 release |
| `server/src/student-auth/admin-direct-sponsor.ts` | Untracked | System Sponsor / direct create | Admin Direct | **NO** | NO | Preserve; exclude from G1 |
| `docs/LEARNWISE_ADMIN_DIRECT_STUDENT_CREATION_DESIGN.md` | Untracked | Admin Direct design | Admin Direct | **NO** | NO | Preserve; separate approval |
| `docs/LEARNWISE_ADMIN_DIRECT_STUDENT_CREATION_IMPLEMENTATION_REPORT.md` | Untracked | Admin Direct impl report | Admin Direct | **NO** | NO | Preserve; separate approval |

---

## Category F — Uncertain — operator review (7)

| Path | Tracked | Purpose | Why uncertain | Recommended question |
|------|---------|---------|---------------|----------------------|
| `apps/mobile/app.json` | Modified | versionCode currently **28** | VC29 APK baked as **29** | Align versionCode before any commit? |
| `apps/mobile/app/admin.tsx` | Modified | Admin shell + Create Student → Direct | Direct tile vs G1 HOLD | Revert Direct link for G1 commit? |
| `server/src/admin-users/admin-users.service.ts` | Modified | Admin user side-effects | Scope unclear for G1 pilot | Needed for Student ID / G1? |
| `server/src/app.ts` | Modified | `/media/vocab` static mount | Staging image fix | Commit for staging only or also prod? |
| `server/src/config/env.ts` | Modified | Student auth / sponsor env flags | May enable Admin Direct paths | Inspect flags before commit |
| `server/src/student-auth/admin-shared-student-otp.service.ts` | Untracked | Shared student OTP | In or out of Student ID MVP? | Include with B or defer? |
| `server/prisma/migrations/20261119200000_admin_shared_student_otp/migration.sql` | Untracked | OTP migration | Same as above | Migrate only with OTP approval |

---

## Modified tracked files — complete (17)

| # | Path | Primary | G1 required |
|---|------|---------|-------------|
| 1 | `apps/mobile/app.json` | F | UNCERTAIN |
| 2 | `apps/mobile/app/admin.tsx` | F | UNCERTAIN |
| 3 | `apps/mobile/app/login.tsx` | A | YES |
| 4 | `apps/mobile/services/api.ts` | A | YES |
| 5 | `apps/mobile/services/auth-errors.ts` | A | YES |
| 6 | `apps/mobile/services/auth-errors.test.ts` | A | YES |
| 7 | `server/prisma/schema.prisma` | B | YES* |
| 8 | `server/src/admin-users/admin-users.service.ts` | F | UNCERTAIN |
| 9 | `server/src/app.ts` | F | UNCERTAIN |
| 10 | `server/src/auth/auth.service.ts` | A | YES |
| 11 | `server/src/children/children.service.ts` | B | YES* |
| 12 | `server/src/config/env.ts` | F | UNCERTAIN |
| 13 | `server/src/learning/learning.routes.ts` | B | YES* |
| 14 | `server/src/learning/learning.service.ts` | B | YES* |
| 15 | `server/src/lib/jwt.ts` | B | YES* |
| 16 | `server/src/routes/index.ts` | B | YES* |
| 17 | `server/src/subscriptions/subscription.service.ts` | A | YES |

---

## Dependencies

```
login.tsx ──► api.ts, auth-errors.ts, login-siwi-hero.jpg
student-login.tsx ──► api.ts, auth-errors.ts, student-change-password.tsx
student-auth.routes ──► student-auth.service, student-id, student-session, jwt, schema + credentials migration
learning.routes ──► dual-auth / student-auth middleware, subscription.service
admin.tsx ──optional──► admin-create-student.tsx (E — exclude from G1)
admin-direct-sponsor (E) ── not required for VC29 APK (already holdout at build)
app.ts media mount (F) ──optional──► batch-d1 JPGs (D — never commit media)
```

**Important:** Local tree (`versionCode` 28, cleartext **true**, Admin Direct files present) ≠ baked **VC29** APK (`versionCode` 29, cleartext **false**, Admin Direct held out). Committing the worktree as-is does **not** reconstruct VC29 without a documented rebuild recipe.

---

## Accidental production / staging configuration risks

| Risk | Detail |
|------|--------|
| Local cleartext **true** | Staging LAN restore — **not** VC29 production APK setting |
| Local `versionCode` **28** | Differs from shipped VC29 (**29**) |
| Committing Admin Direct (E + admin.tsx Direct tile) | Contradicts G1 HOLD / VC29 holdout |
| Committing `exports/_stage2_secrets_*` or probes | Credential / PII leak |
| Treating staging scripts as prod runbooks | May target LAN `:4100` / local DB |
| Backend student-auth push + migrate without approval | Production DB change (out of scope) |
| Staging media mount in `app.ts` as “prod truth” | Needs explicit deploy decision |

---

## Recommended release file list (future — after approval; **not staged**)

### 1) Safest first — docs-only (6 files from C)

- `docs/LEARNWISE_GITHUB_RELEASE_PREFLIGHT_REPORT.md`
- `docs/LEARNWISE_GITHUB_RELEASE_FILE_MANIFEST.md`
- `docs/LEARNWISE_LEVEL1_PRODUCTION_APK_PREPARATION_REPORT.md`
- `docs/LEARNWISE_LEVEL1_PRODUCTION_GO_LIVE_READINESS.md`
- `docs/LEARNWISE_LEVEL1_VC29_PHYSICAL_ANDROID_QA_REPORT.md`
- `docs/LEARNWISE_LEVEL1_FINAL_PRODUCTION_READINESS.md`

### 2) Client Student-ID sync (A mobile + B mobile)

- Category A mobile: `login.tsx`, `api.ts`, `auth-errors.ts`, `auth-errors.test.ts`, `login-siwi-hero.jpg`
- Category B mobile: `student-login.tsx`, `student-change-password.tsx`
- **Exclude** `admin-create-student.tsx`

### 3) Server Student-ID (separate deploy approval)

- Category B server stack (without `admin-direct-sponsor.ts`)
- Resolve **F** items (`env.ts`, `app.ts`, OTP migration, `admin-users.service.ts`, `admin.tsx`) first

### Never

- Entire category **D** (962 paths)
- Admin Direct category **E** until separately approved
- APKs, AAB, keystores, `.env`, secrets JSON

---

## Remaining blockers

1. VC29 physical QA still **BLOCKED** (on-device Admin/Parent/Student login and learning not evidenced).  
2. Go-live readiness already **NOT READY**.  
3. Operator decisions on all **7** category **F** items.  
4. Explicit choice: **APK-only pilot** vs need for any GitHub code push.  
5. Confirm Admin Direct remains **out** of any G1 commit.  
6. Ensure no category **D** path is staged if a commit is later approved.  
7. Local Android config ≠ VC29 baked config — document rebuild recipe before claiming tree matches APK.

---

## Stop

- **No** source changes beyond writing this manifest  
- **No** staging · **No** commit · **No** push  
- **No** deletion · **No** move · **No** git reset/clean · **No** branch switch  
- **Stash@{0} intact**

**Await operator approval** before any GitHub staging or release commit plan.
