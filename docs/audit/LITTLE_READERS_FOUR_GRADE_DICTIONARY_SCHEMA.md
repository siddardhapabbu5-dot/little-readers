# Four-Grade Dictionary Classification — Schema Proposal

**Status:** Proposed → implementing in same change set  
**Date:** 2026-11-04  
**Constraint:** Do not duplicate kids-facing `VocabularyWord` as the source of truth for dictionary headwords. Preserve Level 1 learning sessions / progress FKs.

---

## 1. Current architecture (inspected)

| Concept | Today | Issue |
|---------|-------|--------|
| Age band | `LearningLevel` codes `LEVEL_1`…`LEVEL_4` (ages overlapping / not 1–3,4–6,7–9,10–12) | Level conflated with grade |
| Difficulty | Implicit via category unlock / word `difficulty` Int | No formal “level within grade” |
| Category | `LearningCategory` under `LearningGroup` A/B | Keep; make configurable |
| Word | `VocabularyWord` **unique on `text`** → one global spelling | Blocks multi-grade publish |
| Import | `VocabImportBatch` requires **levelId + categoryId** upfront | Admin picks grade/category before import; no whole-dictionary analyse |

Kids learning still selects words by `categoryId` + `isActive`. Sessions/attempts reference `VocabularyWord.id`.

---

## 2. Target concepts

```
LearningGrade (age band)
  └── LearningLevel (difficulty band within that grade)  [existing table, gradeId added]
        └── LearningGroup (A/B or future)
              └── LearningCategory (Family, Animals, …)
                    └── VocabularyWord (published, kids-facing copy)

DictionaryEntry (one headword — never duplicated per grade)
  └── DictionarySense (one definition / POS / examples)
        └── VocabularyGradeAssignment (suggested/approved link → grade + level + category)
              └── optional publishedVocabularyWordId → VocabularyWord
```

---

## 3. Proposed schema changes

### 3.1 `LearningGrade` (new)

| Field | Type | Notes |
|-------|------|--------|
| id | cuid | |
| code | unique | `GRADE_1`…`GRADE_4` |
| label | string | e.g. Grade 1 |
| ageMin / ageMax | int | 1–3, 4–6, 7–9, 10–12 |
| sortOrder | int | |

### 3.2 `LearningLevel` (extend)

| Field | Change |
|-------|--------|
| gradeId | optional FK → LearningGrade |
| kind | enum `GRADE_BAND` \| `DIFFICULTY` (default GRADE_BAND for LEVEL_1…4) |

**Migration mapping (preserve codes):**

| Existing code | Grade | Ages |
|---------------|-------|------|
| LEVEL_1 | GRADE_1 | 1–3 |
| LEVEL_2 | GRADE_2 | 4–6 |
| LEVEL_3 | GRADE_3 | 7–9 |
| LEVEL_4 | GRADE_4 | 10–12 |

FOUNDATION / ELEMENTARY / ADVANCED remain legacy child-placement levels (unchanged).

### 3.3 Dictionary models (new)

**`DictionaryEntry`**

- `normalizedHeadword` unique (lowercased, trimmed)
- `headword`, `pronunciation?`, `audioUrl?`
- `sourceName?`, `licence?`, `sourceRef?`
- `importBatchId?`

**`DictionarySense`**

- `entryId`, `senseIndex`
- `definition` (required — never invent)
- `wordType?` (POS)
- `synonymsJson?`, `antonymsJson?`, `examplesJson?`, `relationsJson?`
- `rawPayloadJson?` (preserve unmapped fields)

**`DictionaryImportBatch`**

- Admin upload of full dictionary (xlsx/csv/json/txt/docx/pdf as today)
- Status: `PENDING` \| `PARSED` \| `CLASSIFIED` \| `FAILED` \| `CANCELLED`
- Counts + `previewJson` / parse notes / licence fields
- Does **not** require categoryId (unlike `VocabImportBatch`)

### 3.4 `VocabularyGradeAssignment` (new)

| Field | Notes |
|-------|--------|
| senseId | FK DictionarySense |
| gradeId | FK LearningGrade |
| levelId | FK LearningLevel (difficulty or grade-band level) |
| categoryId | FK LearningCategory |
| status | `PENDING` \| `APPROVED` \| `REJECTED` \| `PUBLISHED` |
| difficultyScore | Float |
| confidenceScore | Float 0–1 |
| explanation | Text |
| classificationVersion | String |
| publishedWordId | optional FK VocabularyWord |
| reviewedById / reviewedAt | optional |

Unique: `(senseId, gradeId, categoryId)` — multi-grade allowed via multiple rows; **one DictionaryEntry**.

### 3.5 `VocabularyWord` (extend, no replace)

| Change | Why |
|--------|-----|
| Drop `@@unique([text])` → `@@unique([categoryId, text])` | Same headword publishable in multiple grade categories |
| `dictionarySenseId?` | Traceability to dictionary |
| `publishStatus` | `LEGACY` \| `PUBLISHED` (existing rows = LEGACY, keep active) |

**Existing Level 1 words:** if any remain, set `publishStatus=LEGACY`, do **not** auto-reclassify or delete. Current DB may be empty after clear — structure only.

### 3.6 Keep `VocabImportBatch`

Category-targeted import remains for quick category fills. Dictionary pipeline is additive.

---

## 4. Classification engine (v1)

Version string: `classify-v1`.

Signals (weighted, configurable constants — **not** length-only):

1. Word length & syllable estimate (heuristic vowel groups — labelled as estimate)
2. Definition length / rare-character density
3. Concrete vs abstract hint (pronoun/abstract keyword lists — low weight)
4. Category keyword match against sense definition + headword
5. Everyday / early-years allowlist & complex-word denylist (config JSON)

Output per sense: suggested grade(s), level, category, scores, explanation. Multi-grade when confidence split is close.

**Disclaimer stored on every assignment:** automated suggestion does not guarantee developmental suitability.

---

## 5. Admin / learning APIs (planned)

| Method | Path | Role |
|--------|------|------|
| POST | `/admin/dictionary/uploads` | ADMIN+ — full dictionary file |
| GET | `/admin/dictionary/imports` | list batches |
| POST | `/admin/dictionary/imports/:id/classify` | run engine |
| GET | `/admin/dictionary/assignments` | filter status/grade/confidence |
| POST | `/admin/dictionary/assignments/:id/approve` | |
| POST | `/admin/dictionary/assignments/:id/reject` | |
| PATCH | `/admin/dictionary/assignments/:id` | reclassify |
| POST | `/admin/dictionary/assignments/bulk-approve` | |
| POST | `/admin/dictionary/assignments/:id/publish` | creates/updates VocabularyWord |

Kids APIs unchanged in shape: only `isActive` + published words in category. Sessions still require seat + device rules.

---

## 6. Non-goals this pass

- Guaranteeing linguistic correctness of imported definitions  
- Inventing definitions / POS when missing  
- Replacing mobile UI with a new grade picker beyond existing LEVEL_1…4 tabs  
- Fake payment / seat changes  

---

## 7. Approval to proceed

Schema above is the implementation target. Applying migration next.
