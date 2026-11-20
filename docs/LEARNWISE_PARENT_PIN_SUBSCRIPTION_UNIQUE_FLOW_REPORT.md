# Learn Wise — Parent PIN Subscription Unique Flow Report

**Date:** 2026-11-20  
**Scope:** Align progress labels and confirm the existing unique Parent PIN → subscription → verified-payment path  
**Plan:** Parent PIN Payment Flow (same unique path)  

**Production payment / subscription writes / APK rebuild / backend deploy:** **Not performed**

**Assessment:** **PASS** (labeling + routing preserved + focused tests)

---

## 1. Decision preserved

One canonical checkout path (no parallel payment system):

1. **Parent PIN** — gate (`RequireParentGate` / `ParentGateModal`)  
2. **Learn Wise Grade** — `/child-setup` (first-time / incomplete setup)  
3. **Learning Phone** — `/child-setup`  
4. **Subscription** — `/subscription` summary  
5. **Choose a Plan** — same screen (catalog pricing; Continue)  
6. **Learn Wise Agreements** — `/agreements`  
7. **Payment Method** — same screen (Razorpay/Cashfree web; Google Play on Android)  

Activate **only** after existing backend payment verification.  
Renewals skip Grade/Phone and open `/subscription` after PIN.  
Student Subscription remains read-only parent-guidance; PIN is not a student login credential.

---

## 2. Files changed

| File | Change |
|------|--------|
| `apps/mobile/components/RegistrationSteps.tsx` | Progress labels → 7 product step names; document route map |
| `apps/mobile/app/parent.tsx` | Remove misleading step-1 progress on Add Child (PIN is gate) |
| `apps/mobile/app/subscription.tsx` | Setup progress step 4 / 5 when plan selected; comment on `setup=1` |
| `apps/mobile/app/agreements.tsx` | Progress step 6 Agreements / 7 Payment Method |
| `apps/mobile/app/child-setup/[id].tsx` | Comment clarifying continue to `/subscription?setup=1` |

No new routes. No price changes. No backend changes.

---

## 3. Navigation confirmation

| Path | Behavior |
|------|----------|
| Profile → Subscription (PARENT) | PIN unlock → `/subscription` (renewal; no forced Grade/Phone) |
| Add Child → child-setup → done | Grade → Phone → `/subscription?setup=1` |
| Continue with plan | `/agreements?planId&childId&region` (selections in query) |
| Agreements Back | `router.back()` while not paying (preserves prior screen state) |
| Student → Subscription | `StudentSubscriptionSafeView` (no PIN / no pay APIs) |
| Admin grade-grant | Untouched |

---

## 4. Focused test / preflight results

| Check | Result |
|-------|--------|
| `server/tests/parent-gate-pin.test.ts` | **2/2 PASS** |
| `apps/mobile/services/avatar-auth.test.ts` | **PASS** |
| Source preflight (labels, setup route, agreements push, student safe, parent gate, step 4/5 & 6/7) | **PASS** |

Not run (restricted): production payments, APK rebuild/install, live Razorpay charge.

---

## 5. Restrictions compliance

| Restriction | Status |
|-------------|--------|
| No production payment / subscription / DB changes | Observed |
| No backend deploy | Observed |
| No APK rebuild or install | Observed |
| No new student / Grades 2–4 unlock | Observed |
| No commit / push (this task) | Observed |

---

## 6. Stop

Labeling and unique-path confirmation complete. Ready for separate staging UI QA or APK work only if explicitly approved later.
