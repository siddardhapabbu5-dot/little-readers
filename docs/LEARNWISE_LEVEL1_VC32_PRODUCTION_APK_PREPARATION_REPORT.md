# Learn Wise — Level 1 VC32 Production APK Preparation Report

**Date:** 2026-11-20  
**Purpose:** Production-configured Android APK including the Student Subscription navigation fix (session preserved; parent-guidance UI)  
**Basis:** `docs/LEARNWISE_VC31_STUDENT_SUBSCRIPTION_NAVIGATION_FIX_REPORT.md`  
**Google Play:** Out of scope  
**Install / distribute:** **Not performed** — stop before installation; awaiting approval  

**Final assessment:** **PASS** (focused tests + build + configuration verification)

---

## 1. Source changes included

From the VC31 subscription navigation fix (already in the worktree at build time):

| File | Inclusion |
|------|-----------|
| `apps/mobile/app/subscription.tsx` | Student-safe view + `parentOrStudentBilling` AuthGate; parent UI unchanged |
| `apps/mobile/app/index.tsx` | Cold start uses `/student/auth/me` for STUDENT |
| `apps/mobile/app/(tabs)/profile.tsx` | Profile refresh uses `/student/auth/me` for STUDENT |
| `apps/mobile/services/api.ts` | Resume probe uses `/student/auth/me` for STUDENT |
| `apps/mobile/app/(tabs)/home.tsx` | Hide Parent dashboard CTA for STUDENT when blocked |
| `apps/mobile/app/(tabs)/learn.tsx` | Blocked gate keeps Subscription CTA only |
| `apps/mobile/components/AuthGate.tsx` | Existing STUDENT → `/student/auth/me` (unchanged this build) |

**Also preserved from VC31 lineage:** Student/Parent/Admin login, Admin OTP Grade 1 create (`admin-create-student-grade1`), Admin Edit Student ID, Grade 1 only.

**Held out of this APK (same policy as VC30/VC31):** `admin-create-student.tsx` (Admin Direct) → `exports/_prod_apk_holdout_vc32/` during build, then **restored** to the worktree.

---

## 2. Test results

| Check | Result |
|-------|--------|
| `exports/vc31-sub-nav/local-verify-subscription-nav.mjs` | **10/10 PASS** |
| Student Subscription copy / no parent billing APIs in student view | PASS |
| Parent `/subscriptions/me` path retained | PASS |
| AuthGate / index / profile / resume student me | PASS |
| Live `GET /subscriptions/me` non-user bearer → 401 | PASS |

On-device install/QA of VC32: **not run** (install gated).

---

## 3. Build result

| Item | Value |
|------|--------|
| Command | `gradlew.bat assembleRelease` with `-PLW_UPLOAD_*` from `~/.lr-keystore/signing.properties` |
| Env | `EXPO_PUBLIC_API_URL=https://api.siwiapp.shop/api`, `EXPO_PUBLIC_ENABLE_DEMO=0`, cleartext env unset |
| Gradle | **BUILD SUCCESSFUL** in ~2m 21s |
| Branch / HEAD | `feature/student-id-login` @ `a4377fc` (local dirty tree for subscription/session fix) |

---

## 4. APK path and file size

| Item | Path |
|------|------|
| **VC32 production APK** | `exports/android-production-apk-level1-vc32-2026-11-20/LearnWise-1.0.0-vc32-level1-production-https.apk` |
| Size | 111,628,344 bytes (~106.46 MB) |
| SHA-256 file | `exports/android-production-apk-level1-vc32-2026-11-20/SHA256.txt` |

---

## 5. Package ID, version name, version code

| Field | Value |
|-------|--------|
| Package ID | `com.littlereaders.app` (unchanged) |
| Application label | Learn Wise |
| versionName | `1.0.0` |
| **versionCode** | **32** |

---

## 6. Production API and HTTPS verification

| Check | Result |
|-------|--------|
| Build-time API | `EXPO_PUBLIC_API_URL=https://api.siwiapp.shop/api` |
| Bundle `https://api.siwiapp.shop/api` | **1** |
| Bundle LAN `192.168.1.20:4100` | **0** |
| Bundle `localhost:4100` | **0** |
| Bundle `http://api.siwiapp` | **0** |
| `EXPO_PUBLIC_ENABLE_DEMO` | `0` |
| `usesCleartextTraffic` in APK | **false** (`0x0`) |
| `LR_ALLOW_CLEARTEXT` | Unset during build |
| `rzp_live_` in bundle | **0** |

---

## 7. Signing certificate verification

| Field | Value |
|-------|--------|
| Keystore | via `~/.lr-keystore/signing.properties` → `-PLW_UPLOAD_*` |
| `apksigner verify` | Verified (exit 0) |
| Cert SHA-256 | `6d283c941deb3a2823ea1c11d9dd5c2e7b8ba9e044dbaf0de00e878c32e2707a` |
| Lineage match (expected) | **PASS** — matches VC27–VC31 release lineage |

---

## 8. APK SHA-256

`FCA804A7F148DBFCA4F809F3CFA7B5990F038196FAD1B45E4C1BA80B90692808`

---

## 9. VC29–VC31 remain unchanged

| Artifact | SHA-256 | Unchanged vs pre-build? |
|----------|---------|-------------------------|
| VC29 | `1F0322AEF19DBD3DB189B34D8D3770E9ED479D4D08000E7813EB1BA8A5944283` | **Yes** |
| VC30 | `A34AAB7F285E5731DFDC0B515351B7794EEBF1AA7F1A908BC7F051C07C42F38E` | **Yes** |
| VC31 | `0B4B9E465F9907F855FCE6302F9A96288483BE3B6216F83937CF01885DBEE49C` | **Yes** |
| Overwritten? | **No** — VC32 written to a new folder only | |

---

## 10. Bundle feature evidence (VC32)

| Feature | In VC32? | Bundle evidence |
|---------|----------|-----------------|
| Student Subscription parent-guidance copy | **Yes** | `Ask your parent to manage your subscription` = 1 |
| `parentOrStudentBilling` role set | **Yes** | = 1 |
| AuthGate / student me | **Yes** | `student/auth/me` = 1 |
| Student login | **Yes** | `student/auth/login` = 1 |
| Admin Create Student (Grade 1) OTP | **Yes** | `admin-create-student-grade1` = 1; `shared-email-otp` = 3 |
| Edit Student ID | **Yes** | `admin-edit-student-id` = 1 |
| Parent billing path still present (parent branch) | **Yes** | `/subscriptions/me` = 1 |
| Admin Direct (`direct-children`) | **Excluded** | = **0** |
| Grades 2–4 activation | **Not performed** | HOLD policy |

---

## 11. Failures / limitations

| Item | Notes |
|------|--------|
| On-device install | **Not performed** — awaiting approval |
| Physical confirmation of Subscription tap | Requires VC32 install on S24 with existing student `DEPPU1727` |
| Backend deploy | **Not performed** |
| Commit / push | **Not performed** |
| Google Play | **Not performed** |
| New student / seat grant | **Not performed** |

---

## 12. Local worktree after build

Restored for continued staging/LAN work:

- `versionCode` **28** (`app.json` + `build.gradle`)
- `usesCleartextTraffic` **true** (main manifest)
- `admin-create-student.tsx` restored (local only; not in VC32)
- Holdout backups under `exports/_prod_apk_holdout_vc32/`

---

## 13. Stop / approval gate

**Stopped before installation.**

Awaiting explicit approval before:

1. Physical device install of VC32 (upgrade over VC31 on the same signing lineage)  
2. Any internal distribution  
3. Re-test: Student home → Subscription → parent guidance → back to home with session intact  

No Google Play upload · no backend deploy · no commit/push · VC29/VC30/VC31 APK files not modified.
