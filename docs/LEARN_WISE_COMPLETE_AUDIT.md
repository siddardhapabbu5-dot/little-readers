# LEARN WISE – Complete End-to-End Audit

- **Date:** 9 Nov 2026
- **Type:** Inspection only. No code, database, environment, payment or deployment changes were made. No real payments, no OTPs sent, no secrets recorded here.
- **Commit audited:** `336d01a` on `release/android-play-api36` (production server is on the same commit).
- **Latest build:** Android versionCode 22 (AAB + APK at `Desktop\LearnWise-release-v22\`).

Status values: **PASS / PARTIAL / FAIL / NOT TESTED / NOT IMPLEMENTED / OWNER ACTION**.
Severity values: **Critical / High / Medium / Low**.

---

## 1. Overall status

**Overall: PARTIAL – ready for Google Play *internal testing*, NOT ready for public release.**

The core product works end to end in production: parent registration with email OTP, PIN, child profiles with a 2-seat limit, Grade 1 learning (10 categories, 750 words), games, rewards, certificates, Razorpay live payments on web, admin console, and the new Android TV pairing. Typechecks pass for all four packages.

Four things block a public release:

1. **Payment policy (Critical).** The Android/iOS apps sell digital subscriptions through Razorpay. Google Play and Apple require their own billing for digital content.
2. **Scoring trust (High).** The server accepts `isCorrect` and points from the client, so points and progress can be faked.
3. **Session security (High).** Password reset and password change do not log out other sessions or TVs, and there is no brute-force limit on login or parent PIN.
4. **Destructive admin endpoint (Critical).** `POST /words/clear-all` wipes every child's answer history.

---

## 2. Audit areas (10)

| # | Area | Status |
|---|------|--------|
| 1 | Authentication, OTP, PIN, sessions | PARTIAL |
| 2 | Parent, child and seat management | PASS (minor issues) |
| 3 | Learning content and activities | PARTIAL |
| 4 | Games, rewards, certificates, challenges | PARTIAL |
| 5 | Payments and subscriptions | PARTIAL (FAIL for store policy) |
| 6 | Admin / Super Admin / School / Teacher | PARTIAL |
| 7 | Android TV | PASS (needs physical device test) |
| 8 | Database and migrations | PASS (with risks) |
| 9 | Security and privacy | PARTIAL |
| 10 | Builds, deployment, testing | PARTIAL |

### Test and check results (run locally during this audit)

| Check | Result |
|---|---|
| Server tests (vitest) | 163 passed, **8 failed** of 171. The failures come from tests running against the shared local dev database, which has extra data (11 categories instead of 10, one extra policy document). This is a test-isolation problem, not a production defect. One failure (`content-structure` expects `deactivate`, gets `force`) may be a real behaviour change and should be checked. |
| `apps/api` tests | 1/1 PASS (health-only scaffold, unused) |
| TypeScript: server, web, mobile, api | PASS (exit 0 for all) |
| Web lint (`next lint`) | FAIL – ESLint is not configured; the command stops at an interactive prompt |
| `npm audit --omit=dev` | 24 vulnerabilities (10 high, 13 moderate, 1 low). Notable: `xlsx` (no fix), `zod` (memory exhaustion) |
| `expo install --check` | PASS – dependencies up to date |
| Admin Practice e2e (earlier today) | 12/12 PASS; TV tests 9/9 PASS |

### Production snapshot (read-only SELECTs)

| Item | Value |
|---|---|
| Users | 3 parents, 1 super admin, 0 demo/test accounts |
| Subscriptions | 1 ACTIVE |
| Payments | Razorpay: 1 SUCCEEDED, 3 FAILED |
| Children | 3 (1 with a learning seat) |
| Content | 10 published categories, 750 active words, 0 placeholder (📝) emojis |
| Migrations | 29 applied, schema up to date |
| Payments mode | Live Razorpay key, `PAYMENT_ENABLED=true` |
| OTP | `OTP_DEV_MODE=0`; email OTP via SMTP; `SMS_PROVIDER=console` (SMS never delivered, unused by apps) |
| Demo logins | `ENSURE_DEMO_LOGINS=0` |
| TLS | Valid until 3 Feb 2027 |
| Host | Disk 6 %, memory 1.1 / 7.9 GB, Node 20 |

---

## 3. Working features (PASS)

- Parent registration, email OTP (hashed, expiring, attempt-limited), login, forgot/reset password with token or OTP.
- Parent PIN gate on parent areas; single active mobile device per parent with refresh-token rotation (tested).
- Child profiles, avatar, Grade 1 assignment; 2 included seats; 3rd child blocked (`child-seats.test.ts`).
- Ownership (IDOR) checks on child, progress, receipt and TV endpoints.
- One shared `VocabularyWord` bank used by phone, web and TV; child progress isolated per child.
- Listen / Spell / Quiz / Matching / Revision activities; category progress and unlock order; achievements; unique certificates.
- Friends and leaderboard are opt-in; no chat, no direct messaging, no public profiles.
- Razorpay: server-side order amount, HMAC signature verification, webhook raw-body verification, idempotent processing with row locks, receipts.
- Web subscribers can use the mobile app (account-based entitlement).
- Admin console: words, categories, levels, grades, users, payments, reports, settings, policy documents, subscription plans.
- Admin "Play games" with a Practice learner (phone + TV), excluded from family challenge stats.
- Android TV: QR / code pairing, child picker, D-pad game, revoke from phone (`tv.routes.ts`, `apps/mobile/tv/*`).
- Security basics: helmet, upload size limits, Razorpay secret server-only, consent records, no secrets committed to git.
- Android build: target/compile SDK 36, min 24, 16 KB page alignment, edge-to-edge, `allowBackup=false`, cleartext off, release-signed.
- No analytics or ad SDKs in the app.

## 4. Partially working features (PARTIAL)

- **Mobile sessions:** access token lasts 15 min and the mobile app never calls `/parent/auth/refresh`. Users may be logged out often. Needs physical device confirmation.
- **Quiz:** after one wrong tap, all other wrong options are dimmed, revealing the answer (`apps/mobile/app/quiz.tsx`, `optionDim`).
- **Listen sessions:** accuracy is always reported as 100 %, so one correct answer can complete a category.
- **Category locks:** enforced only in the app, not on the server.
- **Grade 1 only:** not enforced on the server; all levels are listed, and TV picks the first level that has words.
- **Activity toggles:** Revision is always on; "Surprise" toggle not enforced on the server.
- **Refunds:** a refund marks the payment REFUNDED but does not remove access or seats.
- **Cancel renewal:** only changes a label.
- **Logout:** client-side only; server session stays valid until expiry.
- **Web login:** no device ID; 7-day token stored in `localStorage`; no Content-Security-Policy.
- **Backups:** manual dumps in `/root/backups` only; no schedule, no off-server copy.

## 5. Broken features (FAIL)

- **Store billing compliance:** Android/iOS sell digital subscriptions via Razorpay (see PAY-01).
- **Web lint:** `next lint` not configured (TEST-02).
- **Server test isolation:** 8 tests fail against the local dev database (TEST-01).
- **SMS OTP:** `SMS_PROVIDER=console` reports success but sends nothing. Not used by the apps today, but any SMS route silently fails.

## 6. Missing features (NOT IMPLEMENTED)

- Google Play Billing / Apple StoreKit in-app purchases.
- Admin certificate settings.
- Login and PIN brute-force lockout.
- Audit log for admin actions (manual grants, payment edits, deletions).
- Hard-delete data erasure for privacy requests; verification on the public privacy request form.
- Automated, off-site database backups.
- Database health check in `/health`.
- Server-side audio: the phone uses device text-to-speech only; `audioUrl` is ignored.
- Game resume; ABANDONED session status is never set.
- iOS build, App Store Connect setup (`ascAppId` placeholder), iOS privacy manifest, associated domains.

---

## 7. Security vulnerabilities

| ID | Sev | Description | Evidence | Affected screen / API | Recommended solution |
|---|---|---|---|---|---|
| SEC-01 | High | Password reset does not set `passwordChangedAt` or revoke refresh sessions and TV sessions | `server/src/auth/auth.service.ts` ~349-363, ~425-440 | `/auth/reset-password`, parent reset with OTP | On reset: set `passwordChangedAt`, revoke all refresh sessions and TV sessions |
| SEC-02 | High | Change password does not revoke other sessions | `auth.service.ts` `changePassword` | Profile → Change password | Revoke other sessions after change |
| SEC-03 | High | No brute-force limit on login or parent PIN; global limit is at least 1000 requests / 15 min | `server/src/app.ts` ~61-78; `verifyParentPin` | `/auth/login`, `/parent/auth/login`, PIN verify | Per-account and per-IP limit (e.g. 5 tries then 15 min lockout) |
| SEC-04 | High | Seed script creates a demo super admin unless `SEED_DEMO=0` | `server/prisma/seed.ts` ~251 | Any environment where seed runs | Default to no demo users; require explicit opt-in |
| SEC-05 | Medium | Mobile never refreshes the token (15 min access token) | `apps/mobile/app/login.tsx` ~111-114, `services/api.ts` | All mobile screens | Add refresh-on-401 in the API client |
| SEC-06 | Medium | Web token in `localStorage`, 7-day, not bound to a session, no CSP | `apps/web` auth code, `next.config` | Web app | Session-bound tokens, httpOnly cookie or short expiry, add CSP |
| SEC-07 | Medium | Logout is client-only | mobile/web logout handlers | Logout | Add server logout that revokes the session |
| SEC-08 | Medium | `/auth/forgot-password` reveals whether an account exists | `auth.routes.ts` / `auth.service.ts` | Forgot password | Always return the same response |
| SEC-09 | Medium | Admins can use the parent reset flow (weaker password rule) | `auth.service.ts` | Parent forgot password | Block staff roles or apply staff password policy |
| SEC-10 | Medium | `subscription.tsx` and `privacy-request.tsx` reachable from child screens without PIN | `apps/mobile/app/subscription.tsx`, `privacy-request.tsx` | Payment, privacy request | Wrap with `RequireParentGate` |
| SEC-11 | Medium | `set-pin` overwrites PIN without the old PIN | parent PIN route | Parent PIN | Require current PIN or password |
| SEC-12 | Medium | Teacher can enroll any child by ID; school admin can update staff of another school | `server/src/schools/school.service.ts` ~381-430, ~247-285 | School / teacher APIs | Check school ownership and parent consent |
| SEC-13 | Medium | Device rules rely on the `X-Client-Platform` header (client-controlled) | device enforcement middleware | Login / device limit | Treat as a hint; bind to device ID + session |
| SEC-14 | Medium | `xlsx@0.18.5` (prototype pollution, ReDoS, no fix) and `zod` (memory exhaustion) | `npm audit` | Admin word import | Replace `xlsx` (e.g. `exceljs`), upgrade `zod` after testing |
| SEC-15 | Medium | Public privacy request endpoint has no verification or rate limit | privacy routes | Privacy request | Require login or email verification; add a limit |
| SEC-16 | Medium | Redis has no password and Postgres/Redis bind to `0.0.0.0` via Docker (bypasses ufw). External test from outside could not reach 5437/6379 (ports 22/443 reachable), so a provider firewall is currently blocking them | `docker-compose.yml`, `ss -tlnp` on VPS | Database / cache | Bind to `127.0.0.1`, set Redis password (or remove Redis, it is unused) |
| SEC-17 | Medium | Live Razorpay keys and real SMTP credentials are in the **local** `.env` | `server/.env` (names only checked) | Local dev | Remove live keys from local; use test keys only |
| SEC-18 | Low | Web `.env` on the server holds all server secrets (DB, JWT, Razorpay, SMTP) | `/var/www/siwi/apps/web/.env` (names only) | Web | Keep only `NEXT_PUBLIC_*` values the web needs |
| SEC-19 | Low | Mobile `ErrorBoundary` shows raw error messages; no request timeouts | `apps/mobile/app/_layout.tsx`, `services/api.ts` | All screens | Friendly error text; add fetch timeout |

## 8. Database and migration issues

| ID | Sev | Description | Evidence | Affected | Recommended solution |
|---|---|---|---|---|---|
| DB-01 | Critical | `POST /words/clear-all` deletes **all** QuestionAttempts (every child's history) | `server/src/vocab-import/vocab-import.routes.ts` ~127-141 | Admin words | Remove, or limit to Super Admin with typed confirmation and backup first |
| DB-02 | High | Force-deleting a category deletes child progress | category delete service | Admin categories | Soft-delete (unpublish) only |
| DB-03 | High | `/words/import-sheet` writes directly and reactivates words without preview | `vocab-import.routes.ts` | Admin import | Use preview → confirm flow |
| DB-04 | Medium | No unique index on attempts; concurrent "complete" calls double-count | `schema.prisma` QuestionAttempt, `learning.service.ts` | Learning progress | Unique key per session+word; transaction on complete |
| DB-05 | Medium | Backups are manual only, stored on the same server | `/root/backups`, crontab (certbot + docker prune only) | Whole DB | Daily `pg_dump` cron + off-site copy + restore test |
| DB-06 | Low | 6 migrations contain data backfills and one index swap; all applied cleanly | `server/prisma/migrations` | – | Keep; review before any reset |
| DB-07 | Low | Server tests share the dev DB; data drift breaks tests | TEST-01 | Tests | Use a separate test database |

Migrations: 29 found, production schema **up to date**, all additive. PASS.

## 9. Payment compliance

| ID | Sev | Description | Evidence | Affected | Recommended solution |
|---|---|---|---|---|---|
| PAY-01 | Critical | Native Android/iOS sell digital subscriptions with `react-native-razorpay`. Play Payments policy and Apple guideline 3.1.1 require Play Billing / StoreKit | `apps/mobile/services/razorpay.native.ts`, `app/agreements.tsx` ~112-131, `app/subscription.tsx` | Subscription screen | Either add Play Billing (and StoreKit), or remove purchasing from the apps and sell only on the website (no in-app links/prompts to buy) |
| PAY-02 | High | Any `refund.*` webhook marks REFUNDED but does not revoke access or seats | `server/src/payments/payment.service.ts` ~546-561 | Webhook | On full refund: end subscription and release seats |
| PAY-03 | High | Live/test key choice not tied to `NODE_ENV`; payment stub has no production guard | payment config | Payments | Refuse stub in production; refuse live keys outside production |
| PAY-04 | Medium | "authorized" treated as paid | `payment.service.ts` | Payments | Treat only "captured" as paid (or auto-capture) |
| PAY-05 | Medium | Seats not revoked on expiry/refund; seat rotation unlimited | seat service | Child seats | Revoke on expiry; limit swaps per period |
| PAY-06 | Medium | Any ADMIN can grant subscriptions or create SUCCEEDED Razorpay rows, uncapped, with no audit log | admin payment routes | Admin payments | Super Admin only + audit log |
| PAY-07 | Medium | Staff bypass of subscription check applies to every staff account; not covered by tests | `subscription.service.ts` `isStaffLearnerAccount` | Admin practice | Limit to the Practice child; add tests |
| PAY-08 | Low | Cancel renewal is only a label | subscription UI | Subscription | Implement or remove the wording |

Live payments: ON in production (unchanged by this audit). Web Razorpay flow: PASS.

## 10. Google Play readiness

| Item | Status | Note |
|---|---|---|
| Package `com.littlereaders.app`, versionCode 22 | PASS | |
| Target/compile SDK 36, 16 KB pages | PASS | |
| Release signing (upload key) | PASS | Signing plugin silently falls back to debug key if properties missing (PLAY-03) |
| Play Billing for digital goods | FAIL | PAY-01 |
| Families / Designed for Families policy | OWNER ACTION | Data safety form, teacher-approved content declaration, privacy policy URL |
| Permissions | PARTIAL | CAMERA, NFC and READ_BASIC_PHONE_STATE come from Razorpay; must be justified or removed (PLAY-02) |
| `assetlinks.json` | OWNER ACTION | Contains upload key SHA only; add Play App Signing SHA-256 from Play Console |
| App icon | OWNER ACTION | Check for checkerboard/transparency in the store icon |
| New personal account rule | OWNER ACTION | 12 testers for 14 days in closed testing before production |
| Android TV | OWNER ACTION | TV banner present; TV review needs screenshots and a physical TV test |
| Minify / R8 | Low | Off (larger AAB, no obfuscation) |

| ID | Sev | Description | Recommended solution |
|---|---|---|---|
| PLAY-01 | Critical | Razorpay in-app for digital subscription | See PAY-01 |
| PLAY-02 | Medium | Extra permissions from Razorpay SDK; unused Google Sign-In / ML Kit stubs bundled | Remove Razorpay from the app or strip permissions with `tools:node="remove"` |
| PLAY-03 | Medium | Build can be silently debug-signed | Fail the release build when signing properties are missing |
| PLAY-04 | Low | Duplicate deep-link scheme intent filter | Remove the duplicate |

## 11. Apple App Store readiness

**Status: NOT IMPLEMENTED / NOT TESTED.** No iOS build has been made.

| ID | Sev | Description | Recommended solution |
|---|---|---|---|
| IOS-01 | Critical | No StoreKit; Razorpay used for digital goods | See PAY-01 |
| IOS-02 | High | `ascAppId` placeholder; no App Store Connect record | OWNER ACTION: create app record |
| IOS-03 | Medium | `supportsTablet: true` with portrait lock risks ITMS-90474 | Set `supportsTablet: false` or support all iPad orientations |
| IOS-04 | Medium | Privacy manifest incomplete; no associated domains | Complete `PrivacyInfo` reasons; add associated domains |
| IOS-05 | Medium | Kids Category rules (no external links/purchases without parental gate) | Gate every external link and purchase |

## 12. Production risks

| ID | Sev | Risk | Recommended solution |
|---|---|---|---|
| OPS-01 | High | No automated off-site backups | Daily backup cron + off-site copy |
| OPS-02 | Medium | Postgres/Redis bound to all interfaces, Redis without password (SEC-16) | Bind to localhost |
| OPS-03 | Medium | pm2 runs the API with `tsx` (TypeScript at runtime); no log rotation | Build to JS; install `pm2-logrotate` |
| OPS-04 | Medium | `/health` does not check the database | Add DB ping |
| OPS-05 | Low | Server repo has a modified `package-lock.json`; local branch name on server differs from release branch | Reset lockfile to commit; rename branch at next deploy |
| OPS-06 | Low | nginx config and backup scripts not in the repo; env docs incomplete | Add to `docs/ops` |
| OPS-07 | Low | pm2 restarts: API 21, web 5 (mostly from deploys) | Monitor |
| OPS-08 | Low | Web layout shows Super Admin / School / Teacher links and a "Phase 1 architecture foundation" footer | Clean up public layout |
| OPS-09 | Low | Web login page claims "Speech Recognition" | Correct the wording |

## 13. Learning and content issues

| ID | Sev | Description | Evidence | Affected | Recommended solution |
|---|---|---|---|---|---|
| LRN-01 | High | Server trusts client `isCorrect` and `pointsAwarded` (0–100); wrong attempts not deduped → unlimited points | `server/src/learning/learning.service.ts` ~941-986, validation ~269-283 | Points, rewards, leaderboard | Server decides correctness from the stored word; fixed points |
| LRN-02 | Medium | API sends `isCorrect` for each option to the client | learning session response | All activities | Send options without answers |
| LRN-03 | Medium | Quiz dims all wrong options after one miss (reveals answer) | `apps/mobile/app/quiz.tsx` `optionDim` | Quiz | Dim only the tapped wrong option |
| LRN-04 | Medium | Listen accuracy always 100 % | `learning.service.ts` | Listen | Compute from attempts |
| LRN-05 | Medium | Category lock and Grade 1 restriction client-only; level/group publish flags not checked | learning routes | Learn, TV | Enforce on server |
| LRN-06 | Medium | Alphabet-sheet meanings may contain the answer word | import data | Spell / Quiz | Validate on import |
| LRN-07 | Medium | Batch-imported words get 📝 placeholder emoji (0 in production today) | import service | Quiz options | Require an emoji or image on import |
| LRN-08 | Medium | Empty published category blocks unlocking the next | progress service | Learn | Skip empty categories |
| LRN-09 | Medium | Certificate share has no parental gate | `apps/mobile/app/certificate.tsx` | Certificate | Add `ParentGateModal` |
| LRN-10 | Low | Phone uses device TTS only; games do not resume | `services/speech.ts` | Activities | Use `audioUrl` when present |

## 14. Exact files and components responsible

| Area | Files |
|---|---|
| Auth / sessions | `server/src/auth/auth.service.ts`, `server/src/auth/auth.routes.ts`, `server/src/app.ts`, `apps/mobile/app/login.tsx`, `apps/mobile/services/api.ts`, `apps/mobile/services/session.ts` |
| PIN gate | `apps/mobile/components/ParentGateModal.tsx`, `RequireParentGate.tsx` |
| Learning | `server/src/learning/learning.service.ts`, `apps/mobile/app/play.tsx`, `quiz.tsx`, `matching.tsx`, `revision.tsx`, `category-play.tsx` |
| Word admin | `server/src/vocab-import/vocab-import.routes.ts`, `apps/mobile/app/admin-words.tsx`, `admin-vocabulary.tsx` |
| Payments | `server/src/payments/payment.service.ts`, `server/src/subscriptions/subscription.service.ts`, `apps/mobile/services/razorpay.native.ts`, `apps/mobile/app/subscription.tsx`, `agreements.tsx` |
| Schools | `server/src/schools/school.service.ts` |
| TV | `server/src/tv/tv.routes.ts`, `tv.service.ts`, `apps/mobile/tv/*`, `apps/mobile/app/tv-connect.tsx`, `apps/mobile/plugins/withAndroidTv.js` |
| Seed | `server/prisma/seed.ts` |
| Infra | `docker-compose.yml`, pm2 config, nginx on VPS |
| Build | `apps/mobile/app.json`, signing plugin, `docs/ops/ANDROID_RELEASE.md` |

| ID | Sev | Description | Recommended solution |
|---|---|---|---|
| TEST-01 | Medium | 8 server tests fail due to shared dev DB data | Separate test DB, seed per run; check the `force` vs `deactivate` change |
| TEST-02 | Low | Web ESLint not configured | Add ESLint config |

---

## Final release summary

### A. Ready
- Production API, web and database on commit `336d01a`, schema up to date.
- Parent account, email OTP, PIN, child profiles, 2-seat limit.
- Grade 1 learning content (10 categories, 750 words) and activities.
- Web Razorpay live payments with signature and webhook verification.
- Admin console and Admin Practice play.
- Android TV pairing and play (server side).
- Android build v22 signed, SDK 36.

### B. Needs fixing
- DB-01 clear-all endpoint; DB-02 force delete; DB-03 import without preview.
- LRN-01 client-trusted scoring; LRN-02 answers sent to client; LRN-03 quiz reveal.
- SEC-01/02 session revocation; SEC-03 brute-force limits; SEC-04 seed demo admin.
- SEC-05 mobile token refresh; SEC-10 PIN gate on subscription/privacy screens.
- PAY-02 refund revocation; PAY-03 key/env guard.
- SEC-12 school/teacher ownership checks.
- OPS-01 automated backups; SEC-16 bind DB/Redis to localhost.
- TEST-01 test isolation.

### C. Needs owner action
- Decide billing model for apps (Play Billing vs web-only sales) – PAY-01.
- Play Console: Data safety, Families declarations, privacy policy URL, Play signing SHA into `assetlinks.json`, icon check, 12 testers × 14 days.
- Remove live Razorpay keys and real SMTP from local `.env` (SEC-17).
- Confirm Hostinger firewall blocks ports 5437 / 6379 / 3100 / 4100.
- Apple: developer account, App Store Connect record, `ascAppId`.

### D. Needs physical device testing
- Mobile session staying logged in beyond 15 minutes (SEC-05).
- Android TV app on a real TV / Fire TV: D-pad, pairing, audio, banner.
- Razorpay checkout on a real phone (test mode only).
- Speech (TTS) on low-end Android; small screens for the new quiz layout.
- Offline / poor network behaviour.

### E. Ready for internal Play Store testing
**Yes.** v22 AAB can go to the **Internal testing** track now for the owner and invited testers.

### F. Not ready for public release
**Not ready** for Production on Google Play or for the App Store until PAY-01 (billing), LRN-01 (scoring), DB-01 (clear-all), SEC-01/02/03 (sessions and brute force) and the Play Families/Data safety owner actions are done.

---

## Prioritized list of remaining work

1. **Decide the app billing model** and implement it (Play Billing, or remove buying from the app and sell on the website only). – PAY-01 / PLAY-01 / IOS-01
2. **Remove or lock down `POST /words/clear-all`** and the category force-delete. – DB-01, DB-02
3. **Make the server decide correctness and points**, stop sending answers to the client, fix the quiz option dimming. – LRN-01, LRN-02, LRN-03
4. **Revoke sessions and TVs on password reset/change; add login and PIN lockout.** – SEC-01, SEC-02, SEC-03
5. **Add mobile token refresh** and PIN-gate subscription, privacy and certificate share screens. – SEC-05, SEC-10, LRN-09
6. **Refunds remove access and seats; guard live/test keys by environment.** – PAY-02, PAY-03, PAY-04
7. **Automated daily off-site DB backups; bind Postgres/Redis to localhost.** – OPS-01, SEC-16
8. **Fix school/teacher ownership checks** and restrict manual payment grants to Super Admin with an audit log. – SEC-12, PAY-06
9. **Seed without demo admin; replace `xlsx`, upgrade `zod`; clean local `.env`.** – SEC-04, SEC-14, SEC-17
10. **Server-side Grade 1, category lock and publish checks; Listen accuracy.** – LRN-04, LRN-05
11. **Separate test database and ESLint config.** – TEST-01, TEST-02
12. **Play Console owner tasks + closed testing (12 testers × 14 days) + physical TV test**, then submit for Production.
13. **iOS** (only after items 1–6): App Store Connect record, StoreKit, privacy manifest, tablet setting.
