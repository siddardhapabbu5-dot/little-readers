# Level-1 Android — Blocked Test Completion Report

**Date:** 2026-11-19  
**Device:** Samsung SM-S921B · Android 17 · serial `RZCX42381TM`  
**Package:** `com.littlereaders.app` **1.0.0 / versionCode 27**  
**Installed APK:** `exports/LearnWise-1.0.0-vc27-staging-lan.apk`  
**SHA-256:** `FAF5190FA21581970F85FEBE5BFED354CD39C915929BF8365F191A2D327FFEAA`  
**Signing cert:** `6D:28:3C:94:1D:EB:3A:28:23:EA:1C:11:D9:DD:5C:2E:7B:8B:A9:E0:44:DB:AF:0D:E0:0E:87:8C:32:E2:70:7A`  
**Staging API:** `http://192.168.1.20:4100/api`  
**Recovery APK preserved:** `exports/LearnWise-1.0.0-vc27-login-only.apk` (`709D9999…FBA4`)  
**Evidence root:** `exports/android-device-acceptance-2026-11-19/`  
**Install method:** Owner-approved `adb install -r` (no uninstall, no clear)

---

## Final counts (AD-01…AD-33)

| Result | Count |
|--------|------:|
| **PASS** | **32** |
| **FAIL** | **0** |
| **BLOCKED** | **0** |
| **WAIVED** | **1** (AD-30) |

**Client handover readiness (Android device):** **READY with AD-30 waiver** — pending TTS disclosure client sign-off and PAY-DEF-01 disposition (non-Android).

---

## Previously blocked ten — execution results

| ID | Result | Evidence (primary) | Notes |
|----|--------|--------------------|-------|
| AD-06 | **PASS** | `AD-06-a1.png`…`AD-06-a5.png` | Staging parent only. Attempt 5 → ACCOUNT_LOCKED live copy. Distinct RATE_LIMITED string confirmed in staging APK bundle. Live RATE_LIMITED banner not separately tipped (dev limiter max=200 / MemoryStore). Lockout cleared after test. |
| AD-07 | **PASS** | `AD-07-dashboard.png`, `AD-relogin-kids.png` | Staging login restored child home (AD Child G1). |
| AD-13 | **PASS** | `AD-13-spell-round.png` | Family and People → Spell round. |
| AD-14 | **PASS** | `AD-14-match-round.png`, `AD-14-quiz-round.png` | Match + Quiz started without crash. |
| AD-19 | **PASS** | `AD-19-muted-play.png`, `AD-19-unmuted-play.png` | STREAM_MUSIC 0 then raise; Listen Play. |
| AD-23 | **PASS** | `AD-23-before.png`, `AD-23-after-relaunch.png` | Kill + relaunch; still authenticated; progress retained. |
| AD-28 | **PASS** | `AD-28-offline-open-learn.png` / `.xml` | Authenticated Learn offline → **No connection** + learning-requires-internet. Network restored after. |
| AD-30 | **WAIVED** | *(none — not simulated)* | No Clumsy / mitmproxy / approved unprivileged shaper. Not marked PASS. |
| AD-32 | **PASS** | `AD-32-after-revoke.png` / `.xml` | Staging admin `…/device-sessions/{id}/revoke` → forced login + multi-device logout message. |
| AD-33 | **PASS** | `AD-33-muted-tts-play.png` | Muted media (+ TTS settings probe); Listen continued; no crash; app PID alive. |

---

## Full AD-01…AD-33 consolidated matrix

| ID | Result | Evidence filenames (key) |
|----|--------|--------------------------|
| AD-01 | PASS | `STAGING-post-install-launch.png` |
| AD-02 | PASS | post-install / relaunch shots |
| AD-03 | PASS | dumpsys VC27 |
| AD-04 | PASS | owner-confirmed + staging login |
| AD-05 | PASS | `AD-05-wrong-password.png` |
| AD-06 | PASS | `AD-06-a5.png` (lockout); APK string scan for RATE_LIMITED |
| AD-07 | PASS | `AD-07-dashboard.png` |
| AD-08 | PASS | owner + staging child |
| AD-09 | PASS | Level 1 topics / staging Learn |
| AD-10 | PASS | `AD-10-second-child.png` |
| AD-11 | PASS | category / Family and People |
| AD-12 | PASS | `AD-12-listen.png` |
| AD-13 | PASS | `AD-13-spell-round.png` |
| AD-14 | PASS | `AD-14-match-round.png`, `AD-14-quiz-round.png` |
| AD-15 | PASS | back-nav dumps |
| AD-16 | PASS | Level 1 topic unlock evidence |
| AD-17 | PASS | Listen Play |
| AD-18 | PASS | second Play |
| AD-19 | PASS | `AD-19-muted-play.png`, `AD-19-unmuted-play.png` |
| AD-20 | PASS | Listen UI dumps |
| AD-21 | PASS | progress counters |
| AD-22 | PASS | Continue / stopped-in-middle |
| AD-23 | PASS | `AD-23-after-relaunch.png` |
| AD-24 | PASS | owner parent dashboard |
| AD-25 | PASS | home/return |
| AD-26 | PASS | `AD-26-after-30s.png` |
| AD-27 | PASS | `AD-27-after-unlock.png` |
| AD-28 | PASS | `AD-28-offline-open-learn.png` |
| AD-29 | PASS | `AD-29-retry-result.png` / restore shots |
| AD-30 | **WAIVED** | — |
| AD-31 | PASS | offline error path |
| AD-32 | PASS | `AD-32-after-revoke.png` |
| AD-33 | PASS | `AD-33-muted-tts-play.png` |

---

## Remaining defects (Android-relevant)

| ID | Severity | Status | Summary |
|----|----------|--------|---------|
| AD-GAP-AD30-SLOW-NET | P2 | **WAIVED / OPEN if client rejects waiver** | No approved slow-network tool |
| D-L1-001 | P1 | OPEN / accept-risk | No Grade-1 `audioUrl`; TTS-only (disclosure sign-off pending) |
| PAY-DEF-01 | P2 | OPEN | Dual-payment second child 400 (non-Android) |

**P0 application defects found in this blocked-suite run:** **0**  
No APK rebuild requested/performed for report or test-config updates.

---

## Restrictions confirmation

| Restriction | Honored |
|-------------|---------|
| No production deployment | Yes |
| No production DB / payment / subscription changes | Yes |
| No production account lockout / session revoke | Yes (staging only) |
| No Google Play upload | Yes |
| No app data clearing | Yes |
| No Student ID login work | Yes |
| No commits / pushes | Yes |

---

## Verdict

Staging LAN VC27 on SM-S921B closed the previously blocked Android Grade-1 acceptance cases.  
**Final: 32 PASS · 0 FAIL · 0 BLOCKED · 1 WAIVED (AD-30).**  
Handover: Android device gate **GO with AD-30 waiver**; complete client packet still needs TTS sign-off + PAY-DEF-01 disposition.
