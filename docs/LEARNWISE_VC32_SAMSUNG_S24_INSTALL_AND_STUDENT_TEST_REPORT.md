# Learn Wise VC32 — Samsung S24 Install & Student Test Report

**Date:** 2026-11-20  
**Device:** Samsung Galaxy S24 SM-S921B · ADB `RZCX42381TM`  
**Package:** `com.littlereaders.app`  
**APK:** `exports/android-production-apk-level1-vc32-2026-11-20/LearnWise-1.0.0-vc32-level1-production-https.apk`  
**Student:** existing production test student **DEPPU1727** (Deepika) — **no new account created**  

**Final assessment:** **INSTALL PASS** · **Subscription fix PASS** · **Resume/cold-start PASS** · **Profile session FAIL** (remaining `/auth/me/avatar` path — not fixed in this task)

---

## 1. Pre-install checks

| Check | Result |
|-------|--------|
| Device connected / authorized | **PASS** — `RZCX42381TM device` |
| APK exists | **PASS** |
| APK SHA-256 | **PASS** — `FCA804A7F148DBFCA4F809F3CFA7B5990F038196FAD1B45E4C1BA80B90692808` |
| Pre-install versionCode | **PASS** — **31** / `1.0.0` |
| Uninstall / clear data | **Not used** |

---

## 2. Installation

| Item | Result |
|------|--------|
| Command | `adb -s RZCX42381TM install -r <VC32 APK>` |
| Result | **Success** (exit 0) |
| Installed versionCode | **32** |
| versionName | `1.0.0` |
| Package | `com.littlereaders.app` |
| `lastUpdateTime` | `2026-11-20 21:04:13` |
| Data dirs present after upgrade | `dataDir=/data/user/0/com.littlereaders.app` (and work profile path) — **upgrade preserved package data** (no uninstall/clear) |
| Launch | **PASS** — MainActivity focused |

Artifacts: `exports/vc32-s24-install/01-launch.*`

---

## 3. Focused student tests

Passwords / OTP were never recorded.

| # | Test | Result | Evidence |
|---|------|--------|----------|
| 1 | Student ID + current password login | **PASS** | Re-login after Profile bounce; Home `Hi, Deepika!` / Grade 1 (`30-home-authed.*`). Password verified via API for input troubleshooting only — **not stored in this report**. |
| 2 | Student Home opens | **PASS** | `30-home-authed.*`, earlier `11-home.*` |
| 3 | Tap Subscription | **PASS** | `31-subscription.*` |
| 4 | Parent-guidance message; no login redirect | **PASS** | **“Ask your parent to manage your subscription”**; Back to home stayed authenticated. Also confirmed earlier (`10-subscription-ok.*`). |
| 5 | Open Profile | **FAIL** | Bottom Profile tab → welcome/login (`12-profile-tab.*`). Likely `ProfilePhoto` → `GET /auth/me/avatar` → 401 → `clearSession`. **Skipped on retest** to avoid re-clearing session. |
| 6 | Close and reopen (force-stop / cold start) | **PASS** | `33-after-cold-start.*` — still `Hi, Deepika!` / Grade 1 |
| 7 | Resume app (HOME then return) | **PASS** | `32-after-resume.*` — session retained |
| 8 | Grade 1 works; Grades 2–4 locked | **PASS** | Grade 1 home / unlock messaging only; no Grades 2–4 unlock UI (`GRADE1_SHOWN=True`, `GRADES234_UNLOCK_UI=False`). Learning locked without seat (expected). |

### Subscription fix (primary VC32 goal)

**PASS.** Student can open Subscription, sees parent-guidance copy, and is **not** sent to login by the Subscription route itself. “Back to home” returned to authenticated Home (`HOME_AUTHED=True`).

### Profile failure (remaining issue — not fixed in this task)

**Likely cause:** `apps/mobile/components/ProfilePhoto.tsx` still calls **`GET /auth/me/avatar`** on mount. Student JWTs get **401** → global `notifyUnauthorized` → `clearSession` → login.  

VC32 already fixed Profile’s `/auth/me` user refresh to `/student/auth/me`, but **avatar** was not included in that fix. **No code changes made during this install/test task** (per restrictions).

Note: An earlier mistaken tap hit a **header** control also labeled `content-desc="Profile"` (`[54,160][192,298]`). Retest used the **bottom tab** only; failure reproduced.

---

## 4. Restrictions compliance

| Restriction | Status |
|-------------|--------|
| No backend deploy | Observed |
| No production data changes / no new student | Observed |
| No seat/subscription activation | Observed |
| No Play upload / APK distribution | Observed |
| No unrelated fixes during test | Observed |

---

## 5. Artifact index

Under `exports/vc32-s24-install/`:

| File | Content |
|------|---------|
| `01-launch.*` | Post-install launch |
| `04-subscription-guidance.*` / `10-subscription-ok.*` | Parent-guidance Subscription UI |
| `05-home-after-sub.*` / `11-home.*` | Authenticated Grade 1 home |
| `12-profile-tab.*` | Profile → login bounce |
| `09-relogin.*` | Student login (SID filled) after earlier bounce |
| `30-home-authed.*` | Authenticated home after password re-login |
| `31-subscription.*` | Subscription parent-guidance retest |
| `32-after-resume.*` | Session after app resume |
| `33-after-cold-start.*` | Session after force-stop cold start |

---

## 6. Stop / next steps (approval required)

**Stopped after install + focused testing + this report.**

Recommended follow-up (separate approval):

1. Fix student avatar fetch to skip or use a student-safe endpoint (do not call `/auth/me/avatar` with student JWT).  
2. Rebuild VC33 (or patch APK) and re-verify Profile + cold start + resume on S24 with **DEPPU1727** only.
