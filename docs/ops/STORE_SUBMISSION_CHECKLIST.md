# Store submission preparation checklist

Use before Phase 6 store upload. Preparation only in Phase 5.

## Shared

- [ ] App name: Little Readers
- [ ] Bundle / application id: `com.littlereaders.app`
- [ ] Privacy policy URL live
- [ ] Support email configured (`SUPPORT_EMAIL`)
- [ ] Screenshots for phone (and tablet if claiming tablet support)
- [ ] Production API reachable over HTTPS
- [ ] Demo mode off (`EXPO_PUBLIC_ENABLE_DEMO=0`)
- [ ] Live payments still disabled unless approved
- [ ] No secrets in client env

## Google Play

- [ ] Play Console app created
- [ ] AAB from `eas build --profile production` (Phase 6)
- [ ] Data safety form completed
- [ ] Content rating
- [ ] Target audience / Families policy
- [ ] Internal testing track validated on real devices

## Apple App Store

- [ ] Apple Developer + App Store Connect app
- [ ] `ascAppId` filled in `eas.json`
- [ ] Privacy nutrition labels
- [ ] Encryption compliance answered (standard HTTPS)
- [ ] TestFlight internal build validated
- [ ] Review notes: parent OTP + PIN gate; student one-device rule

## Explicitly out of scope until approved

- [ ] SMS production credentials
- [ ] VocabRound production migration
- [ ] Level-1 production restore
- [ ] Razorpay live mode
