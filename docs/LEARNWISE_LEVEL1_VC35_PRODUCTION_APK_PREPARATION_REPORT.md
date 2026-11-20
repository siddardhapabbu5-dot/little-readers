# Learn Wise — Level 1 VC35 Production APK Preparation Report

**Date:** 2026-11-20  
**Purpose:** Production Android APK with Student session-protection fix (stale 401 must not clear a newer session)  
**Reference:** `docs/LEARNWISE_STUDENT_LOGIN_TAB_SESSION_VERIFICATION_REPORT.md`  
**Google Play / install / distribute:** **Not performed** — awaiting approval  

**Final assessment:** **PASS** (focused tests + build + APK verification)

---

## 1. Source fixes included

| Fix | In VC35? |
|-----|----------|
| Clear session only when failing bearer === current token | **Yes** (`shouldClearSessionForUnauthorized`) |
| Late Admin 401 must not clear newer Student JWT | **Yes** |
| Late Student 401 must not clear newer Parent JWT | **Yes** (same guard) |
| Login tab switch clears the other role’s ID field | **Yes** (`login.tsx` `switchMode`) |
| Student / Parent / Admin auth flows preserved | **Yes** |
| VC34 Parent PIN + subscription-entry + student-safe Subscription | **Yes** (retained) |
| Student Profile default avatar (no `/auth/me/avatar`) | **Yes** (retained) |

**Held out of APK:** `admin-create-student.tsx` (Admin Direct) → `exports/_prod_apk_holdout_vc35/` during build, then restored.

---

## 2. Files changed (for this VC)

| File | Role |
|------|------|
| `apps/mobile/services/session.ts` | Session-guard helper |
| `apps/mobile/services/api.ts` | `handleAuthFailure` uses guard before `notifyUnauthorized` |
| `apps/mobile/app/login.tsx` | Tab switch clears cross-role identity |
| `apps/mobile/components/AuthGate.tsx` | Docstring only |
| `apps/mobile/services/session.test.ts` | Unit tests (Admin→Student + Student→Parent) |

Build-time only (restored after): `app.json` / `build.gradle` versionCode **35**; `AndroidManifest` cleartext **false**.

---

## 3. Regression test results (pre-build)

| Suite / check | Result |
|---------------|--------|
| `apps/mobile/services/session.test.ts` | **PASS** (incl. Admin→Student + Student→Parent stale 401) |
| `apps/mobile/services/avatar-auth.test.ts` | **PASS** |
| `apps/mobile/services/auth-errors.test.ts` | **PASS** |
| `apps/mobile/services/subscription-entry.test.ts` | **PASS** |
| `server/tests/parent-gate-pin.test.ts` | **2/2 PASS** |
| Student / Parent / Admin tab field wiring (source) | **PASS** |
| Student auth endpoints in bundle (`student/auth/login`, `student/auth/me`) | **PASS** (post-build string check) |
| Physical S24 install / live DEPPU1727 login | **Not performed** (restricted) |

---

## 4. Build result

| Item | Value |
|------|--------|
| Command | `gradlew.bat assembleRelease` + `-PLW_UPLOAD_*` from `~/.lr-keystore/signing.properties` (`release.jks`) |
| Env | `EXPO_PUBLIC_API_URL=https://api.siwiapp.shop/api`, `EXPO_PUBLIC_ENABLE_DEMO=0` |
| Gradle | **BUILD SUCCESSFUL** (~2.5 min) |

---

## 5. APK path and size

| Item | Path / value |
|------|----------------|
| **VC35 APK** | `exports/android-production-apk-level1-vc35-2026-11-20/LearnWise-1.0.0-vc35-level1-production-https.apk` |
| Size | 111,634,064 bytes (~106.46 MB) |
| SHA-256 file | `exports/android-production-apk-level1-vc35-2026-11-20/SHA256.txt` |

---

## 6. Package and version

| Field | Value |
|-------|--------|
| Package ID | `com.littlereaders.app` |
| Label | Learn Wise |
| versionName | `1.0.0` |
| **versionCode** | **35** |

---

## 7. Production API and HTTPS

| Check | Result |
|-------|--------|
| Bundle `https://api.siwiapp.shop/api` | **1** |
| LAN `192.168.1.20:4100` | **0** |
| `localhost:4100` | **0** |
| `usesCleartextTraffic` | **false** (`0x0`) |

---

## 8. Signing certificate

| Field | Value |
|-------|--------|
| Cert SHA-256 | `6d283c941deb3a2823ea1c11d9dd5c2e7b8ba9e044dbaf0de00e878c32e2707a` |
| Lineage match | **PASS** |

---

## 9. APK SHA-256

`D229D2ECD931EA5CD037C8462B5E838CB873FDCAE2D7E6A79D93882E46DEE217`

---

## 10. VC29–VC34 unchanged

| Artifact | Unchanged? |
|----------|------------|
| VC29–VC34 SHA-256 vs pre-build snapshots | **Yes** |
| Overwritten? | **No** — new folder only |

Pre-build snapshot: `exports/_vc35_prebuild_sha_snapshot.json`

---

## 11. Bundle feature evidence (VC35)

| Feature | Count |
|---------|-------|
| `shouldClearSessionForUnauthorized` | **1** |
| `student/auth/login` | **1** |
| `student/auth/me` | **1** |
| `Student ID (e.g. LWXXXXXXXX)` | **1** |
| `subscription-entry` | **1** |
| `Parent PIN` | **4** |
| Ask your parent to manage your subscription | **1** |
| `direct-children` (Admin Direct) | **0** |

---

## 12. Failures / limitations

| Item | Notes |
|------|--------|
| On-device install | **Not performed** |
| Live Student/Parent/Admin password login | **Not performed** this prep |
| Production payment / seat / DB | **Not performed** |
| Backend deploy / Play / commit | **Not performed** |

---

## 13. Local worktree after build

Restored:

- `versionCode` **28** (`app.json` + `build.gradle`)
- `usesCleartextTraffic` **true**
- `admin-create-student.tsx` restored  
- Holdout under `exports/_prod_apk_holdout_vc35/`

---

## 14. Stop / approval gate

**Stopped before installation.**

Awaiting explicit approval before `adb install -r` of VC35 on Samsung S24.
