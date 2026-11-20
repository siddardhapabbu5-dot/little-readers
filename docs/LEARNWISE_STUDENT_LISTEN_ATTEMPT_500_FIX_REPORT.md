# Student Animals Listen — Internal Server Error Fix

**Date:** 2026-11-21
**API:** production `siwi-api` on `201.18.220.29`

## Root cause
`POST /api/learning/sessions/:id/attempts` used `req.user!.id`.
Student JWT sets `req.student` only → `req.user` undefined → TypeError → **500 Internal server error**.

VPS log confirmed:
`TypeError: Cannot read properties of undefined (reading 'id')` at `learning.routes.ts:402`
`POST .../attempts` → 500

## Fix
Use existing `actorParentId(req)` for attempts + complete (+ sessions/active student-safe).

## Deploy
- File: `/var/www/siwi/server/src/learning/learning.routes.ts`
- Backup: `learning.routes.ts.bak-vc36-student-attempts-*`
- `pm2 restart siwi-api --update-env` → online
- Health: ok after restart settle

## Operator
Retry Animals Listen on VC36 (no APK rebuild needed). Tap a picture again — should score without Internal server error.
