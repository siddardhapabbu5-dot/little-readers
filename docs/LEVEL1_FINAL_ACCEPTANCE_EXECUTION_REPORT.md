# Level-1 — Final Acceptance Execution Report

**Date:** 2026-11-18 (payment/admin); **updated 2026-11-19** (Android VC27 device continuation)  
**Product:** Learn Wise — Grade-1 / Level-1  
**Authority:** User-approved payment sandbox + admin staging; Android physical attempt authorized 2026-11-19  
**Stop conditions honored:** No deploy, no production mutation, no AAB, no merge/push, no unapproved fixes

---

## Environment

| Item | Value |
|------|--------|
| Database | Local Docker Postgres `localhost:5437` |
| Isolation check | `DB_ISOLATION=local_ok`; prod host markers absent |
| Payments | Razorpay **test** key prefix `rzp_test_`; Vitest Razorpay stub; `PAYMENT_ENABLED=true` locally |
| Admin | Local API via `createApp()` + local demo admin |
| Production API / DB / payments | **Not used for mutations** |
| Android binary | **VC27** staging LAN APK installed (`LearnWise-1.0.0-vc27-staging-lan.apk`, SHA `FAF5190F…FFEAA`); recovery prod APK preserved |
| Android API (device suite) | Local staging `http://192.168.1.20:4100/api` |
| Android adb (2026-11-19) | Samsung **SM-S921B** (`RZCX42381TM`) |

---

## Totals

| Category | Total | Passed | Failed | Blocked |
|----------|------:|-------:|-------:|--------:|
| Payment sandbox (mapped Phase-1 gates) | 10 | 10 | 0 | 0 |
| Payment supporting Vitest cases | 24 | 23 | 1 | 0 |
| Admin staging (script rows) | 14 | 14 | 0 | 0 |
| Admin Phase-2 mapped gates | 10 | 10 | 0 | 0 |
| Android device cases (AD-01…AD-33) | 33 | 32 | 0 | 0 (+1 WAIVED AD-30) |
| TTS technical wording review | 4 | 4 | 0 | 0 |
| TTS client sign-off | 1 | 0 | 0 | 1 |
| **Grand total (all tracked rows)** | **86** | **83** | **1** | **1** (+1 AD-30 WAIVED) |

*Android final: **32 PASS / 0 FAIL / 0 BLOCKED / 1 WAIVED (AD-30)**. Phase-1+2 mapped gates remain 20/20 PASS. Full AD matrix: `LEVEL1_ANDROID_DEVICE_ACCEPTANCE.md`. Completion: `LEVEL1_ANDROID_BLOCKED_TEST_COMPLETION_REPORT.md`.*

---

## Phase 1 — Payment sandbox

| ID | Expected | Actual | Result | Evidence |
|----|----------|--------|--------|----------|
| PAY-01 | Successful payment | Verify 200 → ACTIVE | **PASS** | `batch10-payments` success verify |
| PAY-02 | Failed payment | `payment.failed` → FAILED, no activation | **PASS** | batch10 cancel/fail test |
| PAY-03 | Cancelled payment | cancel → FAILED | **PASS** | same |
| PAY-04 | Duplicate webhook | Idempotent; race single grant | **PASS** | batch10 duplicate + race |
| PAY-05 | Activation | `status=ACTIVE` | **PASS** | batch10 |
| PAY-06 | Grade-1 access after activation | Learning session 201 | **PASS** | `device-subscription` |
| PAY-07 | Subscription expiry | EXPIRED / eligible false | **PASS** | device-sub + dual RTDN |
| PAY-08 | Access after expiry | Learning session 402 | **PASS** | `device-subscription` |
| PAY-09 | Status sync | Payment SUCCEEDED consistent | **PASS** | batch10 race |
| PAY-10 | Retry after interrupt | Re-verify `alreadyProcessed=true` | **PASS** | batch10 idempotent verify |

**Account:** local demo / ephemeral test parents (masked).  
**Config changes:** none requested or applied.

---

## Phase 2 — Admin staging

| ID | Expected | Actual | Result | Evidence |
|----|----------|--------|--------|----------|
| ADM-01 | Admin login | 200 | **PASS** | `_staging-admin-acceptance.ts` |
| ADM-02 | Create test word | 201 | **PASS** | same |
| ADM-03 | Edit | 200 meaning edited | **PASS** | same |
| ADM-04 | Publish | PUBLISHED | **PASS** | same |
| ADM-05 | Visible to staging parent path | progress 200 | **PASS** | ADM-05 / ADM-05c |
| ADM-06 | Unpublish / deactivate | inactive + unpublished | **PASS** | same |
| ADM-07 | Not active for consumers | `isActive=false` | **PASS** | same |
| ADM-08 | Grade-1 assignment | LEVEL_1 | **PASS** | same |
| ADM-09 | Image/media | imageUrl+emoji | **PASS** | same |
| ADM-10 | Validation / duplicates | 409 + 400 | **PASS** | ADM-10 / 10b |
| Cleanup | Fixtures removed | leftover=0 | **PASS** | ADM-CLEANUP |

Script: `SUMMARY {"pass":14,"fail":0,"total":14}`

---

## Phase 3 — Android physical device (2026-11-19)

| Step | Result |
|------|--------|
| Device | Samsung SM-S921B, Android 17 (`RZCX42381TM`) |
| Installed build | Staging LAN APK **versionCode 27** (`com.littlereaders.app` 1.0.0); `-r` install; no clear |
| AAB / Play upload | **No** |
| Production mutate | **No** |
| AD executed | **32 PASS / 0 FAIL / 0 BLOCKED / 1 WAIVED (AD-30)** |

| IDs | Result | Notes |
|-----|--------|-------|
| AD-01…05, AD-08…12, AD-15…18, AD-20…22, AD-24…27, AD-29, AD-31 | **PASS** | Prior + staging evidence |
| AD-06 | **PASS** | Staging lockout UI `AD-06-a5.png`; distinct RATE_LIMITED strings in APK |
| AD-07 | **PASS** | Staging re-login / child home |
| AD-13 | **PASS** | `AD-13-spell-round.png` |
| AD-14 | **PASS** | Match + Quiz rounds |
| AD-19 | **PASS** | Mute / unmute Listen Play |
| AD-23 | **PASS** | Kill/relaunch still authenticated + progress |
| AD-28 | **PASS** | Authenticated Learn offline → No connection |
| AD-30 | **WAIVED** | No approved slow-network tool |
| AD-32 | **PASS** | Staging admin session revoke → forced login |
| AD-33 | **PASS** | Muted TTS Play; no crash |

Evidence: `exports/android-device-acceptance-2026-11-19/`. Completion report: `LEVEL1_ANDROID_BLOCKED_TEST_COMPLETION_REPORT.md`.

---

## Phase 4 — TTS disclosure

| Check | Result |
|-------|--------|
| Listen = device TTS | Confirmed in disclosure |
| Recorded audio not currently supplied | Confirmed |
| Pronunciation varies by device/voice | Confirmed |
| No mic recognition / pronunciation assessment claims | Confirmed |
| Client sign-off section prepared | Yes — **unsigned** |

Client approval is **not** claimed.

---

## Defects and severity

| ID | Severity | Status | Summary |
|----|----------|--------|---------|
| PAY-DEF-01 | **P2** | OPEN | Dual-payment suite: creating second child under shared entitlement returned HTTP 400 (expected 201). Does not overturn Level-1 Razorpay 10-gate PASS. |
| D-L1-001 | **P1** | OPEN / accept-risk pending client TTS sign-off | No `audioUrl` for Grade-1; TTS only |
| D-L1-002 | **P1** | **CLOSED (device)** | Android VC27 **32 PASS / 0 FAIL / 0 BLOCKED / 1 WAIVED (AD-30)** |
| D-L1-003 | **P2** | **CLOSED for staging scope** | Payment sandbox + admin staging now executed on local isolation |

**P0 defects found in this execution:** **0**

---

## Production untouched — confirmation

| Action | Done? |
|--------|------:|
| Production DB mutations | No |
| Production payment credentials / charges | No |
| Production subscription/customer edits | No |
| Production Grade-1 vocabulary/media edits | No |
| Production env var changes | No |
| Deploy / merge / push | No |
| Android AAB build/upload | No |
| Unapproved product code fixes | No (test script payload only under `server/scripts/`) |

---

## Remaining client approval requirements

1. **AD-30 disposition** — accept waiver **or** approve Clumsy/mitmproxy and re-run slow-network only.  
2. **Written TTS disclosure sign-off** (`LEVEL1_TTS_DISCLOSURE.md` §5).  
3. **Disposition of PAY-DEF-01** (fix / waive / defer).  

---

## Verdict

**Evidence-based readiness: CONDITIONAL GO (Android device suite closed with AD-30 waiver).**  
Payment sandbox and admin staging gates are evidenced **PASS** on isolated local staging.  
Android VC27 physical suite: **32 PASS / 0 FAIL / 0 BLOCKED / 1 WAIVED (AD-30)**.

**Final stop (2026-11-19):** Staging LAN APK installed under owner approval; 10 previously blocked AD cases executed on local staging (AD-30 waived). No production mutations, no Play upload, no app-data clear, no commit/push.
