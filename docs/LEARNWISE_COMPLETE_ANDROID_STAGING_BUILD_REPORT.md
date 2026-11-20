# Learn Wise – Complete Android Staging Build Report

**Date:** 2026-11-20  
**Build type:** Complete application staging APK (not feature-only)  
**Status:** BUILD VERIFIED — awaiting approval before any production release  
**Physical device testing:** NOT performed in this run

---

## 1. Git / worktree

| Item | Value |
|------|--------|
| Branch | `feature/student-id-login` |
| HEAD | `a4377fcaa0bac165bb31bfb72306f2cdbe639ccb` (`a4377fc` — docs: add Level-1 Android acceptance reports and staging helpers) |
| Tracking | `origin/feature/student-id-login` |
| Worktree | `C:/Users/harsh/OneDrive/Documents/Desktop/SIWI-login-auth-only` |
| Other worktrees (untouched) | `SIWI-Read IT & Spell IT` (`fix/login-auth-reliability`); `SIWI-vc27-login-only-apk` (detached) |
| Stash | `stash@{0}` preserved — WIP on `feature/student-id-login` at `a4377fc` |
| Commit / push | **Not performed** (per restrictions) |

### Worktree status (summary)

Uncommitted / untracked work **retained** (not discarded), including:

- Student auth UI: `student-login.tsx`, `student-change-password.tsx`, `admin-create-student.tsx`
- Login / admin / API client updates
- Server student-auth + Admin Direct Sponsor (`server/src/student-auth/`)
- Related migrations, Stage 2 / Admin Direct evidence under `exports/`
- Staging cleartext enablement in `android/app/src/main/AndroidManifest.xml` (`usesCleartextTraffic=true` for LAN HTTP)

No required feature was found only on another branch in a way that blocked this APK. Sibling worktrees were left unchanged.

---

## 2. Feature inclusion checklist

### A. Existing Learn Wise application

| Check | Result |
|-------|--------|
| Existing navigation / screens | Included (full mobile app tree; complete release bundle) |
| Grade 1–4 learning | Included (existing learning modules retained) |
| Content, audio, progress, activities | Included |
| Subscription / payment | Included (existing flows retained; not removed) |

### B. Authentication

| Check | Result |
|-------|--------|
| Student / Parent / Admin login options | Included (`login.tsx`, `student-login.tsx`) |
| Student ID + password login | Included |
| Admin email + password login | Included (`/auth/login`) |
| Parent login | Included (existing) |
| Auth error handling | Included (`auth-errors.ts`) |
| Student session management | Included (student auth middleware / secure session) |

### C. Student account management

| Check | Result |
|-------|--------|
| Admin creates student accounts | Included |
| Admin Direct Student Creation (no parent picker) | Included (`admin-create-student.tsx` → `POST /student/auth/admin/direct-children`) |
| System-managed internal Sponsor Parent | Included (`admin-direct-sponsor.ts`) |
| Preferred Student ID | Included |
| Automatic Student ID generation | Included |
| Duplicate Student ID prevention | Included (server validation) |
| Student ID rename | Included (server student-auth) |
| Temporary password generation | Included |
| Forced first-login password change | Included (`student-change-password.tsx`) |
| Show/hide password controls | Included |

### D. Subscription and access

| Check | Result |
|-------|--------|
| New students UNPAID by default | Included (direct-create UI + server) |
| Unpaid cannot access paid learning | Included (Stage 2 entitlement behavior retained) |
| Admin-granted entitlement unlocks permitted learning | Included |
| Existing subscription / payment records protected | Included (no production DB changes; staging-only) |

### E. UI

| Check | Result |
|-------|--------|
| Updated login screen | Included |
| Updated Admin Create Student Account screen | Included |
| No Sponsor Parent picker in direct-creation workflow | Included |
| Responsive Android layouts | Source present; **physical device QA not run** |
| No overlapping / clipped fields | Source reviewed earlier; **physical device QA not run** |

### Missing features

**None identified** for the approved development scope listed above.  
Server-side Admin Direct / student-auth code is in this worktree; the APK embeds the corresponding mobile screens and API paths (`direct-children`, `student/auth/login`, `admin-create-student`, `UNPAID` present in JS bundle).

---

## 3. Build configuration

| Item | Value |
|------|--------|
| Application | Learn Wise |
| Platform | Android |
| Package ID | `com.littlereaders.app` |
| versionName | `1.0.0` |
| versionCode | **28** (incremented from installed VC27 lineage) |
| API | **LOCAL / STAGING only** |
| Staging API endpoint | `http://192.168.1.20:4100/api` |
| Web URLs (staging) | `http://192.168.1.20:3100` |
| Cleartext | `LR_ALLOW_CLEARTEXT=1` intent; manifest set `usesCleartextTraffic=true` for LAN HTTP |
| Production API credentials | **Not used** for this APK’s active API base |
| Signing | `~/.lr-keystore/release.jks` via `signing.properties` (`-PLW_UPLOAD_*`) |

**Note on production URL string in bundle:** `apps/mobile/services/api.ts` keeps a compile-time fallback literal `https://api.siwiapp.shop/api`. With `EXPO_PUBLIC_API_URL` set at build time, the **active** base URL inlined is `http://192.168.1.20:4100/api`. Bundle scan: LAN hits = 1; production fallback string still present once (unused when env is set).

---

## 4. Build and compilation results

| Step | Result |
|------|--------|
| Gradle `assembleRelease` (initial) | BUILD SUCCESSFUL (~17 min) |
| Cleartext fix + rebuild | BUILD SUCCESSFUL in 1m 12s |
| APK produced | `apps/mobile/android/app/build/outputs/apk/release/app-release.apk` |
| Export copy | See paths below |
| `aapt dump badging` | package / version verified |
| `apksigner verify --print-certs` | Verified |
| Manifest cleartext | `usesCleartextTraffic=true` (binary value `0xffffffff`) |
| JS bundle staging markers | LAN API, `direct-children`, student login paths present |

TypeScript / app unit checks were not re-run as a separate CI gate in this final packaging step; prior Stage 2 and Admin Direct verification scripts/evidence remain under `exports/`.

---

## 5. APK artifact

| Field | Value |
|-------|--------|
| Primary export path | `exports/android-complete-staging-apk-2026-11-20/LearnWise-1.0.0-vc28-complete-staging-lan.apk` |
| Convenience copy | `exports/LearnWise-1.0.0-vc28-complete-staging-lan.apk` |
| Package ID | `com.littlereaders.app` |
| App label | Learn Wise |
| versionName | `1.0.0` |
| versionCode | `28` |
| File size | 111,610,880 bytes (**106.44 MB**) |
| APK SHA-256 | `93EA577B353E475E3DF1FF9BD864C546FD2469FD765D86481A0B5450CD446D2E` |
| Staging API endpoint | `http://192.168.1.20:4100/api` |
| minSdk / targetSdk | 24 / 36 |

### Signing information

| Field | Value |
|-------|--------|
| Keystore | `~/.lr-keystore/release.jks` (same VC27 lineage) |
| Signer #1 cert SHA-256 | `6d283c941deb3a2823ea1c11d9dd5c2e7b8ba9e044dbaf0de00e878c32e2707a` |
| Signer #1 cert SHA-1 | `7ae9061fc26ca907615802839c6ed5eea36bf6d6` |
| DN | CN=, OU=, O=, L=, ST=, C=US |

---

## 6. Installation instructions (staging)

**Build verification only below — not a substitute for device QA.**

1. Ensure the staging API is reachable on the LAN at `http://192.168.1.20:4100` (device and host on same network).
2. Uninstall any older Learn Wise build if needed, or install over VC27 (same signing cert).
3. Install:
   ```text
   adb install -r exports/android-complete-staging-apk-2026-11-20/LearnWise-1.0.0-vc28-complete-staging-lan.apk
   ```
4. Open **Learn Wise**; log in against staging (Student ID / Parent / Admin as implemented).
5. Confirm traffic goes to LAN staging, not production.

Do **not** upload to Google Play. Do **not** point this APK at production.

---

## 7. Known issues and blockers

| Item | Severity | Notes |
|------|----------|--------|
| Physical Android device testing | Open | Not run in this session — layouts, login, learning, payments, Admin Direct create not device-validated here |
| Production fallback string in JS | Info | Unused when `EXPO_PUBLIC_API_URL` is set; do not confuse with active staging base URL |
| Cleartext required for staging HTTP | Info | Release manifest intentionally `usesCleartextTraffic=true` for this staging APK; **must not** ship to production with cleartext enabled |
| Uncommitted feature work | Info | Large set of local changes / untracked files; stash preserved; no commit per restrictions |
| Production release | Blocked pending approval | No Play upload, no production deploy/migrate/DB changes |

### Build verification vs device testing

| Layer | Status |
|-------|--------|
| Source feature presence | Verified |
| Gradle compile + APK packaging | Verified |
| Package ID / versionCode / signing | Verified |
| Staging API string in bundle | Verified |
| Cleartext for LAN HTTP | Verified in APK manifest |
| Install on phone / end-to-end flows | **Not verified** |

---

## 8. Restrictions compliance

- Complete Android application APK only — yes  
- Staging API only — yes  
- No production modification / deploy / Play upload — yes  
- No production migrations / DB changes — yes  
- No git commit / push — yes  
- No discard of stashes / existing work — yes  
- Stop after APK + report — yes  

**Awaiting approval before any production release.**
