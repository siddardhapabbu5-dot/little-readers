# Phase 5 — Production preparation summary

Phases 1–4 remain implemented. Phase 5 prepares Android/iOS release configuration and documentation. **No APK/AAB/IPA was generated. No EAS build was started. No Hostinger production changes.**

## Offline / network behavior (honest limits)

| Scenario | Behavior |
|----------|----------|
| No internet | Banner: learning requires connection; no offline queue |
| Disconnect mid-session | Attempt submit fails with network error; local UI does not invent progress |
| API down | Same as network failure; health probe updates banner |
| Auth expired / session revoked | Clear secure session → login |
| Reconnect | User retries; server idempotent correct-attempt + achievement upserts prevent duplicate rewards |

**Not supported:** offline learning, background sync, offline reward accrual.

## Config touched

- `apps/mobile/app.json` — Android/iOS identity, permissions, deep link scheme, iOS privacy/encryption flags
- `apps/mobile/eas.json` — development / preview / staging / production profiles + submit stubs
- Client network banner + API network error signalling
- Docs under `docs/ops/`

## Pending approval ops (unchanged)

1. SMS credential configuration  
2. VocabRound migration after backup  
3. Level-1 750-word restore after staging dry-run  
4. Razorpay live keys + payment activation  

## Phase 6 next (do not start automatically)

1. Explicit approval to run EAS Android production build (AAB)  
2. Explicit approval to run EAS iOS production build (after Apple credentials)  
3. Install testing on real devices  
4. Page-wise audits  
5. Store submission when checklist complete  
