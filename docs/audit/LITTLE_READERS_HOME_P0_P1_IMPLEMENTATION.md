# Little Readers — Home P0/P1 implementation notes

**Date:** 2026-11-06  
**Production payments:** kept disabled (Phase 1).  
**Production DB vocabulary:** not modified (local staging only).

## Phase 2 — Level 1 vocabulary (local Docker `5437`)

- Ran `npm run db:restore-level1-vocab` (upsert only).
- Seed 10 categories each **75** active words (750 unique).
- Unpublished 15 legacy L1 categories (`isPublished: false`) — no deletes.
- Progress preserved: attempts 154, sessions 47, learningProgress 75 (unchanged).

## Code changes

| Area | Files |
|------|--------|
| Daily Goal (IST) | `server/src/learning/learning.service.ts` — `summary.daily` |
| Parent PIN | `schema.prisma` + migration `20261106160000_parent_pin_gate`; `parent-gate.service.ts`; routes on `/parent/auth/gate/*` |
| Home UI | `apps/mobile/app/(tabs)/home.tsx` |
| Parent gate UI | `ParentGateModal.tsx`, `profile.tsx` |
| Listen/Spell deep-link | `home.tsx` + `play.tsx` `startRound` |
| Games honesty | `games.tsx` |
| APK | `app.json` versionCode **10** |

## Not done on production

- Hostinger `PAYMENT_ENABLED` still for you to verify.
- Production vocabulary restore awaits backup + your approval.
