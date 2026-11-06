# Production deployment sequence

Order matters. **Approval gates** stop automatic execution.

## 0. Preconditions

- Phases 1–5 code complete on the release branch.
- Hostinger API + Postgres healthy.
- Secrets already present locally for staging tests only — do not change Hostinger without approval.

## 1. Backup

1. Full PostgreSQL dump / Hostinger snapshot.
2. Record checksum + timestamp.
3. Keep off-host copy.

## 2. Approval-gated data ops (from Phase 4 plan)

Only after explicit approval, in this order:

1. Configure production SMS credentials (MSG91/HTTP).
2. Apply VocabRound migration on staging → verify → production.
3. Dry-run Level-1 750-word restore on staging → production.
4. Razorpay live keys + `PAYMENT_ENABLED=true` (last).

See `docs/ops/PHASE4_PRODUCTION_OPS_PLAN.md`.

## 3. API / web deploy

1. Deploy Express API build to Hostinger (existing process).
2. Deploy Next.js web (`apps/web`) with `NEXT_PUBLIC_API_URL=https://api.siwiapp.shop/api`.
3. Smoke: `/api/health`, parent OTP send (SMS), admin login, student Learn start.

## 4. Mobile binaries (Phase 6)

1. Bump `version` / `versionCode` / `buildNumber` if needed.
2. `eas build` Android production (AAB) + iOS production.
3. Internal testing installs — **no** store submit until checklist pass.

## 5. Store submission (Phase 6+)

1. Play internal track → closed → production.
2. TestFlight → App Review.
3. Monitor crash + OTP + payments (if live).

## Rollback

| Failure | Action |
|---------|--------|
| Bad API deploy | Redeploy previous API artifact; keep DB |
| Bad migration | Restore DB from step-1 backup (preferred for enum changes) |
| Bad mobile build | Halt store rollout; ship previous binary; fix + rebuild |
| Payment issues | Set `PAYMENT_ENABLED=false` immediately; do not delete payment rows |

Never delete student learning history to “fix” a release.
