# Batch 9 — School, Teacher & Classroom Management (plan)

**Date:** 2026-11-05  
**Constraint:** Reuse Express API + Prisma DB used by Parent/Kids/Admin. Do **not** replace Parent→Child. No payment gateway. No Nest cutover this batch.

---

## 1. Inspection summary (before coding)

| Area | Today |
|------|--------|
| Live API | Express `server/` on `:4100` — mobile + website call this |
| Nest `apps/api` | Health-only Phase 1 shell; **not** used by clients |
| `UserRole` (Prisma) | `PARENT` \| `ADMIN` \| `SUPER_ADMIN` only |
| School models | **None** — no School / Classroom / enrollment tables |
| Teacher UI | Placeholder shells (`/teacher`, mobile `teacher.tsx`) — no fake rosters |
| Child identity | `Child` owned by `parentId`; seats via `hasLearningSeat`; progress on `Child` |
| Lessons | Shared `Lesson` + `ChildLessonProgress` + Listen/Spell sessions |
| Auth | JWT + `requireAuth` / `requireRoles`; `isActive` enforced; password reset exists |
| Device lock | `StudentDevice` per **child** only — not parent/teacher/admin |
| Packages | `PlatformRole` includes `TEACHER`/`SCHOOL_ADMIN` in types; Prisma enum lags |

**Decision:** Implement school/teacher/classroom on the **Express + Prisma** stack so website and mobile share one backend/database. Nest remains deferred.

---

## 2. Enrollment architecture (critical)

### Parent → Child remains canonical

```
Parent (User PARENT)
  └── Child (profile + learning identity)
        ├── hasLearningSeat / home subscription (unchanged)
        ├── ChildLessonProgress / LearningSession (unchanged)
        └── StudentDevice (one phone per child, unchanged)
```

### School is an organizational overlay — not a second student account

```
School
  ├── SchoolStaff (User TEACHER | SCHOOL_ADMIN ↔ schoolId)
  └── Classroom
        ├── ClassroomTeacher (M:N teachers)
        ├── ClassroomEnrollment (Child.id)  ← existing Child only
        └── ClassroomLessonAssignment (Lesson.id)  ← existing Lesson only
```

### Rules

1. **No duplicate Child** for school. Enrollment references `Child.id` that already belongs to a Parent.
2. A Child may be enrolled in zero or more classrooms (typically one active classroom per school); `@@unique([classroomId, childId])` prevents duplicates in the same class.
3. School enrollment does **not** grant home learning seats or bypass subscription/device rules.
4. Teachers see **learning progress** (lessons, completion) for enrolled children — never parent billing, payments, seat grants, or password/email of parents beyond display name of the child.
5. Kids continue learning via Parent/Kids apps; teachers monitor and optionally assign published lessons to classrooms.

---

## 3. Schema changes (migration required)

### Enum

```prisma
enum UserRole {
  PARENT
  TEACHER
  SCHOOL_ADMIN
  ADMIN
  SUPER_ADMIN
}
```

### Models

| Model | Purpose |
|-------|---------|
| `School` | name, code?, contactEmail/phone/address, notes?, isActive, timestamps |
| `SchoolStaff` | `userId` + `schoolId` + `staffRole` (`TEACHER` \| `SCHOOL_ADMIN`) + isActive; `@@unique([userId, schoolId])` |
| `Classroom` | schoolId, name, code?, gradeLabel?, isActive |
| `ClassroomTeacher` | classroomId + teacherUserId; `@@unique([classroomId, teacherUserId])` |
| `ClassroomEnrollment` | classroomId + childId; `@@unique([classroomId, childId])`; soft leave via `leftAt` / `isActive` |
| `ClassroomLessonAssignment` | classroomId + lessonId + assignedByUserId + assignedAt; `@@unique([classroomId, lessonId])` |

`User` gains relations: `schoolStaff`, `classroomTeaching`, `lessonAssignmentsMade`.  
`Child` gains `classroomEnrollments`.  
`Lesson` gains `classroomAssignments`.

**No** separate school vocabulary/lesson tables.  
**No** school payment models this batch (packages in config remain documentation-only).

---

## 4. Roles & permissions

| Actor | Can |
|-------|-----|
| `SUPER_ADMIN` / `ADMIN` | CRUD schools; create teachers & school admins; all classrooms; grant visibility across schools |
| `SCHOOL_ADMIN` | Manage teachers/classrooms/enrollments **only** for their `SchoolStaff.schoolId` |
| `TEACHER` | Read assigned classrooms; enroll/view students if policy allows **or** read-only roster + progress; assign published lessons to own classrooms; **no** Admin vocab/dictionary/seats APIs |
| `PARENT` | Unchanged; **cannot** call school admin/teacher mutate APIs |

Backend: every school route checks role + school membership + (for teachers) classroom assignment. Deactivated `User.isActive` or `SchoolStaff.isActive` → 401/403.

Password reset: existing `/auth/forgot-password` + `/auth/reset-password` (role-agnostic).

Teacher accounts: created by Admin/School Admin (not public register). Public `/auth/register` stays PARENT-only.

---

## 5. APIs (Express)

### Admin / School Admin — schools

- `GET/POST /api/admin/schools`
- `GET/PATCH /api/admin/schools/:id`
- `POST /api/admin/schools/:id/deactivate` | activate
- Search/filter: `q`, `isActive`

### Teachers / staff

- `POST /api/admin/schools/:id/teachers` — create User(TEACHER) + SchoolStaff + temp/password set
- `GET /api/admin/schools/:id/teachers`
- `PATCH /api/admin/teachers/:userId` — profile, school, isActive
- School Admin scoped to own school

### Classrooms

- `GET/POST /api/admin/schools/:id/classrooms`
- `PATCH /api/admin/classrooms/:id`
- `POST .../teachers` assign/unassign
- `POST .../students` enroll existing childId (validate child exists + active)
- `DELETE .../students/:childId` unenroll (keep Child + progress)
- Activate/deactivate classroom

### Teacher dashboard (role TEACHER+)

- `GET /api/teacher/me` — schools + classrooms
- `GET /api/teacher/classrooms/:id` — roster (child displayName, level; **no** parent email/billing)
- `GET /api/teacher/classrooms/:id/progress` — lesson progress summaries from `ChildLessonProgress`
- `GET /api/teacher/lessons` — published active lessons (reuse lesson list, no invent)
- `POST /api/teacher/classrooms/:id/lessons` — assign published lesson
- `DELETE /api/teacher/classrooms/:id/lessons/:lessonId`

Isolation tests: Teacher A ≠ Teacher B classrooms; School A ≠ School B; PARENT 403; TEACHER 403 on `/admin/vocabulary`, `/subscriptions/seats/*`.

---

## 6. UI

### Website

- `/admin/schools` (+ detail) — AdminShell nav
- `/admin/schools/[id]/teachers`, `.../classrooms`
- `/teacher` — real dashboard (replace shell)
- `/school` — School Admin hub (own school classrooms/teachers) or redirect into admin school pages

### Mobile

- `/teacher` — classrooms → students → progress
- Admin: schools entry → list/create (parity lite; deep edit can deep-link web if needed)
- Keep Parent/Kids/Admin vocab flows unchanged
- Login already routes `TEACHER` → `/teacher`

---

## 7. Learning experience (teachers)

- Reuse published `Lesson` catalog.
- Assignment = `ClassroomLessonAssignment` row (organizational); children play via existing Kids lesson/session APIs.
- Progress = existing `ChildLessonProgress` / sessions for enrolled children.
- No Matching/Tracing; no new vocab DB.

---

## 8. Security & regression tests

| Test | Expect |
|------|--------|
| Teacher A reads Teacher B classroom | 403 |
| Cross-school classroom mutate | 403 |
| Parent → teacher/admin school APIs | 403 |
| Teacher → seats/grant, vocab admin | 403 |
| Deactivated teacher login / API | 401 |
| Duplicate enrollment | 409 |
| Enroll unknown / inactive child | 400/404 |
| Regression | child-seats, batch8 lessons, lesson-management, word-management, auth login parent |

Builds: server tests, server tsc, mobile tsc, website tsc, `next build`.

---

## 9. Non-goals (Batch 9 stop)

- Payment gateway / school license checkout  
- NestJS school module cutover / RLS  
- Separate STUDENT User login (Child profiles remain)  
- Inventing school/teacher/student seed data beyond test fixtures  
- Final release packaging  

---

## 10. Implementation order

1. This plan (done before schema)  
2. Prisma migration + role enum  
3. School/staff/classroom/enrollment/assignment services + routes  
4. Teacher dashboard APIs  
5. Website Admin + Teacher UI  
6. Mobile Teacher + Admin school entry  
7. Tests + typechecks + build + audit update  
8. **Stop**

---

## Implementation status (2026-11-05) — COMPLETE

| Item | Status |
|------|--------|
| Migration `20261105020000_school_teacher_classroom` | Applied |
| `UserRole` + `TEACHER` / `SCHOOL_ADMIN` | Done |
| School / Classroom / Enrollment / Assignment APIs | Done on Express |
| Teacher dashboard APIs | Done |
| Website Admin schools + Teacher/School portals | Done |
| Mobile Teacher + Admin schools | Done |
| Security + regression tests | Done — see audit Batch 9 |
| Payment gateway / Nest cutover | **Out of scope** (stop) |

**Batch 9 stop.**
