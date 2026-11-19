# Level-1 — VC27 Signed APK Build Report

**Date:** 2026-11-19  
**Objective:** Prepare a signed `versionCode 27` APK for Samsung SM-S921B acceptance testing  
**Result:** **STOPPED — no APK produced**

No Google Play upload, production deploy, DB/subscription/content changes, keystore creation, commit, or push were performed.

---

## 1. Source verification

| Check | Result |
|-------|--------|
| Worktree branch | `release/login-auth-only` @ **`122c627`** |
| Working tree | Clean of code WIP for this build attempt; untracked Level-1 docs/exports/tools only (not used as build input) |
| Login commit `122c627` present | **Yes** — `fix(auth): improve login reliability and Redis rate limiting` |
| Mobile `ACCOUNT_LOCKED` / `RATE_LIMITED` in `122c627` | **Yes** — `apps/mobile/services/auth-errors.ts` |
| Package ID at `122c627` | **`com.littlereaders.app`** |
| versionName / versionCode at `122c627` | **`1.0.0` / `27`** |
| Default API in `apps/mobile/services/api.ts` | **`https://api.siwiapp.shop/api`** (EAS preview/staging/production profiles match) |
| Parent of `122c627` | **`eb296fe`** — Level-2 Types of Nouns 3D pilot commit |
| Level-2 / pilot coupling in mobile tree | **Present** — e.g. `apps/mobile/services/pilot-3d.ts` imported by `emoji.ts` / `VocabVisual.tsx` |
| Pure vc27 bump commit `32972cd` (`release/android-play-api36`) | versionCode **27**, but **does not** contain login `ACCOUNT_LOCKED`/`RATE_LIMITED` mapping (old “signing too quickly” for all 429s) |

### Source STOP reason

Requirements conflict:

1. Must include approved login fixes from **`122c627`**, and  
2. Must **not** include unrelated WIP / Level-2 changes.

`122c627` is stacked on Level-2 tip `eb296fe`, so building that tree ships Level-2-related mobile code paths.  
`32972cd` is versionCode 27 without the login-fix mobile mapping.

**No isolated approved commit satisfies both constraints.** APK build was **not** started.

---

## 2. Signing verification

| Item | Result |
|------|--------|
| Configured Gradle props (`~/.gradle/gradle.properties`) | `LW_UPLOAD_STORE_FILE` → **`upload-new.jks`** |
| `upload-new.jks` cert SHA-256 | `F0:23:47:E9:…:3D:56` |
| Approved VC26 APK / VC27 AAB cert SHA-256 | `6D:28:3C:94:…:70:7A` |
| Match (default Gradle keystore vs approved) | **NO** |
| Approved-matching keystore found | **`~/.lr-keystore/release.jks`** (alias present; cert SHA-256 **matches** VC26/VC27) |
| Matching public cert file | `~/.lr-keystore/upload_certificate.pem` (same SHA-256) |
| New keystore created | **No** |
| Signing config files modified | **No** |
| Keystore passwords / private keys printed | **No** |

### Signing STOP reason (for any build using current Gradle defaults)

Default `LW_UPLOAD_*` points at **`upload-new.jks`**, which is **not** the approved Play/upload identity used by VC26 APK and VC27 AAB.  
An APK signed with that key would fail upgrade install over the device’s VC26 app (signature mismatch). Android signature checks must not be bypassed.

Approved identity exists as **`release.jks`**, but using it requires an **explicit one-build override** (or updating Gradle props) — **not done** without source clearance + approval, and not done by editing signing configuration in this task.

---

## 3. Build result

| Step | Result |
|------|--------|
| Signed release APK build | **Not executed** |
| New AAB | **Not created** |
| Play upload | **Not performed** |

---

## 4. APK validation

| Check | Result |
|-------|--------|
| APK file exists | **N/A** — not built |
| Package / versionCode / signature / cert / installability / non-debug / API | **N/A** |

Reference artifacts already on disk (not produced this session):

| Artifact | Notes |
|----------|--------|
| `LearnWise-release-v26/LearnWise-v26.apk` | Signed; cert `6D28…`; versionCode **26** |
| `LearnWise-release-v27/LearnWise-1.0.0-vc27.aab` | Signed; same cert; **AAB only** — not sideloadable as APK without signed `bundletool` output |

---

## 5. Installation preparation (for when an approved APK exists)

**Do not auto-uninstall or clear app data.**

Safe upgrade (after review approval):

```text
adb install -r path\to\LearnWise-1.0.0-vc27-signed.apk
```

If Android reports version downgrade or **signatures do not match**, **STOP**. Do not use `adb install -d` or resign/bypass.

Device under test: Samsung SM-S921B, Android 17, currently on versionCode **26**.

---

## 6. Evidence summary (this report)

| Field | Value |
|-------|--------|
| Source commit evaluated | `122c627` (login fixes) vs `32972cd` (vc27 bump without login mapping) |
| Package ID (source) | `com.littlereaders.app` |
| Version name / versionCode (source) | `1.0.0` / `27` |
| APK path | **Not created** |
| APK SHA256 | **N/A** |
| Signing verification | Default Gradle keystore **mismatch**; `release.jks` **matches** approved cert |
| Certificate comparison | Approved `6D28…` vs `upload-new` `F023…` |
| API environment | Intended production API `https://api.siwiapp.shop/api` in source |
| Build result | **STOPPED** |

---

## 7. Approval needed before retry

1. **Source recipe approval** — choose one:  
   - **A)** Build from `122c627` accepting Level-2 mobile coupling already in that tip, **or**  
   - **B)** Approve a **login-only mobile patch** on top of `32972cd` / Play vc27 baseline (isolated worktree; no Level-2 content), **or**  
   - **C)** Other owner-specified commit that is both login-fixed and Level-2-free.  
2. **Signing override approval** — allow one build using `release.jks` (approved cert) via Gradle `-P` overrides **without** editing repo signing config / without switching to `upload-new.jks`.  
3. Then re-run: build → validate → report → **wait again** before device install.

---

## Sign-off

| Role | Outcome |
|------|---------|
| Build agent | **STOP — APK not prepared** |
| Owner review | Pending source + signing override decisions |

**Stopped for review. No APK install attempted.**
