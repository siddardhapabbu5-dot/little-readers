# Level-1 — Android BLOCKED Test Unblock Plan

**Date:** 2026-11-19  
**Status:** **PLAN ONLY — awaiting approval**  
**Depends on:** `LEVEL1_STAGING_ENVIRONMENT_PLAN.md`  
**Current counts:** **23 PASS / 0 FAIL / 10 BLOCKED**  
**Blocked IDs:** AD-06, AD-07, AD-13, AD-14, AD-19, AD-23, AD-28, AD-30, AD-32, AD-33  

**Do not create accounts, build/install APKs, revoke prod sessions, or run lockout against the owner account until this plan is approved.**

---

## 1. Mapping: blocked case → safe method

| ID | Need | Safe environment | Proposed method | Forbidden |
|----|------|------------------|-----------------|-----------|
| **AD-06** | Lockout vs rate-limit copy | Staging API + test parent | Wrong-password loop on **dedicated staging parent** until distinct `ACCOUNT_LOCKED` / `RATE_LIMITED` UI | Owner prod lockout |
| **AD-07** | Logout / login again | Staging test parent | In-app logout → login with staging credentials (tester-held; not logged in reports) | Capturing owner password/OTP |
| **AD-13** | Open Spell | Staging Grade-1 child + entitlement | Learn → category → Spell; screenshot round start | Prod owner account (optional later only if owner drives manually) |
| **AD-14** | Open Match/Quiz | Same | Learn → Match and Quiz; no crash screenshots | Same |
| **AD-19** | Mute then raise | Staging Listen | `cmd media_session volume` STREAM_MUSIC 0 → play TTS → raise → play; note audible | N/A |
| **AD-23** | Kill / relaunch / same child progress | Authenticated staging child | Note progress → `am force-stop` → relaunch → same child progress visible | `pm clear` |
| **AD-28** | Offline + open Learn | Authenticated Learn | `svc wifi disable` + `svc data disable` → open Learn → honest offline → restore | Leaving device offline |
| **AD-30** | Slow network | Staging + approved throttle | See §4.2 (mitmproxy / Clumsy / approved proxy) | Root-only improvisation; throttling prod owner traffic without consent |
| **AD-32** | Forced session invalid | Staging only | Admin revoke device session **or** password reset on staging parent → app shows clean login / `SESSION_REVOKED` path | Prod session revoke; app-data clear |
| **AD-33** | TTS unavailable / muted | Staging Listen | Mute music stream / disable TTS engine if available → Listen continues, no crash | N/A |

Original AD-01…AD-33 definitions in `LEVEL1_ANDROID_DEVICE_ACCEPTANCE.md` remain unchanged.

---

## 2. Phase 2 — Test account preparation plan (no creation yet)

### 2.1 Intended fixtures (local DB only)

| Fixture | Plan value (illustrative — finalize at creation time) |
|---------|------------------------------------------------------|
| Parent email | e.g. `qa.android.ad@test.local` (non-prod TLD) |
| Parent role | `PARENT` |
| Password | Generated; stored only in tester secret store; **never** in git/docs/chat |
| Child | Display name e.g. `AD Child G1`; level **LEVEL_1** |
| Entitlement | Active LEVEL_1 seat/subscription on **local** DB only |
| Device | Register learning device on staging as required by product rules |

### 2.2 Creation approach (after approval)

1. Isolation gate on `DATABASE_URL` (`localhost:5437` only).  
2. Prefer **additive** Prisma/script fixtures (pattern: prior `qa_*@test.local` admin acceptance; `server/scripts/staging-create-test-user.mjs` creates PARENT only — extend carefully for child + seat).  
3. Reuse seed curriculum / published Grade-1 categories already on local DB where possible (`npm run db:seed` only if local DB empty and approved).  
4. Grant LEVEL_1 seat via existing local admin/subscription helpers used in payment/admin staging — **not** production admin.  
5. Record masked email in evidence docs (`qa.***@test.local`); never record password/OTP.

### 2.3 Safe password reset procedure (staging)

| Step | Action |
|------|--------|
| 1 | Ensure `PASSWORD_RESET_LOG_ONLY=true` and/or `OTP_DEV_MODE=1` on local API |
| 2 | Trigger forgot-password from staging APK or API against **staging parent only** |
| 3 | Read token/OTP from **local server console / logs** (not production email) |
| 4 | Complete reset; confirm old staging sessions fail (`passwordChangedAt` / JWT revoke behavior) |
| 5 | Update tester secret store; do not paste secrets into reports |

### 2.4 Controlled session revocation (staging) — for AD-32

Pick **one** approved method at execution time:

| Option | Mechanism | Notes |
|--------|-----------|-------|
| **A (preferred)** | Admin routes `…/device-sessions/:sessionId/revoke` or revoke-all on **local** admin | `admin-parent-sessions.routes.ts` |
| **B** | Login same staging parent on a second client → single-device policy revokes prior | If enabled in staging |
| **C** | Password reset (§2.3) → prior access tokens revoked | Also exercises reset |

**Never** call revoke APIs against production parent IDs.

---

## 3. Phase 3 — Testing tools (safe methods)

### 3.1 Login lockout / rate-limit (AD-06)

- Target: staging parent email only.  
- Action: repeated wrong password from staging APK until UI shows distinct copy for `ACCOUNT_LOCKED` vs `RATE_LIMITED` (VC27+ strings in `auth-errors.ts`).  
- Redis (`REDIS_URL`) should be up so counters behave as in multi-instance staging tests.  
- After test: clear lockout on **staging user only** (wait TTL or local Redis key delete / DB attempt reset — document exact command at execution).  
- Evidence: screenshots of each distinct message.

### 3.2 Slow-network simulation (AD-30)

**Approved candidates (choose one at approval):**

| Method | How | Pros | Cons |
|--------|-----|------|------|
| **mitmproxy / Charles** on PC | Phone Wi‑Fi proxy → throttle profile | Accurate HTTP delay | Needs user cert install on phone (owner consent) |
| **Clumsy** (Windows) | Lag/throttle NIC while phone uses PC hotspot | No phone root | Affects all hotspot traffic |
| **Waiver** | Document inability | No device change | Case stays BLOCKED / ACCEPTED RISK |

**Not planned without extra approval:** root `tc` on phone; changing production CDN.

### 3.3 Offline / API failure (AD-28; supports AD-31 already PASS)

```powershell
adb shell svc wifi disable
adb shell svc data disable
# open Learn on staging session → capture offline UI
adb shell svc wifi enable
adb shell svc data enable
```

Airplane-mode broadcast from `adb` may be denied on Samsung (observed `SecurityException`); prefer `svc wifi/data`.

### 3.4 Session revocation (AD-32)

See §2.4. Evidence: mid-Learn or parent screen → revoke → clean Welcome Back / revoked message → no crash.

### 3.5 Authenticated learning (AD-13, 14, 19, 23, 33)

1. Login staging parent on staging APK.  
2. Select Grade-1 child with seat.  
3. Open published category (e.g. Fruits).  
4. Spell / Match / Quiz entry screenshots.  
5. Listen + volume mute/unmute for AD-19/33.  
6. AD-23: force-stop/relaunch without `pm clear`; confirm progress.

Volume helpers:

```powershell
adb shell cmd media_session volume --stream 3 --set 0
adb shell cmd media_session volume --stream 3 --set 15
```

---

## 4. Execution order (after environment + accounts approved)

1. Isolation check + start staging API (env plan).  
2. Create staging parent/child/entitlement (this plan §2).  
3. Build + verify staging APK URL (env plan).  
4. Install staging APK on SM-S921B (approval).  
5. Run **AD-07** (login cycle) → **AD-13/14** → **AD-19/33** → **AD-23** → **AD-28** → **AD-06** (lockout last on that account) → **AD-32** → **AD-30** (if tool approved).  
6. Update `LEVEL1_ANDROID_DEVICE_ACCEPTANCE.md`, defect register, execution report.  
7. Restore prod VC27 APK if desired; leave staging DB fixtures or clean with approved cleanup script.

---

## 5. Evidence standard

For each unblocked ID:

- Screenshot PNG under `exports/android-device-acceptance-YYYY-MM-DD/`  
- UI dump optional  
- Result **PASS** / **FAIL** only if executed; else remain **BLOCKED** with reason  
- Never mark untested PASS  

---

## 6. Risks and rollback

| Risk | Rollback |
|------|----------|
| Lockout leaves staging parent unusable | Wait TTL / clear staging Redis / reset attempts on local user only |
| Staging APK left on phone | `adb install -r` prod VC27 APK |
| Local DB polluted | Delete `qa.android.*` fixtures only; do not drop unrelated seed data without approval |
| Proxy cert left on phone | Owner removes user CA after AD-30 |
| Accidental prod API | Pre-install bundle audit for `api.siwiapp.shop` |

---

## 7. What is explicitly out of scope until separate approval

- Building or installing any APK  
- Creating the staging parent/child  
- Owner production re-auth by the agent  
- Production session revoke or subscription changes  
- Commit / push / deploy  
- Changing EAS `staging` profile in repo (optional follow-up: point `staging` at LAN — code change needs approval)

---

## 8. Approval checklist (Phases 2–3)

- [ ] Approve fixture email pattern + LEVEL_1 entitlement seeding on **local** DB only  
- [ ] Approve password-reset-via-console procedure  
- [ ] Approve AD-32 revoke option A/B/C  
- [ ] Approve AD-30 tool (mitmproxy / Clumsy / waive)  
- [ ] Approve execution order §4  
- [ ] Confirm agent will never receive owner production passwords/OTPs  

**Stop — report ready for review. No accounts created. No APK built.**
