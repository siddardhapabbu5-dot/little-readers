# Learn Wise — Level 1 VC31 Production APK Preparation Report

**Date:** 2026-11-20  
**Purpose:** Production-configured Android APK including Admin OTP Grade 1 student provisioning, Student ID edit, and AuthGate student login fix  
**Google Play:** Out of scope  
**Install / distribute:** **Not performed** — stop before installation; awaiting approval  

**Final assessment:** **PASS** (build + configuration verification)

---

## 1. APK location

| Item | Path |
|------|------|
| **VC31 production APK** | `exports/android-production-apk-level1-vc31-2026-11-20/LearnWise-1.0.0-vc31-level1-production-https.apk` |
| Size | 111,624,700 bytes (~106.46 MB) |
| **SHA-256** | `0B4B9E465F9907F855FCE6302F9A96288483BE3B6216F83937CF01885DBEE49C` |

### Prior APKs preserved (unchanged)

| Item | SHA-256 |
|------|---------|
| VC29 | `1F0322AEF19DBD3DB189B34D8D3770E9ED479D4D08000E7813EB1BA8A5944283` |
| VC30 | `A34AAB7F285E5731DFDC0B515351B7794EEBF1AA7F1A908BC7F051C07C42F38E` |
| Overwritten? | **No** |

---

## 2. Version

| Field | Value |
|-------|--------|
| versionName | `1.0.0` |
| **versionCode** | **31** |
| Application label | Learn Wise |
| Package ID | `com.littlereaders.app` (unchanged) |
| Gradle | `assembleRelease` **BUILD SUCCESSFUL** (~1m 33s) |
| Branch / HEAD reference | `feature/student-id-login` @ `a4377fc` (local dirty tree for OTP/AuthGate/SID UI) |

---

## 3. Signing identity

| Field | Value |
|-------|--------|
| Keystore | `~/.lr-keystore/release.jks` (via `-PLW_UPLOAD_*` for this build) |
| `apksigner verify` | Verified (exit 0) |
| Cert SHA-256 | `6d283c941deb3a2823ea1c11d9dd5c2e7b8ba9e044dbaf0de00e878c32e2707a` |
| Lineage | Same as VC27–VC30 (upgrade-compatible) |

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

| Feature | In VC31? | Bundle evidence |
|---------|----------|-----------------|
| Student / Parent / Admin login | **Yes** | `student/auth/login` = 1 |
| AuthGate student `/student/auth/me` | **Yes** | `student/auth/me` = 1 |
| Admin Create Student (Grade 1) OTP screen | **Yes** | `/admin-create-student-grade1` = 1; title “Create Student (Grade 1)” = 1 |
| Shared-email OTP create API paths | **Yes** | `shared-email-otp` = 3 |
| Edit Student ID (Admin management) | **Yes** | `/admin-edit-student-id` = 1; “Edit Student ID” = 1 |
| Secure handover / `mustChangePassword` | **Yes** | `mustChangePassword` = 1 |
| Grade 1 / LEVEL_1 only (UI) | **Yes** | Screen locks to LEVEL_1 (code) |
| Admin Direct (`/admin-create-student`, `direct-children`) | **Excluded** | exact `/admin-create-student` (non-grade1) = **0**; `direct-children` = **0** |
| Grades 2–4 activation | **Not performed** | HOLD policy |

During build, `admin-create-student.tsx` was temporarily held out under `exports/_prod_apk_holdout_vc31/`, then **restored** to the worktree afterward.

---

## 6. What VC31 adds vs VC30

| Change | Notes |
|--------|--------|
| OTP-gated Grade 1 create UI | No Parent picker; shared mailbox OTP flow |
| AuthGate student session fix | Prevents post–password-change login loop |
| Admin Edit Student ID screen | Rename without resetting password/progress |
| Backend pairing | Requires deployed OTP/sponsor APIs for full create QA (not part of this APK-only task) |

---

## 7. Installation readiness

| Item | Status |
|------|--------|
| APK built & signed | **Ready** |
| Config matches production HTTPS + cleartext off | **Ready** |
| VC29 / VC30 artifacts intact | **Yes** |
| Physical install | **Not started** — awaiting approval |
| Distribution | **Not performed** |
| Backend deploy | **Not performed** |
| Commit / push | **Not performed** |

**Device note:** Installing VC31 is an upgrade on the same signing lineage over VC29/VC30; requires explicit operator approval before `adb install`.

---

## 8. Local worktree after build

Restored for continued staging/LAN work:

- `versionCode` **28** (`app.json` + `build.gradle`)
- `usesCleartextTraffic` **true** (main manifest)
- `admin-create-student.tsx` restored (local only; not in VC31)
- Dashboard still points to `/admin-create-student-grade1` and `/admin-edit-student-id`
- Holdout backups under `exports/_prod_apk_holdout_vc31/`

---

## 9. Stop / approval gate

**Stopped before installation.**

Awaiting explicit approval before:

1. Physical device install of VC31  
2. Any internal distribution  
3. Production / staging backend deploy or account creation  

No Google Play upload · no backend deploy · no commit/push · VC29/VC30 APK files not modified.
