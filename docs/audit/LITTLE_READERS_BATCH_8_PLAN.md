# Batch 8 — Kids Lessons + Subscription & Child Seats (plan)

**Date:** 2026-11-05  
**Constraint:** Reuse lesson/session/seat APIs. No payment gateway. No School/Teacher APIs.

---

## Inspection summary

| Area | Today |
|------|--------|
| Lessons API | `GET /learning/lessons?childId=` lists all published; not grade-filtered; progress + `activeSessionId` present |
| Session start | `POST /learning/sessions` with `lessonId` or `categoryId`; resume for lesson sessions |
| Kids UI | Category Listen/Spell only (`play.tsx`, `/kids/level-1/play`); no Lessons entry |
| Seats | `hasLearningSeat`, base 2 + `extraSeats`; assign/unassign/grant APIs exist; **no revoke** |
| Parent mobile | Parent + Subscription screens show seats |
| Parent web | Dashboard lacks seat assign/subscription detail |
| Admin | `GET /subscriptions/admin` list only; grant via API; no dedicated seats UI |

---

## Part A — Kids Lessons

### Backend (extend, minimal)
- Filter published lessons by child’s `levelId` / grade (and category/group when set on lesson).
- Unscoped lessons (`gradeId`/`levelId`/`learningCategoryId` all null) remain visible to any seated child.
- Add `playStatus`: `NOT_STARTED` | `IN_PROGRESS` | `COMPLETED` from `ChildLessonProgress` + open session.
- Detail already returns vocab via include.

### UI
- **Mobile:** Learn tab → Lessons section + `/lesson/[id]` detail (Start/Resume) → reuse `/play` with `lessonId`.
- **Web:** `/kids/lessons`, `/kids/lessons/[id]`, play page accepts `lessonId`.
- Activities: Listen/Spell only (existing play flow).

---

## Part B — Subscription & seats

### Backend
- Enrich `GET /subscriptions/admin` with per-parent seat snapshot (`included/extra/capacity/assigned/available` + children).
- Add `POST /subscriptions/seats/revoke` (ADMIN/SUPER_ADMIN): decrease `extraSeats` without dropping capacity below currently assigned seats.
- Keep grant requiring manual admin action / payment ledger row (existing).

### UI
- **Parent web:** subscription card + seat assign/unassign (same APIs as mobile).
- **Parent mobile:** tighten subscription screen (already mostly done); ensure assign/unassign clear.
- **Admin web + mobile:** seat management — list subs, grant/revoke extras, show assignments.

---

## Tests
- Lesson visibility filter + unpublished hidden
- Start/resume per child isolation
- Seat assign/unassign/grant/revoke + third-child 402
- Parent 403 on admin revoke/grant
- Regression: child-seats, lesson-management, device

## Non-goals
Payment checkout, School/Teacher, Matching/Tracing, inventing payment success.

---

## Implementation status (2026-11-05) — COMPLETE

| Item | Status |
|------|--------|
| Lesson visibility filter + `playStatus` | Done — `listPublishedLessonsForChild` |
| Kids Lessons UI (web + mobile) | Done — Learn tab / `/kids/lessons` + detail + Start/Resume |
| Seat revoke API | Done — `POST /subscriptions/seats/revoke` |
| Admin seat snapshot | Done — enriched `GET /subscriptions/admin` |
| Parent seat UI (web + mobile) | Done |
| Admin seat UI (web + mobile) | Done — `/admin/subscriptions`, `/admin-seats` |
| Tests + tsc + next build | Done — see audit Batch 8 section |

**Batch 8 stop.** No School/Teacher APIs or payment gateway.
