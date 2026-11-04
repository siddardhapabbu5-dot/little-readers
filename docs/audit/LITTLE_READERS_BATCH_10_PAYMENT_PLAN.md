# Batch 10 — Payment Gateway & Subscription Checkout (plan)

**Date:** 2026-11-05  
**Recommended gateway:** Razorpay (sandbox first).  
**Constraint:** Preserve seats (base 2 + extras), device lock on children only, grace/eligibility. No fake payment success. No final production go-live.

---

## 1. Inspection summary (before coding)

| Area | Today |
|------|--------|
| Live API | Express `server/` — Parent/Kids/Admin/Teacher use this |
| `Subscription` | Parent-level; `plan`, `status`, `startedAt`/`expiresAt`/`graceEndsAt`, `includedSeats` (2), `extraSeats`, `provider`, `providerRef?` |
| Eligibility | `ACTIVE`/`TRIALING`/`GRACE`/`PAST_DUE` + expiry/grace window (`isSubscriptionRecordEligible`) |
| Seats | Option B: `Child.hasLearningSeat`; capacity = included + extra; assign/unassign/grant/revoke |
| `Payment` | Exists: `amountCents`, `currency`, `status` PENDING\|SUCCEEDED\|FAILED\|REFUNDED, `provider`, `providerRef?` unique, optional `subscriptionId` |
| Checkout | **None** — `/subscriptions/verify` & `/status` are **501 stubs** |
| Admin grants | `POST /subscriptions/seats/grant` creates SUCCEEDED `Payment` with `manual_admin` (amount 0 allowed) |
| School packages | `SUBSCRIPTION_PACKAGES` in config = **school** capacity — **not** parent B2C prices |
| Mobile | Subscription screen read-only; notes checkout when provider configured |
| Prices | **Not approved** — must not invent rupee amounts |

**Business rules to preserve**

1. Base plan = **2** included child seats.  
2. Extra children need paid add-on seats (or explicit Admin grant).  
3. Independent child progress + one device per child.  
4. Parent/Teacher/Admin not device-locked.  
5. Server-side subscription enforcement + grace.  
6. Never duplicate Parent subscription or Child rows for payment.

---

## 2. Gateway choice: Razorpay **Orders (one-time)** + controlled renewal

### Chosen: One-time Razorpay Orders / Payments (not Razorpay Subscriptions v1)

| Option | Pros | Cons |
|--------|------|------|
| **A. Orders API (chosen)** | Matches existing `expiresAt` model; extra seats are one-shot; simple idempotent webhooks; renew = new order that extends expiry; sandbox easy to test | Parent must re-pay to renew (no auto-debit until Phase later) |
| B. Razorpay Subscriptions | Auto-renew | Needs plan IDs at Razorpay; maps poorly to current schema; extra seats awkward; more failure modes before prices approved |

**Why A:** Little Readers already treats entitlement as a dated `Subscription` row plus seat counters. Activation after a verified one-time payment already fits Admin grant + ledger. Recurring Subscriptions can be added later once merchant plans and prices are approved — without blocking Batch 10 verification security.

Tax: optional `TAX_RATE_BPS` applied server-side to configured base amounts (not invented list prices).

---

## 3. Mobile / App Store policy (document before native checkout)

Digital subscriptions sold **inside** App Store / Play Store apps generally require Apple IAP / Google Play Billing.

**Batch 10 policy**

| Surface | Checkout |
|---------|----------|
| **Website** (`apps/web`) | Full Razorpay Checkout (Orders + Checkout.js / hosted) |
| **Mobile Expo** | **No embedded native IAP this batch.** Parent sees plans + “Pay securely on the website” deep link / in-app browser to web checkout, or sandbox WebBrowser to web success/pending/failure pages. Store-compliant native billing = later release. |
| **Do not** assume website Razorpay can be silently embedded into a store binary as the sole purchase path without store review risk. |

---

## 4. Configurable prices (no invented amounts)

Prices live in **server env** (Admin-managed ops config until a Plan UI exists):

```
RAZORPAY_KEY_ID=
RAZORPAY_KEY_SECRET=
RAZORPAY_WEBHOOK_SECRET=
PAYMENT_CURRENCY=INR
PLAN_FAMILY_MONTHLY_AMOUNT_PAISE=   # empty = not offered
PLAN_FAMILY_YEARLY_AMOUNT_PAISE=
PLAN_EXTRA_SEAT_AMOUNT_PAISE=
TAX_RATE_BPS=0                     # e.g. 1800 = 18% GST placeholder
PAYMENT_ENABLED=false              # must be true + keys to create orders
```

`GET /payments/plans` returns only plans with configured positive amounts. If none configured / `PAYMENT_ENABLED` false → checkout APIs return **503** with `PLAN_PRICES_NOT_CONFIGURED` (screens show “Checkout unavailable until prices are configured”).

Demo seed subscriptions (`manual_seed`) remain for learning tests; they are not Razorpay purchases.

---

## 5. Schema changes

Extend `Payment` (reuse table; no parallel ledger):

| Field | Purpose |
|-------|---------|
| `purpose` | `FAMILY_MONTHLY` \| `FAMILY_YEARLY` \| `EXTRA_SEATS` \| `MANUAL_ADMIN` |
| `seatsPurchased` | Int, default 0 (extra seats SKU) |
| `planCode` | String? mirror purpose/plan |
| `razorpayOrderId` | String? indexed |
| `razorpayPaymentId` | String? |
| `rawEventId` | String? unique — webhook idempotency |
| `metadataJson` | String? audit |

Optional `CheckoutIntent` not required if PENDING `Payment` is created at order time with unique `providerRef` = Razorpay `order_id`.

Migration: `20261105030000_payment_checkout`.

---

## 6. APIs

| Method | Path | Role | Behavior |
|--------|------|------|----------|
| GET | `/payments/plans` | PARENT+ | Catalog from env (amounts, seats, tax, totals) |
| POST | `/payments/orders` | PARENT | Create Razorpay order + Payment PENDING; body `{ purpose, seats? }` |
| POST | `/payments/verify` | PARENT | Verify checkout signature **and** fetch payment from Razorpay; activate idempotently |
| POST | `/payments/webhook` | public + signature | Idempotent activation / fail / refund |
| GET | `/payments/me` | PARENT | Payment history |
| GET | `/payments/admin` | ADMIN+ | All payments + subscription context |
| GET | `/subscriptions/me` | unchanged | Still source of seat/eligibility truth |

Remove/replace 501 stubs for verify/status with real payment routes (keep path clarity under `/payments/*`).

**Activation (server only, after verify)**

- `FAMILY_*`: upsert/extend parent `Subscription` → `ACTIVE`, `includedSeats=2`, set/extend `expiresAt` (monthly +30d / yearly +365d from max(now, currentExpires)), `provider=razorpay`, link payment.  
- `EXTRA_SEATS`: increment `extraSeats` by purchased count; **idempotent** on same `providerRef` / payment id.  
- Preserve existing child `hasLearningSeat` assignments.  
- Refund webhook: mark Payment REFUNDED; do **not** silently wipe seats if assigned — Admin revoke path remains for capacity reduction.

**Never** grant seats from a client “success” flag alone.

---

## 7. UI

**Website**

- Parent: `/parent/checkout` (plans, order summary, Razorpay script, success/pending/failure).  
- Parent: payment history on `/parent` or `/parent/payments`.  
- Admin: extend `/admin/subscriptions` with payment history + purpose + manual vs paid badge.

**Mobile**

- Subscription screen: show plans from API; CTA opens website checkout URL (`APP_PUBLIC_URL/parent/checkout?...`) via `Linking` / WebBrowser.  
- Status/history list from `/payments/me`.  
- Document store IAP gap in UI copy.

---

## 8. Security & tests

| Case | Expect |
|------|--------|
| Invalid checkout signature | 400, no activation |
| Forged frontend success (skip verify) | No seat/sub change |
| Invalid webhook signature | 400 |
| Duplicate webhook / verify | Same payment; seats/sub not double-applied |
| Failed/pending payment | No ACTIVE grant |
| EXTRA_SEATS after pay | Capacity +N once |
| Expiry still enforced | Existing eligibility |
| Device lock | Unchanged for children |
| Teacher/parent isolation | Teachers 403 on payment admin |
| Sandbox | Test mode keys only in dev |

Use HMAC fixtures / stub Razorpay client in unit tests when keys absent.

---

## 9. Env & webhook ops

- Dashboard: webhook URL `https://<api>/api/payments/webhook`  
- Events: `payment.captured`, `payment.failed`, `refund.processed` (as available)  
- Never commit live secrets.  
- Production activation of live keys = **out of Batch 10 scope**.

---

## 10. Non-goals (Batch 10 stop)

- Live merchant go-live / production key cutover  
- Apple IAP / Play Billing  
- Razorpay Subscriptions auto-renew  
- Inventing approved consumer price list  
- School license checkout  

---

## 11. Implementation order

1. This plan (before schema/code) ✓  
2. Migration + env + Razorpay client wrapper  
3. Order / verify / webhook / activate services  
4. Website checkout + Admin payments  
5. Mobile plans + web checkout handoff + history  
6. Tests + tsc + build + audit  
7. **Stop**

---

## Implementation status (2026-11-05) — COMPLETE

| Item | Status |
|------|--------|
| Gateway | Razorpay **Orders** (one-time) + controlled renewal |
| Migration `20261105030000_payment_checkout` | Applied |
| APIs `/payments/plans|orders|verify|webhook|me|admin` | Done |
| Website checkout + history + Admin payments | Done |
| Mobile plans + web checkout handoff + history | Done (no native IAP) |
| Stub/sandbox tests | PASS (`batch10-payments.test.ts`) |
| Live Razorpay sandbox merchant capture | **Not run** (stub HMAC path; needs merchant keys) |
| Production key cutover | **Out of scope** |

**Batch 10 stop.**
