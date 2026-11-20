# Learn Wise — Grade 1 / Level 01 GitHub & Controlled Production Release Report

**Date:** 2026-11-20  
**Objective:** Controlled production launch to five pilot families (Android APK distribution — **not** Google Play)  
**Branch:** `feature/student-id-login` @ `a4377fc`  
**Remote:** `origin` → `https://github.com/siddardhapabbu5-dot/little-readers.git`  
**Upstream:** `origin/feature/student-id-login` (up to date before this run)  
**Stash:** `stash@{0}` **preserved / untouched**  
**Mode:** Protect → verify → STOP unsafe GitHub source release → continue QA where possible → report  

**This document does not authorize APK distribution.**

---

## Final recommendation: **NOT READY** for five-family pilot

| Gate | Result |
|------|--------|
| Safe Grade 1 **source** GitHub allowlist | **NOT established** — Phase 4 **STOP** (no commit, no push) |
| Docs-only set (prior review) | Previously **READY FOR OPERATOR APPROVAL** — **not committed** this run (source release set failed STOP rule) |
| VC29 physical login / learning QA | **BLOCKED** |
| Admin creates Student ID on production | **BLOCKED** (Admin Direct **excluded**; production `direct-children` → **404**) |
| Final APK rebuild (Phase 6) | **Skipped** (QA blockers unresolved) |
| Five-family distribution | **Not started** — awaiting explicit approval after READY |

---

## 1. GitHub branch and commit

| Item | Value |
|------|--------|
| Current branch | `feature/student-id-login` (**unchanged**) |
| HEAD commit | `a4377fcaa0bac165bb31bfb72306f2cdbe639ccb` (`a4377fc`) |
| New commit this run | **None** |
| Push this run | **None** |
| Force push | **Not used** |
| Staging area | **Empty** throughout |
| Working tree | Dirty — **17** modified tracked · **~991** untracked (preserved) |

### Phase 1 — Protect (confirmed)

- No `git clean` / `reset` / `checkout` discarding work  
- No stash drop/apply  
- No force push  
- Secrets, keystores, APKs, AABs, batch-d1 media, backups, probes **not** staged  

---

## 2. Exact files committed and pushed

**Committed:** *(none)*  
**Pushed:** *(none)*  

### Why Phase 4 STOP’d (exact safe release set not established)

A production-grade **source** allowlist could not be formed without violating release rules or shipping unsafe config:

1. **Category F unresolved** — `app.json` (versionCode **28**), `admin.tsx` (Admin Direct tile → `/admin-create-student`), `env.ts` (Admin Direct + shared OTP defaults), `app.ts` (staging `/media/vocab` mount), `admin-users.service.ts` (imports `admin-direct-sponsor`), OTP service + migration.  
2. **Admin Direct entanglement** — Student-auth router includes `/admin/direct-children`; Admin UI tile points at excluded screen; `admin-users.service` depends on `admin-direct-sponsor.ts` (**Category E — exclude**). Cannot commit B server stack cleanly without E or without surgical edits (edits not authorized as “blind production config copy”).  
3. **Config mismatch vs VC29 APK** — local `versionCode` 28 / `build.gradle` 28 / main manifest `usesCleartextTraffic=true` vs VC29 **29** / cleartext **false**. Committing local tree as “production release source” would **misrepresent** the shipped APK.  
4. **Backend deploy forbidden** — Category B server + migrations require production migrate/deploy to affect live Student ID auth; this run forbids backend deploy / DB changes. Pushing server source alone does not complete a controlled production Student-ID backend release.  
5. **Prior docs-only set** was operator-review **READY**, but this release order required an approved **Grade 1 release source** set. Per instruction: *If the exact safe release set cannot be established, STOP*.

**Not included (correctly):** `.env`, `_stage2_secrets_*`, keystores, `*.apk`/`*.aab`, `batch-d1` media, `exports/**` probes/backups, Admin Direct UI/docs (E).

### Allowlist that *would* be reconsidered only after operator decisions

| Tier | Paths | Blocker to include now |
|------|-------|------------------------|
| Docs (prior review) | 6 Level-1 / preflight / manifest docs | Optional separate docs-only commit — not executed under STOP |
| Client A (partial) | `login.tsx`, `api.ts`, `auth-errors*`, hero | Needs version/cleartext story; login depends on Student routes |
| Client B | `student-login.tsx`, `student-change-password.tsx` | OK as client-only **if** backend already live; still not a full “release source” |
| Server B | student-auth (minus Admin Direct), middleware, credentials migration, related mods | Needs F resolution + **explicit** migrate/deploy approval |
| **Never for G1** | `admin-create-student.tsx`, `admin-direct-sponsor.ts`, Admin Direct docs, Category D | Excluded by product rule |

---

## 3. Configuration findings

| Setting | Local worktree (now) | VC29 APK (shipped) | Correct production release config |
|---------|----------------------|--------------------|-----------------------------------|
| versionCode | **28** (`app.json` + `build.gradle`) | **29** | Next production assemble must bump intentionally (≥29); **do not** claim tree = VC29 |
| Cleartext | `apps/mobile/android/app/src/main/AndroidManifest.xml` → **true** (staging LAN restore) | **false** | Production APK must keep cleartext **false**; keep local true only for staging LAN work — **do not** blindly overwrite staging workflow |
| API | `api.ts` fallback production HTTPS | Baked `https://api.siwiapp.shop/api` | Production builds: `EXPO_PUBLIC_API_URL=https://api.siwiapp.shop/api` |
| Admin Direct | Source + admin tile **present** | **Excluded** from APK; prod API **404** | Remain **excluded** from G1 pilot APK and from G1 GitHub source until separate approval |
| `app.ts` `/media/vocab` | Staging static mount added | N/A (client APK) | Useful for **local/staging** image serve; review before any **server** production deploy — not required for APK-only pilot |
| Package ID | `com.littlereaders.app` | Same | Unchanged |
| Signing | Local keystore path outside repo | Cert SHA-256 `6d283c94…e2707a` | Keep approved lineage; never commit keystore |

**Decision:** Treat **VC29 binary** as the production client artifact for this pilot. Treat local tree as **dirty staging/dev** until F items and Admin Direct separation are operator-resolved. **Do not** copy APK settings into source blindly (would break staging LAN) and **do not** commit staging cleartext as production truth.

---

## 4. VC29 QA results (Phase 5)

**Device:** Samsung Galaxy S24 · SM-S921B · serial present (see prior QA report) · adb connected  
**Installed:** `com.littlereaders.app` · versionName `1.0.0` · **versionCode 29**  
**API health:** `GET https://api.siwiapp.shop/api/health` → **ok**  
**Admin Direct on production:** `POST .../student/auth/admin/direct-children` → **404**

| # | Test | Result |
|---|------|--------|
| — | Prior: Install VC29 | **PASS** (retained) |
| — | Prior: Launch / no crash | **PASS** (retained) |
| — | Prior: Student / Parent / Admin tabs | **PASS** (retained) |
| 1 | Admin login + dashboard (on-device) | **BLOCKED** — no operator-confirmed login; RN inputs not fillable via adb; no approved credentials used |
| 2 | Admin creates test Student ID + password | **BLOCKED** — Admin Direct **out of scope**; production create-direct **404**; no approved alternate production create path exercised; no DB writes |
| 3 | Student ID login (on-device) | **BLOCKED** — no approved production Student test account |
| 4 | Parent Email + Password login (on-device) | **BLOCKED** — no approved production Parent test account (staging demo previously 401 on prod — not reused) |
| 5 | Grade 1 access | **BLOCKED** — requires authenticated entitled session |
| 6 | Learn → Speak → Understand → Play → Complete | **BLOCKED** |
| 7 | Image and audio playback (in-app) | **BLOCKED** (CDN samples elsewhere ≠ this session journey) |
| 8 | Progress save / resume | **BLOCKED** |
| 9 | Grade 1 subscription/access restrictions | **BLOCKED** |
| 10 | Grades 2–4 HOLD (on-device) | **BLOCKED** — no entitled session; **not activated** this run |
| 11 | Stability / network recovery | **BLOCKED** |

**This-run UI re-check:** App brought to foreground; UI dump shows **Student / Parent / Admin** tabs and Parent email/password login chrome (`exports/vc29-physical-qa/31-release-attempt-ui.xml`). Incomplete tests marked **BLOCKED**, not PASS.

**Credentials policy honored:** No invented credentials · no staging credentials against production · no passwords/tokens printed.

---

## 5. Student account creation result

| Path | Result |
|------|--------|
| Admin Direct (mobile UI / API) | **Excluded** from this release · production API **404** |
| Shared-email OTP admin create | **Not tested** · tied to Category F · would need approved prod Admin session + mailbox — **BLOCKED** |
| Create under existing sponsor parent | **Not tested** · requires approved Admin session + existing parent — **BLOCKED** |
| Production DB student row created this run | **No** (forbidden / not done) |

**Result:** **No** new production Student ID created in this release run.

---

## 6. Grade 1 learning result

**BLOCKED** — no on-device Parent/Student session on VC29; journey not evidenced on this APK.

Listen = TTS (not recorded MP3 library) · Speak = manual “I said it!” — product honesty unchanged; **not** claimed PASS for VC29 session.

---

## 7. Grades 2–4 HOLD verification

| Check | Result |
|-------|--------|
| This run activated G2–G4 | **No** |
| On-device HOLD enforcement on VC29 | **BLOCKED** (no session) |
| Production content catalog may still contain L2–L4 data | Known from prior audits — HOLD is entitlement/policy; **unverified on VC29 UI** |

---

## 8. Final APK details and checksum

Phase 6 rebuild **not performed** (QA blockers unresolved; instruction: only after approved source reviewed **and** release QA blockers resolved).

**Existing VC29 APK retained (not overwritten / not deleted):**

| Field | Value |
|-------|--------|
| Path | `exports/android-production-apk-level1-vc29-2026-11-20/LearnWise-1.0.0-vc29-level1-production-https.apk` |
| Size | 111,599,352 bytes (~106.43 MB) |
| SHA-256 | `1F0322AEF19DBD3DB189B34D8D3770E9ED479D4D08000E7813EB1BA8A5944283` |
| versionCode / versionName | **29** / `1.0.0` |
| Package | `com.littlereaders.app` |
| API | `https://api.siwiapp.shop/api` |
| Cleartext | Disabled in APK |
| Signing cert SHA-256 | `6d283c941deb3a2823ea1c11d9dd5c2e7b8ba9e044dbaf0de00e878c32e2707a` |
| Admin Direct in APK | Excluded (prior prep) |
| Device install/launch | Still installed VC29; launch/UI tabs reconfirmed |

---

## 9. Remaining blockers

1. **No approved production Admin / Parent / Student test accounts** for on-device QA (or operator confirmation after manual Admin login).  
2. **Admin Student creation path for pilot** undefined without Admin Direct — need approved production process (e.g. existing parent-linked create) **without** enabling Direct.  
3. **Category F + Admin Direct separation** before any Grade 1 **source** GitHub commit.  
4. **Local vs VC29 config drift** (versionCode / cleartext) — document rebuild recipe before claiming source matches APK.  
5. **Backend migrate/deploy** still out of scope — Student ID server changes not production-applied by this run.  
6. **On-device Grade 1 learning + HOLD + stability** not evidenced on VC29.  
7. **TTS disclosure** client sign-off still pending (prior readiness).  
8. GitHub **docs-only** commit still available as a separate, previously reviewed option — not executed under this STOP.

---

## 10. Phase 7 — Five-family pilot instructions (DRAFT — do not distribute)

**Status:** Prepared for operator review only. **Do not send to families** until recommendation flips to READY and operator explicitly approves distribution.

### A. Install (Android APK)

1. Receive the **approved** Learn Wise APK file from the operator (VC29 or a later approved build).  
2. On the child’s Android phone: allow install from the delivery channel the operator specifies.  
3. Install **Learn Wise** (`com.littlereaders.app`).  
4. Open the app — you should see **Student / Parent / Admin** options.  
5. Use **Wi‑Fi or mobile data** (app talks to `https://api.siwiapp.shop`).

### B. Parent login

1. Tap **Parent**.  
2. Enter the Parent **email** and **password** issued by Learn Wise support for your family.  
3. Tap **Log In**.  
4. Confirm your child / Grade 1 access appears as instructed by support.

### C. Student ID + password

1. Tap **Student**.  
2. Enter the child’s **Student ID** and **password** provided by Learn Wise (or Parent after account setup).  
3. If asked to change password on first login, set a new password the parent supervises.  
4. Do not share Student passwords outside the family.

### D. Parent supervision

- Young learners should use the app with a parent nearby for the pilot.  
- Parents manage accounts, subscriptions, and support contact.  
- Do not attempt Admin features unless you are Learn Wise staff.

### E. Grade 1 learning

1. Open Grade 1 / Level 1 content only.  
2. Typical loop: **Learn → Speak → Understand → Play → Complete**.  
3. **Listen** uses on-device speech (TTS), not a separate recorded MP3 library.  
4. **Speak** uses the in-app “I said it!” confirmation (not automatic speech grading).  
5. Grades 2–4 are **on HOLD** for this pilot — do not expect those grades to unlock.

### F. Support

- Contact the Learn Wise pilot operator / support email provided in the family welcome note.  
- Include: device model, app version (Settings/About if available), Student ID **without** password, and a short description of the issue.

---

## Strict restrictions honored

| Restriction | Honored |
|-------------|---------|
| No Google Play upload | YES |
| No backend deployment | YES |
| No production DB modifications | YES |
| No content publication changes | YES |
| No Grade 2–4 activation | YES |
| No subscription changes | YES |
| No public / family distribution | YES |
| No unapproved production changes | YES |
| No force push / reset / clean / stash drop | YES |

---

## Recommendation

### **NOT READY** for five-family pilot

**Next operator actions (suggested):**

1. Approve **docs-only** GitHub commit (6 reviewed files) **or** resolve Category F + Admin Direct separation and approve a precise source allowlist.  
2. Provide **approved production** Admin confirmation and Parent/Student test accounts (or waive roles).  
3. Define **non–Admin Direct** Student provisioning for the five families.  
4. Complete VC29 on-device login → learning → HOLD → stability QA.  
5. Only then approve distribution of the **existing VC29** APK (or a new build if source changes require it).

---

## Stop

Stopped **before APK distribution**.  

No commit · no push · no new APK · no deploy · stash intact · branch unchanged at `a4377fc`.  

**Awaiting explicit operator approval** for the next gated action.
