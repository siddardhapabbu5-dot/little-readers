# Learn Wise VC35 — Samsung S24 Install Report

**Date:** 2026-11-20  
**Device:** Samsung Galaxy S24 SM-S921B · ADB `RZCX42381TM`  
**APK:** `exports/android-production-apk-level1-vc35-2026-11-20/LearnWise-1.0.0-vc35-level1-production-https.apk`  

**Install status:** **PASS**

---

## Install verification

| Check | Result |
|-------|--------|
| Pre-install versionCode | 34 |
| `adb install -r` | **Success** |
| Post-install versionCode | **35** |
| versionName | `1.0.0` |
| Package | `com.littlereaders.app` |
| APK SHA-256 | `D229D2ECD931EA5CD037C8462B5E838CB873FDCAE2D7E6A79D93882E46DEE217` |
| Signing cert | production lineage (matches prior VC) |
| Launch | App started after install |

Artifacts: `exports/vc35-s24-install/01-launch.png`, `01-ui.xml`

---

## Student login / journey

**Not completed in this install step.** Operator should:

1. Tap **Student** tab  
2. Log in as **DEPPU1727**  
3. Confirm Home stays up (no bounce to login)  
4. Profile + Subscription without logout  
5. Grade 1 learning (Admin grant already active until 20/12/2026)

---

## Restrictions

| Item | Status |
|------|--------|
| No Play upload | Observed |
| No webpage deploy | Observed |
| No backend / DB / seat changes | Observed |
| No commit / push | Observed |
