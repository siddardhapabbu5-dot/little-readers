# Learn Wise – Google Play Policy Fixes (Phase 1)

Date: 11 Nov 2026 · Branch: `release/android-play-api36`

No production database, API server, website deployment, Android build or Play submission was done. Every test ran against the **local** database.

---

## 1. Git commit (part A)

| Item | Value |
|---|---|
| Commit | **`ed42a74`**: "Block READ_PHONE_STATE and add Google Play deployment audit" |
| Contents (verified with `git show --stat`) | `apps/mobile/app.json` (+1 line, `READ_PHONE_STATE` added to `blockedPermissions`), `LEARN-WISE-GOOGLE-PLAY-DEPLOYMENT-AUDIT.md` (new) |
| Pushed | Yes. `origin/release/android-play-api36` now points to `ed42a74…` |
| Package ID | `com.littlereaders.app` (unchanged) |
| Version | `1.0.0` (unchanged) |
| Version code | **26** in `app.json` (unchanged). The request mentioned 27, but the file holds 26, the last shipped build. Bump it to 27 just before the next build. |

The billing and deletion-page work below is **not committed yet** and needs your approval.

---

## 2. Files changed for parts B and C (uncommitted)

| File | Change |
|---|---|
| `apps/mobile/app/subscription.tsx` | Android now shows the **Google Play** subscribe card. Razorpay/Cashfree plan picking appears only on the website (`WEB_CHECKOUT = Platform.OS === "web"`). |
| `apps/mobile/app/agreements.tsx` | The Razorpay/Cashfree checkout path runs only on the web. In the apps, agreements return to the subscription screen (Google Play flow). |
| `apps/mobile/components/GooglePlaySubscribe.tsx` | Lists Google Play offers in duration order (1, 3, 6, 12 months). |
| `server/src/payments/google-play.ts` | Default products are now `learnwise_monthly:1, learnwise_3month:3, learnwise_6month:6, learnwise_yearly:12`. |
| `.env.example` | Same four product IDs documented. |
| `server/src/privacy/privacy.service.ts` | New `createAccountDeletionRequest()`. |
| `server/src/privacy/privacy.routes.ts` | New public `POST /api/privacy/deletion-requests`, limited to 10 requests per hour per IP. |
| `apps/web/src/app/delete-account/page.tsx` | **New public page** `/delete-account`. |
| `apps/web/src/components/DeleteAccountForm.tsx` | New request form with confirmation screen. |
| `apps/web/src/app/layout.tsx` | "Delete Account" link added to the site footer. |
| `server/tests/dual-payment.test.ts` | Expects 4 products; new test for 3-month and 6-month purchases. |
| `server/tests/account-deletion-request.test.ts` | New tests for the deletion endpoint. |

No database migration. No change to Razorpay/Cashfree server code, website checkout, plans, subscription records, the package ID or the EAS project ID.

---

## 3. Google Play Billing (part B)

### What already existed (inspected, reused)
These pieces were built earlier and removed from the Android screen in commit `59a9292`:
- `services/play-billing.native.ts`: connects with `expo-iap`, loads offers, starts the purchase, listens for results, finishes transactions, lists owned purchases, opens Play subscription management.
- `components/GooglePlaySubscribe.tsx`: the purchase screen with **Subscribe**, **Restore purchases** and **Manage in Google Play**.
- `server/src/payments/google-play.ts`: verification against Google's servers, acknowledgement, real-time notifications (renewals, refunds) and voided purchases.
- Routes `GET /payments/google-play/config`, `POST /payments/google-play/verify`, `POST /payments/google-play/restore`, `POST /payments/google-play/rtdn`.

### Requirement checklist

| # | Requirement | Status | How |
|---|---|---|---|
| 1 | Inspect existing implementation | Done | See above |
| 2 | Android subscription screen uses Play Billing | **Done** | `GooglePlaySubscribe` restored on Android. Razorpay/Cashfree are hidden in the app; there's no other Android path to them (searched). |
| 3 | Monthly, 3-month, 6-month, yearly | **Done (code)** | Four product IDs, each mapped to the admin plan with the same `durationMonths` for seat count and plan code. The products must be created in Play Console (section 6). |
| 4 | Prices shown come from Google Play | Done | `fetchProducts` → `formattedPrice` from Play. No prices are hardcoded in the app. |
| 5 | Secure backend verification | Done | The server calls the **Google Play Developer API** (`purchases.subscriptionsv2`) with a service account kept on the server. The app only sends `productId` and `purchaseToken`. The purchase must be tied to the signed-in parent (`obfuscatedAccountId`), or the server rejects it (`PURCHASE_ACCOUNT_MISMATCH`). |
| 6 | Update parent subscription after verification | Done | Creates or updates the `Subscription` (`provider: google_play`) and a `Payment` record, then the screen reloads `/subscriptions/me`. |
| 7 | Cancellation, failure, restoration, renewal | Done | User cancel → "Purchase cancelled. You have not been charged." Failure → error message; payment stays safe and can be retried with Restore. Pending payments → access starts once Google confirms. **Restore purchases** re-verifies owned purchases. **Renewal, grace period, on hold, cancel, expiry and refund** come in through Google's real-time notifications (`/rtdn`). The purchase is acknowledged only after verification. |
| 8 | No duplicate entitlement | Done | Subscription is unique per hashed purchase token (`gp_<sha256>`, the raw token is never logged or returned). Payment is unique per Google order ID (`gp_order:<id>`). Row lock in a transaction. Notification de-duplication by message ID. A parent with an active Razorpay/Cashfree plan can't buy on Play until it ends (`ACTIVE_SUBSCRIPTION_OTHER_PROVIDER`). The website refuses checkout for Play subscribers (`MANAGED_BY_GOOGLE_PLAY`). |
| 9 | Existing records and admin plans preserved | Done | No schema or data change. Existing Razorpay/Cashfree subscriptions keep working, and the app shows them. |
| 10 | Website Razorpay/Cashfree unchanged | Done | Server payment code is untouched; the website flow is unchanged. |
| – | No secrets in the app | Done | The service account JSON and notification token live only in server environment variables. |
| – | No alternative billing in India | Done | Not enabled. |

### Server switches (all OFF by default; set them on the server at deploy time)
`PAYMENT_ENABLED=true`, `GOOGLE_PLAY_BILLING_ENABLED=true`, `GOOGLE_PLAY_PACKAGE_NAME=com.littlereaders.app`, `GOOGLE_PLAY_SERVICE_ACCOUNT_FILE=<path outside Git>`, `GOOGLE_PLAY_RTDN_TOKEN=<random secret>`, and optionally `GOOGLE_PLAY_PRODUCT_IDS` (if it's already set in production, it overrides the new 4-product default and must list all four).

Until `GOOGLE_PLAY_BILLING_ENABLED` is on, the Android screen shows "Subscriptions are not open yet."

---

## 4. Backend purchase verification status

**Implemented and tested with a mocked Google API.** It has not been tested against the real Google API: that needs the Play Console products, a service account and a Play-installed build, none of which exist yet. The automated tests cover:
- a valid purchase being verified, acknowledged once and activating access, with repeat verification making no duplicate;
- 3-month and 6-month products getting the right payment purpose;
- rejection of an invalid token, an unknown product, a product mismatch, or a purchase belonging to another parent;
- renewal, grace, on hold, cancel, expiry and revoke notifications, plus voided purchases and duplicate notification messages;
- upgrade from monthly to yearly (`linkedPurchaseToken`), which expires the old subscription;
- a Play subscriber being blocked from website checkout.

---

## 5. Account deletion page (part C)

**URL once deployed: `https://siwiapp.shop/delete-account`.** It's not live yet; production still returns 404 until the website and API are deployed.

| Requirement | Status |
|---|---|
| Clearly identifies Learn Wise | Title, app name, package `com.littlereaders.app`, site `siwiapp.shop` |
| Explains how to request deletion | 4-step process, plus the in-app path (Profile → Privacy & data requests) |
| Working form | Registered mobile (required, with country code), parent email (optional), name and reason (optional), guardian confirmation checkbox |
| Clear confirmation | "✅ Request received" with a reference number; no processing time is promised |
| Securely recorded for admins | Saved as an `ACCOUNT_DELETION` request in the existing `PrivacyDataRequest` table. It shows in **Admin → Privacy → Account / data deletion requests**, linked to the matching account when the mobile number or email matches. |
| Doesn't reveal whether an account exists | Same response for known and unknown numbers |
| Abuse protection | 10 requests/hour/IP; an open request for the same account is not duplicated |
| Data deletion and retention explained | What is deleted, what is kept (payment records "for the period required by applicable tax and accounting law", the request log, backups "removed in the normal backup cycle"), and a note to cancel the Google Play subscription first |
| No automatic deletion | Nothing is deleted; an administrator verifies and acts |
| Design consistent | Uses the existing `MarketingPage` layout and form styles; footer link added |
| No login needed | Public route |

> **Business and legal verification required before public deployment.** The page deliberately states **no** specific periods. None of the following has been certified, and each must be decided and verified by the business and legal adviser, then added to the page if desired:
> - payment/invoice record retention period (the page says only "the period required by applicable tax and accounting law");
> - backup deletion period (the page says only "removed as those backups are replaced in the normal backup cycle");
> - deletion request processing time (the confirmation promises no timeframe).

---

## 6. Testing results

| Check | Result |
|---|---|
| Server type check (`tsc`) | **0 errors** |
| Mobile app type check | **0 errors** |
| Website type check | **0 errors** |
| Final run before commit: `account-deletion-request` + `privacy-policy-workflow` + `dual-payment` | **27 / 27 passed** (3 files) |
| `dual-payment.test.ts` re-run on its own | **12 / 12 passed** |
| Earlier runs (same session) | 4 Razorpay website-order tests failed in `dual-payment.test.ts`, **with and without** these changes (checked by stashing them: 7 / 11, same 4 failures). They passed in both later runs, so they depend on local test-database state, not on this code. |
| Browser test of `/delete-account` (local website + local API + local DB) | Page loads (200), the form submits, the confirmation shows a reference, and the row is stored as `ACCOUNT_DELETION / SUBMITTED` with the normalised mobile `+91…`. An invalid number was rejected (400). The local test row was then removed. |
| Real Google Play purchase | **Not run.** Needs Play Console products and a build installed from Play (section 7). |

Local note: the Next.js dev server can't load `globals.css` from the project folder because of the `&` in its path. It ran correctly from `C:\lwb`. This doesn't affect production.

---

## 7. Remaining Google Play policy requirements

1. **Create the 4 subscription products in Play Console** (Monetize → Subscriptions): `learnwise_monthly` (1 month), `learnwise_3month` (3 months), `learnwise_6month` (6 months), `learnwise_yearly` (1 year). Each needs one auto-renewing base plan and a price.
2. **Service account**: Google Cloud service account with Play Console "View financial data" and "Manage orders and subscriptions". Store its JSON file on the server outside Git.
3. **Real-time developer notifications**: Pub/Sub topic and push subscription to `https://api.siwiapp.shop/api/payments/google-play/rtdn?token=<GOOGLE_PLAY_RTDN_TOKEN>`. Set the topic in Play Console → Monetization setup.
4. **License testers** in Play Console for test purchases.
5. **Deploy** API and website changes (needs your approval). Then `https://siwiapp.shop/delete-account` goes live; enter it in **App content → Data deletion**.
6. **Data safety, Target audience (Families) and content rating** forms in Play Console.
7. **Native payment SDKs**: Razorpay and Cashfree native libraries are still bundled in the Android app (Cashfree adds the `NFC` permission) although Android no longer uses them. Declare them in Data safety, or remove them from the mobile app in a later phase to simplify the Families review.
8. **Version code** → 27 before the next build. Prepared as a separate change, not part of the Phase 1 commit; it needs explicit approval. The one-line patch is at `Desktop\LearnWise-versionCode-27.patch` (apply with `git apply`).
9. **Retention wording** on `/delete-account` must be verified by the business and legal adviser before public deployment (section 5).

---

## 8. Exact next steps

1. Review and approve committing the files in section 2.
2. Play Console: create the 4 products (section 7, item 1), the service account (item 2), notifications (item 3) and testers (item 4).
3. With approval, deploy the API and website to production. Set the server switches listed in section 3, `pm2 restart siwi-api siwi-web`, then check:
   ```
   curl -s -o /dev/null -w "%{http_code}" https://siwiapp.shop/delete-account   # expect 200
   ```
4. Bump `apps/mobile/app.json` versionCode to **27** and build the AAB (local script or `eas build -p android --profile production`).
5. Upload to **Internal testing**, install from Play on a tester phone, and buy and restore each plan with a license tester account. Confirm access in the parent dashboard and in Admin → Subscriptions.
6. Complete Data deletion URL, Data safety, Families and content rating in Play Console, then send for review.
