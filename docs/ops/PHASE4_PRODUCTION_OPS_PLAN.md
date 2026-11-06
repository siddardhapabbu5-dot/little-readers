# Phase 4 — Production operations plan (approval required)

**Do not execute these steps without explicit written approval.**  
This document prepares VocabRound migration, Level-1 curriculum restore, SMS, and Razorpay live cutover. None of these were applied to Hostinger production during Phase 4 development.

---

## A. Required environment variables (report only)

### SMS / Parent OTP (production)

| Variable | Required when | Notes |
|----------|---------------|--------|
| `SMS_PROVIDER` | always | `msg91` or `http` (not `console` in prod) |
| `SMS_API_KEY` | msg91 / http | Provider auth key |
| `SMS_SENDER_ID` | msg91 | Approved sender ID |
| `SMS_TEMPLATE_ID` | msg91 | Template with `otp` variable |
| `SMS_HTTP_URL` | optional msg91 / required http | Override endpoint |
| `OTP_EXPIRY_SECONDS` | optional | Default `300` |
| `OTP_RESEND_SECONDS` | optional | Default `60` |
| `OTP_MAX_ATTEMPTS` | optional | Default `5` |
| `OTP_MAX_SENDS_PER_HOUR` | optional | Default `5` |
| `OTP_DEV_MODE` | **must be unset / false in prod** | Never expose OTP in API JSON |

### Razorpay

| Variable | Sandbox test | Live (later) |
|----------|--------------|--------------|
| `PAYMENT_ENABLED` | `true` only for sandbox E2E | Keep `false` until live approval |
| `RAZORPAY_KEY_ID` | `rzp_test_…` | `rzp_live_…` (approval only) |
| `RAZORPAY_KEY_SECRET` | test secret | live secret (approval only) |
| `RAZORPAY_WEBHOOK_SECRET` | webhook secret | live webhook secret |
| Plan amounts / published DB plans | required for checkout | Do not invent prices |

### Clients

| Variable | Production value |
|----------|------------------|
| `EXPO_PUBLIC_API_URL` | `https://api.siwiapp.shop/api` (or approved API origin) |
| `NEXT_PUBLIC_API_URL` | Same Express API base ending in `/api` |
| `EXPO_PUBLIC_WEB_APP_URL` | `https://siwiapp.shop` (checkout handoff) |

---

## B. VocabRound migration (NOT executed)

**File:** `server/prisma/migrations/20261106180000_vocab_round_activities/migration.sql`

```sql
ALTER TYPE "VocabRound" ADD VALUE 'MATCHING';
ALTER TYPE "VocabRound" ADD VALUE 'QUIZ';
ALTER TYPE "VocabRound" ADD VALUE 'REVISION';
```

### Backup / restore plan

1. Take a full PostgreSQL backup of Hostinger production (`pg_dump` or Hostinger snapshot).
2. Store backup off-host with timestamp + checksum.
3. On a **staging** copy of prod data, run `npx prisma migrate deploy` and verify Matching/Quiz/Revision sessions.
4. After approval only: deploy the same migration to production during a maintenance window.
5. Rollback: restore from the backup taken in step 1 (enum `ADD VALUE` is not trivially reversible in PostgreSQL without restore).

**Does not** delete learning history or rewrite Level-1 words.

---

## C. Level-1 750-word curriculum restore (NOT executed)

**Source of truth (repo):** `server/prisma/data/level1-vocabulary.generated.json` (750 unique / 10×75).  
**Script:** `npm run db:restore-level1-vocab` → `server/scripts/restore-level1-vocabulary.mjs` (upsert by category+text; preserves progress).

### Backup / restore plan

1. Backup production DB.
2. Dry-run restore on staging; verify category/group/word counts and that `learningProgress` / attempts / sessions counts are unchanged.
3. After approval only: run restore against production.
4. Rollback: restore DB backup if content is wrong; do **not** wipe student progress to “fix” content.

---

## D. Razorpay live cutover (NOT executed)

1. Keep `PAYMENT_ENABLED=false` until approval.
2. Sandbox: set test keys + `PAYMENT_ENABLED=true` on a non-prod environment only.
3. Live: replace keys, configure webhook URL to `/api/payments/webhook` (or mounted path), set `PAYMENT_ENABLED=true` only after signed approval.
4. Verify signature verification and that subscriptions activate only after `/payments/verify` or verified webhook.

---

## E. Explicitly deferred

- Hostinger production DB changes
- VocabRound production migrate
- Level-1 production restore
- Live Razorpay
- SMS credential changes on Hostinger
- APK/AAB / EAS builds
- Phase 5
