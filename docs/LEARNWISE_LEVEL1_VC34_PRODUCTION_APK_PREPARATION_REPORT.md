# Learn Wise — Level 1 VC34 Production APK Preparation Report

**Date:** 2026-11-20  
**Purpose:** Production Android APK including the unique Parent PIN → subscription → verified-payment flow wiring and progress labels  
**References:**  
- `docs/LEARNWISE_PARENT_SUBSCRIPTION_UNIQUE_FLOW_WIRING_REPORT.md`  
- `docs/LEARNWISE_PARENT_PIN_SUBSCRIPTION_UNIQUE_FLOW_REPORT.md`  
**Google Play / install / distribute:** **Not performed** — awaiting approval  

**Final assessment:** **PASS** (focused tests + build + APK verification)

---

## 1. Source included

| Item | In VC34? |
|------|----------|
| `/subscription-entry` after Profile/Parent Subscription | **Yes** |
| Parent PIN gate then setup-complete branch | **Yes** |
| Incomplete → Grade → Learning Phone → `/subscription?setup=1` | **Yes** |
| Complete/renewal → `/subscription` → agreements → pay → receipt | **Yes** |
| Progress labels (Parent PIN … Payment Method) | **Yes** |
| Student safe Subscription (no PIN / no pay) | **Yes** |
| VC33 Subscription + Profile auth fixes | **Yes** (retained) |

**Held out of APK:** `admin-create-student.tsx` (Admin Direct) → `exports/_prod_apk_holdout_vc34/` during build, then restored.

---

## 2. Focused test results (pre-build)

| Suite | Result |
|-------|--------|
| `apps/mobile/services/subscription-entry.test.ts` | **PASS** |
| `apps/mobile/services/avatar-auth.test.ts` | **PASS** |
| `server/tests/parent-gate-pin.test.ts` | **2/2 PASS** |
| Physical Samsung S24 install/QA | **Not claimed** |

---

## 3. Build result

| Item | Value |
|------|--------|
| Command | `gradlew.bat assembleRelease` + `-PLW_UPLOAD_*` from `~/.lr-keystore/signing.properties` |
| Env | `EXPO_PUBLIC_API_URL=https://api.siwiapp.shop/api`, `EXPO_PUBLIC_ENABLE_DEMO=0` |
| Gradle | **BUILD SUCCESSFUL** in ~1m 54s |

---

## 4. APK path and size

| Item | Path |
|------|------|
| **VC34 APK** | `exports/android-production-apk-level1-vc34-2026-11-20/LearnWise-1.0.0-vc34-level1-production-https.apk` |
| Size | 111,633,756 bytes (~106.46 MB) |
| SHA-256 file | `exports/android-production-apk-level1-vc34-2026-11-20/SHA256.txt` |

---

## 5. Package and version

| Field | Value |
|-------|--------|
| Package ID | `com.littlereaders.app` |
| Label | Learn Wise |
| versionName | `1.0.0` |
| **versionCode** | **34** |

---

## 6. Production API and HTTPS

| Check | Result |
|-------|--------|
| Bundle `https://api.siwiapp.shop/api` | **1** |
| LAN `192.168.1.20:4100` | **0** |
| `localhost:4100` | **0** |
| `usesCleartextTraffic` | **false** (`0x0`) |

---

## 7. Signing certificate

| Field | Value |
|-------|--------|
| Cert SHA-256 | `6d283c941deb3a2823ea1c11d9dd5c2e7b8ba9e044dbaf0de00e878c32e2707a` |
| Lineage match | **PASS** |

---

## 8. APK SHA-256

`84EAAC4DEA0AA15F1039CE628A4C90F6FD76C923491784161EE5F43DEF409266`

---

## 9. VC29–VC33 unchanged

| Artifact | Unchanged? |
|----------|------------|
| VC29–VC33 SHA-256 vs pre-build snapshots | **Yes** |
| Overwritten? | **No** — new folder only |

---

## 10. Bundle feature evidence (VC34)

| Feature | Count |
|---------|-------|
| `subscription-entry` | **1** |
| `Parent PIN` | **1** |
| `Choose a Plan` | **1** |
| Ask your parent to manage your subscription | **1** |
| `direct-children` (Admin Direct) | **0** |

---

## 11. Failures / limitations

| Item | Notes |
|------|--------|
| On-device install | **Not performed** |
| Production payment | **Not performed** |
| Backend deploy | **Not performed** |
| Commit / push | **Not performed** |

---

## 12. Local worktree after build

Restored:

- `versionCode` **28** (`app.json` + `build.gradle`)
- `usesCleartextTraffic` **true**
- `admin-create-student.tsx` restored  
- Holdout under `exports/_prod_apk_holdout_vc34/`

---

## 13. Stop / approval gate

**Stopped before installation.**

Awaiting explicit approval before `adb install -r` of VC34 on Samsung S24.
