# Batch 7 — Lesson Management (plan)

**Date:** 2026-11-05  
**Constraint:** Reuse existing `Lesson`, Listen/Spell sessions, `VocabularyWord`. No School/Teacher APIs. No invented content.

---

## Current state (inspection)

| Piece | Today |
|-------|--------|
| Legacy `Lesson` | Exists with `title`, `description`, `instructions`, `levelId?`, string `category`, `PublishStatus`, `isPublished`, `sortOrder` |
| Legacy `LessonWord` | Links to **`Word`** (seed alphabet samples) — **not** kids `VocabularyWord` |
| Kids play | `LearningSession` + `QuestionAttempt` on **category** word pools (`VocabularyWord`); Listen/Spell/Letter only |
| Progress | `ChildCategoryProgress` per child×category; attempt idempotency already exists; **no lesson resume API** |
| Admin lessons | Route stubs return **501** (`/api/admin/lessons`) |
| Matching/Tracing | AttemptType enum values only — **not implemented** |

---

## Design decisions

1. **Keep** legacy `LessonWord` → `Word` for seed/history; **add** `LessonVocabItem` → `VocabularyWord` for Admin + play.
2. **Extend** `Lesson` with `gradeId`, `groupId`, `learningCategoryId`, `isActive`, `activitiesJson` (`["LISTEN","SPELL"]` only). Keep string `category` for backward compatibility (sync label from learning category when set).
3. **Extend** `LearningSession` with optional `lessonId`. Category-based start stays default; lesson start uses ordered lesson vocab as the pool.
4. **Add** `ChildLessonProgress` (`@@unique([childId, lessonId])`) for per-child lesson completion — independent of category progress.
5. **Resume:** `start` with `lessonId` reuses the child’s open `IN_PROGRESS` session for that lesson (never another child’s). Category start unchanged unless `resume=true` with matching open session.
6. **Publish gate:** lesson may publish only if every linked vocab word is `isActive` and (if dictionary-linked) not solely REJECTED; draft may hold words that fail that check until publish.
7. **Activities:** configure LISTEN/SPELL only; never advertise Matching/Tracing as done.
8. **Hard delete:** prefer deactivate; refuse destructive delete when sessions/attempts/progress exist.

---

## Schema migration (additive)

```
Lesson += gradeId?, groupId?, learningCategoryId?, isActive, activitiesJson
LessonVocabItem { lessonId, vocabularyWordId, sortOrder } @@unique([lessonId, vocabularyWordId])
ChildLessonProgress { childId, lessonId, … } @@unique([childId, lessonId])
LearningSession += lessonId?
```

No remapping of existing category sessions. No duplicate `VocabularyWord` rows.

---

## API contracts

### Admin — `/api/admin/lessons` (ADMIN | SUPER_ADMIN)

| Method | Path | Body / query | Notes |
|--------|------|--------------|-------|
| GET | `/` | `q`, `gradeId`, `levelId`, `groupId`, `learningCategoryId`, `status`, `isPublished`, `isActive`, `take`, `skip` | List/search |
| GET | `/:id` | | Detail + ordered vocab + counts |
| POST | `/` | title, description?, instructions?, gradeId?, levelId?, groupId?, learningCategoryId?, sortOrder?, activities? | Validate placement chain |
| PATCH | `/:id` | same fields + status? | |
| POST | `/:id/deactivate` | | `isActive=false`, unpublish |
| POST | `/:id/publish` | | Validates vocab; `status=PUBLISHED`, `isPublished=true` |
| POST | `/:id/unpublish` | | `status=DRAFT` or keep ARCHIVED rules → `isPublished=false`, status DRAFT |
| PUT | `/:id/words` | `{ vocabularyWordIds: string[] }` | Replace ordered list; no dupes; does not mutate words |
| DELETE | `/:id/words/:vocabularyWordId` | | Remove link only |
| GET | `/:id/preview` | | Admin preview payload (words + activities) |

PARENT → **403**.

### Learning (reuse / extend) — `/api/learning`

| Method | Path | Change |
|--------|------|--------|
| GET | `/lessons?childId=` | **New** — published active lessons for child (scoped by ownership) |
| GET | `/lessons/:id?childId=` | **New** — lesson detail + this child’s progress / active session id |
| POST | `/sessions` | Accept `lessonId` **or** `categoryId`; resume open lesson session |
| GET | `/sessions/active?childId=&lessonId=` | **New** — resume helper |
| POST | `/sessions/:id/attempts` | Unchanged (idempotent scoring) |
| POST | `/sessions/:id/complete` | Also upsert `ChildLessonProgress` when `session.lessonId` set |

---

## UI

- **Web:** `/admin/vocabulary/lessons` — list, create/edit, vocab picker/reorder, preview, publish controls; AdminShell nav.
- **Mobile:** `/admin-lessons` — list + create/edit basics + website link for heavy editor.
- **Kids play:** optional lesson entry later via existing Listen/Spell session APIs; do not redesign play UI in Batch 7 beyond API support.

---

## Known build / TS issues (investigate in Batch 7)

| Issue | Plan |
|-------|------|
| `next build` `/school` `useContext` null | Reproduce; if React/portal SSR mismatch, apply safe `dynamic = 'force-dynamic'` / simplify shell — only if understood |
| Server `findUnique({ text })` after `@@unique([categoryId,text])` | Fix to `findFirst` / compound unique — clear schema drift |

---

## Non-goals

School/Teacher APIs, payments, Matching/Tracing, inventing media/vocab, replacing category Listen/Spell flows.

---

## Implementation status (Batch 7 complete)

| Area | Status |
|------|--------|
| Migration `20261105010000_lesson_management` | Applied |
| Admin `/api/admin/lessons/*` | Done |
| Learning lesson list + session `lessonId` + resume | Done |
| Web `/admin/vocabulary/lessons` | Done |
| Mobile `/admin-lessons` | Done |
| `/school` + `/teacher` prerender fix (`force-dynamic`, no PortalShell) | Done |
| Server `findUnique({ text })` → compound unique | Done |
