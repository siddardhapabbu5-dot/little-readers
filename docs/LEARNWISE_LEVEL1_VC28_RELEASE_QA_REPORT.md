# Learn Wise VC28 – Level 1 Only Release QA Report

**Date:** 2026-11-20  
**Scope:** Grade 1 / Level 1 **only** (Grades 2–4 not activated or modified)  
**Environment:** Local staging API `http://127.0.0.1:4100` / LAN `http://192.168.1.20:4100` · DB `localhost:5437`  
**Build under test:** `LearnWise-1.0.0-vc28-complete-staging-lan.apk`  
**Decision:** **NOT READY for production Level-1 release** (see §8)

---

## 0. Build under test

| Field | Value |
|-------|--------|
| Branch | `feature/student-id-login` |
| Commit | `a4377fcaa0bac165bb31bfb72306f2cdbe639ccb` (`a4377fc`) |
| versionName | `1.0.0` |
| versionCode | **28** |
| Package | `com.littlereaders.app` |
| APK | `exports/android-complete-staging-apk-2026-11-20/LearnWise-1.0.0-vc28-complete-staging-lan.apk` |
| APK size | 111,610,880 bytes (106.44 MB) |
| Signing cert SHA-256 | `6d283c941deb3a2823ea1c11d9dd5c2e7b8ba9e044dbaf0de00e878c32e2707a` |
| Staging API | `http://192.168.1.20:4100/api` (cleartext enabled in this staging APK) |

**Restrictions observed:** No production deploy, Play upload, commit/push, merge, production DB changes, or Grades 2–4 activation. Stash `stash@{0}` preserved.

---

## 1. Evidence locations

| Artifact | Path |
|----------|------|
| Automated API evidence | `exports/_vc28_level1_release_qa_evidence.json` |
| Evidence pack | `exports/vc28-level1-qa-evidence/` |
| Device UI screenshots | **Not captured** — no Android device/emulator attached |

---

## 2. Phase 1 – Authentication

| ID | Test case | Result | Evidence |
|----|-----------|--------|----------|
| A-01 | Parent email registration (OTP send) | **PASS** | Staging `POST /auth/email-otp/send` → 200 for unique email |
| A-02 | Parent email OTP verification (complete register) | **BLOCKED** | No inbox / delivered OTP available on staging automation |
| A-03 | Existing parent login | **PASS** | `parent@littlereaders.test` → 200, role `PARENT` |
| A-04 | Admin login | **PASS** | `admin@littlereaders.test` → 200, role `ADMIN` |
| A-05 | Admin-created Student ID + password | **PASS** | `POST /student/auth/admin/direct-children` → 201, temp password once, `mustChangePassword=true`, `UNPAID` |
| A-06 | Student login without email/phone | **PASS** | `POST /student/auth/login` with Student ID + password + `installationId`/`platform` → 200 tokens |
| A-07 | Incorrect password rejection | **PASS** | Parent login → 401; Student login → 401 `STUDENT_PASSWORD_INVALID` |
| A-08 | Session management | **PASS** | Student access token issued; first-login `mustChangePassword` gate observed |

---

## 3. Phase 2 – Level 1 content

| ID | Test case | Result | Evidence |
|----|-----------|--------|----------|
| C-01 | Grade 1 mapped to Level 1 | **PASS** | `/learning/levels`: `LEVEL_1` ↔ `GRADE_1` |
| C-02 | Approved Grade 1 categories accessible | **PASS** | API returns **10** published categories (Family…Action Words) |
| C-03 | Vocabulary available | **PASS** | Animals category: **75** active words via admin words API |
| C-04 | Images load correctly | **FAIL** | Sample `imageUrl` fetches return **HTTP 404** (`batch-d1` media missing on staging disk) |
| C-05 | Audio plays correctly | **BLOCKED** | Device TTS not exercised; product Listen uses **on-device TTS** (`speakWord` / expo-speech). Staging rows also have `audioUrl` like `/assets/audio/level1/…` — not device-verified |
| C-06 | Sentences / learning activities | **BLOCKED** | Activities catalog present (Listen, Spell, Match It, Quiz Time, Surprise); full activity UX needs device |
| C-07 | No unpublished content exposed | **PASS** | DB: 10 PUBLISHED + 2 DRAFT; API Level-1 list = 10 published only |

### Staging Level-1 category inventory (DB)

| unlockOrder | label | status | active words |
|------------:|-------|--------|-------------:|
| 0 | Family and People | PUBLISHED | 75 |
| 1 | Animals | PUBLISHED | 75 |
| 2 | Fruits and Vegetables | PUBLISHED | 75 |
| 3 | Colors and Shapes | PUBLISHED | 75 |
| 4 | Body Parts | PUBLISHED | 75 |
| 5 | School and Classroom | PUBLISHED | 75 |
| 6 | Household Objects | PUBLISHED | 75 |
| 7 | Food and Drinks | PUBLISHED | 75 |
| 8 | Nature and Environment | PUBLISHED | 75 |
| 9 | Action Words (Verbs) | PUBLISHED | 75 |
| 9 | Family and People | DRAFT | 0 |
| 9999 | QA Handover… | DRAFT | 0 |

**Totals (LEVEL_1):** 750 active words; 750 with `imageUrl` field set; staging media files for `pilot/batch-d1` **not present** under `server/storage` (only `batch-d2` with ~30 files).

---

## 4. Phase 3 – Learning journey

| ID | Test case | Result | Evidence |
|----|-----------|--------|----------|
| J-01 | Learn | **BLOCKED** | No physical device session |
| J-02 | Listen | **BLOCKED** | TTS path documented; not device-played |
| J-03 | Speak | **PASS** (honesty) | **Manual confirmation** (“I said it!”) in `topic/[id].tsx` — **not** automatic speech recognition |
| J-04 | Understand | **BLOCKED** | Device required |
| J-05 | Play | **BLOCKED** | Device required |
| J-06 | Complete | **BLOCKED** | Device required |
| J-07 | Progress tracking | **BLOCKED** | Device / entitled child session required |
| J-08 | Resume learning | **BLOCKED** | Device required |

**Speak disclosure:** Do **not** claim ASR. Listen uses device TTS (`docs/LEVEL1_TTS_DISCLOSURE.md`).

Activities catalog (API): LISTEN, SPELL, MATCH_IT, QUIZ_TIME, SURPRISE — all `enabled: true`.

---

## 5. Phase 4 – Subscription and access

| ID | Test case | Result | Evidence |
|----|-----------|--------|----------|
| S-01 | Level 1 subscription plans | **PASS** | `LEVEL_1_1M/3M/6M/12M` active+published (₹99/249/449/799 in paise) |
| S-02 | Grade 1 access (parent catalog) | **PASS** | Parent token → Level-1 categories 200 |
| S-03 | Expired subscription restrictions | **NOT TESTED** | No expiry mutation on staging |
| S-04 | Student account access (unpaid) | **PASS** | Unpaid direct-create student blocked from starting paid learning session (`SUBSCRIPTION_REQUIRED` / 402 family) |
| S-05 | Parent account access | **PASS** | Existing parent login + Grade-1 catalog |
| S-06 | No unauthorized Grade 2–4 **activation** | **PASS** | QA did not activate/deploy/modify G2–4 |

**Note:** Staging DB already has `LEVEL_2`–`LEVEL_4` published flags and content. Release **scope** remains Grade 1 only; this QA did not change those rows. Production cutover must still gate what learners can purchase/enter.

---

## 6. Phase 5 – Android device QA

| ID | Test case | Result | Evidence |
|----|-----------|--------|----------|
| D-01 | Verify APK signature | **PASS** | `apksigner verify`; cert SHA-256 matches VC27 lineage |
| D-02 | Installation safety (no overwrite without approval) | **PASS** | **No install attempted** — approval gate honored |
| D-03 | Install on physical Android device | **BLOCKED** | `adb devices` empty; no emulator |
| D-04 | Login / logout on device | **BLOCKED** | No device |
| D-05 | App restart | **BLOCKED** | No device |
| D-06 | Network interruption / recovery | **BLOCKED** | No device |
| D-07 | Crashes / blocking errors | **BLOCKED** | No device |

---

## 7. Defects and security findings

### Defects

| ID | Severity | Summary |
|----|----------|---------|
| DEF-VC28-01 | **High** | Grade-1 vocabulary `imageUrl` points at `/media/vocab/pilot/batch-d1/…` but staging storage lacks `batch-d1` → **404** for sampled images (cat/dog/bird/fish/cow). Blocks Level-1 visual learning on this staging stack. |
| DEF-VC28-02 | Medium | Parent OTP **complete** registration not end-to-end verified (mail delivery / inbox). Send path works. |
| DEF-VC28-03 | Medium | Full Learn→Complete journey and progress/resume **not device-validated** on VC28 APK. |
| DEF-VC28-04 | Low | Level-1 category API descriptions still say “No words yet…” while `wordCount` is 75 (stale copy). |

### Security / auth findings (staging)

| ID | Finding | Status |
|----|---------|--------|
| SEC-01 | Incorrect passwords rejected (parent + student) | PASS |
| SEC-02 | Student login requires device `installationId` + `platform` | Observed (expected client contract) |
| SEC-03 | Unpaid admin-direct students cannot start paid learning | PASS |
| SEC-04 | System Sponsor Parent remains internal (prior Admin Direct suite) | Referenced; not re-broken in this run |
| SEC-05 | Staging APK cleartext to LAN HTTP | Intentional for staging only — **must not** ship to production |

No production credentials used. No production DB writes.

---

## 8. Level 1 readiness decision

### **NOT READY for production Level-1 release**

Blockers before approval:

1. **Restore Grade-1 image media** on the target environment (`batch-d1` or rewritten URLs) and re-verify image HTTP 200.  
2. **Physical Android device QA** on VC28 APK (install only with explicit approval if overwriting): login/logout, restart, network recovery, Learn/Listen/Speak(manual)/Understand/Play/Complete, progress/resume.  
3. Complete or waive **parent OTP verify** with documented mail path.  
4. Decide production posture for **Grades 2–4** already present in data (hide / unpublish / entitlement-gate) without activating them in this Level-1 release.  
5. Re-test **expired subscription** behavior in a controlled staging mutation (or accept as deferred with owner sign-off).

### What already looks good on staging API

- Parent / Admin login  
- Admin Direct Student create + Student ID login + bad-password rejection + session token  
- Grade 1 ↔ Level 1 mapping; 10 published categories; 750 vocabulary rows  
- Unpublished drafts not listed on Level-1 categories API  
- Unpaid student learning blocked  
- Level-1 subscription plan SKUs present  
- VC28 APK identity + signing verified (install not performed)

---

## 9. Result counts (this run)

| Result | Count |
|--------|------:|
| PASS | 22 (automated API/APK cases in evidence JSON) + mapped table PASSes above |
| FAIL | **1** automated (`images_load_sample`) — **DEF-VC28-01** |
| BLOCKED | Device journey, OTP verify complete, TTS playback, install |
| NOT TESTED | Expired subscription |

---

## 10. Screenshots

Device UI screenshots: **none** (no device).  

Supporting non-UI evidence (CSV/logs/JSON): `exports/vc28-level1-qa-evidence/`  
(`01` categories · `02` word samples · `03` image 404 log · `04`–`05` APK · `06` empty adb · `07` full JSON).

---

## 11. Stop / approval gate

QA report prepared. **Stopped** per instructions.

Awaiting approval before: production release, Play upload, device install/overwrite, or any Grades 2–4 activation.
