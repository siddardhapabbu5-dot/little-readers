# Learn Wise — Level 1 VC36 Production APK Preparation Report

**Date:** 2026-11-21  
**Purpose:** Production Android APK fixing Student Home bounce after Grade 1 unlock (Parent-only API 401 → session clear)  
**References:**  
- `docs/LEARNWISE_VC35_STUDENT_HOME_401_BOUNCE_ROOT_CAUSE.md`  
- `docs/LEARNWISE_STUDENT_LOGIN_TAB_SESSION_VERIFICATION_REPORT.md`  

**Final assessment:** **PASS** (tests + build + APK verify + S24 install)

---

## 1. Source fixes included

| Fix | In VC36? |
|-----|----------|
| Home: skip `/learning/progress` + `/challenges/overview` for STUDENT | **Yes** |
| Learn / Games: no `/children` for STUDENT | **Yes** |
| Games: skip daily-challenge progress API for STUDENT | **Yes** |
| Rewards: skip progress API for STUDENT | **Yes** |
| VC35 stale-401 session guard | **Yes** (retained) |
| Login tab clears cross-role ID | **Yes** (retained) |
| Parent PIN + subscription-entry + student-safe Subscription | **Yes** |

**Held out:** `admin-create-student.tsx` → `exports/_prod_apk_holdout_vc36/` (restored after build)

---

## 2. Files changed

| File | Role |
|------|------|
| `apps/mobile/app/(tabs)/home.tsx` | Student-safe Home fetches |
| `apps/mobile/app/(tabs)/learn.tsx` | Student-safe child resolve |
| `apps/mobile/app/(tabs)/games.tsx` | Student-safe Games fetches |
| `apps/mobile/app/(tabs)/rewards.tsx` | Skip Parent progress for Student |
| `apps/mobile/services/session.ts` / `api.ts` / `login.tsx` | From VC35 lineage |

---

## 3. Regression tests (pre-build)

| Suite | Result |
|-------|--------|
| `session.test.ts` | **PASS** |
| `avatar-auth.test.ts` | **PASS** |
| `auth-errors.test.ts` | **PASS** |
| `subscription-entry.test.ts` | **PASS** |
| `parent-gate-pin.test.ts` | **2/2 PASS** |

---

## 4. Build / APK

| Item | Value |
|------|--------|
| Command | `gradlew.bat assembleRelease` + `release.jks` via `-PLW_UPLOAD_*` |
| Env | `EXPO_PUBLIC_API_URL=https://api.siwiapp.shop/api` |
| APK | `exports/android-production-apk-level1-vc36-2026-11-21/LearnWise-1.0.0-vc36-level1-production-https.apk` |
| Size | 111,634,484 bytes |
| SHA-256 | `C08E9DA5525E036265E15A3473F8384964B2DEB62D37C700D75006466C3F576B` |
| Package | `com.littlereaders.app` · `1.0.0` · **versionCode 36** |
| Cleartext | **false** (`0x0`) |
| Prod API in bundle | **1** · LAN/localhost **0** |
| Cert | `6d283c94…32e2707a` **PASS** |
| Bundle evidence | `Student profile is missing` **1** · `shouldClearSessionForUnauthorized` **1** · `direct-children` **0** |
| VC29–VC35 | **Unchanged** |

---

## 5. Local restore

- `versionCode` **28**, cleartext **true**, `admin-create-student.tsx` restored  

---

## 6. Install

See `docs/LEARNWISE_VC36_SAMSUNG_S24_INSTALL_REPORT.md` — **installed on S24** after owner approval.
