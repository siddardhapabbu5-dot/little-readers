# EAS build configuration guide

**Phase 5:** profiles are prepared. **Do not run builds until Phase 6 approval.**

Working directory for all commands: `apps/mobile`.

## Profiles (`eas.json`)

| Profile | Android | iOS | Distribution | Demo flag |
|---------|---------|-----|--------------|-----------|
| `development` | APK + dev client | Simulator OK | internal | `EXPO_PUBLIC_ENABLE_DEMO=1` |
| `preview` | APK | device | internal | demo off |
| `staging` | APK | device | internal | demo off |
| `production` | **AAB** (`app-bundle`) | App Store binary | store (when submitted) | demo off |

All non-local profiles bake:

- `EXPO_PUBLIC_API_URL=https://api.siwiapp.shop/api`
- `EXPO_PUBLIC_WEB_APP_URL=https://siwiapp.shop`

## Prerequisites (accounts)

1. Expo account with access to project owner `tjgf-hjgl` / projectId in `app.json`.
2. Google Play Console app for `com.littlereaders.app` (upload key / Play App Signing).
3. Apple Developer Program team + App Store Connect app for `com.littlereaders.app`.
4. `eas-cli` installed (`npm i -g eas-cli`) and `eas login`.

## Commands (Phase 6 only — do not run now)

```bash
cd apps/mobile
eas build --platform android --profile production   # produces AAB
eas build --platform ios --profile production
eas build --platform android --profile preview      # internal APK
```

Submit (Phase 6+, after store assets ready):

```bash
eas submit --platform android --profile production
eas submit --platform ios --profile production
```

Replace `submit.production.ios.ascAppId` in `eas.json` with the real App Store Connect numeric app ID before iOS submit.

## Versioning

- App version (`version`): `1.0.0` in `app.json`
- Android `versionCode`: `10`
- iOS `buildNumber`: `"10"`
- `cli.appVersionSource`: `local` — bump in `app.json` before each store upload

## Native modules note

Tokens use `expo-secure-store` (Android backup disabled for the store). Speech uses `expo-speech` (TTS — no microphone permission). Device binding uses a stable installation id in SecureStore + `X-Installation-Id` header.
