# Learn Wise — GitHub Release Preflight Report (NO PUSH)

**Date:** 2026-11-20  
**Mode:** Inspection only — **no commit, no push, no code changes, no APK rebuild, no deploy**  
**Intended release shape:** Grade 1 / Level 1 · VC29 Android APK · five pilot families · **Google Play not included** · Grades 2–4 **HOLD**

---

## Final recommendation: **NOT READY**

The **VC29 production HTTPS APK artifact** is configuration-ready for *internal* use, but this Git worktree is **not** ready for a controlled GitHub “release” commit/push review because:

1. Large uncommitted / untracked surface (≈986 untracked paths).  
2. VC29 physical QA still **BLOCKED** (on-device Admin/Parent/Student login and learning not evidenced).  
3. Go-live readiness already **NOT READY**.  
4. Local Android tree currently differs from the shipped VC29 APK (local `versionCode` 28 · cleartext **true**).  
5. Multiple **do-not-commit** secret/evidence paths present under `exports/`.

**Pilot APK distribution is a separate operator decision** and is **out of scope** for this preflight (no distribute / no declare live).

---

## 1. Git status

| Item | Value |
|------|--------|
| Current branch | `feature/student-id-login` |
| Current commit | `a4377fcaa0bac165bb31bfb72306f2cdbe639ccb` (`a4377fc`) |
| Upstream | `origin/feature/student-id-login` (**up to date**) |
| Remotes | `origin` (standard git remote — host/URL not required for this summary) |
| Target branch for any future push | Same feature branch **or** a dedicated release branch after approval (not created) |
| Working tree | **Dirty** — modified tracked + large untracked set |
| Stashes | `stash@{0}: WIP on feature/student-id-login: a4377fc docs: add Level-1 Android acceptance reports and staging helpers` — **preserved, untouched** |

### Recent commits (abbreviated)

From `git log` on this branch (style): docs / Level-1 Android acceptance helpers at `a4377fc` and earlier history on `feature/student-id-login`. Full log available locally; no rewrite performed.

### Modified tracked files (17)

```
apps/mobile/app.json
apps/mobile/app/admin.tsx
apps/mobile/app/login.tsx
apps/mobile/services/api.ts
apps/mobile/services/auth-errors.test.ts
apps/mobile/services/auth-errors.ts
server/prisma/schema.prisma
server/src/admin-users/admin-users.service.ts
server/src/app.ts
server/src/auth/auth.service.ts
server/src/children/children.service.ts
server/src/config/env.ts
server/src/learning/learning.routes.ts
server/src/learning/learning.service.ts
server/src/lib/jwt.ts
server/src/routes/index.ts
server/src/subscriptions/subscription.service.ts
```

### Untracked (high-level)

≈**986** untracked paths, including notably:

- Mobile: `student-login.tsx`, `student-change-password.tsx`, `admin-create-student.tsx`, hero asset  
- Server: `server/src/student-auth/**`, middleware, migrations  
- Docs: LEARNWISE_* Level-1 / VC28 / VC29 / Admin Direct / staging reports  
- `exports/**` (QA evidence, secrets file, APK folders, media, probes, backups)  
- `server/storage/vocab-media/pilot/batch-d1/` (restored staging images)

**Protect existing work:** No reset/clean/checkout/stash drop/force-push/commit performed.

---

## 2. Files proposed for release (if operator later approves a docs/code PR)

**Important:** The **pilot delivery vehicle is the APK**, already built and gitignored (`*.apk`). A GitHub push is **not required** to hand five families an APK.

### A. Safe to consider for a future *documentation* commit (after QA PASS)

- `docs/LEARNWISE_LEVEL1_PRODUCTION_APK_PREPARATION_REPORT.md`
- `docs/LEARNWISE_LEVEL1_PRODUCTION_GO_LIVE_READINESS.md`
- `docs/LEARNWISE_LEVEL1_VC29_PHYSICAL_ANDROID_QA_REPORT.md` (once completed)
- `docs/LEARNWISE_LEVEL1_FINAL_PRODUCTION_READINESS.md`
- `docs/LEARNWISE_GITHUB_RELEASE_PREFLIGHT_REPORT.md` (this file)
- Related Level-1 readiness docs **without** embedded secrets

### B. App/server source — only with explicit product decision

| Candidate | Caution |
|-----------|---------|
| Login / auth-errors / student-login UI | Needed if Student ID login is in pilot scope |
| `server/src/student-auth/**` + migrations | **Backend deploy** — out of this APK-only preflight; Admin Direct must stay excluded from pilot APK |
| `admin-create-student.tsx` | **Must not ship** in Level-1 pilot APK (already excluded from VC29); do not commit as “enabled” without separate approval |
| `server/src/app.ts` media mount | Staging serve helper — review before production deploy |

### C. Not part of GitHub release of the APK itself

- `exports/android-production-apk-level1-vc29-2026-11-20/*.apk` — **gitignored**; distribute only with separate approval

---

## 3. Files that must not be committed

| Path / pattern | Risk |
|----------------|------|
| `.env` (present locally; **gitignored**) | Production/staging DB URLs, JWT, payment keys |
| `exports/_stage2_secrets_local_only.json` | Staging secrets / student IDs |
| `exports/_prod_probe_body.json` / probe artifacts | May contain credential-shaped payloads |
| `exports/vc29-physical-qa/installed-base.apk` and `*.apk` | Binaries; signing surfaces |
| `~/.lr-keystore/**` (outside repo) | Release keystore / signing passwords — never add |
| `server/storage/vocab-media/pilot/batch-d1/**` | Large media; not needed in git for APK pilot |
| `exports/_backup_*`, `_recovered*`, `_vps_student_auth_pull/**` | Recovery dumps / possible env leakage |
| Any file containing live tokens, OTPs, or parent/student PII dumps | Privacy |
| Local `AndroidManifest` cleartext=true changes as “production truth” | Misleading vs VC29 APK |

Tracked examples only: `.env.example`, `apps/mobile/.env.example` (templates — OK if no real secrets).

---

## 4. Security findings

| Finding | Severity | Notes (no secret values) |
|---------|----------|--------------------------|
| Untracked `exports/_stage2_secrets_local_only.json` | **High if committed** | Keep out of git |
| Local `.env` exists | **High if committed** | Ignored by `.gitignore` — verify stays ignored |
| Signing material outside repo | OK | Keystore not in tree; do not add |
| Hardcoded live Razorpay keys in app/server source | **Not found** in quick scan | Only test/`rzp_live_` **guard** strings in payment code |
| Demo passwords in historical scripts under `exports/` / server scripts | **Medium** | Treat as non-production; do not commit probe scripts with real prod passwords |
| VC29 APK bundle | Prior scan | No LAN API; no `rzp_live_` material; Admin Direct strings absent |
| Private student/parent datasets in exports | **Review before any add** | Prefer omit entire `exports/` from release commits |

**No secret values are printed in this report.**

---

## 5. Release configuration findings

| Check | VC29 APK artifact | Local worktree (now) |
|-------|-------------------|----------------------|
| Production HTTPS API `https://api.siwiapp.shop/api` | **PASS** (baked in) | `api.ts` fallback prod; build env must set for release |
| Cleartext disabled | **PASS** (`usesCleartextTraffic=false` in APK) | Local manifest currently **`true`** (staging restore) — **do not confuse with APK** |
| Package ID | **PASS** `com.littlereaders.app` | Same in `app.json` |
| Version | **PASS** versionCode **29** / 1.0.0 | Local `app.json` shows versionCode **28** |
| Signing identity | **PASS** cert SHA-256 `6d283c94…e2707a` | N/A |
| Admin Direct excluded | **PASS** in VC29 APK | Source file `admin-create-student.tsx` **exists untracked** (excluded from that APK build) |
| Grade 1 scope / G2–4 HOLD | Policy | HOLD not device-proven on VC29 |
| Google Play | Out of scope | Confirmed not part of this preflight |

---

## 6. QA inspection summary (actual statuses)

Sources: `LEARNWISE_LEVEL1_VC29_PHYSICAL_ANDROID_QA_REPORT.md`, `LEARNWISE_LEVEL1_PRODUCTION_GO_LIVE_READINESS.md`

### PASS (evidenced)

- VC29 install on SM-S921B  
- Launch / login UI with Student · Parent · Admin tabs  
- APK production HTTPS + cleartext off + signing + Admin Direct excluded  
- Production API health / Admin API login probe (workstation — **not** on-device Admin PASS)

### FAIL

- Staging parent demo against production (401) — unavailable for Parent QA  
- Recorded audio library as Listen product claim (TTS only)

### BLOCKED

- On-device Admin login (awaiting operator confirmation)  
- On-device Parent / Student login (no approved prod test accounts)  
- Grade 1 learning journey, progress/resume  
- Subscription / unpaid / Grades 2–4 HOLD on device  
- Stability (restart / logout / network)

### NOT TESTED

- Full in-app HTTPS session from device after login  
- Anything not listed as PASS above on **VC29**

Go-live doc verdict remains **NOT READY**. Incomplete tests are **not** claimed PASS.

---

## 7. Recommended commit and push plan (for later approval only)

**Do nothing on GitHub until QA blockers clear**, unless operator explicitly wants a **docs-only** PR.

### Recommended sequence (when approved)

1. Finish VC29 physical QA (Admin → Parent → Student → Grade 1 journey → HOLD → stability).  
2. Decide pilot is **APK-only** (likely) vs **also** push code.  
3. If docs-only: new branch from `feature/student-id-login`, add selected `docs/LEARNWISE_*` reports, exclude `exports/`, commit, PR, **no force push**.  
4. If code: split PRs — (a) Student/Parent login client without Admin Direct UI, (b) server student-auth **without** enabling Admin Direct in production, (c) never commit `.env` / secrets / APK / batch-d1 media.  
5. Push only with operator approval; protect `main`/`production` branches.

### Explicitly not recommended now

- Single giant commit of all 986 untracked files  
- Committing Admin Direct as part of Grade 1 pilot  
- Pushing before on-device QA PASS  

---

## 8. Final recommendation

| Decision | **NOT READY** for GitHub release review / push |
|----------|-----------------------------------------------|
| APK config for Grade 1 pilot | Separately: VC29 artifact is **config-PASS**; **QA-NOT READY** for go-live |
| Next operator gates | (1) Complete physical QA · (2) Approve whether GitHub push is needed at all · (3) Approve any docs/code commit set · (4) Approve APK distribution to five families |

---

## Stop

Inspection complete. **No commit. No push. No deploy. No distribute.**  

Awaiting explicit operator approval before any GitHub or release action.
