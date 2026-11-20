# Learn Wise — Level 1 Production APK Preparation Report

**Date:** 2026-11-20  
**Purpose:** Internal-distribution production-configured Android APK (Level 1 only)  
**Google Play:** **Out of scope** — not uploaded  
**Physical install / deploy:** **Not performed** — awaiting explicit approval  

**Final assessment:** **PASS** (build + configuration verification)

---

## 1. APK location

| Item | Path |
|------|------|
| **Production APK** | `exports/android-production-apk-level1-vc29-2026-11-20/LearnWise-1.0.0-vc29-level1-production-https.apk` |
| Size | 111,599,352 bytes (**106.43 MB**) |
| SHA-256 | `1F0322AEF19DBD3DB189B34D8D3770E9ED479D4D08000E7813EB1BA8A5944283` |

### Staging APK preserved (not overwritten)

| Item | Path |
|------|------|
| Staging LAN APK | `exports/android-complete-staging-apk-2026-11-20/LearnWise-1.0.0-vc28-complete-staging-lan.apk` |
| Size | 111,610,880 bytes (unchanged timestamp 2026-11-20 13:52:27) |

---

## 2. Build version and versionCode

| Field | Value |
|-------|--------|
| versionName | `1.0.0` |
| **versionCode** | **29** (chosen to avoid conflict with staging VC28) |
| Application label | Learn Wise |
| Branch | `feature/student-id-login` |
| Reference commit | `a4377fc` |
| Gradle | `assembleRelease` **BUILD SUCCESSFUL** (~2 min after JS bundle) |

---

## 3. Package ID

`com.littlereaders.app` — unchanged.

---

## 4. Signing verification

| Field | Value |
|-------|--------|
| Keystore | `~/.lr-keystore/release.jks` (via `signing.properties` / `-PLW_UPLOAD_*`) |
| `apksigner verify` | Verified |
| Cert SHA-256 | `6d283c941deb3a2823ea1c11d9dd5c2e7b8ba9e044dbaf0de00e878c32e2707a` |
| Lineage | Same as VC27 / VC28 staging (upgrade-compatible signing) |

---

## 5. Production API verification

| Check | Result |
|-------|--------|
| Build-time `EXPO_PUBLIC_API_URL` | `https://api.siwiapp.shop/api` |
| Web URLs | `https://siwiapp.shop` |
| JS bundle `https://api.siwiapp.shop/api` hits | **1** (active) |
| JS bundle LAN `192.168.1.20:4100` | **0** |
| JS bundle `localhost:4100` | **0** |
| Demo flag | `EXPO_PUBLIC_ENABLE_DEMO=0` |
| Secrets in bundle (`rzp_live_`, private keys) | **0** |

Base path matches existing app convention: **`/api`** → full base `https://api.siwiapp.shop/api`.

---

## 6. Cleartext verification

| Check | Result |
|-------|--------|
| APK `usesCleartextTraffic` | **false** (`0x0` in binary manifest) |
| `LR_ALLOW_CLEARTEXT` during build | **Unset** |

---

## 7. Configuration differences from staging

| Aspect | Staging VC28 APK | Production VC29 APK (this build) |
|--------|------------------|----------------------------------|
| File | `…vc28-complete-staging-lan.apk` | `…vc29-level1-production-https.apk` |
| versionCode | 28 | **29** |
| API | `http://192.168.1.20:4100/api` | **`https://api.siwiapp.shop/api`** |
| Cleartext | true | **false** |
| Admin Direct UI (`admin-create-student`) | Present in staging tree/APK era | **Excluded** from this APK |
| `direct-children` in bundle | Present (staging feature APK) | **0** |
| Student / Parent / Admin login | Present | **Present** (`student/auth/login` in bundle) |
| Signing cert | Same SHA-256 | Same SHA-256 |

Local worktree after build: Admin Direct screen + admin tile **restored**; `versionCode` source restored to **28**; staging cleartext restored to **true** for continued LAN work. Stash `stash@{0}` preserved. No commit/push.

---

## 8. Release scope notes

| Topic | Status |
|-------|--------|
| Grade 1 / Level 1 only | Intended; no G2–4 activation performed |
| Admin Direct | **Not included** in this APK; production route remains 404 |
| Student / Parent / Admin login | Preserved (no OTP forced; no options removed) |
| Production DB | **Not modified** |
| Play Store | **Not uploaded** |
| Device install | **Not performed** |

### Access control (read-only; no DB mutation)

| Check | Result |
|-------|--------|
| Production API health | 200 OK |
| Grade 1 media sample | 200 |
| Admin Direct on production | 404 (out of this APK) |
| Live Parent/Student G1 vs G2–4 entitlement matrix on device | **Deferred** to post-approval install testing (no production credentials exercised / no entitlement writes) |

Prior production acceptance + VC27 device evidence remain the baseline for Grade-1 entitlement behavior; this task did not re-mutate or re-prove live seats.

---

## 9. Outstanding issues

| ID | Issue | Severity |
|----|-------|----------|
| O1 | Device install / smoke against production **not done** (awaiting approval) | Process gate |
| O2 | Live G2–4 HOLD entitlement confirmation on a production account **not re-run** in this task | Should confirm at install QA |
| O3 | TTS Listen disclosure client sign-off still pending (product/comms) | Non-APK |
| O4 | Admin Direct remains local/staging-only — do not market as live | Expected |

---

## 10. Final PASS / FAIL

### **PASS**

Production-configured internal APK generated and verified:

- Package `com.littlereaders.app`
- versionName `1.0.0` / versionCode **29**
- Signed with release keystore (VC27 lineage)
- HTTPS production API only (no LAN / no cleartext)
- Admin Direct excluded from APK
- Staging VC28 APK preserved

---

## 11. Stop / approval gate

**Stopped.**  

Awaiting **explicit approval** before:

1. Physical device installation  
2. Internal distribution to testers  
3. Any production server deployment or Play upload (Play remains out of scope unless separately approved)
