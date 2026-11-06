# iOS release instructions

## App identity

| Field | Value |
|-------|--------|
| Bundle identifier | `com.littlereaders.app` |
| Display name | Little Readers |
| version | `1.0.0` |
| buildNumber | `10` |
| Deployment target | iOS 15.1 |
| Icon / splash | same assets as Android |
| Encryption export | `ITSAppUsesNonExemptEncryption: false` (HTTPS only) |

## Permissions / Info.plist

- Photo library usage string: only for admin document/image picking.
- No microphone / speech-recognition strings (TTS via `expo-speech` does not require mic).
- No background modes enabled for sync (offline learning not supported).

## Production API & auth

Same production API URL as Android via EAS env.  
Tokens in Keychain via `expo-secure-store`.  
Parent OTP device sessions + student one-device binding unchanged.

## Deep links

Custom scheme `littlereaders://`. Associated Domains / Universal Links can be added later with an Apple `applinks:` entitlement and `apple-app-site-association` on `siwiapp.shop` — not required for launch OTP.

## Apple Developer requirements (external)

| Item | Status needed before Phase 6 iOS build |
|------|----------------------------------------|
| Apple Developer Program membership | Required |
| App Store Connect app record | Create for `com.littlereaders.app` |
| Distribution certificate | Managed by EAS Credentials or manual |
| Provisioning profile | EAS can generate with Apple team access |
| Asc App ID in `eas.json` `submit.production.ios.ascAppId` | Replace placeholder |
| Privacy Nutrition Labels | Account, Device ID, Product Interaction |
| Kids Category / COPPA answers | Parent-gated product — review carefully |

## Build artifact (Phase 6)

```bash
cd apps/mobile
eas build --platform ios --profile production
```

Do not run until Apple team + certificates are ready. Simulator builds: `--profile development`.
