# Learn Wise VC31 — Physical Android Installation Report

**Date:** 2026-11-20  
**Task:** Install and basic launch verification only  
**Functional workflow testing:** **Not started** — awaiting further approval  

**Final assessment:** **PASS**

---

## A. Exact VC31 APK identity

| Field | Value |
|-------|--------|
| Path | `exports/android-production-apk-level1-vc31-2026-11-20/LearnWise-1.0.0-vc31-level1-production-https.apk` |
| Full path | `C:\Users\harsh\OneDrive\Documents\Desktop\SIWI-login-auth-only\exports\android-production-apk-level1-vc31-2026-11-20\LearnWise-1.0.0-vc31-level1-production-https.apk` |
| SHA-256 | `0B4B9E465F9907F855FCE6302F9A96288483BE3B6216F83937CF01885DBEE49C` |
| SHA match expected | **Yes** |
| package | `com.littlereaders.app` |
| versionCode / versionName | **31** / `1.0.0` |
| Signing cert SHA-256 | `6d283c941deb3a2823ea1c11d9dd5c2e7b8ba9e044dbaf0de00e878c32e2707a` |
| Matches installed (VC30) cert | **Yes** |

---

## B. Device

| Field | Value |
|-------|--------|
| ADB serial | `RZCX42381TM` |
| Status | `device` (authorized) |
| Model | **SM-S921B** (Samsung Galaxy S24) |

---

## C. Pre-install package state

| Field | Value |
|-------|--------|
| Package | `com.littlereaders.app` |
| Previous versionCode | **30** |
| Previous versionName | `1.0.0` |

---

## D. Installation

| Step | Result |
|------|--------|
| Pre-checks (device, model, SHA, package, cert) | **PASS** — no failures |
| Command | `adb -s RZCX42381TM install -r <VC31 APK>` |
| Result | **Success** (`INSTALL_EXIT=0`) |
| Uninstall | **Not performed** |
| Clear data / storage | **Not performed** |
| Rebuild / backend deploy / commit | **Not performed** |

---

## E. Post-install package state

| Field | Value |
|-------|--------|
| versionCode | **31** |
| versionName | `1.0.0` |
| lastUpdateTime | 2026-11-20 19:33:46 |

---

## F. Launch verification

| Check | Result |
|-------|--------|
| App opens | **PASS** — cold launch via launcher |
| First screen after launch | **Admin Dashboard** (existing Admin session preserved; data not cleared) |
| Admin dashboard content | Visible: Admin Dashboard, Quick Actions including **Create Student (Grade 1)** and **Edit Student ID** |
| Login tabs (via `littlereaders://login`) | **Student**, **Parent**, **Admin** all **visible** |
| Student creation / production data changes | **Not performed** |

### Artifacts

| File | Description |
|------|-------------|
| `exports/vc31-physical-install/01-launch.png` | Admin Dashboard after launch |
| `exports/vc31-physical-install/01-launch-ui.xml` | UI dump |
| `exports/vc31-physical-install/02-login-attempt.png` | Login screen |
| `exports/vc31-physical-install/02-login-attempt-ui.xml` | Login UI dump (tabs confirmed) |

---

## G. Prior APK integrity

| APK | SHA-256 after install | Unchanged? |
|-----|------------------------|------------|
| VC29 | `1F0322AEF19DBD3DB189B34D8D3770E9ED479D4D08000E7813EB1BA8A5944283` | **Yes** |
| VC30 | `A34AAB7F285E5731DFDC0B515351B7794EEBF1AA7F1A908BC7F051C07C42F38E` | **Yes** |

---

## H. Errors

None. Installation and basic launch verification completed successfully.

---

## Stop / approval gate

**Stopped after installation and basic launch verification.**

Awaiting further approval before:

1. Functional workflow testing (OTP student create, Student ID edit, password-change login)  
2. Any production account creation  
3. Backend deploy  

No Google Play upload · no APK distribution · no commit/push.
