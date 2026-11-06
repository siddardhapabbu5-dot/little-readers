# Environment variables guide

Never commit real secrets. Client (`EXPO_PUBLIC_*` / `NEXT_PUBLIC_*`) values are **visible in binaries** — only put non-secret URLs and feature flags there.

## Environments

| Env | Mobile API | Web API | Payments | SMS |
|-----|------------|---------|----------|-----|
| Local | `http://localhost:4100/api` | same | `PAYMENT_ENABLED=false` | `SMS_PROVIDER=console`, `OTP_DEV_MODE=1` |
| Preview / staging | `https://api.siwiapp.shop/api` (or staging host) | same | false or Razorpay **test** keys | console or test SMS |
| Production | `https://api.siwiapp.shop/api` | same | live only after approval | MSG91/HTTP after approval |

## Server (Express) — root `.env` / Hostinger

| Variable | Required | Notes |
|----------|----------|--------|
| `DATABASE_URL` | yes | PostgreSQL connection string |
| `JWT_SECRET` | yes | ≥32 chars |
| `JWT_EXPIRES_IN` / `ACCESS_TOKEN_EXPIRY` / `REFRESH_TOKEN_EXPIRY` | recommended | Auth TTLs |
| `CORS_ORIGIN` | yes | Comma-separated web + Metro origins |
| `NODE_ENV` | yes | `production` on Hostinger |
| `PORT` | yes | API listen port |
| `OTP_*` / `SMS_*` | prod OTP | See Phase 4 ops plan |
| `RAZORPAY_*` / `PAYMENT_ENABLED` | payments | Keep live off until approval |
| `PLAN_*_AMOUNT_PAISE` / tax | optional | Env plan prices; prefer published DB plans |
| `RESEND_*` / `SUPPORT_EMAIL` | email/support | Password reset + forgot-mobile |
| `APP_PUBLIC_URL` / `MOBILE_PUBLIC_URL` | redirects | Web + Expo web origins |

## Mobile (EAS / `apps/mobile/.env`)

| Variable | Public? | Notes |
|----------|---------|--------|
| `EXPO_PUBLIC_API_URL` | yes | Must end with `/api`; no localhost in store builds |
| `EXPO_PUBLIC_WEB_APP_URL` | yes | Checkout / portal handoff |
| `EXPO_PUBLIC_WEB_URL` | yes | Alias used by some screens |
| `EXPO_PUBLIC_ENABLE_DEMO` | yes | `0` for production |

## Web (Next.js)

| Variable | Public? | Notes |
|----------|---------|--------|
| `NEXT_PUBLIC_API_URL` | yes | Express API base ending in `/api` |
| `NEXT_PUBLIC_NEST_API_URL` | optional | Legacy Nest pointer if still referenced |

## EAS

| Item | Notes |
|------|--------|
| Expo account / `owner` | `tjgf-hjgl` in `app.json` |
| `extra.eas.projectId` | `05c9d4b3-b240-4dc7-9f2b-648e7243e2d0` |
| Profiles | `development`, `preview`, `staging`, `production` in `apps/mobile/eas.json` |
| Apple / Google creds | Stored in Expo credentials service — not in Git |

## Do not put in client env

- `DATABASE_URL`, `JWT_SECRET`, SMS keys, Razorpay **secret**, webhook secret, Resend API key, Postgres passwords.
