# Learn Wise — Level 1 VC30 Production APK Preparation Report

**Date:** 2026-11-20  
**Purpose:** Separate production-configured Android APK including Grade 1 Admin Create Student (parent-scoped)  
**Google Play:** Out of scope  
**Install / distribute:** **Not performed** — stop before installation; awaiting approval  

**Final assessment:** **PASS** (build + configuration verification)

---

## 1. APK location

| Item | Path |
|------|------|
| **VC30 production APK** | `exports/android-production-apk-level1-vc30-2026-11-20/LearnWise-1.0.0-vc30-level1-production-https.apk` |
| Size | 111,617,712 bytes (~106.45 MB) |
| **SHA-256** | `A34AAB7F285E5731DFDC0B515351B7794EEBF1AA7F1A908BC7F051C07C42F38E` |

### VC29 preserved (unchanged)

| Item | Value |
|------|--------|
| Path | `exports/android-production-apk-level1-vc29-2026-11-20/LearnWise-1.0.0-vc29-level1-production-https.apk` |
| SHA-256 (before & after) | `1F0322AEF19DBD3DB189B34D8D3770E9ED479D4D08000E7813EB1BA8A5944283` |
| Overwritten? | **No** |

---

## 2. Version

| Field | Value |
|-------|--------|
| versionName | `1.0.0` |
| **versionCode** | **30** |
| Application label | Learn Wise |
| Package ID | `com.littlereaders.app` (unchanged) |
| Gradle | `assembleRelease` **BUILD SUCCESSFUL** (~1m 33s) |
| Branch / HEAD reference | `feature/student-id-login` @ `a4377fc` (local dirty tree for UI) |

---

## 3. Signing identity

| Field | Value |
|-------|--------|
| Keystore | `~/.lr-keystore/release.jks` (via `-PLW_UPLOAD_*` for this build) |
| `apksigner verify` | Verified |
| Cert SHA-256 | `6d283c941deb3a2823ea1c11d9dd5c2e7b8ba9e044dbaf0de00e878c32e2707a` |
| Lineage | Same as VC27 / VC28 / VC29 (upgrade-compatible) |

---

## 4. Production configuration verification

| Check | Result |
|-------|--------|
| Build-time API | `EXPO_PUBLIC_API_URL=https://api.siwiapp.shop/api` |
| Bundle `https://api.siwiapp.shop/api` | **1** |
| Bundle LAN `192.168.1.20:4100` | **0** |
| Bundle `localhost:4100` | **0** |
| `EXPO_PUBLIC_ENABLE_DEMO` | `0` |
| `usesCleartextTraffic` in APK | **false** (`0x0`) |
| `LR_ALLOW_CLEARTEXT` | Unset during build |
| `rzp_live_` in bundle | **0** |

---

## 5. Feature inclusion / exclusion

| Feature | In VC30? | Bundle evidence |
|---------|----------|-----------------|
| Student / Parent / Admin login | **Yes** | `student/auth/login` = 1 |
| Admin Create Student (Grade 1) screen | **Yes** | `/admin-create-student-grade1` = 1; dashboard title “Create Student (Grade 1)” = 1 |
| Parent list + create under Parent | **Yes** | `learn-wise-grades` = 1; `/student/auth/admin/parents/` = 1 |
| Secure handover / `mustChangePassword` / seat warning fields | **Yes** | `mustChangePassword` = 1; `hasLearningSeat` = 1 |
| Grade 1 / LEVEL_1 only (UI) | **Yes** | Screen locks to LEVEL_1 (code) |
| Admin Direct (`/admin-create-student`, `direct-children`) | **Excluded** | exact `/admin-create-student` (non-grade1) = **0**; `direct-children` = **0** |
| Grades 2–4 activation | **Not performed** | HOLD policy; UI does not offer G2–4 create |

During build, `admin-create-student.tsx` was temporarily held out under `exports/_prod_apk_holdout_vc30/`, then **restored** to the worktree afterward.

---

## 6. Installation readiness

| Item | Status |
|------|--------|
| APK built & signed | **Ready** |
| Config matches production HTTPS + cleartext off | **Ready** |
| VC29 artifact intact | **Yes** |
| Physical install | **Not started** — awaiting approval |
| Distribution | **Not performed** |
| Backend deploy / student account create | **Not performed** |
| Commit / push | **Not performed** |

**Device note:** Phone currently has VC29 (`versionCode` 29). Installing VC30 is an upgrade on the same signing lineage; requires explicit operator approval before `adb install`.

---

## 7. Local worktree after build

Restored for continued staging/LAN work:

- `versionCode` **28** (`app.json` + `build.gradle`)
- `usesCleartextTraffic` **true** (main manifest)
- `admin-create-student.tsx` restored (local only; not in VC30)
- Dashboard still points to `/admin-create-student-grade1`
- `stash@{0}` preserved

---

## 8. Stop / approval gate

**Stopped before installation.**

Awaiting explicit approval before:

1. Physical device install of VC30  
2. Any internal distribution  
3. Production account creation / QA create under a designated Parent  

No Google Play upload · no backend deploy · no commit/push.
