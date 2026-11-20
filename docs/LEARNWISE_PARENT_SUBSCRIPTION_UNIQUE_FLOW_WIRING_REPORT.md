# Learn Wise — Parent Subscription Unique Flow Wiring

**Date:** 2026-11-20  
**Goal:** Enforce the flowchart path from Dashboard/Profile → Subscription  

```
Dashboard_or_Profile_Subscription
  → ParentGateModal
  → Child_setup_complete?
       incomplete → child-setup_Grade → child-setup_LearningPhone → subscription_status_plus_plan
       complete   → subscription_status_plus_plan
  → Continue_with_plan
  → agreements_plus_Pay
  → Backend_payment_verify
  → receipt
```

**Production payment / APK rebuild / backend deploy:** not performed  

---

## Implementation

| Step | Wiring |
|------|--------|
| Entry | Profile **Subscription**, Parent **Renew/activate** / bell / locked Learn → `/subscription-entry` |
| Parent PIN | `RequireParentGate` on `/subscription-entry` |
| Branch | `resolveSubscriptionEntryHref()` in `services/subscription-entry.ts` |
| Incomplete | `/child-setup/:id` (Grade → Learning Phone); then `/subscription?setup=1` |
| Complete / renewal | `/subscription` (status + plan) |
| Continue | existing `/agreements?planId&childId&region` |
| Pay + verify | existing agreements Razorpay/Cashfree/Play + backend verify |
| Receipt | existing `/receipt/[id]` |
| Students | still `/subscription` safe view (no PIN, no pay) |

### Files

- `apps/mobile/app/subscription-entry.tsx` (new)
- `apps/mobile/services/subscription-entry.ts` (new)
- `apps/mobile/app/(tabs)/profile.tsx`
- `apps/mobile/app/parent.tsx`
- `apps/mobile/app/child-setup/[id].tsx` (mark setup complete; skip to phone if grade set)
- `apps/mobile/services/parent-gate.ts` (protect `/subscription-entry`)

Setup-complete heuristics: local flag after Learning Phone; or device registered; or child already entitled (backfill for existing parents).

---

## Tests

| Check | Result |
|-------|--------|
| `subscription-entry.test.ts` (source wiring) | **PASS** |
| Parent PIN server APIs | Unchanged |
| Live payment | **Not run** (restricted) |

---

## Stop

Unique flow routing is in source. Visible on device only after an approved APK build/install. No production charges or backend deploy in this task.
