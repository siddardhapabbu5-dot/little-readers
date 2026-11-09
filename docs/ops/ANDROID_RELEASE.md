# Android release instructions

## App identity

| Field | Value |
|-------|--------|
| Application ID | `com.littlereaders.app` (permanent once published — do not change) |
| Display name | Learn Wise |
| version | `1.0.0` |
| versionCode | `22` (increment for every Play upload; `appVersionSource: local` reads `app.json`) |
| Icon | `apps/mobile/assets/icon.png` + adaptive `adaptive-icon.png` |
| Splash | `apps/mobile/assets/splash.png` (`#F3E8FF`) |
| Expo SDK / React Native | 54 / 0.81.5 (New Architecture, Hermes) |
| Min / target / compile SDK | 24 / 36 / 36 |
| Edge-to-edge | Always on (Android 15+ requirement); screens use `react-native-safe-area-context` insets |
| Android TV | Same package (from v20): `plugins/withAndroidTv.js` adds LEANBACK_LAUNCHER, `tv-banner.png`, optional touchscreen/camera/portrait; TV runs landscape, phones portrait. See `ANDROID_TV_TESTING.md` |
| Predictive back | Opted out (`predictiveBackGestureEnabled: false`) so hardware back keeps working |

## Permissions

Declared: `INTERNET`, `ACCESS_NETWORK_STATE`, `CAMERA` (only when a parent taps "Camera" for a profile photo).
Pulled in by the Razorpay checkout SDK: `NFC`.

Explicitly blocked (`blockedPermissions` in `app.json`): microphone, fine/coarse/background location,
contacts, legacy storage (`READ/WRITE_EXTERNAL_STORAGE`), media (`READ_MEDIA_*`), `SYSTEM_ALERT_WINDOW`,
and the advertising ID (`com.google.android.gms.permission.AD_ID`).

Gallery picks use the system photo picker (no storage permission). `android:allowBackup` is `false`.

## Production API

Set via EAS `production` profile: `EXPO_PUBLIC_API_URL=https://api.siwiapp.shop/api`, demo logins off
(`EXPO_PUBLIC_ENABLE_DEMO=0`).
Secure tokens: `expo-secure-store` (Android backup for secure store disabled).
Device registration: SHA-256 hash of the Android ID + phone name, sent to `/devices/register` on Learn open.

## Deep links

Scheme: `littlereaders://` (intent filter in `app.json`). Universal links / App Links verification is optional and not required for OTP login.

## Notifications

Push notifications are **not** implemented. Do not request notification permission in store builds until a future phase adds FCM.

## Build artifact

### EAS (preferred)

```bash
cd apps/mobile
eas build --platform android --profile production   # AAB, signed with the EAS-managed upload key
eas build --platform android --profile preview      # internal test APK
```

### Local Gradle build (Windows, when EAS build quota is exhausted)

1. Android SDK in `%LOCALAPPDATA%\Android\Sdk` with `platforms/android-36`, `build-tools/36.0.0`,
   `ndk/27.1.12297006`, `cmake/3.22.1`; JDK 17.
2. Build from a short path outside OneDrive (e.g. `robocopy` the repo to `C:\lwb`, then `npm ci`).
3. Upload key: download the EAS keystore once with `eas credentials -p android` (production profile) and put
   these in `%USERPROFILE%\.gradle\gradle.properties` (never in the repo):
   `LW_UPLOAD_STORE_FILE`, `LW_UPLOAD_STORE_PASSWORD`, `LW_UPLOAD_KEY_ALIAS`, `LW_UPLOAD_KEY_PASSWORD`.
   `plugins/withLocalReleaseSigning.js` wires them into the release build; without them the debug key is used.
4. In `apps/mobile`:

```powershell
$env:GRADLE_USER_HOME="C:\g"            # short cache path: NDK/ninja fails on paths over 260 chars
$env:GRADLE_USER_HOME="C:\g"            # short cache path: NDK/ninja fails on paths over 260 chars
$env:EXPO_NO_METRO_WORKSPACE_ROOT="1"   # Windows + monorepo: Gradle passes a relative entry file
$env:EXPO_PUBLIC_API_URL="https://api.siwiapp.shop/api"
$env:EXPO_PUBLIC_WEB_APP_URL="https://siwiapp.shop"
$env:EXPO_PUBLIC_WEB_URL="https://siwiapp.shop"
$env:EXPO_PUBLIC_ENABLE_DEMO="0"        # apps/mobile/.env sets 1 for local dev
$env:NODE_ENV="production"
npx expo prebuild --platform android --clean --no-install
cd android
.\gradlew.bat bundleRelease    # app\build\outputs\bundle\release\app-release.aab
```

## Play Console checklist (prep)

- [ ] Create app listing for Learn Wise
- [ ] Privacy policy URL: `https://siwiapp.shop/privacy`
- [ ] Account deletion URL: `https://siwiapp.shop/privacy` (request form) + in-app Profile > Privacy & data requests
- [ ] Content rating questionnaire
- [ ] Target audience / Families policy answers
- [ ] Data safety form (account, child profile, learning progress, device ID, payments via Razorpay)
- [ ] Resolve Google Play Billing policy for in-app subscriptions before production release
- [ ] Upload AAB to internal testing track first
