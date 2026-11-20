# Learn Wise VC33 — Samsung S24 Install & Student Test Report

**Date:** 2026-11-20  
**Device:** Samsung Galaxy S24 SM-S921B · ADB `RZCX42381TM`  
**Package:** `com.littlereaders.app`  
**APK:** `exports/android-production-apk-level1-vc33-2026-11-20/LearnWise-1.0.0-vc33-level1-production-https.apk`  
**Student:** existing production test student **DEPPU1727** (Deepika) — **no new account created**  

**Final assessment:** **INSTALL PASS** · **Subscription fix PASS** · **Profile auth fix PASS** · **Resume/cold-start PASS**

---

## 1. APK SHA-256 verification

| Check | Result |
|-------|--------|
| Expected | `855BE7175A4EEBA32FE8862F9EA47ACE844E615E7CD562B5CFFBF5399103EFCD` |
| Computed | `855BE7175A4EEBA32FE8862F9EA47ACE844E615E7CD562B5CFFBF5399103EFCD` |
| Match | **PASS** |

---

## 2. Pre-install checks

| Check | Result |
|-------|--------|
| Device connected / authorized | **PASS** — `RZCX42381TM device` · SM-S921B |
| APK exists | **PASS** |
| Pre-install package | **PASS** — `com.littlereaders.app` |
| Pre-install versionCode | **PASS** — **32** / `1.0.0` |
| Uninstall / clear data | **Not used** |

---

## 3. Installation

| Item | Result |
|------|--------|
| Command | `adb -s RZCX42381TM install -r <VC33 APK>` |
| Result | **Success** (exit 0) |
| Package | `com.littlereaders.app` |
| versionName | `1.0.0` |
| versionCode | **33** |
| `firstInstallTime` | `2026-11-20 17:29:16` (unchanged from earlier install lineage) |
| `lastUpdateTime` | `2026-11-20 21:36:12` |
| Data preservation | **PASS** — upgrade-only install; no uninstall/clear; `dataDir=/data/user/0/com.littlereaders.app` retained |
| Launch | **PASS** — MainActivity focused |

---

## 4. Focused student tests

Passwords / tokens were never recorded in this report.

| # | Test | Result | Evidence |
|---|------|--------|----------|
| 1 | Student ID + Password login | **PASS** | Manual login by operator after ADB special-char input friction; authenticated Home `Hi, Deepika!` (`30-home.*`) |
| 2 | Student Home | **PASS** | `Hi, Deepika!` / Grade 1 (`30-home.*`, `35-after-cold-start.*`) |
| 3 | Subscription parent guidance | **PASS** | **“Ask your parent to manage your subscription”** (`31-subscription.*`) |
| 4 | Subscription — no login redirect | **PASS** | Stayed on Subscription student-safe screen; **Back to home** returned to authenticated Home (`32-home-after-sub.*`) |
| 5 | Profile opens | **PASS** | Bottom Profile tab → `Deepika` / `DEPPU1727` / `STUDENT` (`33-profile.*`) |
| 6 | Student default avatar / no camera tools | **PASS** | No Camera / Change photo / Edit profile controls (`CAMERA=False`) |
| 7 | Profile — no session clearing | **PASS** | `LOGIN_BOUNCE=False`; session remained after Profile |
| 8 | Cold start | **PASS** | Force-stop + relaunch → still `Hi, Deepika!` (`35-after-cold-start.*`) |
| 9 | App resume | **PASS** | HOME then return → still authenticated (`34-after-resume.*`) |
| 10 | Grade 1 accessible (entry) | **PASS** | Grade 1 home shown |
| 11 | Grades 2–4 locked | **PASS** | No Grades 2–4 unlock UI (`GRADES234_UNLOCK=False`) |

### Expected non-failure: Grade 1 learning lock copy

Home shows **“Ask a parent to unlock Grade 1”** / subscription needed.  
This is **expected**: DEPPU1727 has **no learning seat** and no subscription grant was performed (per restrictions). It is **not** a VC33 regression.

### VC33 primary fixes (device)

| Fix | Result |
|-----|--------|
| A. Student Subscription navigation | **PASS** — parent guidance; no logout/login bounce from Subscription |
| B. Student Profile authentication | **PASS** — Profile opens without clearing session; student tools hidden |

### Parent / Admin

Not re-exercised end-to-end on device in this pass (no separate Parent/Admin session available without additional credentials). Login role tabs (Student / Parent / Admin) remain present on the welcome screen. Student path did not regress Parent-managed messaging on Profile/Subscription.

---

## 5. Artifact index

Under `exports/vc33-s24-install/`:

| File | Content |
|------|---------|
| `01-launch.*` | Post-install launch (login welcome) |
| `30-home.*` | Authenticated student Home |
| `31-subscription.*` | Parent-guidance Subscription UI |
| `32-home-after-sub.*` | Home still authenticated after Subscription |
| `33-profile.*` | Student Profile (no login bounce) |
| `34-after-resume.*` | Session after app resume |
| `35-after-cold-start.*` | Session after force-stop cold start |

---

## 6. Restrictions compliance

| Restriction | Status |
|-------------|--------|
| No backend deploy | Observed |
| No production data changes / no new student | Observed |
| No seat/subscription activation | Observed |
| No Play upload / APK distribution | Observed |
| VC29–VC33 APK artifacts unmodified after install | Observed |
| No commit / push | Observed |

---

## 7. Failures / limitations

1. **ADB password entry** with special characters was unreliable; final login confirmation used **operator manual entry** plus subsequent automated UI checks.  
2. **Parent/Admin full flows** not device-tested in this pass (student-focused).  
3. **Learning content** remains locked without a seat — expected; not treated as a VC33 defect.

---

## 8. Stop

**Stopped after installation and focused testing + this report.**  
No further install, distribution, backend, or commit actions performed.
