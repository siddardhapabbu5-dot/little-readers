# Little Readers — Multi-School SaaS Architecture (Phase 1)

## Product summary

Little Readers is a **multi-tenant educational SaaS** for schools.

- **Business model:** Fixed annual school subscription (Starter / Standard / Premium / Enterprise)
- **Access:** School + Home
- **Curriculum:** Common English literacy (ages 3–12)
- **Task model:** Teacher-assigned tasks + automatic adaptive learning (never silently replace mandatory tasks)

## Platforms

| Surface | Stack |
|---------|--------|
| Website portals | Next.js + TypeScript (`apps/web`) |
| Android / iOS | React Native + Expo (`apps/mobile`) |
| Primary API | NestJS + TypeScript (`apps/api`) |
| Legacy API (preserved) | Express (`server`) — kept until NestJS auth/tenant cutover in Phase 2 |
| Database | PostgreSQL + Prisma |
| Jobs | Redis + BullMQ |
| Media | Private cloud storage (Phase later) |
| Speech | STT / TTS providers (Phase later) |

## Multi-tenancy model

```
Super Admin (platform)
 └── School (tenant)
      ├── School Admin
      ├── Teachers ↔ Classes / Sections
      ├── Students
      ├── Parents ↔ Students
      ├── Assignments / Attempts / Mastery
      └── License / Subscription / Invoices
```

**Isolation rules**

1. Every school-owned row carries `schoolId` (or a verified join to a school-owned parent).
2. API requests resolve a **tenant context** (`schoolId` + role + actor id).
3. Server-side permission checks run on every mutating/query path.
4. PostgreSQL **Row-Level Security** is introduced in Phase 2.
5. Cross-school reads/writes are forbidden by default.

## Roles

| Role | Scope |
|------|--------|
| `SUPER_ADMIN` | Platform: schools, licenses, curriculum, payments, audit |
| `SCHOOL_ADMIN` | One school: years, classes, teachers, students, parents, reports |
| `TEACHER` | Assigned classes: assignments, tracking, remediation |
| `PARENT` | Linked children: progress, consent, privacy |
| `STUDENT` | Own learning: tasks, lessons, quizzes, rewards |

## Design systems (separate UX)

- **Student** — colourful, large controls, audio-friendly
- **Parent** — calm progress / reports
- **Teacher** — operational assignment console
- **School admin** — professional school SaaS
- **Super admin** — dense platform operations

## Learning engines (later phases)

1. **Teacher Assignment Engine** — individual / group / class; due dates; status
2. **Automatic Learning Engine** — mastery, remediation, revision queue; never replaces mandatory teacher tasks
3. **Sync Engine** — school + home devices; offline-safe; duplicate submission resolution

## Target monorepo structure

```
little-readers/
├── apps/
│   ├── api/                      # NestJS REST API (primary)
│   │   ├── src/
│   │   │   ├── main.ts
│   │   │   ├── app.module.ts
│   │   │   ├── config/
│   │   │   ├── common/           # guards, filters, tenant, roles
│   │   │   ├── health/
│   │   │   ├── modules/          # auth, schools, … (Phase 2+)
│   │   │   └── jobs/             # BullMQ producers/consumers (Phase 2+)
│   │   └── test/
│   ├── web/                      # Next.js portals
│   │   └── src/app/
│   │       ├── (public)/
│   │       ├── super-admin/
│   │       ├── school/
│   │       ├── teacher/
│   │       ├── student/
│   │       ├── parent/           # preserved from prior work
│   │       └── kids/             # student-facing colourful UI (alias/entry)
│   ├── mobile/                   # Expo (Phase 11 deep work)
│   └── legacy-notes              # Express server kept at /server
├── server/                       # Legacy Express API (preserved, working)
├── packages/
│   ├── types/                    # Shared domain types & role enums
│   ├── validation/               # Zod schemas
│   ├── shared/                   # Pure business helpers
│   ├── ui/                       # Shared presentational primitives
│   ├── config/                   # Shared env schema helpers
│   └── tenant/                   # Tenant context types/helpers
├── assets/
├── docs/
│   ├── ARCHITECTURE.md
│   ├── PHASES.md
│   └── api-phase-1.md
├── docker-compose.yml            # postgres + redis
├── package.json
└── README.md
```

## Phase 1 scope (this deliverable)

- Architecture + folder foundation
- NestJS API bootstrap + health endpoint
- Redis service in Docker Compose
- Shared role/tenant type packages
- Portal route shells (no fake dashboard stats)
- Preserve existing parent/kids/auth Express flows

## Explicitly deferred to Phase 2+

- Full multi-tenant Prisma schema + RLS
- NestJS authentication & sessions
- School registration / licenses
- BullMQ job processors
- Payments (never dummy-confirmed)
