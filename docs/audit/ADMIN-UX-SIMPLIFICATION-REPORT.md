# Admin UX Simplification — Final Report

Date: 2026-11-05  
Scope: Phone-first Admin IA + programme UI/DB stub (scheduler deferred)

## 1. Existing features reused
- Content APIs: `/admin/content` grades/levels/groups/categories
- Dictionary: upload / classify / assignments approve-reject-publish (+ bulk)
- Vocabulary words: search / patch / deactivate / reclassify
- Lessons: create / publish / deactivate / `LessonVocabItem`
- Auth: `ADMIN` / `SUPER_ADMIN` gates
- Mobile design tokens: `dash`, `adminColors`, `SoftButton`, `AdminTabBar`

## 2. Files and components modified / added

### Mobile
- `apps/mobile/components/AdminTabBar.tsx` — Dashboard · Structure · Vocabulary · Lessons · More
- `apps/mobile/app/admin.tsx` — learning summary cards + academic quick actions
- `apps/mobile/app/admin-settings.tsx` — More hub (students/reports/ops)
- `apps/mobile/app/admin-vocabulary.tsx` — **new** vocabulary hub
- `apps/mobile/app/admin-structure.tsx` — grade-first structure UX + counts
- `apps/mobile/app/admin-words.tsx` — Vocabulary Manager + pending AI suggestions
- `apps/mobile/app/admin-dictionary.tsx` — tab bar + AI no-auto-publish copy
- `apps/mobile/app/admin-lessons.tsx` — grade filter, activity chips, tab bar
- `apps/mobile/app/admin-programme.tsx` — **new** programme UI
- `apps/mobile/services/admin-nav.ts` — safe back (already present)

### Server
- `server/prisma/schema.prisma` — VocabProgramme* models
- `server/prisma/migrations/20261105090000_vocab_programme/`
- `server/src/programmes/programme.service.ts` — **new**
- `server/src/programmes/programme.routes.ts` — **new**
- `server/src/routes/index.ts` — mount `/admin/programmes`
- `server/src/content-structure/content-structure.service.ts` — category lesson counts
- `server/tests/vocab-programme.test.ts` — **new** (seeds grade words; full generate→approve→activate)
- Earlier test cleanup: batch8 / lesson-management `afterAll`

### Web
- `apps/web/src/components/AdminShell.tsx` — IA-aligned sidebar
- `apps/web/src/app/admin/vocabulary/page.tsx` — hub links
- `apps/web/src/app/admin/vocabulary/programme/page.tsx` — **new**

## 3. Database changes
Additive only (no data wipe):
- Enums: `VocabProgrammeStatus`, `VocabProgrammeDayStatus`
- Tables: `VocabProgramme`, `VocabProgrammeDay`, `VocabProgrammeItem`, `VocabProgrammePublishLog`
- Migration applied: `20261105090000_vocab_programme`
- Default timezone: `Asia/Kolkata`
- Audit fields: `approvedById` / `activatedById` (+ timestamps)

## 4. APIs added or changed
| Method | Path | Notes |
|--------|------|-------|
| GET | `/api/admin/programmes` | list |
| GET | `/api/admin/programmes/:id` | detail + calendar days |
| POST | `/api/admin/programmes` | create DRAFT |
| POST | `/api/admin/programmes/:id/generate` | fill days from grade words |
| POST | `/api/admin/programmes/:id/approve` | DRAFT → APPROVED |
| POST | `/api/admin/programmes/:id/activate` | APPROVED → ACTIVE (no cron yet) |
| PUT | `/api/admin/programmes/days/:dayId/words` | replace day words |
| GET | `/api/admin/content/categories` | `_count.lessons` added |

## 5. Tests performed
| Suite | Result |
|-------|--------|
| `vocab-programme.test.ts` | pass (create → generate → approve → activate; days stay `SCHEDULED`, not auto-published) |
| `dictionary-grade.test.ts` | pass (upload → classify → approve → publish) |
| `word-management.test.ts` | pass |
| `lesson-management.test.ts` | pass |
| Prisma migrate deploy (programme) | success |
| Prisma generate | success |

## 6. Remaining issues / follow-ups
- **Asia/Kolkata daily publisher worker** not implemented (by plan)
- Picture Matching / Quiz / Revision **play** not implemented (UI “coming soon” only)
- Classification remains heuristic `classify-v1` (labeled AI suggestions; never auto-publish)
- Website Reports / Settings dedicated pages still thin (Schools used as Students & Progress)
- SoftButton Listen/Spell chips are informational on phone create form; lessons still store LISTEN+SPELL via API
- Local vocabulary DB may be empty after prior clear/replace runs — re-import dictionary or restore seed vocab before demoing Programme generate in the UI
