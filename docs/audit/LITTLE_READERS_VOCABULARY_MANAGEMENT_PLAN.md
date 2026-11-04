# Batch 6 — Vocabulary Word Management (plan)

**Date:** 2026-11-05  
**Constraint:** Reuse `VocabularyWord`, `DictionarySense`, `VocabularyGradeAssignment`. No auto-publish. No duplicate headwords on reclassify.

---

## Current state

| Piece | Today |
|-------|--------|
| Kids word | `VocabularyWord` unique `(categoryId, text)`; `isActive`; optional `dictionarySenseId` |
| Dictionary | `DictionaryEntry` → `DictionarySense` → `VocabularyGradeAssignment` (PENDING→APPROVED→REJECTED→PUBLISHED) |
| Publish | Creates/upserts `VocabularyWord` in assignment category; keeps same word id on re-publish via upsert |
| Admin list | `GET /admin/vocabulary/words?categoryId=&take=` — active only, no search/filters/edit |
| Web | Read-only table (200 rows) |
| Mobile | Sample list on Admin overview |

Attempts (`QuestionAttempt.wordId`) must keep pointing at the same `VocabularyWord.id` after edits/reclassify.

---

## APIs (Admin / Super Admin)

Mount under `/api/admin/vocabulary` (extend) + reuse `/api/admin/dictionary/assignments/*`.

### Words
- `GET /words` — `q`, `gradeId`, `levelId`, `groupId`, `categoryId`, `isActive`, `origin`, `take`, `skip`
- `GET /words/:id` — detail + sense/entry + published assignments + attemptCount
- `POST /words` — create LEGACY/manual shell in a category (no invented definitions beyond admin input)
- `PATCH /words/:id` — edit meaning, phonetic, emoji, media, sortOrder, difficulty, isActive (text change only if no clash)
- `POST /words/:id/deactivate` — `isActive=false`
- `DELETE /words/:id` — 409 if attempts or published assignments; else delete
- `POST /words/:id/reclassify` — `{ categoryId, levelId?, gradeId? }` move category; validate chain; update linked assignment placement; **same word id**

### Assignments (existing + extend)
- Keep approve / reject / publish / bulk-approve
- Add `POST /assignments/bulk-reject`, `POST /assignments/bulk-publish`
- List filters already support `status`, `gradeId`, `maxConfidence`

---

## UI
- **Web:** replace View Vocabulary with search/filters/detail/edit/reclassify + bulk assignment panel (pending / low confidence)
- **Mobile:** browse/search/edit/reclassify single words; link to website for bulk

## Non-goals
Lesson CRUD, school/teacher, inventing confidence, new audit subsystem

---

## Implementation status (Batch 6 complete)

| Area | Status |
|------|--------|
| `word-management.service.ts` + routes under `/api/admin/vocabulary/words*` | Done |
| Bulk reject / publish (+ richer bulk approve results) | Done |
| Web `/admin/vocabulary/words` management + dictionary bulk UI | Done |
| Mobile `/admin-words` browse/edit/reclassify + website bulk link | Done |
| Tests `word-management.test.ts` | Done |
| Migrations | **None** — reused existing schema |
