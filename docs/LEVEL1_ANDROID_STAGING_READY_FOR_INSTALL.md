# Level-1 Android — Staging ready for install approval

**Date:** 2026-11-19  
**Gate:** **Phase 1 final pre-install validation PASS** · **STOPPED for owner install approval**

## Summary

Isolated local staging is running. Staging APK re-validated (no rebuild). Samsung SM-S921B reaches staging API over LAN (**HTTP 200**). Prod VC27 recovery APK preserved. **No install performed.**

**Current AD counts remain 23 PASS / 0 FAIL / 10 BLOCKED until tests execute on device.**

## Staging API

| Item | Value |
|------|--------|
| Base URL | `http://192.168.1.20:4100/api` |
| DB | `localhost:5437` (Docker) |
| Redis | `localhost:6379` |
| Isolation | Confirmed — no production DB URL |

## Staging APK (awaiting install approval)

| Item | Value |
|------|--------|
| File | `exports/LearnWise-1.0.0-vc27-staging-lan.apk` |
| SHA-256 | `FAF5190FA21581970F85FEBE5BFED354CD39C915929BF8365F191A2D327FFEAA` |
| Package | `com.littlereaders.app` |
| Version | `1.0.0` (27) |
| Cert SHA-256 | `6d283c94…e2707a` (same as prod VC27) |
| Bundle API | LAN only — **no** `api.siwiapp.shop` |
| Install command (after approval) | `adb install -r exports/LearnWise-1.0.0-vc27-staging-lan.apk` |
| Forbidden | `pm clear`, uninstall, Play upload |

## Recovery

```text
adb install -r exports/LearnWise-1.0.0-vc27-login-only.apk
```

SHA-256 prod recovery: `709D9999D8A43F4EA441A2DD734EE976F2F4DB4461E689E7CD7BA3C7CEB3FBA4`

## Test account

- Email (masked): `qa.***@test.local`
- Child: `AD Child G1` with LEVEL_1 seat
- Credentials: local `.secrets/` only (not in reports)
- Reset: re-run `server/scripts/_staging-android-ad-fixtures.ts`

## Phase 1 validation (2026-11-19) — no rebuild

| Check | Result |
|-------|--------|
| Staging APK path | `exports/LearnWise-1.0.0-vc27-staging-lan.apk` |
| SHA-256 | `FAF5190FA21581970F85FEBE5BFED354CD39C915929BF8365F191A2D327FFEAA` |
| Package / VC | `com.littlereaders.app` / **27** / `1.0.0` |
| Cert SHA-256 | `6d283c941deb3a2823ea1c11d9dd5c2e7b8ba9e044dbaf0de00e878c32e2707a` |
| Bundle API | `http://192.168.1.20:4100/api` **×1** |
| Prod API `https://api.siwiapp.shop/api` | **×0** |
| `rzp_live_` in bundle | **×0** |
| Residual `siwiapp.shop` strings | Policy/website/TV/pricing links only — **not** API base |
| Cleartext | `usesCleartextTraffic=true` |
| DB isolation | `localhost:5437` only; Razorpay `rzp_test_` |
| API health LAN/local | **200** |
| Device | SM-S921B `RZCX42381TM` · Wi‑Fi `192.168.1.16` (same `/24` as host) |
| Device → staging `:4100/api/health` | **HTTP 200** (`little-readers-api`) via `toybox nc` |
| Prod recovery APK | Present · SHA-256 `709D9999…FBA4` |
| Installed on phone now | Still prod-pointed VC27 (not replaced) |

## Owner action required

1. Reply **approve install** of the staging LAN APK (`adb install -r`, no data clear).  
2. Agent will then execute AD-06, 07, 13, 14, 19, 23, 28, 30, 32, 33 and update reports.

**Stopped for approval. No device install performed.**
