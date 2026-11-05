# Dictionary Data + Automatic Vocabulary Publishing — Final Report

Date: 2026-11-05

## 1. Dictionary entries imported

| Metric | Count |
|--------|------:|
| Dictionary entries | ~79 |
| Dictionary senses | ~101 |
| Source used | Existing classified uploads (kids CSV template + mini JSON fixtures). **No PDF was present** in storage; no duplicate PDF/CSV re-upload performed. |
| Rehydrate approach | `scripts/rehydrate-dictionary-vocab.mjs` + `ensure-grade4-vocab.mjs` created assignments from existing senses, then approve/publish into `VocabularyWord` without duplicating `DictionaryEntry` rows. Source/licence/sourceRef preserved on entries. |
| Grades 1–4 | Reactivated (`isActive: true`) |

## 2. Active approved / published words per grade

After restore (demo-ready; no ACTIVE programme hiding words):

| Grade | Active words | PUBLISHED assignments |
|-------|-------------:|----------------------:|
| GRADE_1 | 50 | 42 |
| GRADE_2 | 11 | 11 |
| GRADE_3 | 30 | 50 |
| GRADE_4 | 15 | 25 |

Notes: GRADE_3/4 published assignment counts can exceed distinct active words when the same sense was assigned to multiple categories or headwords collide on upsert within a category.

## 3. Programme generation results

Exercised in `tests/vocab-programme-grades.test.ts`:

| Grade | Span | Daily target | Result |
|-------|------|-------------:|--------|
| GRADE_1 | **180 days** (six-month) | 1 | Generated, edited day 1, approved, activated, jobs enqueued |
| GRADE_2 | 14 days | 2 | Same flow |
| GRADE_3 | 21 days | 2 | Same flow |
| GRADE_4 | 10 days | 2 | Same flow |

Also verified: word→grade linkage (sampled), replace-day words API, single ACTIVE programme per grade (409 if another active), Asia/Kolkata timezone on create.

## 4. Scheduler implementation details

**Backend-only** worker started from `server/src/index.ts` via `startProgrammePublisher()` (30s tick; skipped under Vitest).

### Schema (migration `20261105100000_vocab_publisher`)
- `VocabPublisherConfig` — timezone `Asia/Kolkata`, configurable `publishHour`/`publishMinute`, status `RUNNING|PAUSED|STOPPED`
- `VocabPublishJob` — DB-backed jobs per programme day (`PENDING|CLAIMED|SUCCEEDED|FAILED|CANCELLED`), attempts, `nextAttemptAt`, claim lease recovery
- `AdminAlert` — failure notifications for admins

### Behaviour
- On **activate**: hide all words on `SCHEDULED` days (`isActive=false`); enqueue one job per day; does **not** auto-activate a next programme
- Worker publishes days with `dueDate <= Kolkata today` and (for today) after configured local time
- Publish activates day words, sets day `PUBLISHED`, writes `VocabProgrammePublishLog`, marks job `SUCCEEDED`
- Duplicate publish prevented (already-published days skipped; successful jobs not reprocessed)
- Retries with backoff; after `maxAttempts` → job/day `FAILED` + `AdminAlert`
- Stale `CLAIMED` jobs recovered after 2 minutes
- Missed days (server downtime) republish when worker resumes (`dueDate` in the past)
- Pause / resume / stop via `PUT /api/admin/publisher/config`

### Admin APIs
| Method | Path |
|--------|------|
| GET/PUT | `/api/admin/publisher/config` |
| POST | `/api/admin/publisher/run-once` |
| GET | `/api/admin/publisher/jobs` |
| GET | `/api/admin/publisher/alerts` |
| POST | `/api/admin/publisher/alerts/:id/read` |

Phone + website programme screens expose Run / Pause / Resume / Stop controls.

## 5. Publishing test results

`tests/vocab-publisher.test.ts` — **pass**
- Activate hides future words
- Pause skips processing
- Run publishes due day; future day stays hidden
- Student category list includes published word, excludes future word
- Duplicate run processes 0; single `PUBLISHED` log
- Overdue job recovery publishes missed day

## 6. Failure recovery test results

- Stale claim reclaim path implemented (CLAIMED older than 2 min → PENDING)
- Retry/fail + AdminAlert path implemented in `failJob`
- Missed dueDate recovery covered in publisher test (overdue job republished)
- Pause/stop prevent processing until resumed

## 7. Phone and website verification

| Surface | Change |
|---------|--------|
| Phone `admin-programme.tsx` | Publisher controls + updated activate copy |
| Web `admin/vocabulary/programme/page.tsx` | Same controls + copy |
| Admin IA from prior phase | Unchanged (Structure / Vocabulary / Lessons / More) |

Automated API coverage is primary; UI wired to the same publisher endpoints.

## 8. Remaining issues

- No original dictionary **PDF** in repo/storage — CSV/JSON uploads were the available sources
- GRADE_3 has more PUBLISHED assignments than distinct active words (multi-assignment / upsert overlap)
- Email delivery for AdminAlert is DB-only (no SMTP/push yet) — admins poll `/admin/publisher/alerts`
- Activating a long programme hides **all** scheduled words for that grade until each day publishes (intentional drip); cancelled programmes should use `scripts/restore-active-dictionary-words.mjs` if a demo needs all words visible again
- Matching / Quiz / Revision play still out of scope

## Tests run (21 passed)

- `vocab-programme-grades.test.ts`
- `vocab-publisher.test.ts`
- `student-programme-visibility.test.ts`
- `vocab-programme.test.ts`
- `dictionary-grade.test.ts`
- `word-management.test.ts`
- `lesson-management.test.ts`
- `learning-play.test.ts`
