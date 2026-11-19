# Level-1 / Grade-1 — Test Cases and Results

**Date (UTC):** 2026-11-18  
**Mode:** Read-only production acceptance  
**Legend:** PASS · FAIL · BLOCKED · NOT TESTED  

---

## A. Content

| ID | Test case | Result | Evidence |
|----|-----------|--------|----------|
| C-01 | Level-1 exists and is published | **PASS** | Prisma `LEVEL_1` `isPublished=true` |
| C-02 | Exactly 10 Grade-1 categories | **PASS** | Count = 10 |
| C-03 | Each category published | **PASS** | 10/10 `PUBLISHED` |
| C-04 | Exactly 750 active vocabulary rows | **PASS** | 750/750 active |
| C-05 | 75 words per category | **PASS** | All categories 75 |
| C-06 | No duplicate texts in Grade-1 set | **PASS** | 0 duplicates |
| C-07 | Every word has imageUrl | **PASS** | 750/750 |
| C-08 | Sampled images reachable (60) | **PASS** | 60/60 OK |
| C-09 | Every word has audioUrl | **FAIL** | 0/750 audioUrl |
| C-10 | Sampled audio reachable | **BLOCKED** | No audioUrl to probe |

---

## B. Learning

| ID | Test case | Result | Evidence |
|----|-----------|--------|----------|
| L-01 | Learn / Listen start | **PASS** | Owner live Grade-1 learning PASS; code path `LISTEN` |
| L-02 | Speak honesty (TTS vs recorded) | **PASS** | Documented: TTS via `speakWord`; not recorded audio |
| L-03 | Understand / quiz meaning | **PASS** | Owner learning PASS; Quiz activity exists |
| L-04 | Play games (match/quiz) | **PASS** | Owner learning PASS; Play section in UI |
| L-05 | Complete topic | **PASS** | Owner PASS; certificate/progress UI present |
| L-06 | Next topic unlock | **PASS** | Owner PASS; `unlockOrder` on categories |
| L-07 | Resume in-progress session | **PASS** | Owner PASS; `progress.resume` UI |
| L-08 | Progress persists | **PASS** | Owner PASS; progress API client wired |
| L-09 | Parent can view progress | **PASS** | Owner parent login PASS |

---

## C. Parent / subscription

| ID | Test case | Result | Evidence |
|----|-----------|--------|----------|
| P-01 | Parent login | **PASS** | Owner confirmation |
| P-02 | Child profile usable for Grade-1 | **PASS** | Owner Grade-1 learning PASS |
| P-03 | Level-1 plans present & active | **PASS** | `LEVEL_1_1M/3M/6M/12M` |
| P-04 | Live payment capture | **NOT TESTED** | Read-only; no purchase |
| P-05 | Activation after payment | **NOT TESTED** | No purchase |
| P-06 | Expiry removes Grade-1 access | **NOT TESTED** | No mutation |
| P-07 | Higher grades require own plan | **PASS** (config) | Distinct Level-2/3/4 plans |
| P-08 | Parent single-device session policy | **PASS** | Auth deploy live; sessions exist |

---

## D. Admin

| ID | Test case | Result | Evidence |
|----|-----------|--------|----------|
| A-01 | Admin login | **PASS** | Owner confirmation |
| A-02 | Admin console loads | **PASS** | `/admin` HTTP 200 |
| A-03 | List Grade-1 categories | **BLOCKED** | Interactive admin not run |
| A-04 | Edit vocabulary text/meaning | **BLOCKED** | Would risk prod content |
| A-05 | Manage image/audio | **BLOCKED** | Not exercised |
| A-06 | Publish/unpublish category | **BLOCKED** | Forbidden in read-only audit |
| A-07 | Grade-1 visible as published in data | **PASS** | DB audit |

---

## E. Android

| ID | Test case | Result | Evidence |
|----|-----------|--------|----------|
| M-01 | App identity / versionCode | **PASS** | `com.littlereaders.app` / 27 |
| M-02 | Installed APK/AAB login | **BLOCKED** | No device session this audit |
| M-03 | Parent dashboard on device | **BLOCKED** | Device |
| M-04 | Child Grade-1 topics | **BLOCKED** | Device |
| M-05 | Topic navigation | **BLOCKED** | Device |
| M-06 | TTS / audio playback | **BLOCKED** | Device |
| M-07 | Background / resume | **BLOCKED** | Device |
| M-08 | Offline / API error UX | **BLOCKED** | Device |

---

## F. Platform health

| ID | Test case | Result | Evidence |
|----|-----------|--------|----------|
| H-01 | API health | **PASS** | `status:ok` |
| H-02 | Web kids Level-1 page | **PASS** | HTTP 200 |
| H-03 | Web login/parent/admin/pricing | **PASS** | HTTP 200 |

---

## Summary counts

| Result | Count |
|--------|------:|
| PASS | 28 |
| FAIL | 1 (`C-09` audioUrl) |
| BLOCKED | 14 |
| NOT TESTED | 3 |

See also `LEVEL1_DEFECT_REGISTER.md` and `LEVEL1_CLIENT_HANDOVER_READINESS.md`.
