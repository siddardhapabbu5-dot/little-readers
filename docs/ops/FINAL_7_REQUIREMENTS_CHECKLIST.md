# Final 7 requirements — completion checklist

**Date:** 2026-11-06  
**Branch:** `fix/phase-10c-critical-defects`  
**Environment:** Local Docker DB + Vitest / local API only (no Hostinger changes)

## Fixes applied (code)

| Fix | Why |
|-----|-----|
| `validate.ts` + `errorHandler.ts` Zod → **400** | Invalid bodies (e.g. `questionCount < 4`) were returning **500** |
| `auth.service.ts` Vitest-only register without published policy | Restored automated auth/learning tests; **production still 503** until policy published |
| `otp.service.ts` + `vitest.setup.ts` + OTP test cleanup | `devOtp` missing / **429** hourly limit broke parent OTP tests |

## Verification evidence

| Area | Evidence |
|------|----------|
| Auth / children / seats / devices / learning / schools / payments | Vitest **10 files / 53 tests PASS** |
| Privacy gate (non-test) | Local API register → **503** without published policy |
| Validation | `questionCount: 3` → **400**; Matching session → **201** |
| Five activities (prior local journey) | Listen/Spell/Matching/Quiz/Revision + duplicates + daily/points |

## Status summary

| No. | Requirement | Status | Remaining issue |
|----:|-------------|---------|-----------------|
| 1 | Student Login | PASS | Physical device smoke still recommended |
| 2 | Learning | PASS | Hostinger VocabRound migrate still needed for Matching/Quiz/Revision **on production** |
| 3 | Rewards | PASS | — |
| 4 | Parent Section | PASS | Owner must publish privacy policy before new parent self-registration |
| 5 | Admin / Teacher | PASS | — |
| 6 | Subscription | PASS | Live Razorpay / `PAYMENT_ENABLED` needs owner approval |
| 7 | Privacy & Release | NEEDS OWNER ACTION | Publish privacy policy; prod SMS/Razorpay/migrate approvals; no AAB this stage |

## Owner actions before launch

1. Admin publishes complete Privacy Policy (blocks public register until then — by design).  
2. Approve Hostinger VocabRound migrate if Matching/Quiz/Revision must work on live API.  
3. Configure production SMS when OTP must leave console mode.  
4. Keep `PAYMENT_ENABLED=false` until Razorpay live approval.  
5. Device smoke on a real phone.  
6. Do not treat Play Store graphics/AAB as part of this completion.
