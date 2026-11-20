# Learn Wise VC29 — Physical Android Installation & QA Report

**Date:** 2026-11-20 (updated — QA completion attempt)  
**Device:** Samsung Galaxy S24 · **SM-S921B** · Android 17 · serial `RZCX42381TM`  
**APK:** `exports/android-production-apk-level1-vc29-2026-11-20/LearnWise-1.0.0-vc29-level1-production-https.apk`  
**Package / version:** `com.littlereaders.app` · `1.0.0` · **versionCode 29**  
**API:** `https://api.siwiapp.shop/api`  
**Related:** `docs/LEARNWISE_LEVEL1_PRODUCTION_GO_LIVE_READINESS.md`  

## Final assessment (current): **NOT COMPLETE — BLOCKED on credentials / operator login**

Install and launch remain **PASS**. Remaining interactive QA did **not** progress to PASS because:

1. **Admin on-device login** awaits **operator confirmation** (not recorded as PASS).  
2. **No approved production Parent or Student test accounts** were provided in this session (staging credentials must not be used against production; credentials were not invented).

No rebuild · no reinstall · no app-data clear · no production DB/subscription changes · no Grades 2–4 activation · no deploy/distribute/commit/push · no Play upload.

---

## Phase 1 — Device safety

| Step | Result | Evidence |
|------|--------|----------|
| Prior VC36 conflict | Resolved earlier by owner uninstall | Prior section / package dump |
| Current package | **PASS** | versionCode **29** on device (no reinstall this session) |

---

## Phase 2 — Installation / launch

| Test | Result | Evidence |
|------|--------|----------|
| Install VC29 | **PASS** | Earlier `adb install` Success |
| Launch / no crash | **PASS** | `MainActivity` focused |
| Production HTTPS config in APK | **PASS** | Prep report + bundle scan |
| Foreground for continuation QA | **PASS** | `21-foreground-login.png` / UI dump — login screen with Student / Parent / Admin |

---

## Phase 3 — Login testing

| Test | Result | Evidence |
|------|--------|----------|
| Student / Parent / Admin tabs visible | **PASS** | UI dump `21-foreground-ui.xml` |
| OTP not forced on login UI | **PASS** | Same |
| **Admin login (on-device)** | **BLOCKED — awaiting operator** | App is on login screen. Instructions require **manual Admin login** then **operator confirmation** before PASS. **No confirmation received this turn.** |
| Admin API probe (workstation only) | Informational only | Demo Admin → HTTP 200 on production API earlier — **does not count as on-device Admin PASS** |
| **Parent login (Email + Password)** | **BLOCKED** | No **approved production** Parent test account supplied this session. Staging `parent@littlereaders.test` previously **401** on production — not reused. |
| **Student login (Student ID + Password)** | **BLOCKED** | No **approved production** Student ID / password supplied. Credentials not invented. |

---

## Phase 4 — Level 1 learning

| Test | Result | Evidence |
|------|--------|----------|
| Grade 1 access | **BLOCKED** | Requires Parent/Student (or entitled) session on device |
| Learn → Speak → Understand → Play → Complete | **BLOCKED** | Same |
| Images / audio (TTS) in-app | **BLOCKED** | Same (CDN image samples elsewhere ≠ in-app journey) |
| Progress save / resume | **BLOCKED** | Same |

Speak honesty (code/docs, not device-proven on VC29): manual “I said it!” · Listen = TTS — not claimed as PASS for this APK session.

---

## Phase 5 — Access control

| Test | Result | Evidence |
|------|--------|----------|
| Admin Direct excluded from APK | **PASS** (build) | Bundle: no `admin-create-student` / `direct-children` |
| Admin Direct on production API | **PASS** (API) | Prior probe **404** |
| Grade 1 subscription access (on-device) | **BLOCKED** | No entitled session |
| Grades 2–4 HOLD (on-device) | **BLOCKED** | No entitled session; not activated |
| Unpaid student restrictions (on-device) | **BLOCKED** | No Student session |

---

## Phase 6 — Stability

| Test | Result | Evidence |
|------|--------|----------|
| App restart | **BLOCKED** | Needs authenticated session first (optional smoke without login not requested as substitute) |
| Logout / login | **BLOCKED** | No successful on-device login yet |
| Network interruption / recovery | **BLOCKED** | Same |
| No blocking crashes (post-login) | **BLOCKED** | Same |

---

## Screenshots / artifacts (this continuation)

| File | Notes |
|------|--------|
| `exports/vc29-physical-qa/20-current-screen.png` | Recents view before foreground |
| `exports/vc29-physical-qa/21-foreground-login.png` | Learn Wise foregrounded on login |
| `exports/vc29-physical-qa/21-foreground-ui.xml` | Student / Parent / Admin texts present |
| Prior | `05-launch.png`, install dumps, etc. |

---

## Remaining blockers

| ID | Severity | Blocker | Needed to unblock |
|----|----------|---------|-------------------|
| **BLK-VC29-06** | High | On-device **Admin login** not operator-confirmed | Operator: open app → Admin → log in with approved prod Admin → reply **“Admin logged in”** |
| **BLK-VC29-07** | High | No approved **production Parent** test account | Owner provides Email + Password for production-only Parent test user |
| **BLK-VC29-08** | High | No approved **production Student** test account | Owner provides Student ID + Password for production-only Student |
| **BLK-VC29-09** | High | Grade 1 journey / progress / HOLD / stability | Complete after logins above |

---

## Restrictions honored

- No staging credentials used against production in this continuation  
- No invented credentials  
- No OTP architecture change  
- No production data/subscription modification  
- No Grades 2–4 activation  
- No rebuild / reinstall / clear data  
- No deploy / distribute / commit / push / Play upload  

---

## Stop

**Stopped.** Awaiting:

1. Operator confirmation after **manual Admin login**, and  
2. Approved production **Parent** and **Student** test credentials (or explicit waiver of those roles).

Do not mark go-live READY until these evidence gaps are closed.
