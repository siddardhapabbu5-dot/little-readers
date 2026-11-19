# Level-1 — VC27 Login-Only Signed APK Build Result

**Date:** 2026-11-19  
**Result:** **SUCCESS** — one signed release APK produced and validated  
**Distribution:** Local artifact only — **not installed**, **not uploaded to Play**, awaiting review

---

## 1. Source

| Item | Value |
|------|--------|
| Base commit | `32972cd` — *Bump Android versionCode to 27* |
| Login patch source | `122c627` — *fix(auth): improve login reliability and Redis rate limiting* |
| Build worktree | `C:\Users\harsh\OneDrive\Documents\Desktop\SIWI-vc27-login-only-apk` (detached `32972cd` + patch; original WIP preserved) |
| Package / version | `com.littlereaders.app` · `1.0.0` · **versionCode 27** |

### Applied mobile files only (from `122c627`)

- `apps/mobile/app/login.tsx`
- `apps/mobile/services/api.ts`
- `apps/mobile/services/auth-errors.ts`
- `apps/mobile/services/auth-errors.test.ts`

### Excluded (not taken from `122c627`)

All non-mobile and non-login paths from that commit, including:

- Server Redis/lockout/password-rate-limit changes  
- Web login / web `auth-errors`  
- Login docs under `docs/LOGIN_*`  
- Level-2 tip commit `eb296fe` and descendants  
- Level-2 pilot exports (`exports/level2-3d-image-pilot-*`, etc.)  
- Any other unrelated WIP

### Login-fix verification (source + APK bundle)

| Check | Result |
|-------|--------|
| `ACCOUNT_LOCKED` in `auth-errors.ts` | **Present** |
| `RATE_LIMITED` in `auth-errors.ts` | **Present** |
| Same strings in `index.android.bundle` | **Present** (1 hit each) |
| API URL in bundle | `https://api.siwiapp.shop/api` |
| Bundle hits for `level2-3d-image-pilot` | **0** |
| Bundle hits for `pilot-3d` | **0** |

Patch compatibility: clean `git checkout 122c627 -- <4 files>` onto `32972cd` — **no conflicts**.

---

## 2. Signing

| Item | Result |
|------|--------|
| Keystore | Existing `release.jks` only |
| Overrides | Temporary Gradle `-P` (`LW_UPLOAD_STORE_FILE` / `KEY_ALIAS` / passwords) |
| Permanent Gradle / repo signing config edited | **No** |
| `upload-new.jks` used | **No** |
| Pre-build cert SHA-256 (`release.jks`) | `6D:28:3C:94:…:70:7A` |
| Approved VC26/VC27 cert | `6D:28:3C:94:…:70:7A` |
| Match | **YES** |
| APK signer cert SHA-256 | `6d283c941deb3a2823ea1c11d9dd5c2e7b8ba9e044dbaf0de00e878c32e2707a` |
| Passwords / private keys in this report | **None** |

### Build command (secrets redacted)

```bat
set EXPO_PUBLIC_API_URL=https://api.siwiapp.shop/api
set EXPO_PUBLIC_ENABLE_DEMO=0
set EXPO_NO_METRO_WORKSPACE_ROOT=1
cd apps\mobile\android
gradlew.bat assembleRelease ^
  -PLW_UPLOAD_STORE_FILE=<release.jks path> ^
  -PLW_UPLOAD_KEY_ALIAS=<redacted> ^
  -PLW_UPLOAD_STORE_PASSWORD=<redacted> ^
  -PLW_UPLOAD_KEY_PASSWORD=<redacted>
```

Notes:

- One `assembleRelease` only (no AAB task).  
- Local generated `android/app/build.gradle` needed a monorepo `root`/`entryFile` pin plus `EXPO_NO_METRO_WORKSPACE_ROOT=1` so Metro did not resolve `index.js` from the repo root (Windows/Expo workspace issue). **Signing configuration was not permanently changed.**

---

## 3. APK artifact

| Field | Value |
|-------|--------|
| Path | `exports/LearnWise-1.0.0-vc27-login-only.apk`  
| (under `SIWI-login-auth-only`) | also built at worktree `…/android/app/build/outputs/apk/release/app-release.apk` |
| Size | 113,808,801 bytes |
| SHA-256 | `709D9999D8A43F4EA441A2DD734EE976F2F4DB4461E689E7CD7BA3C7CEB3FBA4` |

---

## 4. Validation

| Check | Result |
|-------|--------|
| `apksigner verify` | **Verifies** (v2) |
| Package ID | `com.littlereaders.app` |
| versionName / versionCode | `1.0.0` / **27** |
| Signing cert vs approved | **Match** |
| API base URL in bundle | `https://api.siwiapp.shop/api` |
| Login `ACCOUNT_LOCKED` / `RATE_LIMITED` in bundle | **Yes** |
| Level-2 tip pilot strings in bundle | **Not found** |
| Debug signing | Release signing used (approved upload cert) |
| Installability | Signature compatible with installed VC26 (same cert). **Install not executed** (awaiting review). |

Safe upgrade after approval (do **not** clear data unless requested):

```bat
adb install -r exports\LearnWise-1.0.0-vc27-login-only.apk
```

If Android reports signature mismatch, **STOP** — do not bypass.

---

## 5. Restrictions honored

| Restriction | Honored |
|-------------|---------|
| One APK only | Yes |
| No AAB | Yes |
| No Play upload | Yes |
| No production deploy / DB / subscriptions / Grade-1 content | Yes |
| No new keystore / no permanent signing config edit | Yes |
| No commit / push | Yes |
| WIP on other worktrees preserved | Yes |

---

## 6. Outcome

**Build result: PASS**  
Artifact ready for owner review before device install / AD-04+ resume.

**Stopped after validation. No distribution beyond the local `exports/` path.**
