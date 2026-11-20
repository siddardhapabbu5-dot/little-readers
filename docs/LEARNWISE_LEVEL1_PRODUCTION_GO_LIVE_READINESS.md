# Learn Wise — Level 1 Production Go-Live Readiness

**Date:** 2026-11-20  
**Candidate binary:** `exports/android-production-apk-level1-vc29-2026-11-20/LearnWise-1.0.0-vc29-level1-production-https.apk`  
**Package / version:** `com.littlereaders.app` · `1.0.0` · **versionCode 29**  
**Configured API:** `https://api.siwiapp.shop/api`  
**Primary QA source:** `docs/LEARNWISE_LEVEL1_VC29_PHYSICAL_ANDROID_QA_REPORT.md`  
**Supporting sources:** Production APK prep report · Final production readiness audit · Prior VC27 device acceptance (cited only where explicitly reusable)  

**This document does not declare the app live.** No Play upload, distribution, backend deploy, DB change, or Grades 2–4 activation was performed for this review.

---

## Final recommendation: **NOT READY**

VC29 is a correctly configured **production HTTPS** internal APK and has been **installed and launched** on a physical device.  
It is **not** ready for controlled internal production release until **on-device** Admin / Parent / Student login and Grade 1 learning / access-control / stability are evidenced on **this** APK.

Do **not** treat VC27 journey PASSes as VC29 PASSes.

---

## 1. Verified PASS items

### A. Release configuration (APK — re-verified this review)

| Item | Evidence |
|------|----------|
| Package ID `com.littlereaders.app` | `aapt dump badging` |
| versionName `1.0.0` / versionCode **29** | `aapt` + device `dumpsys` |
| Signing valid | `apksigner verify` |
| Signing cert SHA-256 | `6d283c941deb3a2823ea1c11d9dd5c2e7b8ba9e044dbaf0de00e878c32e2707a` (VC27 lineage) |
| `usesCleartextTraffic=false` | Manifest binary `0x0` |
| Production API in bundle | `https://api.siwiapp.shop/api` present; **LAN / 192.168.1.20 = 0** |
| Admin Direct excluded from APK | `admin-create-student` = 0 · `direct-children` = 0 |
| Student login path present in bundle | `student/auth/login` = 1 |
| No `rzp_live_` / private-key material in bundle | Prep report scan |
| `EXPO_PUBLIC_ENABLE_DEMO=0` at build | Prep report |

### B. Physical install / launch (VC29 QA report)

| Item | Evidence |
|------|----------|
| Owner removed conflicting VC36 install | Phase 1 resolved |
| VC29 install Success on SM-S921B | `adb install` EXIT=0; versionCode 29 on device |
| App opens without immediate crash | `MainActivity` focused |
| Login UI shows Student / Parent / Admin | Screenshot + UI dump (`exports/vc29-physical-qa/05-launch.png`) |
| No OTP forced on login chrome | UI dump |

### C. Production API / content (read-only / prior audits — not VC29 UI)

| Item | Evidence |
|------|----------|
| Production API health HTTPS | `GET /api/health` ok (prior + ongoing probes) |
| Admin auth works on production API | Workstation `POST /auth/login` demo Admin → **200** (VC29 QA); **not** on-device UI login |
| Wrong password rejected (API) | HTTP 401 |
| Admin Direct API absent on production | `direct-children` → **404** |
| Grade 1 images reachable (sampled) | Prior 64/64 + content audit 750 URLs present |
| Level-1 plans exist (prior prod read) | Production acceptance audit |

---

## 2. Failed items

| Item | Result | Evidence |
|------|--------|----------|
| Parent demo account on production (`parent@littlereaders.test`) | **FAIL / unavailable** | HTTP **401** during VC29 QA — cannot use staging demo parent for prod Parent/Student journey |
| Recorded Grade 1 `audioUrl` library as product Listen path | **FAIL as recorded-audio claim** | Prior prod audit 0/750 `audioUrl`; sample MP3 404 — Listen is **TTS** (disclosure still unsigned) |

---

## 3. Blocked items

| Item | Why blocked |
|------|-------------|
| **On-device Admin login** | VC29 QA: RN `TextInput` not fillable via `adb`; owner login not completed |
| **On-device Parent login** | Same + no usable prod Parent demo credentials in agent possession |
| **On-device Student ID login** | Same + no prod Student test ID provided |
| **Admin dashboard on VC29** | Depends on on-device Admin login |
| Continuing Phases 3–6 UI automation | Explicitly paused pending owner login |

---

## 4. Not-tested items (on VC29 APK — no PASS claimed)

| Area | Status |
|------|--------|
| Admin dashboard after VC29 login | **NOT TESTED** |
| Parent Email + Password on-device against production | **NOT TESTED** |
| Student ID + Password on-device against production | **NOT TESTED** |
| Grade 1 access with entitled child on VC29 | **NOT TESTED** |
| Learning journey Learn → Speak → Understand → Play → Complete on VC29 | **NOT TESTED** |
| Images/audio (TTS) during in-app learning on VC29 | **NOT TESTED** (images OK at CDN; in-app not proven) |
| Progress save / resume on VC29 | **NOT TESTED** |
| Subscription / unpaid restrictions on VC29 | **NOT TESTED** |
| Grades 2–4 HOLD enforcement on VC29 session | **NOT TESTED** |
| App restart / logout / network recovery / crash soak on VC29 | **NOT TESTED** |
| End-to-end in-app HTTPS traffic capture from device | **NOT TESTED** (bundle config PASS; runtime path not logged from successful login) |

**Explicit non-transfer:** VC27 device acceptance (32 PASS on SM-S921B) applies to an **earlier binary**, not to VC29 evidence.

---

## 5. Security and access-control findings

| Finding | Assessment |
|---------|------------|
| Cleartext disabled on VC29 | Good for production HTTPS |
| No staging LAN URL in VC29 bundle | Good |
| Admin Direct UI stripped from VC29; API 404 on prod | Aligns with “exclude Admin Direct” |
| Learning API not anonymously open | `/learning/levels` → 401 without auth (prior) |
| Production still hosts L2–L4 catalog data | HOLD is a **policy/entitlement** gate — **unverified on VC29** |
| TTS / Listen honesty | Must not claim recorded audio; client sign-off still **pending** (`LEVEL1_TTS_DISCLOSURE.md`) |
| Demo Admin works on production API | Acceptable for internal QA only; protect credentials; do not embed in APK (not found) |

---

## 6. Remaining launch risks

1. **Unknown on-device auth behavior** for VC29 against production (could fail soft-keyboard, session, deep links, etc.).  
2. **No entitled Parent/Student session** proven on VC29 → learning and paywall/HOLD unverified.  
3. **Grades 2–4** may still be reachable if entitlement gates regress — not checked on this build.  
4. **TTS disclosure** unsigned → marketing/support risk.  
5. Prior **VC36** on device used a **different signing cert** — any future sideloads must stay on the approved `6d283c94…` lineage to avoid install conflicts.  
6. Declaring “internal go-live” without Phases 3–6 evidence risks shipping an unvalidated client.

---

## 7. Release configuration checklist (Step 2)

| Check | Result |
|-------|--------|
| Production HTTPS API configured | **PASS** |
| Cleartext disabled | **PASS** |
| Package ID unchanged | **PASS** |
| Version code 29 | **PASS** |
| Signature valid + approved lineage | **PASS** |
| No staging API in APK | **PASS** |
| Admin Direct excluded | **PASS** |
| No debug-only surface found in bundle scan | **PASS** (no Admin Direct; demo flag off) |

---

## 8. Final recommendation

| Decision | **NOT READY** |
|----------|----------------|
| Meaning | Do **not** treat VC29 as cleared for controlled internal production release / distribution beyond the single install already done for QA. |
| Minimum to reach READY (internal) | (1) Owner completes on-device Admin + Parent + Student logins with evidence; (2) Grade 1 learning journey + progress on VC29; (3) Confirm G2–4 inaccessible / unpaid blocked; (4) Basic stability (restart/logout); (5) TTS disclosure sign-off or explicit waiver. |

---

## 9. Stop

Readiness report complete.  

**Awaiting your explicit approval** before any further install guidance, APK distribution, go-live declaration, Play upload, or production changes.
