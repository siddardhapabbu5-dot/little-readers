# LITTLE READERS — ANDROID V8 FIVE-PARENT PILOT AUDIT

| Field | Value |
|---|---|
| Audit date | 2026-11-06 |
| Auditor | Development / Cursor agent (evidence-only) |
| Scope | Android v8 pilot readiness |
| Restrictions | No code changes, no DB migrations, no new APK, no auth/payment/API logic changes |
| Primary device under test | Samsung Galaxy S24 — SM-S921B/DS |
| Framework | Expo SDK 52 / React Native 0.76.9 / React 18.3.1 (mobile) |

---

## 1. Executive summary

Android **versionCode 8** fixes the confirmed **immediate launch crash** that affected **all Android devices** on versionCode 7 (duplicate React 18 + React 19 in the Metro monorepo bundle — `ReactCurrentDispatcher of undefined`). On the Galaxy S24, v8 was installed via `adb` and verified **process stayed alive** after cold start (`APP_RUNNING_OK_V8`).

That does **not** equal five-parent pilot completion. Only **one** physical device was used. There is **no verified evidence** of parent login, student learning flows, progress persistence, device-lock enforcement, or multi-parent installs on five phones. Live API health responds OK. Payments remain disabled by design for the pilot server flag. Google Play target SDK and Families/privacy declarations are incomplete for Play.

**Recommendation:** **NOT READY FOR PILOT** · **NOT READY FOR PLAY**  
(See §12. Sideload single-device smoke may continue on v8 only; five-parent pilot and Play internal testing require further device evidence.)

---

## 2. Exact app version and build identification

| Item | Verified value | Evidence source |
|---|---|---|
| Application name | Little Readers | `apps/mobile/app.json` |
| Android package | `com.littlereaders.app` | `apps/mobile/app.json` |
| versionName | `1.0.0` | `apps/mobile/app.json` |
| versionCode | `8` | `apps/mobile/app.json`; `adb dumpsys package` after v8 install (session log) |
| Expo SDK | `~52.0.28` | `apps/mobile/package.json` |
| React (mobile) | `18.3.1` | `apps/mobile/package.json` + `apps/mobile/node_modules/react` |
| React Native | `0.76.9` | `apps/mobile/package.json` |
| Entry | `index.js` → gesture-handler + expo-router | `apps/mobile/package.json` `main`, `apps/mobile/index.js` |
| EAS build ID | `4df7c639-39b4-49f4-92eb-eba5cecd7b5b` | EAS CLI output during build (2026-11-06) |
| EAS profile | `preview` (APK, internal) | `apps/mobile/eas.json` |
| Artifact URL | `https://expo.dev/artifacts/eas/Nr98Y93ReCq0Oos_vcmlH12crBnvbu8JpDeCIrVF0rw.apk` | EAS build finished output |
| Local APK path | `%TEMP%\little-readers-v8.apk` | File present at audit time |
| APK size | `72,501,117` bytes | `Get-Item` on local APK |
| SHA-256 | `1A884A5FB7A8990D6F1A211B73EFD7E208C12AB01CB2698A617F9820DD974827` | `Get-FileHash -Algorithm SHA256` |
| Git commit (crash fix) | `a0c0f17` on `fix/phase-10c-critical-defects` | `git push` session log |
| minSdk / compileSdk / targetSdk | 24 / 35 / **34** | `apps/mobile/app.json` expo-build-properties |
| Kotlin | `1.9.25` | `apps/mobile/app.json` + `plugins/withAndroidKotlinFix.js` |

**Prior broken build (do not distribute):** versionCode **7** — dropbox `data_app_crash` with `JavascriptException: Cannot read property 'ReactCurrentDispatcher' of undefined`.

---

## 3. Tested Android devices and versions

| Device | Model | Android | Role | Result |
|---|---|---|---|---|
| Samsung Galaxy S24 | SM-S921B/DS | Build fingerprint from crash dropbox: `samsung/e1sxins/e1s:17/...` (One UI / Android 17 lineage per device log) | Primary physical DUT | v7 crash FAIL; v8 launch process alive PASS |
| Other manufacturers | — | — | — | **NOT TESTED** |
| Five distinct parent phones | — | — | Pilot cohort | **NOT TESTED** (0 of 5) |

`PAGE_SIZE` on S24 during diagnostics: **4096** (not a 16KB page-size crash).

At audit write time, USB `adb devices` showed **no attached device** — current on-device state re-check was not possible; launch PASS relies on earlier same-day session logs.

---

## 4. Evidence classes

| Class | Meaning |
|---|---|
| **CODE** | Static inspection of repository files only |
| **DEVICE** | Physical Galaxy S24 session (adb install / launch / dropbox) |
| **REMOTE** | Live Hostinger endpoint probe from auditor machine |
| **BUILD** | EAS / local artifact metadata |

Statuses use only: **PASS** / **FAIL** / **BLOCKED** / **NOT TESTED**.

---

## 5. Test cases

### Area 1 — Android build and APK verification

| ID | Description | Expected | Actual verified result | Evidence | Status |
|---|---|---|---|---|---|
| APK-01 | Preview APK exists for v8 | Finished EAS artifact with versionCode 8 | Build `4df7c639-…` finished; archive URL present; versionCode 8 in app config | BUILD + CODE | **PASS** |
| APK-02 | APK integrity (checksum) | Stable SHA-256 for distributed file | SHA-256 `1A884A5FB7A8990D6F1A211B73EFD7E208C12AB01CB2698A617F9820DD974827`, size 72501117 | BUILD (local file) | **PASS** |
| APK-03 | Production AAB for Play | Production AAB built and stored | Only preview APK verified this cycle; production profile exists in `eas.json` but AAB not produced/tested | CODE | **NOT TESTED** |
| APK-04 | Demo flags off in preview/prod | `EXPO_PUBLIC_ENABLE_DEMO=0` | Confirmed in `eas.json` preview + production env | CODE | **PASS** |
| APK-05 | Live API URL baked into preview | `https://api.siwiapp.shop/api` | Confirmed in `eas.json` preview env + `services/api.ts` fallback | CODE | **PASS** |

### Area 2 — Expo / RN startup and duplicate React

| ID | Description | Expected | Actual verified result | Evidence | Status |
|---|---|---|---|---|---|
| RN-01 | Single React for mobile Metro | All `react` resolves to mobile 18.3.1 | `metro.config.js` forces `react` / jsx-runtimes via `resolveRequest` + `extraNodeModules` | CODE | **PASS** |
| RN-02 | Root/web React 19 does not crash APK | No `ReactCurrentDispatcher` crash on launch | v7: FAIL (dropbox). v8 after Metro pin: process alive on S24 | DEVICE + CODE | **PASS** (v8) |
| RN-03 | Monorepo still has React 19 at root | Document coexistence | `npm why react` showed root `19.3.1` (web/ui) and mobile `18.3.1` | CODE | **PASS** (documented; mitigated for mobile) |
| RN-04 | Entry imports gesture-handler first | `index.js` loads RNGH before router | File present as specified | CODE | **PASS** |

### Area 3 — Installation and launch compatibility

| ID | Description | Expected | Actual verified result | Evidence | Status |
|---|---|---|---|---|---|
| INST-01 | Fresh install of v8 on S24 | `adb install` Success | Streamed install Success; `versionCode=8` | DEVICE | **PASS** |
| INST-02 | Cold start does not exit immediately | Process remains after MainActivity | `pidof com.littlereaders.app` non-empty (`APP_RUNNING_OK_V8`) | DEVICE | **PASS** |
| INST-03 | v7 must not be redistributed | v7 fails launch | Repeated `data_app_crash` v7 with ReactCurrentDispatcher | DEVICE | **FAIL** (v7 artifact) |
| INST-04 | Install on non-Samsung Android | Same launch success | No second manufacturer tested | — | **NOT TESTED** |
| INST-05 | Five parent devices install v8 | All five install + open | 0 of 5 cohort devices documented | — | **NOT TESTED** |
| INST-06 | User-driven Chrome/Wi-Fi install path | Parent can install without adb | USB MTP often 0-byte; Wi-Fi LAN serve used; cohort install procedure not validated end-to-end for five parents | DEVICE (partial) | **NOT TESTED** |

### Area 4 — Parent and student authentication

| ID | Description | Expected | Actual verified result | Evidence | Status |
|---|---|---|---|---|---|
| AUTH-01 | Parent OTP / email login on device | Login screen → authenticated session | Login UI code exists; **no device login success log/screenshot in this audit** | CODE only | **NOT TESTED** |
| AUTH-02 | Teacher / admin login on device | Role routes correctly | AuthGate + role routes in code; not device-tested | CODE only | **NOT TESTED** |
| AUTH-03 | Secure token storage configured | expo-secure-store; backup off | Plugin `configureAndroidBackup: false` in app.json; secure.ts uses SecureStore | CODE | **PASS** (config) |
| AUTH-04 | Session revoke messaging | Revoked session surfaces message | `SESSION_REVOKED` handling in api/secure; not device-tested | CODE only | **NOT TESTED** |

### Area 5 — Learning levels, vocabulary, audio, images

| ID | Description | Expected | Actual verified result | Evidence | Status |
|---|---|---|---|---|---|
| LEARN-01 | Levels/lessons open on device | Content loads from API | Screens exist (`learn`, `lesson/[id]`, etc.); **no device content smoke** | CODE only | **NOT TESTED** |
| LEARN-02 | Vocabulary display | Words/definitions render | Not device-verified | — | **NOT TESTED** |
| LEARN-03 | Audio / TTS | Speech works if enabled | `expo-speech` dependency present; not device-verified | CODE only | **NOT TESTED** |
| LEARN-04 | Images | Assets load | Login/admin image requires exist in assets; runtime load not verified on device | CODE only | **NOT TESTED** |

### Area 6 — Learning progress persistence

| ID | Description | Expected | Actual verified result | Evidence | Status |
|---|---|---|---|---|---|
| PROG-01 | Progress saved after activity | Backend records completion | Learning API/device enforcement code exists; **no device progress proof** | CODE only | **NOT TESTED** |
| PROG-02 | Progress survives restart | Same scores after kill/reopen | Not tested on device | — | **NOT TESTED** |

### Area 7 — API connectivity and offline recovery

| ID | Description | Expected | Actual verified result | Evidence | Status |
|---|---|---|---|---|---|
| API-01 | Production API health | HTTP 200 OK | `GET https://api.siwiapp.shop/api/health` → 200, `status:"ok"` | REMOTE | **PASS** |
| API-02 | App uses production API in v8 | No localhost in release profile | `eas.json` preview/production `EXPO_PUBLIC_API_URL` | CODE | **PASS** |
| API-03 | Offline / timeout UX on device | Clear error, no crash | Not exercised on device | — | **NOT TESTED** |
| API-04 | Mobile data path | Works off Wi-Fi | Not tested | — | **NOT TESTED** |

### Area 8 — One-device-per-student enforcement

| ID | Description | Expected | Actual verified result | Evidence | Status |
|---|---|---|---|---|---|
| DEV-01 | Register device on student learn | Backend stores installationId | `learn.tsx` calls `/devices/register`; `device.service.ts` enforces mismatch | CODE | **PASS** (implementation present) |
| DEV-02 | Second unauthorized device blocked | API rejects wrong installationId | Unit coverage in `server/tests/device-subscription.test.ts`; **not re-run / not device-proven in this audit** | CODE | **NOT TESTED** |
| DEV-03 | Enforcement on five parent phones | Each student bound correctly | No multi-device pilot evidence | — | **NOT TESTED** |

### Area 9 — Authorized device transfer

| ID | Description | Expected | Actual verified result | Evidence | Status |
|---|---|---|---|---|---|
| XFER-01 | Transfer API + UI exist | Parent/admin can authorize | `devices.tsx` + `/devices/transfer` + admin parent devices screens | CODE | **PASS** (implementation present) |
| XFER-02 | Transfer works on physical phones | Old device revoked, new allowed | Not device-tested | — | **NOT TESTED** |

### Area 10 — Parent account restrictions

| ID | Description | Expected | Actual verified result | Evidence | Status |
|---|---|---|---|---|---|
| PAR-01 | Parent vs student feature separation | Parents not treated as student device locks incorrectly | Profile copy distinguishes parent tools; device lock is child-scoped in services | CODE | **PASS** (design inspection) |
| PAR-02 | Parent multi-device sessions | Admin can view/revoke parent sessions | `admin-parent-devices.tsx` present | CODE | **PASS** (UI/API wiring present) |
| PAR-03 | Parent flows on S24 | Real parent login + child management | Not device-tested | — | **NOT TESTED** |

### Area 11 — Crash and error handling

| ID | Description | Expected | Actual verified result | Evidence | Status |
|---|---|---|---|---|---|
| CRASH-01 | Identify v7 launch crash | Root cause known | Dropbox JS exception ReactCurrentDispatcher; duplicate React | DEVICE | **PASS** |
| CRASH-02 | v8 eliminates launch crash on S24 | No immediate death | Process alive after cold start | DEVICE | **PASS** |
| CRASH-03 | ErrorBoundary present | JS errors can surface UI | Exported in `app/_layout.tsx` | CODE | **PASS** (present) |
| CRASH-04 | No crashes during learning/payment | Stable under feature use | Features not device-exercised | — | **NOT TESTED** |
| CRASH-05 | ANR / memory under load | Acceptable | Not measured | — | **NOT TESTED** |

### Area 12 — Android permissions and notifications

| ID | Description | Expected | Actual verified result | Evidence | Status |
|---|---|---|---|---|---|
| PERM-01 | Declared permissions minimal | Only needed network perms | `INTERNET`, `ACCESS_NETWORK_STATE` in app.json | CODE | **PASS** |
| PERM-02 | Runtime permission prompts on device | Behave correctly | Not observed beyond install | — | **NOT TESTED** |
| PERM-03 | Push notifications | If claimed, work | No push notification product claim verified in this audit | — | **NOT TESTED** |

### Area 13 — Privacy and Families policy readiness

| ID | Description | Expected | Actual verified result | Evidence | Status |
|---|---|---|---|---|---|
| PRIV-01 | Privacy policy URL live for Play | Published URL | Not verified in this audit | — | **NOT TESTED** |
| PRIV-02 | Families / children’s declarations | Completed in Play Console | Play Console not evidenced | — | **NOT TESTED** |
| PRIV-03 | Data safety form matches behavior | Accurate | Not completed/verified | — | **NOT TESTED** |

### Area 14 — Google Play target SDK compliance

| ID | Description | Expected | Actual verified result | Evidence | Status |
|---|---|---|---|---|---|
| PLAY-01 | targetSdk meets current Play requirement for new apps/updates | Per current Play policy (checklist notes API 36 by Aug 2026) | Configured **targetSdkVersion 34** | CODE | **FAIL** (for Play readiness) |
| PLAY-02 | Production signing + AAB | Signed AAB ready | Preview APK only verified | CODE / BUILD | **NOT TESTED** |
| PLAY-03 | Internal testing track | Testers install via Play | Not started | — | **NOT TESTED** |

### Area 15 — Payment and subscription readiness

| ID | Description | Expected | Actual verified result | Evidence | Status |
|---|---|---|---|---|---|
| PAY-01 | Payments disabled for pilot safety | No accidental live charges | `PAYMENT_ENABLED` defaults false in env schema; `.env.example` false | CODE | **PASS** (disabled) |
| PAY-02 | Subscription UI against live plans | Plans display; gated content correct | Mobile subscription screen exists; **not device-tested** | CODE only | **NOT TESTED** |
| PAY-03 | Real gateway / Play Billing | Compliant payment path | Razorpay code paths exist; Play Billing not audited; payments off | CODE | **BLOCKED** |
| PAY-04 | Failed/cancelled payment handling on device | Safe UX | Not tested | — | **NOT TESTED** |

---

## 6. Critical issues

1. **Five-parent pilot incomplete** — 0 of 5 parent devices have documented install + login + learning evidence.  
2. **Authentication and learning unproven on device** — launch PASS does not prove product pilot success.  
3. **versionCode 7 still dangerous if redistributed** — same crash on any Android phone.

## 7. High-priority issues

1. **targetSdk 34** — insufficient for upcoming Google Play submission policy path (API 36 timeline in checklist).  
2. **No production AAB / Play internal track evidence.**  
3. **Privacy / Families / Data safety** not verified.  
4. **Device lock & transfer** implemented in code/tests historically, but **not re-validated** on S24 in this audit.  
5. **Parent install UX** (MTP 0-byte copies) historically unreliable; cohort distribution process not proven.

## 8. Remaining production blockers (Play)

- Raise target SDK per current Expo + Play requirements and rebuild.  
- Produce and test **production AAB**.  
- Complete Play listing, Data safety, Families, privacy policy, reviewer credentials.  
- Enable and verify payments only under approved billing policy (`PAYMENT_ENABLED` + Play Billing review).  
- Complete regression on authentication, learning, progress, device lock on multiple devices.

## 9. Recommended next steps (no implementation in this audit)

1. Keep **only v8** in circulation (checksum above). Uninstall v7 everywhere.  
2. On S24: record timed smoke — parent login → child → lesson → game → rewards → logout (screenshots + notes).  
3. Repeat install+smoke on **four additional parent Android phones**; log model / Android version.  
4. Re-run device-lock and transfer scenarios on two phones.  
5. Only after (2)–(4) PASS: mark pilot ready.  
6. Separately plan Play: targetSdk bump, AAB, declarations, internal track.

---

## 10. Status roll-up (audit areas)

| # | Area | Status |
|---|---|---|
| 1 | Android build and APK verification | **PASS** (preview v8) / AAB **NOT TESTED** |
| 2 | Expo / RN startup & duplicate React | **PASS** (v8) |
| 3 | Installation and launch compatibility | **PASS** on 1× S24; multi-device **NOT TESTED** |
| 4 | Parent/student authentication | **NOT TESTED** (device) |
| 5 | Learning / vocab / audio / images | **NOT TESTED** (device) |
| 6 | Learning progress persistence | **NOT TESTED** |
| 7 | API connectivity / offline | API health **PASS**; offline **NOT TESTED** |
| 8 | One-device-per-student | Code **PASS**; device **NOT TESTED** |
| 9 | Authorized device transfer | Code **PASS**; device **NOT TESTED** |
| 10 | Parent account restrictions | Code design **PASS**; device **NOT TESTED** |
| 11 | Crash and error handling | Launch crash fix **PASS**; feature crashes **NOT TESTED** |
| 12 | Permissions / notifications | Declared perms **PASS**; runtime **NOT TESTED** |
| 13 | Privacy / Families readiness | **NOT TESTED** |
| 14 | Google Play target SDK | **FAIL** (34 vs Play path) |
| 15 | Payment / subscription readiness | Payments off **PASS**; live pay **BLOCKED** / UI **NOT TESTED** |

---

## 11. Separation statement

- **Code-inspection evidence** covers Metro React pinning, EAS env URLs, secure-store plugin, device/transfer/payment modules, permissions, targetSdk.  
- **Physical-device evidence** is limited to Galaxy S24: v7 crash logs, v8 adb install, cold-start process alive.  
- **No claim** is made that five parents completed pilot testing.

---

## 12. Final recommendation

### **NOT READY FOR PILOT**

Rationale: Five-parent pilot requires five verified devices plus authentication and learning smoke. Only **one** device has verified **launch** of v8.

### **NOT READY FOR PLAY** / **NOT READY FOR PLAY INTERNAL TESTING**

Rationale: No AAB internal-track evidence; targetSdk 34; privacy/Families declarations unverified; payments/Play Billing not ready.

### Allowed interim (informational, not a checklist PASS)

Single-device **sideload smoke** may continue using **only** v8 APK  
`SHA-256 1A884A5FB7A8990D6F1A211B73EFD7E208C12AB01CB2698A617F9820DD974827`  
after uninstalling any v7 build — pending approval to begin the documented S24 feature smoke and expand to five parents.

---

**Project owner:** Little Readers  
**Audit owner:** Development team  
**Primary Android test device:** Samsung Galaxy S24 (SM-S921B/DS)  
**Awaiting:** Approval before any fixes or further builds
