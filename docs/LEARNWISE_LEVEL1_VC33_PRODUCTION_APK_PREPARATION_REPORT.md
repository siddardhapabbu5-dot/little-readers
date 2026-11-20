# Learn Wise — Level 1 VC33 Production APK Preparation Report

**Date:** 2026-11-20  
**Purpose:** Production Android APK including (A) Student Subscription navigation fix and (B) Student Profile authentication fix  
**References:**  
- `docs/LEARNWISE_VC32_STUDENT_SUBSCRIPTION_NAVIGATION_FIX_REPORT.md`  
- `docs/LEARNWISE_VC32_STUDENT_PROFILE_AUTH_FIX_REPORT.md`  
**Google Play / install / distribute:** **Not performed** — awaiting approval  

**Final assessment:** **PASS** (focused tests + build + APK verification)

---

## 1. Source fixes included

### A. Student Subscription navigation

| Item | In VC33? |
|------|----------|
| `parentOrStudentBilling` AuthGate | **Yes** |
| Student parent-guidance copy | **Yes** — “Ask your parent to manage your subscription” |
| Student view skips `/subscriptions/me` | **Yes** (parent branch retains it) |

### B. Student Profile authentication

| Item | In VC33? |
|------|----------|
| `canUseUserAvatarApi` — STUDENT skips User avatar API | **Yes** |
| Default avatar for students | **Yes** |
| Camera / edit-profile tools gated off for STUDENT | **Yes** |
| Parent/Admin still use `/auth/me/avatar` | **Yes** (`AUTH_ME_AVATAR` present for non-student path) |

### Key source files (worktree at build)

- `apps/mobile/app/subscription.tsx`
- `apps/mobile/services/avatar-auth.ts`
- `apps/mobile/components/ProfilePhoto.tsx`
- `apps/mobile/app/(tabs)/profile.tsx`
- Plus prior session paths: `AuthGate.tsx`, `index.tsx`, `api.ts` (`/student/auth/me`)

**Held out of APK:** `admin-create-student.tsx` (Admin Direct) → `exports/_prod_apk_holdout_vc33/` during build, then restored.

---

## 2. Focused test results (pre-build)

| Suite | Result |
|-------|--------|
| `exports/vc31-sub-nav/local-verify-subscription-nav.mjs` | **10/10 PASS** |
| `apps/mobile/services/avatar-auth.test.ts` | **PASS** |
| Source preflight (sub + avatar + AuthGate + Grade1 OTP + Edit SID) | **PASS** |
| Physical Samsung S24 install/QA | **Not claimed** — no install this task |

---

## 3. Build result

| Item | Value |
|------|--------|
| Command | `gradlew.bat assembleRelease` + `-PLW_UPLOAD_*` from `~/.lr-keystore/signing.properties` |
| Env | `EXPO_PUBLIC_API_URL=https://api.siwiapp.shop/api`, `EXPO_PUBLIC_ENABLE_DEMO=0` |
| Gradle | **BUILD SUCCESSFUL** in ~1m 29s |
| Branch / HEAD | `feature/student-id-login` @ `a4377fc` (local dirty tree for sub + profile fixes) |

---

## 4. APK path and size

| Item | Path |
|------|------|
| **VC33 APK** | `exports/android-production-apk-level1-vc33-2026-11-20/LearnWise-1.0.0-vc33-level1-production-https.apk` |
| Size | 111,629,108 bytes (~106.46 MB) |
| SHA-256 file | `exports/android-production-apk-level1-vc33-2026-11-20/SHA256.txt` |

---

## 5. Package and version

| Field | Value |
|-------|--------|
| Package ID | `com.littlereaders.app` |
| Label | Learn Wise |
| versionName | `1.0.0` |
| **versionCode** | **33** |

---

## 6. Production API and HTTPS

| Check | Result |
|-------|--------|
| Bundle `https://api.siwiapp.shop/api` | **1** |
| LAN `192.168.1.20:4100` | **0** |
| `localhost:4100` | **0** |
| `http://api.siwiapp` | **0** |
| `usesCleartextTraffic` | **false** (`0x0`) |
| `rzp_live_` | **0** |

---

## 7. Signing certificate

| Field | Value |
|-------|--------|
| `apksigner verify` | Exit **0** |
| Cert SHA-256 | `6d283c941deb3a2823ea1c11d9dd5c2e7b8ba9e044dbaf0de00e878c32e2707a` |
| Lineage match | **PASS** |

---

## 8. APK SHA-256

`855BE7175A4EEBA32FE8862F9EA47ACE844E615E7CD562B5CFFBF5399103EFCD`

---

## 9. VC29–VC32 unchanged

| Artifact | SHA-256 | Unchanged? |
|----------|---------|------------|
| VC29 | `1F0322AEF19DBD3DB189B34D8D3770E9ED479D4D08000E7813EB1BA8A5944283` | **Yes** |
| VC30 | `A34AAB7F285E5731DFDC0B515351B7794EEBF1AA7F1A908BC7F051C07C42F38E` | **Yes** |
| VC31 | `0B4B9E465F9907F855FCE6302F9A96288483BE3B6216F83937CF01885DBEE49C` | **Yes** |
| VC32 | `FCA804A7F148DBFCA4F809F3CFA7B5990F038196FAD1B45E4C1BA80B90692808` | **Yes** |
| Overwritten? | **No** — new folder only | |

---

## 10. Bundle feature evidence (VC33)

| Feature | Count / note |
|---------|----------------|
| Ask your parent to manage your subscription | **1** |
| `parentOrStudentBilling` | **1** |
| `student/auth/me` | **1** |
| `canUseUserAvatarApi` | **1** |
| Profile photos are managed by a parent account | **1** |
| `/auth/me/avatar` | **1** (Parent/Admin path retained) |
| `admin-create-student-grade1` | **1** |
| `admin-edit-student-id` | **1** |
| `shared-email-otp` | **3** |
| `student/auth/login` | **1** |
| `direct-children` (Admin Direct) | **0** |

---

## 11. Failures / limitations

| Item | Notes |
|------|--------|
| On-device install | **Not performed** |
| S24 QA of Profile + Subscription on VC33 | Requires separate install approval |
| Backend deploy | **Not performed** |
| Commit / push | **Not performed** |

---

## 12. Local worktree after build

Restored:

- `versionCode` **28** (`app.json` + `build.gradle`)
- `usesCleartextTraffic` **true**
- `admin-create-student.tsx` restored  
- Holdout under `exports/_prod_apk_holdout_vc33/`

---

## 13. Stop / approval gate

**Stopped before installation.**

Awaiting explicit approval before:

1. `adb install -r` of VC33 on Samsung S24  
2. Focused device QA (Subscription + Profile + session + Grades 2–4)  

No Google Play · no backend deploy · no commit/push · VC29–VC32 APKs unmodified.
