# Level-1 — Payment & Expiry Acceptance (Executed)

**Date:** 2026-11-18  
**Environment:** Local staging only — `DATABASE_URL` → `localhost:5437`; Razorpay key prefix `rzp_test_`; `PAYMENT_ENABLED=true`  
**Mode:** Sandbox / stub checkout (no live card PAN; no production charges)  
**Runner:** Vitest `tests/batch10-payments.test.ts`, `tests/dual-payment.test.ts`, `tests/device-subscription.test.ts`  
**Overall gate status:** **PASS with residual defect** (see PAY-DEF-01)

---

## Safety confirmation

| Check | Result |
|-------|--------|
| Local DB (`localhost` / `:5437`) | **PASS** |
| Production host markers absent from `DATABASE_URL` | **PASS** |
| Razorpay `rzp_test_` only (not `rzp_live_`) | **PASS** |
| Production subscriptions / customers mutated | **No** |
| Real charges created | **No** |
| Production env vars / deploy / AAB | **No** |

Test account identifiers are masked (`qa_***@test.local`, demo emails only on local DB).

---

## Case results (Phase 1 — 10 gates)

### PAY-01 — Successful test payment
| Field | Value |
|-------|--------|
| Expected | Stub/sandbox success activates subscription |
| Actual | `POST /api/payments/verify` → 200; `subscription.status=ACTIVE`; `alreadyProcessed=false` on first verify |
| Result | **PASS** |
| Evidence | `batch10-payments.test.ts` — “verifies stub payment once and grants yearly + extra seat idempotently” |

### PAY-02 — Failed payment
| Field | Value |
|-------|--------|
| Expected | Failed webhook leaves entitlement unchanged; payment `FAILED` |
| Actual | `payment.failed` webhook 200; payment rows `FAILED`; `expiresAt` unchanged vs before |
| Result | **PASS** |
| Evidence | `batch10-payments.test.ts` — “records cancelled and failed payments without activating anything” |

### PAY-03 — Cancelled payment
| Field | Value |
|-------|--------|
| Expected | Cancel API marks order failed; no activation |
| Actual | `POST /api/payments/cancel` → 200; `status=FAILED`; no entitlement extension |
| Result | **PASS** |
| Evidence | Same test as PAY-02 |

### PAY-04 — Duplicate payment callback / webhook
| Field | Value |
|-------|--------|
| Expected | Idempotent capture; single entitlement grant |
| Actual | Duplicate signed webhook → 200; race of `/verify` + webhook → exactly one `alreadyProcessed`; one payment `SUCCEEDED` |
| Result | **PASS** |
| Evidence | “rejects invalid webhooks and handles duplicate captured events”; “activates once when /verify and the webhook arrive together” |

### PAY-05 — Subscription activation after successful payment
| Field | Value |
|-------|--------|
| Expected | ACTIVE subscription after verify |
| Actual | Verify body `subscription.status=ACTIVE`; yearly period extended ~365 days on race test |
| Result | **PASS** |
| Evidence | batch10 success + race tests |

### PAY-06 — Correct Grade-1 access after activation
| Field | Value |
|-------|--------|
| Expected | LEVEL_1 child can start learning when subscribed + device registered |
| Actual | Active sub → `POST /api/learning/sessions` **201** for Level-1 child; groups for level 1 load |
| Result | **PASS** |
| Evidence | `device-subscription.test.ts` — “enforces subscription and device on mobile learning sessions” |

### PAY-07 — Subscription expiry
| Field | Value |
|-------|--------|
| Expected | Expired / EXPIRED state removes eligibility |
| Actual | Local expire → status EXPIRED; Google RTDN expiry paths set EXPIRED; `subscriptions/me` `eligible=false` after expiry notification |
| Result | **PASS** |
| Evidence | device-subscription expire step; dual-payment RTDN expiry / revoke cases |

### PAY-08 — Grade-1 access after expiry
| Field | Value |
|-------|--------|
| Expected | Learning blocked after expiry |
| Actual | `POST /api/learning/sessions` → **402** when subscription EXPIRED |
| Result | **PASS** |
| Evidence | `device-subscription.test.ts` expired session assertion |

### PAY-09 — Payment status synchronization
| Field | Value |
|-------|--------|
| Expected | Payment row and subscription stay consistent across verify/webhook |
| Actual | Race test: payment `SUCCEEDED` with matching `razorpayPaymentId`; one activation only |
| Result | **PASS** |
| Evidence | batch10 race + duplicate webhook tests |

### PAY-10 — Refresh / retry after interrupted payment
| Field | Value |
|-------|--------|
| Expected | Client retry of verify is safe |
| Actual | Second identical verify → 200 `alreadyProcessed=true`; subscription count remains 1 |
| Result | **PASS** |
| Evidence | batch10 idempotent verify |

---

## Supporting suite summary

| Suite | Passed | Failed | Notes |
|-------|-------:|-------:|-------|
| `batch10-payments.test.ts` | 8 | 0 | Razorpay stub path |
| `dual-payment.test.ts` | 11 | 1 | See PAY-DEF-01 |
| `device-subscription.test.ts` | 4 | 0 | Grade-1 session + expiry |

---

## Defects

### PAY-DEF-01 — Dual-provider seat entitlement create-child 400
| Field | Value |
|-------|--------|
| Severity | **P2** |
| Status | **OPEN** |
| Area | Dual payment / seats |
| Finding | `dual-payment.test.ts` “shares one entitlement across app and website, seats two children…” failed: second `POST /api/children` returned **400** (expected 201) |
| Impact | Does not break the Level-1 Razorpay success/fail/cancel/idempotency/expiry session gates above; blocks claiming full dual-seat family entitlement in this run |
| Suggested fix | Separate approved investigation of seat capacity / child-create validation — **not executed** |

---

## Sign-off

| Role | Date | Outcome |
|------|------|---------|
| Payments tester (automated sandbox) | 2026-11-18 | **PASS** (10/10 mapped gates; 1 residual suite defect) |
| Owner / client | | Accept / Reject / Waive PAY-DEF-01 |

**Production payment configuration and customer records were not changed.**
