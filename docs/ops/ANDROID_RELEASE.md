# Android release instructions

## App identity

| Field | Value |
|-------|--------|
| Application ID | `com.littlereaders.app` |
| Display name | Little Readers |
| version | `1.0.0` |
| versionCode | `10` |
| Icon | `apps/mobile/assets/icon.png` + adaptive `adaptive-icon.png` |
| Splash | `apps/mobile/assets/splash.png` (`#F3E8FF`) |
| Min / target SDK | 24 / 34 (compile 35) |

## Permissions

Declared: `INTERNET`, `ACCESS_NETWORK_STATE`.  
Explicitly blocked: mic, camera, location, contacts (not required for student learning TTS).

## Production API

Set via EAS `production` profile: `EXPO_PUBLIC_API_URL=https://api.siwiapp.shop/api`.  
Secure tokens: `expo-secure-store` (Android backup for secure store disabled).  
Device registration: installation id + `/devices/register` on Learn open.

## Deep links

Scheme: `littlereaders://` (intent filter in `app.json`). Universal links / App Links verification is optional and not required for OTP login.

## Notifications

Push notifications are **not** implemented. Do not request notification permission in store builds until a future phase adds FCM.

## Build artifact (Phase 6)

```bash
cd apps/mobile
eas build --platform android --profile production
```

Output: **AAB** for Play Console. Preview APK uses `--profile preview`.

## Play Console checklist (prep)

- [ ] Create app listing for Little Readers
- [ ] Privacy policy URL
- [ ] Content rating questionnaire
- [ ] Target audience / Kids policy answers
- [ ] Data safety form (account, device id, learning progress)
- [ ] Upload AAB to internal testing track first
- [ ] Do **not** enable live payments in-app until Phase 4 ops approval
