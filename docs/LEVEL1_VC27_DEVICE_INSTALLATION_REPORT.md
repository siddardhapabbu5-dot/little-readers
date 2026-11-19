# Level-1 — VC27 Device Installation Report

**Date:** 2026-11-19  
**Device:** Samsung SM-S921B · Android 17 · serial `RZCX42381TM`  
**APK:** `exports/LearnWise-1.0.0-vc27-login-only.apk`  
**Gate status:** **Phase 3 COMPLETE — install verified; AD/login testing not started**

Restrictions honored: no uninstall, no data clear, no Play upload, no deploy, no DB/subscription/content changes, no commit/push.

---

## Phase 1 — Pre-install verification (reconfirmed before install)

| # | Check | Result |
|---|--------|--------|
| 1 | APK exists | **PASS** |
| 2 | SHA-256 | **PASS** — `709D9999D8A43F4EA441A2DD734EE976F2F4DB4461E689E7CD7BA3C7CEB3FBA4` |
| 3 | Signature | **PASS** — `apksigner` v2 |
| 4 | Cert vs installed app | **PASS** — both `6d283c941deb3a2823ea1c11d9dd5c2e7b8ba9e044dbaf0de00e878c32e2707a` |
| 5–6 | Device / serial | **PASS** — SM-S921B / RZCX42381TM |
| 7 | Pre-install package | versionCode **26**, `dataDir=/data/user/0/com.littlereaders.app` |
| 8 | Storage | Sufficient (previously ~89G free) |

---

## Phase 2 — Installation (approved)

| Item | Value |
|------|--------|
| User approval | Explicit proceed for Phase 2 on SM-S921B / RZCX42381TM |
| Command | `adb install -r --user 0 <apk>` |
| Uninstall | **Not performed** |
| Clear data | **Not performed** |
| Result | **Success** (`INSTALL_EXIT=0`) |

---

## Phase 3 — Post-install verification

| Check | Result | Evidence |
|-------|--------|----------|
| Installation successful | **PASS** | Streamed Install Success |
| Package ID | **PASS** | `com.littlereaders.app` |
| versionName / versionCode | **PASS** | `1.0.0` / **27** |
| Application data preserved | **PASS** | Same `dataDir=/data/user/0/com.littlereaders.app`; `firstInstallTime=2026-11-19 00:35:17` unchanged; `lastUpdateTime=2026-11-19 05:36:19` (upgrade, not fresh install) |
| App launches | **PASS** | `MainActivity` focused; login UI “Welcome Back!” / “Log In” |
| Production API in installed binary | **PASS** | Installed APK bundle contains `https://api.siwiapp.shop/api` (1 hit) |
| Login fixes in installed binary | **PASS** | `ACCOUNT_LOCKED` + `RATE_LIMITED` present in bundle |

### Evidence files

- `exports/android-device-acceptance-2026-11-19/VC27-post-install-launch.png`
- `exports/android-device-acceptance-2026-11-19/VC27-post-install-ui.xml`

---

## Phase 4 — Android acceptance

**Not started** (per instruction).  
Next: owner on-device login (no password/OTP to agent), then AD-01…AD-33.

---

## Summary

| Metric | Value |
|--------|--------|
| Pre-install versionCode | 26 |
| Post-install versionCode | **27** |
| Install method | `-r` upgrade |
| Data wipe | **No** |
| Overall Phase 1–3 | **PASS** |
