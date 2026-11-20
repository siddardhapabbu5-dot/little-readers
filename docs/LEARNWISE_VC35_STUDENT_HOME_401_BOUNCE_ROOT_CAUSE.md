# Learn Wise — Student login bounce after Grade 1 unlock (VC35)

**Date:** 2026-11-21  
**Device APK:** VC35 (`versionCode` 35)  
**Student:** DEPPU1727 / Deepika (Grade 1 entitled via Admin grant)

## Exact root cause

After Admin Grade 1 grant, Home treats the child as **entitled** and calls Parent/User-only APIs with the **Student JWT**:

1. `GET /learning/progress/:childId` → `progressReadRoles` requires `req.user` → **401**  
2. `GET /challenges/overview` → `requireAuth` (User JWT only) → **401**  
3. `apiRequest` → `handleAuthFailure` → `notifyUnauthorized` → `clearSession` → `/login`  

`.catch(() => null)` on challenges does **not** prevent logout — session is cleared **before** the throw.

**Why it appeared only after grant:** while locked, Home skips the progress/challenges block (`entitled === false`). Unlock enables those calls → bounce.

Related (would also wipe session on tab open):

| Screen | Unsafe Student call |
|--------|---------------------|
| Learn / Games | `GET /children` |
| Games | `GET /learning/progress/.../daily-challenge` |
| Rewards | `GET /learning/progress/:id` |

VC35 stale-token guard does **not** help: the failing bearer **is** the current Student token.

## Source fix (this pass)

| File | Change |
|------|--------|
| `apps/mobile/app/(tabs)/home.tsx` | Student: skip progress + challenges; keep groups/access |
| `apps/mobile/app/(tabs)/learn.tsx` | Student: no `/children`; use `getActiveChild` |
| `apps/mobile/app/(tabs)/games.tsx` | Student: no `/children` / daily-challenge |
| `apps/mobile/app/(tabs)/rewards.tsx` | Student: skip progress API (empty rewards until student progress API exists) |

## Next

Needs **VC36** production APK + S24 install (not in VC35 binary).  
No backend deploy required for this client fix.
