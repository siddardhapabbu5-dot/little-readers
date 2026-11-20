# Learn Wise — Level 1 Final Production Readiness Audit

**Date:** 2026-11-20  
**Mode:** **READ ONLY** — no production changes, no DB writes, no deploy, no publish, no Grades 2–4 activation, no commit/push  
**Release scope:** Grade 1 / Level 1 only · 10 categories · 750 words · existing Student / Parent / Admin login  
**HOLD:** Grades 2, 3, 4 — no activation or production access expansion  

**Verdict:** **NOT READY to go live yet** — content/API foundation is largely sound; release blockers remain (production Android binary, Grades 2–4 access gate confirmation, TTS sign-off, VC28 device proof against production).

---

## 1. Release scope reminder

| In scope | Out of scope / HOLD |
|----------|---------------------|
| Grade 1 ↔ Level 1 | Grade 2 / Level 2 |
| 10 published categories | Grade 3 / Level 3 |
| 750 vocabulary words | Grade 4 / Level 4 |
| Parent + Admin login (existing) | New production content publish |
| Student ID login **if already live** | Admin Direct Student Creation (local/staging only — **not** on production API) |

---

## 2. Verified items (this audit + cited prior evidence)

### 2.1 Production environment & API

| Item | Result | Evidence |
|------|--------|----------|
| Production API health | **PASS** | `GET https://api.siwiapp.shop/api/health` → `status:ok`, service `little-readers-api` |
| Production API root | **PASS** | `GET https://api.siwiapp.shop/` → 200 |
| Web shell | **PASS** | `GET https://siwiapp.shop/` → 200 |
| HTTPS | **PASS** | TLS OK; certificate subject `CN=siwiapp.shop` |
| Learning API auth gate | **PASS** | `GET /api/learning/levels` → **401** (not anonymously open) |
| Plans endpoint | Auth required | `GET /api/subscriptions/plans` → **401** (expected without token) |

### 2.2 Android cleartext / API configuration (build config)

| Item | Result | Evidence |
|------|--------|----------|
| Production / preview / staging EAS profiles | **PASS** (config) | `eas.json` → `EXPO_PUBLIC_API_URL=https://api.siwiapp.shop/api`; **no** `LR_ALLOW_CLEARTEXT` |
| smoke-local EAS only | Cleartext allowed | `LR_ALLOW_CLEARTEXT=1` + LAN HTTP — **not** for production |
| Default JS fallback API | **PASS** | `apps/mobile/services/api.ts` fallback `https://api.siwiapp.shop/api` |
| **Current local AndroidManifest** | **FAIL for prod ship** | `usesCleartextTraffic="true"` (left from staging VC28 LAN APK work) |
| **VC28 APK already built** | **Not production** | Staging LAN `http://192.168.1.20:4100/api` + cleartext — must not ship |

### 2.3 Production Grade 1 images

| Item | Result | Evidence |
|------|--------|----------|
| Prior prod DB audit (2026-11-18) | **PASS** (cited) | `LEVEL1_PRODUCTION_ACCEPTANCE_AUDIT.md`: 750/750 `imageUrl`; 10×75; categories published |
| This audit — sample reachability | **PASS** | **64/64** HTTP 200 JPEG from `https://api.siwiapp.shop/media/vocab/pilot/batch-d1/…` (`exports/_prod_g1_image_sample_probe.json`) |
| Spot samples (cat/dog/bird/fish/cow) | **PASS** | All 200 with expected byte sizes |
| Full 750/750 live probe this session | **Not re-run** | Prior audit + 64-sample OK; full re-enumeration optional before cutover |

### 2.4 Production Grade 1 audio

| Item | Result | Evidence |
|------|--------|----------|
| Stored `audioUrl` library | **Not available as product Listen path** | Prior prod audit: **0/750** `audioUrl`; this audit: `https://api.siwiapp.shop/assets/audio/level1/cat.mp3` → **404** |
| Actual Listen behavior | **On-device TTS** | `docs/LEVEL1_TTS_DISCLOSURE.md`; `speakWord` / expo-speech |
| TTS client sign-off | **PENDING** | Disclosure status: **BLOCKED — awaiting client sign-off** |

### 2.5 Subscription & entitlement (config / prior tests)

| Item | Result | Evidence |
|------|--------|----------|
| Level-1 plans exist (prior prod read) | **PASS** (cited) | `LEVEL_1_1M/3M/6M/12M` in production acceptance audit |
| Payment + activation | Prior staging/sandbox PASS | `LEVEL1_FINAL_ACCEPTANCE_EXECUTION_REPORT.md` PAY-01…10 |
| Expiry removes access | Prior staging PASS | Same report PAY-07/08 — **not re-proven on production live** |
| Unpaid blocked (staging VC28) | PASS (staging) | VC28 / Admin Direct evidence — **staging only** |

### 2.6 Authentication (inspect only — no changes)

| Item | Result | Evidence |
|------|--------|----------|
| Parent / Admin login (existing product) | **PASS** (prior owner + VC27 device) | Production acceptance + Android device acceptance |
| Student ID login route on production | **Present** | `POST /api/student/auth/login` → **400 VALIDATION_FAILED** (route exists; not 404) |
| Admin Direct create on production | **Absent** | `POST /api/student/auth/admin/direct-children` → **404** |
| Local uncommitted Student Auth / Admin Direct | Present in worktree | See §4 — **not deployed** as Admin Direct |

Speak honesty: Grade 1 Speak uses **manual “I said it!”** confirmation; Listen uses **TTS** — not ASR / not recorded MP3 library.

### 2.7 Grades 2–4 HOLD posture

| Item | Result | Notes |
|------|--------|-------|
| This audit activated G2–4 | **No** | Rule honored |
| Production already contains L2–L4 catalog data | **Yes** (prior/staging pattern) | HOLD means **do not expand access / market / entitle** Grades 2–4 in this release |
| Learner lock without higher-grade plan | **Needs explicit cutover confirmation** | Prior AD-10 style evidence exists; confirm production entitlement still blocks G2–4 without purchase |

---

## 3. VC27 acceptance vs VC28 local changes

### 3.1 What VC27 already proved (do not re-run)

| Area | VC27 / prior result |
|------|---------------------|
| Physical Android Level-1 journey | **32 PASS / 0 FAIL / 1 WAIVED** on SM-S921B (`LEVEL1_ANDROID_DEVICE_ACCEPTANCE.md`) |
| VC27 install against **production API** binary | Device installation report: prod API string in installed APK |
| Payment sandbox + admin staging | Mapped gates PASS |
| Production content 10×75 + images sample | Production acceptance audit PASS |

### 3.2 What VC28 added / changed locally (not all on production)

| Area | VC28 status |
|------|-------------|
| versionCode **28** | Local `app.json` / gradle bumped |
| Staging complete APK | Built for **LAN staging only** (cleartext) |
| Staging image restore | Local `batch-d1` + `/media/vocab` mount — **staging worktree** |
| Student Auth UI + Admin Direct | Uncommitted / untracked; Admin Direct **404 on production** |
| VC28 Level-1 release QA | Staging API heavy; **device QA BLOCKED**; images later restored on staging |

**Delta risk:** Shipping VC28 without a **new production HTTPS APK** + device smoke would either ship the wrong (LAN) binary or assume VC27 acceptance covers uncommitted Student Auth / Admin Direct — it does not for Admin Direct.

---

## 4. Uncommitted local changes relevant to VC28

**Branch:** `feature/student-id-login` @ `a4377fc`  
**Stash preserved:** `stash@{0}`  

### Modified (tracked)

| Path | Relevance |
|------|-----------|
| `apps/mobile/app.json` | versionCode 28 |
| `apps/mobile/app/login.tsx` | Login UX / auth options |
| `apps/mobile/app/admin.tsx` | Admin entry to create-student |
| `apps/mobile/services/api.ts`, `auth-errors*.ts` | API / error handling |
| `server/src/app.ts` | `/media/vocab` static mount (staging serve) |
| `server/prisma/schema.prisma` + services/routes/jwt/learning/subscriptions | Student auth / entitlement wiring |
| `server/src/auth/auth.service.ts`, `children.service.ts`, `env.ts` | Auth/child side effects |

### Untracked (high relevance)

| Path | Relevance |
|------|-----------|
| `apps/mobile/app/student-login.tsx` | Student ID login UI |
| `apps/mobile/app/student-change-password.tsx` | Forced password change |
| `apps/mobile/app/admin-create-student.tsx` | Admin Direct create UI |
| `server/src/student-auth/**` | Student auth + Admin Direct server |
| `server/src/middleware/student-auth.ts`, `dual-auth.ts` | Dual auth |
| `server/prisma/migrations/20261119*` | Credential / OTP migrations |
| `server/storage/vocab-media/pilot/batch-d1/` | Restored staging media (750 files) |
| VC28 docs/exports evidence | QA / restore reports |

**AndroidManifest cleartext=true** is a local staging artifact and is a **ship blocker** until reset for any production build.

---

## 5. Outstanding production release blockers

Only **unresolved** items that still block a safe Level-1 production release:

| ID | Blocker | Recommended next action |
|----|---------|-------------------------|
| **B1** | No **production** VC28 (or approved) Android binary | Build APK/AAB with `EXPO_PUBLIC_API_URL=https://api.siwiapp.shop/api`, **cleartext false**, versionCode ≥28, same signing lineage; do **not** use LAN staging APK |
| **B2** | Local `AndroidManifest` still `usesCleartextTraffic=true` | Reset to `false` before any production assemble; confirm with `aapt`/`apksigner` on the new binary |
| **B3** | VC28 not device-validated against **production** API | After B1: approved install on physical device; smoke Parent/Admin/(Student if in scope) login + Grade-1 Learn/Listen(TTS)/progress |
| **B4** | Grades 2–4 **HOLD** not operationally confirmed on production | Read-only entitlement check: learner with Level-1 only cannot start Level-2/3/4 learning; document gate; do **not** publish/activate G2–4 |
| **B5** | TTS / Listen disclosure client sign-off pending | Obtain client sign-off on `LEVEL1_TTS_DISCLOSURE.md` before store/marketing claims |
| **B6** | Admin Direct Student Creation not on production | Either **exclude** from this Level-1 launch (recommended) or separately approve migrate+deploy of student-auth Admin Direct — **out of band** |
| **B7** | Uncommitted release surface | Decide commit/review set for whatever **is** shipping; do not deploy unreviewed local tree blindly |

### Non-blockers / accepted product facts (for this Level-1 release)

| Item | Status |
|------|--------|
| Grade-1 image URLs on production (sampled) | OK — prior full DB presence + 64/64 live sample |
| HTTPS production API | OK |
| Recorded audioUrl library | Not required if TTS disclosure signed off |
| VC27 Level-1 device journey | Already passed — do not repeat full AD matrix unless binary/API surface changes |
| Admin Direct | Not required for first Level-1 release if excluded from scope |

---

## 6. Evidence index

| Artifact | Path / URL |
|----------|------------|
| This audit | `docs/LEARNWISE_LEVEL1_FINAL_PRODUCTION_READINESS.md` |
| Prod image sample (64/64) | `exports/_prod_g1_image_sample_probe.json` |
| Prior prod content audit | `docs/LEVEL1_PRODUCTION_ACCEPTANCE_AUDIT.md` |
| VC27 Android acceptance | `docs/LEVEL1_ANDROID_DEVICE_ACCEPTANCE.md` |
| VC27 install (prod API APK) | `docs/LEVEL1_VC27_DEVICE_INSTALLATION_REPORT.md` |
| VC28 staging QA | `docs/LEARNWISE_LEVEL1_VC28_RELEASE_QA_REPORT.md` |
| Staging image restore | `docs/LEARNWISE_LEVEL1_IMAGE_RESTORATION_REPORT.md` |
| TTS disclosure | `docs/LEVEL1_TTS_DISCLOSURE.md` |
| Production health | `https://api.siwiapp.shop/api/health` |
| Student login route probe | HTTP 400 validation (exists) |
| Admin Direct probe | HTTP 404 (absent on production) |

---

## 7. Recommended sequence (after approval only)

1. Confirm Level-1 launch **excludes** Admin Direct (or approve separate deploy).  
2. Reset cleartext; build **production HTTPS** APK/AAB (VC28+).  
3. Confirm G2–4 entitlement HOLD on production (read-only test).  
4. Client TTS sign-off.  
5. Device smoke on production binary.  
6. Only then approve production release / Play path.

---

## 8. Stop

Audit complete. **No production modifications performed.**  

**Awaiting approval** before any production build, deploy, migration, or Grades 2–4 work.
