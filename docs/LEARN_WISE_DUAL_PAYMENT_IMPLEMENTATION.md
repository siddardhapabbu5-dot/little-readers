# LEARN WISE – Dual Payment Gateway Implementation

Date: 9 Nov 2026 · Scope: local implementation and local testing only.

**Status: stopped at the owner approval gate.** Nothing in this work was committed, pushed, deployed or published, and no production migrations were run. No production environment variable, database row or payment setting was changed, and no live credentials were added.

Status legend: **PASS** (executed locally and passed) · **PARTIAL** · **FAIL** · **NOT TESTED** · **OWNER ACTION**.

---

## 0. Read this first — production conflicts (OWNER ACTION)

| # | Finding | Status |
|---|---------|--------|
| 0.1 | Production currently runs with `PAYMENT_ENABLED=true` and **live** Razorpay keys (website checkout is live). This conflicts with the rule "ALL PRODUCTION PAYMENTS MUST REMAIN DISABLED". I did not change it because changing production env needs your approval. | OWNER ACTION |
| 0.2 | **If this code is deployed**, website checkout turns **off** in production until `RAZORPAY_ENABLED=true` **and** `RAZORPAY_LIVE_ENABLED=true` are set. The old `RAZORPAY_ALLOW_LIVE` flag is no longer read. This is intentional (default off), but it changes behaviour on deploy. | OWNER ACTION |
| 0.3 | The new migration `20261109180000_dual_payment_provider_fields` must be applied to production **before** the new code starts. It is additive only. | OWNER ACTION |

---

## 1. Existing architecture (inspected)

| Area | Finding |
|------|---------|
| `apps/mobile` | Expo SDK 54, React Native 0.81.5, expo-router. Android package `com.littlereaders.app` (unchanged). Previously used `react-native-razorpay` for in-app checkout. |
| `apps/web` | Next.js 15. Parent checkout (`/parent/checkout`) uses Razorpay Checkout.js; Admin `/admin/subscriptions`. |
| `server` | Express + Prisma 6.19 + PostgreSQL — the **active** API (`/api/...`). |
| `apps/api` | Present but not used by web or mobile; left untouched. |
| Razorpay model | **One-time Orders, prepaid** (`payment_capture: 1`); each verified payment extends `Subscription.expiresAt`. No Razorpay recurring Subscriptions. **Not changed.** |
| Entitlement | `Subscription` table (one row per provider purchase) + `Payment` table; seats via `includedSeats + extraSeats`; children keep their own progress. Reused — no duplicate tables. |
| Agreements | Parent must accept the published agreements before payment (`assertAgreementsAccepted`). Reused for both providers. |

---

## 2. Implementation decisions

1. **One canonical entitlement across providers.** `entitlementSubscription()` picks the eligible row with the latest `expiresAt` across `google_play`, `razorpay` and `manual_admin`; otherwise the newest row. Every access check (learning, seats, `/subscriptions/me`, Admin) uses it.
2. **Google Play = Android only.** The Android app no longer contains Razorpay. `react-native-razorpay` was removed, along with its NFC and phone-state permissions. `razorpay.native.ts` is a stub that refuses.
3. **Razorpay = website only.** The server refuses `POST /payments/orders` from `X-Client-Platform: android|ios` with `USE_STORE_BILLING`. The web preview of the mobile app keeps Razorpay.
4. **iOS** shows information only; there is no purchase button. Selling digital subscriptions in iOS would need Apple In-App Purchase, which is an owner decision.
5. **No double charging.** A parent with an active Google Play plan gets `409 MANAGED_BY_GOOGLE_PLAY` on website family checkout. A parent with an active website or manual plan sees "You can subscribe here after it ends" in the Android app.
6. **Cancellation goes to the right provider.** Google Play subscriptions return `409 MANAGED_BY_GOOGLE_PLAY` from `/subscriptions/cancel`; the app shows **Manage in Google Play**. Razorpay plans are prepaid (no renewal to cancel), so the "Cancel renewal" button is hidden and the provider's management text is shown.
7. **Feature flags read at request time, all default OFF.** See §6.
8. **Audit trail.** The new `SubscriptionAuditEvent` table is append-only. It stores status changes from Google verify/RTDN, Razorpay verify/webhook/refund and manual grants, with a unique `providerEventId` for idempotency.

---

## 3. Feature checklist

### B. Google Play Billing (Android)

| # | Requirement | Status | Notes |
|---|-------------|--------|-------|
| B1 | Monthly + yearly products | PASS (code) / OWNER ACTION (console) | `learnwise_monthly` (1 month), `learnwise_yearly` (12 months); configurable via `GOOGLE_PLAY_PRODUCT_IDS`. |
| B2 | Stable product IDs | PASS | Defined once in server config; app reads them from `/payments/google-play/config`. |
| B3 | Country pricing in Play Console | OWNER ACTION | Proposed INR 149 / PHP 149 monthly — set in Play Console. |
| B5 | Show Google's actual price | PASS (code) | The app shows Google's `formattedPrice` and billing period; no hard-coded price. Not verified on a device. |
| B6 | Plan name, period, renewal + cancellation info | PASS (code) | Auto-renew and cancel-anytime disclosure shown under the plans. |
| B7 | Purchase / pending / success / cancelled / failed / restore | PARTIAL | Server paths tested with a mocked Google API. On-device flows are NOT TESTED (they need a Play internal-test build and a license tester). |
| B8 | Backend verification via Google Play Developer API | PASS (mocked + offline real-client test) | `purchases.subscriptionsv2.get` with a service-account JWT (RS256, no extra dependency). |
| B9 | No access from client callback alone | PASS | The client only sends `{productId, purchaseToken}`; access is granted only from Google's response. |
| B10 | Acknowledge correctly | PASS | The server acknowledges ACTIVE/GRACE purchases; pending purchases are never acknowledged. The client calls `finishTransaction` only after server verification. |
| B11 | Renewal, cancel, grace, hold, expiry, revoke | PASS (mocked) | Revoke and voided purchases end access immediately and mark the Payment row REFUNDED. |
| B12 | RTDN | PASS (mocked) | `POST /api/payments/google-play/rtdn?token=…`. The token is compared in constant time and redacted from access logs. |
| B13 | Idempotency | PASS | Pub/Sub `messageId` is stored as unique `rtdn:<id>`; Payment per Google `orderId` (`gp_order:<id>`, unique); Subscription per purchase-token hash. |
| B14 | Restore / manage | PASS (code) | **Restore purchases** re-verifies owned purchases on the server; **Manage in Google Play** deep-links to the Play subscription centre. |

### C. Razorpay (website only)

| # | Requirement | Status | Notes |
|---|-------------|--------|-------|
| C1–C4 | Keep web checkout, reuse Orders, billing model unchanged | PASS | Still prepaid one-time Orders. |
| C5 | Recurring / international support documented | OWNER ACTION | Not recurring. International cards are **not assumed** enabled; the account is Individual / Not Registered (KYC pending). |
| C6 | Server signature verification | PASS | Existing HMAC check, tested. |
| C7 | Verify status before access | PASS | `authorized` no longer activates access. The parent sees "being confirmed"; access starts on the `payment.captured` webhook. |
| C8 | Webhook signature | PASS | Tested (bad signature → 400). |
| C9 | Payment / refund / failure / cancel events | PASS | A full `refund.processed` removes the paid period (cumulative partial refunds count). Partial refunds are recorded for Admin review. Add-on seat refunds are flagged for Admin review. |
| C10 | Idempotency | PASS | Row locks + `rawEventId`, duplicate refund events ignored, audit `razorpay:<eventId>` unique. |
| C11 | No secrets in frontend | PASS | Only `keyId`, and only when checkout is enabled. |
| C12–C14 | No assumed intl cards / PHP / GCash | PASS | Website charges INR only; nothing else is offered. |

### D. Shared backend

| Rule | Status | Notes |
|------|--------|-------|
| Records: parent, provider, provider ref, product, country, currency, amount, status, start, expiry, renewal, cancellation, verification, timestamps | PASS | New columns on `Subscription`: `productId`, `autoRenewing`, `countryCode`, `verificationStatus`, `verifiedAt`, `providerToken`, `acknowledgedAt`. Amount and currency live on `Payment`. |
| D1 No accidental duplicates | PASS | Cross-provider guards (see §2.5); upgrades expire the linked old token. |
| D2 Website plan recognised in Android | PASS | Tested. |
| D3 Google Play plan recognised on website | PASS | Tested. |
| D4/D5 Provider-specific cancel/manage | PASS | |
| D6 Expired / refunded / revoked lose access | PASS | Tested for both providers. |
| D7/D8 Seat limits kept; progress never reset | PASS | Tested: 2 seated + 1 waiting; on expiry, children and records are kept. |

### E. Security

| Item | Status |
|------|--------|
| Google server-side verification; Razorpay signature + webhook verification | PASS |
| Idempotency for all provider notifications | PASS |
| Auth + ownership: token bound to the parent via `obfuscatedAccountId` (user id); another parent's token → 403; parents can't read others' receipts, history or Admin endpoints | PASS (tested) |
| Purchase tokens: stored only to re-query Google; DB lookups use a SHA-256 hash; **never returned** (Prisma client omits `providerToken` globally) | PASS (tested) |
| No trust in client price, currency, status or expiry | PASS |
| Audit log for status changes | PASS |
| No card data / CVV stored | PASS — never received by the server. |

### F. Parent app · G. Admin

| Item | Status | Notes |
|------|--------|-------|
| Current plan, price and period, provider ("Billed via"), status, renew/expiry date, purchase, restore, manage, help text | PASS (typecheck) / NOT TESTED (device) | |
| No Razorpay in the Play app | PASS | Package removed; server also refuses. |
| No misleading success messages | PASS | Success text only after server verification; pending and cancelled states have their own messages. |
| Admin: provider, plan, amount/currency, verification status, dates, renewals/cancellations, failed payments and refunds, search, audit history | PASS (API tested) / NOT TESTED (browser) | `/admin/subscriptions`: search box, provider/auto-renew/verification line, **History** per parent. |
| Admin never sees card data, tokens or secrets | PASS (tested) | |
| Manual grants separate from gateway-paid | PASS | Own `manual_admin` row, `verificationStatus=MANUAL`, `gatewayPaid=false` in history. |

---

## 4. Local test results (section I)

Commands actually executed on 9 Nov 2026 against the **local** database (`localhost:5437`):

- `server`: `node ../node_modules/vitest/vitest.mjs run tests/dual-payment.test.ts` → **11/11 passed**
- `server`: `tests/batch10-payments.test.ts` → **8/8 passed**
- Full server suite → **173 passed, 8 failed / 181** (before this work: 8 failed / 171). The 8 failures are the same pre-existing local-data issues, unrelated to payments: 11 categories instead of 10, an extra policy document, vocab import, and the `force`/`deactivate` change.
- Type checks: server, mobile, web → **all exit 0**.
- Live local API: RTDN with a wrong token → 401; the access log shows `token=[redacted]`.

| # | Test | Status | How |
|---|------|--------|-----|
| I.1 | Google Play purchase success (authorized test setup) | PARTIAL | PASS with mocked Google API and with the real client against stubbed `fetch` (JWT signature, URL, acknowledge). **On-device license-tester purchase: NOT TESTED** (needs a Play Console internal-test release). |
| I.2 | Google Play purchase cancellation | PARTIAL | User-cancel in the Play sheet is handled in the app (`user-cancelled` → "You have not been charged"); NOT TESTED on device. Subscription cancellation via RTDN: PASS. |
| I.3 | Pending purchase | PASS (mocked) | No access, no acknowledge, no Payment row. |
| I.4 | Invalid purchase token | PASS | 400 `INVALID_PURCHASE_TOKEN`; also unknown product, wrong product, other parent's token. |
| I.5 | Duplicate notification | PASS | Same Pub/Sub messageId → `duplicate`; no extra Payment. |
| I.6 | Renewal event | PASS (mocked) | New order id → 2nd Payment, later expiry. |
| I.7 | Cancellation and expiry | PASS (mocked) | Cancelled keeps access until expiry; expired removes it; also grace, hold, revoke, voided, upgrade. |
| I.8 | Razorpay test payment success | PASS | Test-mode stub + real HMAC signatures. |
| I.9 | Razorpay failure | PASS | `payment.failed` + checkout dismissal → FAILED, no access; `authorized` alone → no access. |
| I.10 | Invalid Razorpay signature | PASS | |
| I.11 | Duplicate webhook | PASS | Plus a verify/webhook race (activates once). |
| I.12 | Refund event | PASS | Partial → recorded only; full → access revoked; duplicate refund ignored. |
| I.13 | Website subscriber logging into Android | PASS | Entitled; Play purchase blocked with an explanation. |
| I.14 | Google Play subscriber on website | PASS | Entitled; website family checkout returns 409. |
| I.15 | Two children sharing seats | PASS | 2 seated, 3rd waits. |
| I.16 | Expired subscription access | PASS | `eligible=false`, capacity 0, children kept. |
| I.17 | Parent cannot see another parent's payment | PASS | Receipt 403/404; not in `/payments/me`; Admin history 403. |
| I.18 | Admin payment history | PASS (API) | Search + history endpoint tested; UI not opened in a browser. |
| — | Android native build with `expo-iap` | NOT TESTED | Needs `expo prebuild` + Gradle. Not run because no build was requested. First step of the release checklist. |

Test data was created only in the **local** DB (parents `dualpay_*@test.local`, plans `DUAL_*` deactivated after the run).

---

## 5. Changed files

**Server**
- `server/prisma/schema.prisma` — new `Subscription` columns; new `SubscriptionAuditEvent` model.
- `server/prisma/migrations/20261109180000_dual_payment_provider_fields/migration.sql` — **new**, additive only; applied to the **local** DB only.
- `server/src/payments/flags.ts` — **new** feature flags.
- `server/src/payments/google-play.ts` — **new**: Google API client (service-account JWT), verification, acknowledgement, RTDN, voided purchases, config.
- `server/src/payments/payment.routes.ts` — Google Play routes (`config`, `verify`, `restore`, `rtdn`); platform header passed to orders; Admin payment search.
- `server/src/payments/payment.service.ts` — app-platform block, Google Play conflict guard, `authorized` ≠ paid, refunds, audit, Admin search.
- `server/src/payments/plans.ts`, `server/src/payments/razorpay.ts` — flags; live keys need `RAZORPAY_LIVE_ENABLED`; test stub refused in production.
- `server/src/subscriptions/audit.ts` — **new** audit helper.
- `server/src/subscriptions/subscription.service.ts` — cross-provider entitlement, provider management text, Google cancel guard, Admin search + history.
- `server/src/devices/device.routes.ts` — `GET /subscriptions/admin?q=`, `GET /subscriptions/admin/:userId/history`.
- `server/src/lib/prisma.ts` — `providerToken` omitted from every query result.
- `server/src/app.ts` — `?token=` redacted in access logs.
- `server/src/vocab-import/word-management.service.ts`, `server/tests/dictionary-grade.test.ts` — type-only casts for the Prisma client change.
- `server/tests/dual-payment.test.ts` — **new** (11 tests); `server/tests/batch10-payments.test.ts` — sets `RAZORPAY_ENABLED`.

**Mobile**
- `apps/mobile/package.json`, `package-lock.json` — `expo-iap@6.4.3` added (Google Play Billing Library 9.x); `react-native-razorpay` removed.
- `apps/mobile/app.json` — `expo-iap` config plugin. Package ID unchanged.
- `apps/mobile/services/play-billing.native.ts`, `play-billing.ts` (web stub), `play-billing-types.ts` — **new**.
- `apps/mobile/components/GooglePlaySubscribe.tsx` — **new** Android subscribe / restore / manage card.
- `apps/mobile/app/subscription.tsx` — Android: Google Play; iOS: info only; web preview: existing Razorpay plans. Shows provider, renew/expiry date and management text.
- `apps/mobile/app/agreements.tsx` — in the apps, accepting returns to Subscription (never Razorpay); handles "payment processing".
- `apps/mobile/services/razorpay.native.ts` — stub that refuses.

**Web**
- `apps/web/src/app/admin/subscriptions/page.tsx` — search, provider details, per-parent history and audit events.
- `apps/web/src/app/parent/checkout/page.tsx` — "payment processing" message instead of a false success.

**Config / docs**
- `.env.example` — new flags (no secrets).
- `docs/LEARN_WISE_DUAL_PAYMENT_IMPLEMENTATION.md` — this report.

---

## 6. Environment variables (example — no secrets)

```env
# Master switch. Every provider also needs its own flag. All default OFF.
PAYMENT_ENABLED=false

# Website-only Razorpay
RAZORPAY_ENABLED=false
RAZORPAY_LIVE_ENABLED=false          # rzp_live_ keys refused unless true
# RAZORPAY_KEY_ID=rzp_test_…
# RAZORPAY_KEY_SECRET=
# RAZORPAY_WEBHOOK_SECRET=
PAYMENT_CURRENCY=INR

# Google Play Billing (Android app)
GOOGLE_PLAY_BILLING_ENABLED=false
GOOGLE_PLAY_PACKAGE_NAME=com.littlereaders.app
GOOGLE_PLAY_PRODUCT_IDS=learnwise_monthly:1,learnwise_yearly:12
# GOOGLE_PLAY_SERVICE_ACCOUNT_FILE=/etc/learnwise/play-service-account.json   # outside Git, chmod 600
# GOOGLE_PLAY_SERVICE_ACCOUNT_JSON=                                            # alternative to FILE
# GOOGLE_PLAY_RTDN_TOKEN=<random 32+ characters>
```

Effective rules: website checkout needs `PAYMENT_ENABLED` + `RAZORPAY_ENABLED` + keys (+ `RAZORPAY_LIVE_ENABLED` for live keys). Google Play needs `PAYMENT_ENABLED` + `GOOGLE_PLAY_BILLING_ENABLED` + service-account credentials. The test stub is refused when `NODE_ENV=production`.

Local note: your local `.env` has `PAYMENT_ENABLED=true` with a Razorpay **test** key. For local website checkout, also add `RAZORPAY_ENABLED=true` locally. I did not edit your `.env`.

---

## 7. Google Play Console setup (OWNER ACTION)

1. **Payments profile / merchant account** linked to the developer account (needed to sell).
2. **Monetize → Subscriptions → Create**:
   - `learnwise_monthly`, base plan `monthly`, auto-renewing, 1 month.
   - `learnwise_yearly`, base plan `yearly`, auto-renewing, 1 year.
   - Prices: India INR 149 (monthly), Philippines PHP 149 (monthly) as proposed; you choose the yearly prices. Activate both.
3. **Grace period and account hold**: keep Google's defaults (the server already handles both).
4. **Upload a build containing the billing library** (a release made from this code) to the **Internal testing** track. Products can be fetched only after such a build exists.
5. **License testing**: Settings → License testing → add tester Gmail accounts.
6. **Service account**:
   - Google Cloud project: enable **Google Play Android Developer API**; create a service account and a JSON key.
   - Play Console → Users and permissions: invite the service-account email with *View financial data* and *Manage orders and subscriptions*.
   - Put the JSON on the server **outside Git** (e.g. `/etc/learnwise/play-service-account.json`, `chmod 600`) and set `GOOGLE_PLAY_SERVICE_ACCOUNT_FILE`.
7. **RTDN**:
   - Create a Cloud Pub/Sub topic. Grant `google-play-developer-notifications@system.gserviceaccount.com` the *Pub/Sub Publisher* role.
   - Create a **push** subscription to `https://api.siwiapp.shop/api/payments/google-play/rtdn?token=<GOOGLE_PLAY_RTDN_TOKEN>`.
   - Play Console → Monetization setup: enter the topic, then **Send test notification**.
8. **Data safety form**: declare purchase history (Google Play Billing).

## 8. Razorpay dashboard setup (OWNER ACTION)

1. The account is **Individual / Not Registered**: complete KYC, bank verification and website review before any live use.
2. **Webhooks** → `https://api.siwiapp.shop/api/payments/webhook`, a new secret (`RAZORPAY_WEBHOOK_SECRET`). Events: `payment.captured`, `payment.failed`, `refund.processed` (`payment.authorized` may stay on; it is ignored).
3. **Payment capture**: automatic (Orders already use `payment_capture: 1`).
4. **International cards / other currencies**: not enabled or assumed. Request them in the dashboard only if you want them; the website charges INR only.
5. **Refund policy**: the website states 1 day. Refunds made in the dashboard now end the refunded period automatically.

## 9. Local testing instructions

```powershell
# Local DB container must be running (little-readers-db, port 5437)
cd server
node ../node_modules/vitest/vitest.mjs run tests/dual-payment.test.ts tests/batch10-payments.test.ts
node ../node_modules/typescript/bin/tsc --noEmit
cd ../apps/mobile; node ../../node_modules/typescript/bin/tsc --noEmit -p tsconfig.json
cd ../web;        node ../../node_modules/typescript/bin/tsc --noEmit -p tsconfig.json
```

Tests use a mocked Google API (`setGooglePlayApiForTests`) and the Razorpay test stub. No network calls leave the machine; the real-client test stubs `fetch`.

## 10. Security findings

| # | Finding | Status |
|---|---------|--------|
| S1 | Production has live Razorpay enabled (`PAYMENT_ENABLED=true`), conflicting with the owner rule. | OWNER ACTION |
| S2 | **Fixed:** subscription rows (incl. the Google purchase token) were returned by seat snapshots and Admin lists. Prisma now omits `providerToken` from every query result; covered by a test. | PASS |
| S3 | **Fixed:** the RTDN shared token would have appeared in access logs; `?token=` is now redacted. | PASS |
| S4 | **Fixed:** `/payments/verify` and the `payment.authorized` webhook treated an *authorized* (not yet captured) payment as paid. Now only `captured` grants access. | PASS |
| S5 | **Fixed:** any `refund.*` event (even partial or failed) marked the payment REFUNDED but never removed access. Now only `refund.processed` counts. Full refunds end the refunded period; partial refunds are recorded for Admin review. | PASS |
| S6 | Blocking website checkout from the apps relies on the client-sent `X-Client-Platform` header. This is a store-policy measure, not a security boundary; pricing and verification stay server-side. | PASS (documented) |
| S7 | Purchase tokens are stored in the DB (needed to re-query Google). They are never returned or logged; lookups use a SHA-256 hash. | PASS |
| S8 | During `npm install`, npm's allow-scripts setting skipped Prisma's install script. The Prisma client was already generated. If it is ever missing, run `npm run db:generate`. | PASS (note) |
| S9 | iOS has no purchase path. Selling digital subscriptions inside the iOS app would need Apple In-App Purchase. | OWNER ACTION (decision) |

## 11. Outstanding owner approvals

1. Decide what to do with the **live Razorpay currently enabled in production** (§0.1).
2. Approve applying migration `20261109180000_dual_payment_provider_fields` to production.
3. Approve deploying this code (website checkout will need `RAZORPAY_ENABLED` + `RAZORPAY_LIVE_ENABLED` to stay live).
4. Play Console setup (§7), service-account key and RTDN token on the server.
5. Razorpay KYC / activation and webhook secret (§8).
6. Approve building and uploading an Android release with Google Play Billing (internal testing first).
7. Final prices per country.

## 12. Production release checklist (do nothing without written approval)

- [ ] Owner approval in writing for this release.
- [ ] Back up the production DB.
- [ ] Apply the migration (additive) — `prisma migrate deploy`.
- [ ] Deploy the server with flags **off**: `PAYMENT_ENABLED=false`, `RAZORPAY_ENABLED=false`, `RAZORPAY_LIVE_ENABLED=false`, `GOOGLE_PLAY_BILLING_ENABLED=false`.
- [ ] Place the service-account JSON (outside Git, `chmod 600`); set `GOOGLE_PLAY_SERVICE_ACCOUNT_FILE` and `GOOGLE_PLAY_RTDN_TOKEN`.
- [ ] Deploy the web build (clear `.next/cache/fetch-cache` first).
- [ ] Build the Android release with `expo prebuild --clean` (the new `expo-iap` plugin) and confirm Gradle succeeds. Upload to **Internal testing**; bump `versionCode`.
- [ ] Create the Play products and activate them; add license testers.
- [ ] Owner approves enabling Google Play for testing → set `PAYMENT_ENABLED=true` + `GOOGLE_PLAY_BILLING_ENABLED=true`.
- [ ] License-tester purchase on a real device: verify, acknowledge, entitlement, restore, manage, cancel and expiry. RTDN test notification received.
- [ ] Separately, owner approves website payments → `RAZORPAY_ENABLED=true` (+ `RAZORPAY_LIVE_ENABLED=true` only after Razorpay activation).
- [ ] Monitor `SubscriptionAuditEvent` and Admin → Subscriptions for the first real purchases.
- [ ] Promote the Android build to production only after the above passes.
