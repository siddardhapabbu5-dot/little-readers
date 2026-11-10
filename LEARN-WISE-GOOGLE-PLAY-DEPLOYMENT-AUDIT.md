# Learn Wise – Google Play Deployment Audit

Date: 11 Nov 2026 · Branch: `release/android-play-api36` · Last shipped build: **v26** (`Desktop\LearnWise-release-v26`)

No production build was started, and no database, API, website or backend change was made during this audit.

---

## 1. Summary

The project is **already configured for Google Play** and has been building signed release bundles up to version code 26. Most of the requested configuration was already in place. Two requested values were **not applied** because they conflict with the app that already exists:

| Requested | Current | Decision |
|---|---|---|
| Package ID `com.siwiapp.learnwise` | `com.littlereaders.app` | **Not changed.** See section 3. |
| Version code `1` | `26` | **Not changed.** Play rejects any version code that is not higher than the last upload. |
| App name "Learn Wise" | "Learn Wise" | Already set |
| Version `1.0.0` | `1.0.0` | Already set |
| Orientation portrait | `portrait` | Already set |
| Dev / preview APK / production AAB profiles | All present in `eas.json` | Already set |

**Ready for production AAB generation?** Technically **yes**: the v26 AAB builds, is signed with the upload key and targets API 36. For **Play review**, three issues should be resolved first (section 7): the payment method used on Android, the missing public account-deletion URL, and the Families declarations.

---

## 2. Existing configuration

| Item | Value | Source |
|---|---|---|
| Expo SDK | **54** (`expo ~54.0.38`, CLI 54.0.28) | `apps/mobile/package.json` |
| React Native | **0.81.5**, React 19.1.0 | `apps/mobile/package.json` |
| Expo config | `apps/mobile/app.json`, extended by `apps/mobile/app.config.js` (cleartext only for `smoke-local`, `baseUrl` only for the web export) | |
| EAS project ID | `05c9d4b3-b240-4dc7-9f2b-648e7243e2d0`, owner `tjgf-hjgl` | `app.json > extra.eas` |
| Slug / scheme | `little-readers` / `littlereaders` | `app.json` |
| Android package | `com.littlereaders.app` (iOS bundle ID is the same) | `app.json` |
| versionName / versionCode | `1.0.0` / `26` | `app.json` |
| `appVersionSource` | `local`: version code comes from `app.json` | `eas.json` |
| compile / target / min SDK | 36 / **36** / 24 | `expo-build-properties` |
| Icon | `assets/icon.png` 1024×1024; adaptive icon `assets/adaptive-icon.png` 1024×1024 on `#F3E8FF` | |
| Splash | `assets/splash.png` 1024×1024, `contain`, `#F3E8FF` | |
| Play listing assets | `docs/ops/play-store-assets/` (512 icon, 1024×500 feature graphic) | |
| `allowBackup` | `false` | |
| Cleartext HTTP | Off in release (verified in the v26 manifest); only the `smoke-local` profile enables it | |
| Deep links | `littlereaders://`, plus `https://siwiapp.shop/app/tv-connect` (autoVerify; `assetlinks.json` returns 200) | |
| Signing (local builds) | `plugins/withLocalReleaseSigning.js` reads `LW_UPLOAD_*` Gradle properties; the keystore stays outside the repo. Upload certificate SHA-256 `6d283c94…32e2707a` | |
| Production API | `https://api.siwiapp.shop/api` in every non-local profile; health check returned **200** during this audit | `eas.json` |
| Demo mode | `EXPO_PUBLIC_ENABLE_DEMO=0` in preview, staging and production; `1` only in development | `eas.json` |

### EAS build profiles (`apps/mobile/eas.json`)

| Profile | Output | Purpose |
|---|---|---|
| `development` | APK, dev client | Internal debugging (demo enabled) |
| `preview` | APK | Internal testing against the live API |
| `smoke-local` | APK | LAN testing against a laptop API (cleartext) |
| `staging` | APK | Internal testing |
| `production` | **AAB** (`app-bundle`) | Play upload |
| `submit.production` | Play track `internal`, status `draft` | `eas submit` |

All three requested profiles already exist and work, so `eas.json` was left as it is.

---

## 3. Package ID conflict (not changed)

`com.littlereaders.app` is already configured, and v1 to v26 have been built and signed with it. Changing it to `com.siwiapp.learnwise` would:

- create a **completely new Play app**: new listing, no existing testers or installs, no update path for current users;
- break the `assetlinks.json` link verification for `/app/tv-connect`, which is tied to the package;
- require new Razorpay/Cashfree/Google Play Billing product registrations tied to the package;
- break the standing project rule not to change the package ID.

Users never see the package ID; the Play listing and the launcher label both show **Learn Wise**. **Recommendation:** keep `com.littlereaders.app`. Change it only if you confirm that no Play app exists yet under that ID **and** you accept starting a new listing.

---

## 4. Files changed

| File | Change | Why |
|---|---|---|
| `apps/mobile/app.json` | Added `android.permission.READ_PHONE_STATE` to `blockedPermissions` | The Razorpay SDK (`com.razorpay:core:1.0.1`) injects it. The app never requests it at runtime, so blocking it changes no behaviour, but declaring it in a children's app triggers extra Play scrutiny. Takes effect from the next build (v27). |
| `LEARN-WISE-GOOGLE-PLAY-DEPLOYMENT-AUDIT.md` | New | This report |

Nothing else was modified.

---

## 5. Android / Google Play compatibility

### Target SDK
Play requires new apps and updates to target **API 35 or higher** (Aug 2025 rule). The app targets **API 36**, so this passes.

### Permissions in the v26 build (from `aapt2 dump badging`)

| Permission | Source | Assessment |
|---|---|---|
| `INTERNET`, `ACCESS_NETWORK_STATE` | App | Required |
| `CAMERA` | App (profile photo, TV QR scan) | Justified; requested only when used |
| `com.android.vending.BILLING` | `expo-iap` | Needed only if Google Play Billing is used |
| `NFC` | Cashfree SDK (`com.cashfree.pg:ui/core`) | Normal permission (no prompt). Remove only if Cashfree is not used in the Android app |
| `READ_PHONE_STATE` | Razorpay SDK | **Now blocked** (section 4) |
| `DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION` | AndroidX (internal) | Harmless |

Already blocked: microphone, location, contacts, storage/media, overlay, vibrate, biometric, install referrer and the **advertising ID (`AD_ID`)**. Good for Families.

### Network security
Release builds use HTTPS only. There's no cleartext and no custom network security config, and all endpoints are `https://*.siwiapp.shop`. **Pass.**

### App signing
Local builds are signed with the upload key; Play App Signing re-signs for distribution. If you switch to **EAS cloud builds**, EAS must use the **same upload keystore**: upload it with `eas credentials` first, otherwise Play rejects the AAB.

### Features (code inspection only)
These checks were done by reading code and building the app, not by testing on a device:
- Login, registration and child profiles, the parent dashboard, learning modules, Listen & Spell, certificates and subscriptions are all present and compile into the v26 bundle (1,800 modules).
- They all talk to the production API, and `/api/health` returned 200.
- Before release, follow section 8 to install the APK on a phone and test them by hand.

---

## 6. Google Play Families policy (child-directed app)

| Area | Status |
|---|---|
| Ads / advertising ID | No ad SDK; `AD_ID` blocked. **OK** |
| Location, contacts, microphone | Blocked. **OK** |
| Chat / social features | None (project rule). **OK** |
| WebView | Not used in the mobile app. **OK** |
| Third-party SDKs | Razorpay and Cashfree are payment SDKs and appear on the parent-only subscription flow. They must not collect device identifiers from children. Declare them in Data safety. |
| Privacy policy | `https://siwiapp.shop/privacy` returns 200. **OK** |
| Account deletion | An in-app request form exists (`privacy-request.tsx`), but there is **no public web URL** (`/delete-account` returns 404). Play requires one. **Missing** |
| Parent gate | Payments and settings sit behind the parent login. Confirm in the Console questionnaire. |
| Target audience | Choosing ages under 13 enrols the app in Families. Data safety, content rating (IARC) and the Families declaration must match the shipping build. |

---

## 7. Missing requirements / risks found

1. **Payments policy (highest risk).** On Android, subscriptions are sold through **Razorpay/Cashfree** (`subscription.tsx`: `WEB_CHECKOUT = Platform.OS !== "ios"`). Play's Payments policy requires **Google Play Billing** for digital content. The only exception is India's user-choice billing programme, which requires enrolment and still offers Play Billing alongside. The project already has `services/play-billing.native.ts` and a `store=google_play` path in `agreements.tsx`, but the Android subscription screen does not offer it. **Decide before production review:** enable Play Billing on Android, enrol in user-choice billing, or remove in-app purchase on Android. This is a product decision; no code was changed for it.
2. **No public account-deletion page.** Add one on the website (e.g. `https://siwiapp.shop/delete-account`) that explains how to request deletion, and enter it in the Console. This is a website change, so it was not done in this audit.
3. **Families / Data safety / content rating forms** must be completed in Play Console against the v27 build (`docs/ops/PLAY_STORE_LISTING_PREP.md` sections 5–6 has the draft answers).
4. **EAS CLI is not installed** on this machine. All builds so far were local Gradle builds; that is fine, but the EAS commands below need it.
5. **Signing for EAS cloud builds:** the existing upload keystore must be uploaded to EAS first (section 5).

### Errors found during this audit
- None in the configuration.
- The v26 local build had hit a Metro monorepo entry-resolution error. It was fixed in the build environment with `EXPO_NO_METRO_WORKSPACE_ROOT=1`; no repo change.
- `https://siwiapp.shop/delete-account` returns 404 (see item 2 above).

---

## 8. Exact next commands

Run from `apps\mobile`. Use `node ..\..\node_modules\...` instead of `npx`, because `npx` breaks on the `&` in the folder path.

```powershell
# 0. Install EAS CLI once
npm install -g eas-cli

# 1. Check Expo account (must be tjgf-hjgl or a member of it)
eas login
eas whoami

# 2. Check EAS project link and Android credentials
eas project:info
eas credentials -p android      # upload the existing upload keystore here before any cloud build

# 3. Preview APK (internal test, live API, demo off)
eas build -p android --profile preview

# 4. Production AAB – DO NOT RUN until section 7 items 1–3 are resolved
#    First bump "versionCode" in app.json to 27
eas build -p android --profile production

# 5. Submit to Play (internal track, draft – per eas.json)
eas submit -p android --profile production
```

Equivalent local signed build (the method used for v1–v26):

```powershell
# bump versionCode to 27, then run the existing script (update the v26 paths/names inside it to v27):
powershell -ExecutionPolicy Bypass -File C:\Users\harsh\lw-build-v26.ps1
# keep EXPO_NO_METRO_WORKSPACE_ROOT=1 in the build environment
```

Manual Play submission: Play Console → Learn Wise → Testing → Internal testing → Create release → upload the `.aab` → add release notes → review → roll out to internal testers.

---

## 9. Production readiness verdict

| Check | Result |
|---|---|
| Builds a signed AAB | **Yes** (v26 verified) |
| Target SDK meets Play rules | **Yes** (36) |
| Package / version configuration valid | **Yes** (`com.littlereaders.app`, next versionCode 27) |
| Production API reachable | **Yes** |
| Permissions minimal for a children's app | **Yes**, after the `READ_PHONE_STATE` block in v27 |
| Play payments policy | **Needs decision** |
| Account deletion web URL | **Missing** |
| Families / Data safety forms | **To complete in Console** |

**Verdict:** ready to *generate* a production AAB (v27) and upload it to **internal testing**. Fix the three items above before promoting it to production review.
