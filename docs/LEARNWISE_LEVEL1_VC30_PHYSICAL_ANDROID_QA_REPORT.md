# Learn Wise VC30 — Physical Android Installation & QA Report

**Date:** 2026-11-20  
**Device:** Samsung Galaxy S24 · **SM-S921B** · serial `RZCX42381TM`  
**APK:** `exports/android-production-apk-level1-vc30-2026-11-20/LearnWise-1.0.0-vc30-level1-production-https.apk`  
**Package / version:** `com.littlereaders.app` · `1.0.0` · **versionCode 30**  
**API:** `https://api.siwiapp.shop/api`  
**Related:** `docs/LEARNWISE_LEVEL1_VC30_PRODUCTION_APK_PREPARATION_REPORT.md`  

## Final assessment (current): **INSTALL + LAUNCH PASS · Admin feature UI PARTIAL · create/list BLOCKED on Admin session**

Install was a **signing-compatible upgrade** over VC29 with **data preserved** (no uninstall, no clear).  
Student / Parent / Admin login tabs **visible**.  
**Create Student (Grade 1)** screen is present in the binary and reachable; without an Admin session it correctly shows the Admin-only gate.  
**Parent list load** and further create QA **not run** — no approved credentials used / none invented this session. **No student created.**

---

## Step 1 — Safety checks

| Check | Result | Evidence |
|-------|--------|----------|
| `adb devices` | **PASS** | `RZCX42381TM` device · model SM-S921B |
| VC30 APK exists | **PASS** | Path above |
| SHA-256 | **PASS** | `A34AAB7F285E5731DFDC0B515351B7794EEBF1AA7F1A908BC7F051C07C42F38E` (exact match) |
| APK signature | **PASS** | apksigner cert SHA-256 `6d283c94…e2707a` |
| Installed before | VC29 | versionCode **29**, same cert `6D:28:3C:94…E2:70:7A` |
| Signing compatibility | **PASS** | Installed cert = VC30 cert → upgrade safe |
| Uninstall / clear data | **Not done** | Preserved per instructions |
| VC29 artifact file | **Preserved** | SHA-256 `1F0322AE…44283` unchanged |

**Decision:** Safe to install as update (`adb install -r`). No approval stop required.

---

## Step 2 — Install & launch

| Test | Result | Evidence |
|------|--------|----------|
| Install VC30 over VC29 | **PASS** | `adb install -r` → **Success** · EXIT=0 |
| Post-install version | **PASS** | versionCode **30** · versionName 1.0.0 |
| Signing after install | **PASS** | Same cert lineage |
| Data preservation | **PASS** (best-effort) | Upgrade `-r` only; `firstInstallTime` remains earlier (`17:29:16`); `lastUpdateTime` = install time (`18:41:53`) |
| Launch / no crash | **PASS** | `MainActivity` resumed |
| Student / Parent / Admin tabs | **PASS** | UI dump `exports/vc30-physical-qa/01-launch-ui.xml` + screenshot `01-launch.png` |

Login chrome also showed email/password fields, Log In, Forgot password, Create New Account.

---

## Step 3 — New feature check

| Test | Result | Evidence |
|------|--------|----------|
| Create Student (Grade 1) screen in APK | **PASS** | Deep link `littlereaders://admin-create-student-grade1` |
| Screen title / Admin gate | **PASS** | UI: “Create Student (Grade 1)” · “Only Admin / Super Admin…” · “Go to Admin login” (`02-deeplink-ui.xml`, `03-create-student-gate*.png`) |
| Open Admin Dashboard (authenticated) | **BLOCKED** | No Admin session; credentials not invented |
| Dashboard → Create Student navigation (authenticated) | **BLOCKED** | Depends on Admin login |
| Parent list loads | **BLOCKED** | Requires Admin JWT inside the screen after auth |
| Create production student | **Not performed** | Per restrictions |

**Interpretation:** Binary includes the new Grade 1 create flow and enforces Admin-only access. End-to-end parent-list verification needs an operator Admin login (manual on-device), then re-check.

---

## Evidence files

| File | Notes |
|------|--------|
| `exports/vc30-physical-qa/01-launch.png` | Login with Student / Parent / Admin |
| `exports/vc30-physical-qa/01-launch-ui.xml` | UI dump |
| `exports/vc30-physical-qa/02-deeplink-ui.xml` | Create Student gate |
| `exports/vc30-physical-qa/03-create-student-gate.png` | Gate screenshot |
| `exports/vc30-physical-qa/03-create-student-gate-ui.xml` | Gate UI dump |

---

## Remaining blockers

1. **On-device Admin login** (operator) to open Admin Dashboard and Create Student with a live session.  
2. After login: confirm parent list loads; still **do not create** a student until separately approved.  
3. Designated test Parent still required before any create QA.

---

## Restrictions honored

- No uninstall · no clear data  
- No backend deploy · no DB changes  
- No student account creation  
- No invented credentials  
- No Grades 2–4 activation  
- No commit/push · no five-family distribution  
- VC29 APK file preserved  

---

## Stop

Installation and launch complete. Feature visibility of Create Student (Grade 1) confirmed via deep link (Admin gate).  

**Awaiting operator approval** for Admin login / parent-list continuation (still no create until explicitly approved).
