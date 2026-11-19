# Level-1 / Grade-1 — Defect Register

**Date (UTC):** 2026-11-18  
**Audit:** Read-only production acceptance  
**Status key:** OPEN · ACCEPTED RISK · BLOCKED VERIFICATION  

No production fixes applied in this audit.

---

## Defects

### D-L1-001 — No stored audio for Grade-1 vocabulary
| Field | Value |
|-------|--------|
| Severity | **P1** (product honesty / quality) |
| Status | **OPEN** / may be **ACCEPTED RISK** if TTS is the intended design |
| Area | Content / Speak-Listen |
| Finding | All **750** Grade-1 `VocabularyWord.audioUrl` values are `null`. Playback uses on-device TTS (`expo-speech` / `speakWord`). |
| Impact | Clients may expect recorded human audio; quality varies by device voice pack; no CDN audio fallback. |
| Evidence | Production Prisma aggregate: `withAudioUrl=0`, `missingAudio=750`; `speech.ts` uses `Speech.speak`, not `audioUrl`. |
| Suggested fix (not executed) | Either (a) publish TTS as official Listen behaviour in client docs/store listing, or (b) generate/upload audio assets and set `audioUrl` under a separate approved content release. |

---

### D-L1-002 — Android device acceptance not completed in this audit
| Field | Value |
|-------|--------|
| Severity | **P1** (release gate) |
| Status | **CLOSED (device suite)** — VC27 staging LAN APK on SM-S921B; **32 PASS / 0 FAIL / 0 BLOCKED / 1 WAIVED (AD-30)** (2026-11-19) |
| Area | Android |
| Finding | Owner-approved staging LAN APK (`LearnWise-1.0.0-vc27-staging-lan.apk`, SHA `FAF5190F…FFEAA`) installed with `-r` (no clear). Local staging API `:4100` + dedicated parent/child closed AD-06/07/13/14/19/23/28/32/33. **AD-30 WAIVED** — no Clumsy/mitmproxy/approved shaper. |
| Impact | Android Grade-1 physical acceptance complete except slow-network waiver + residual TTS client sign-off (D-L1-001). |
| Evidence | `LEVEL1_ANDROID_DEVICE_ACCEPTANCE.md`; `LEVEL1_ANDROID_BLOCKED_TEST_COMPLETION_REPORT.md`; `exports/android-device-acceptance-2026-11-19/` |
| Suggested fix (not executed) | Optional: approve Clumsy/mitmproxy and re-run AD-30 only. |

---

### D-L1-003 — Live payment / expiry / admin mutate paths not verified
| Field | Value |
|-------|--------|
| Severity | **P2** |
| Status | **CLOSED (staging scope)** — local sandbox/staging executed 2026-11-18; production still untouched |
| Area | Subscription / Admin |
| Finding | Originally blocked by read-only rules. Controlled local run completed: Razorpay stub + `rzp_test_`; admin throwaway `qa_handover_*`. |
| Impact | Residual risk reduced for Level-1 payment/admin gates; production live-key purchase still not exercised (by design). |
| Evidence | `LEVEL1_PAYMENT_ACCEPTANCE.md`, `LEVEL1_ADMIN_ACCEPTANCE.md`, `LEVEL1_FINAL_ACCEPTANCE_EXECUTION_REPORT.md` |
| Suggested fix (not executed) | Optional live Razorpay test parent on non-prod only if client requires UI checkout evidence beyond stubs. |

### PAY-DEF-01 — Dual-payment second child create returns 400
| Field | Value |
|-------|--------|
| Severity | **P2** |
| Status | **OPEN** |
| Area | Dual payment / seats |
| Finding | `tests/dual-payment.test.ts` entitlement/seats case failed: `POST /api/children` → 400 (expected 201) when seating a second child. |
| Impact | Level-1 Razorpay success/fail/cancel/idempotency/expiry session gates still PASS; full dual-seat claim blocked. |
| Evidence | Vitest FAIL 2026-11-18; AssertionError at dual-payment.test.ts ~501 |
| Suggested fix (not executed) | Investigate seat capacity / validation; requires separate approval. |

---

## Non-defects / cleared items

| Item | Notes |
|------|--------|
| Missing categories | Cleared — 10/10 present |
| Word count shortfall | Cleared — 750/750 |
| Duplicate words | Cleared — 0 |
| Broken image sample | Cleared — 60/60 OK |
| Level-1 unpublished | Cleared — published |
| Login auth outage | Cleared — owner admin/parent PASS post login-only deploy |

---

## Priority summary

| Priority | Count | Notes |
|----------|------:|-------|
| P0 | 0 | |
| P1 | 1 open | D-L1-001 TTS audio (D-L1-002 device suite closed; AD-30 waived) |
| P2 | 1 open + 1 waived note | PAY-DEF-01 open; AD-30 slow-network waived |

**No P0 content-integrity defects** found for Grade-1 vocabulary completeness or image availability.
