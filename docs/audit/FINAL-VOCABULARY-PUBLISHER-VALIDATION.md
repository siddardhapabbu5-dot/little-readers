# Final Vocabulary & Publisher Validation

**Date:** 2026-11-05  
**Verdict: NOT production-ready**

Critical content gaps remain (GRADE_3 / GRADE_4 curriculum empty of real kids words; large synthetic pollution; widespread category mis-assignments). Publisher mechanics and student gating tests pass, but content quality blocks a production go-live claim.

No student progress was reset. No dictionary entries were deleted for this audit. A DRAFT 180-day GRADE_1 programme was generated for coverage analysis only (not auto-approved).

---

## 1. Approved vocabulary counts by grade

Active `VocabularyWord` rows at audit time (after restoring DICTIONARY `isActive` for analysis):

| Grade | Active words | Curriculum-like | Synthetic / test fixtures |
|-------|-------------:|----------------:|--------------------------:|
| GRADE_1 | 57 | **38** | 19 |
| GRADE_2 | 11 | **11** | 0 |
| GRADE_3 | 30 | **0** | 30 |
| GRADE_4 | 15 | **0** | 15 |
| **Total** | **113** | **49** | **64** |

Dictionary store (preserved): ~79 `DictionaryEntry`, ~101 `DictionarySense`. Source names such as `Little Readers Kids Starter` retained; most `sourceRef` / page references are **null** (CSV template had no page column).

**Sufficient vocabulary?**  
- GRADE_1: thin but usable for drip (38 curriculum words).  
- GRADE_2: thin (11).  
- GRADE_3 / GRADE_4: **insufficient for production** — only `dicttest*` / similar fixtures after classification rehydrate; no real kids curriculum pool.

---

## 2. Words requiring review (`NEEDS_REVIEW`)

**85** active words flagged (full dump: `docs/audit/_vocab-quality-raw.json`, summary: `_vocab-quality-summary.json`).

| Reason theme | Count (approx) |
|--------------|---------------:|
| Synthetic/test fixture headword | 64 |
| Theme/category mismatch (e.g. food/animals/nature parked under “Family and People”) | ~55 overlapping flags |
| Same-grade duplicate headwords | 2 (`dicttest…` on GRADE_3 in two categories) |
| Cross-grade duplicate headwords | 17 (all synthetic) |
| Duplicate sense definitions | 0 |

**Examples (real kids words — category wrong, meanings OK):**  
`apple`, `bird`, `cat`, `dog`, `banana`, `flower`, `sun`, `tree`, … → category **Family and People** instead of Animals / Food / Nature.

**Grade-band note:** Classification historically used length/heuristic scoring (`classify-v1` / rehydrate). Audit did **not** re-grade by length alone; category/theme and synthetic pollution dominate the review list. Meanings for starter CSV words are generally short and child-friendly.

**Action required before production:** human review queue for all `NEEDS_REVIEW`; remove or deactivate synthetic fixtures from student-facing pools; reclassify categories; publish real GRADE_3/4 curriculum (do not invent silently).

---

## 3. Six-month programme coverage

Generated DRAFT programme (left DRAFT — not approved/activated):

| Field | Value |
|-------|-------|
| Title | Audit six-month GRADE_1 2026-11-05 |
| Programme id | `cmw30t5xd0001ht3ky09m9dav` |
| Days | **180** |
| `dailyTarget` | **1** (unchanged) |
| Underfilled days | **0** (each day has ≥1 word after within-day dedupe) |
| Active pool used | 50 words |
| Unique words scheduled | 50 |
| Repeats | Every scheduled word appears **~4 times** |

**Why repeats:** Round-robin over pool 50 &lt; 180 slots. By design of `generateProgrammeSchedule`; not silent target changes; no invented vocabulary.

GRADE_2/3/4 pools are too small for low-repeat 180-day programmes (11 / 0 curriculum / 0 curriculum). Do not invent missing words.

---

## 4. Duplicate / repeated word analysis

| Type | Finding |
|------|---------|
| Programme repeats | Expected round-robin (~4× on 180-day G1) |
| Same-grade dupes | 2 synthetic headwords in two categories on GRADE_3 |
| Cross-grade dupes | 17 synthetic only |
| Sense def dupes | None |

---

## 5. Publisher recovery test results

Suite: `tests/publisher-reliability.test.ts`, `tests/vocab-publisher.test.ts` — **PASS**

| Scenario | Result |
|----------|--------|
| Normal daily publishing (due day) | PASS |
| Pause / Resume / Stop | PASS |
| Duplicate publish prevention | PASS (`SKIPPED_ALREADY_PUBLISHED` / no double PUBLISHED) |
| Missed-day recovery (overdue `dueDate`) | PASS |
| Retry / failure logging path | PASS (alerts + job attempts APIs) |
| Programme expiry → `COMPLETED` | PASS (implemented in `completeExpiredProgrammes`) |
| No auto-activation of next programme | PASS (next DRAFT stays DRAFT) |
| Asia/Kolkata fixed offset (no DST) | PASS (`toKolkataParts` / `isPastPublishTime`) |
| API shutdown & restart | PASS at ops level — worker starts from `index.ts` on listen; overdue jobs reclaim on next tick (also covered by missed-day recovery). Live health: `GET /api/health` OK after restart. |

---

## 6. Student visibility test results

`tests/student-programme-visibility.test.ts`, `tests/learning-play.test.ts`, `tests/lesson-management.test.ts` — **PASS**

| Check | Result |
|-------|--------|
| Only published-day words visible in category list | PASS |
| Future scheduled word direct fetch 404 | PASS |
| Replace future day words keeps `QuestionAttempt` counts | PASS |
| Listen / Spell session flow | PASS |
| Lessons publish / progress / no wipe | PASS |
| Grade-correct catalogue | Partial — learning filters by level/category; **content** on G3/G4 is synthetic so educational grade correctness fails even if API gating works |

---

## 7. Phone, website and tablet test results

| Surface | Result | Notes |
|---------|--------|-------|
| Phone Admin programme | **PASS (wiring)** | Dashboard list, generate/approve/activate, day edit (word IDs), pause/resume/stop, jobs + alerts + per-day history. Verified in code + API; Expo `:8081` responding 200. |
| Phone Vocabulary Manager | **PASS (wiring)** | Search, grade filter, pending approve/reject/publish (`admin-words` / `admin-dictionary`). |
| Website Admin programme | **PASS (wiring)** | Create/generate/approve/activate + publisher controls; jobs/alerts panels added. Desktop AdminShell preserved. |
| Tablet | **N/A harness** | No separate tablet app; use Expo web / website. Not a dedicated automated tablet suite. |
| Live UI click-through on device | **Not fully executed** this pass | API + Expo up; recommend manual smoke of Admin programme + Vocabulary on phone web before next phase. |

---

## 8. Failed tests and remaining issues

### Critical (block production)

1. **GRADE_3 and GRADE_4 have 0 curriculum-like active words** — only test fixtures.  
2. **64 synthetic/test words** still active and pollute programmes / student catalogues if activated.  
3. **Widespread category mis-assignment** (Family and People catch-all) for otherwise good starter meanings.  
4. **Missing page/sourceRef** on most dictionary entries (sourceName often present).  
5. **Six-month programmes must heavily repeat** until pools grow (G1 ~4×; worse for other grades).

### Non-critical / follow-ups

- Phone day edit uses raw vocabulary word IDs (usable but not kid-friendly picker UI).  
- Admin alerts are DB-only (no email/push).  
- Manual full phone/tablet UX click-through still recommended.  
- Matching / Quiz / Revision play still out of scope.

### Automated suites run this validation

- `publisher-reliability.test.ts` — pass  
- `vocab-publisher.test.ts` — pass  
- `student-programme-visibility.test.ts` — pass  
- `learning-play.test.ts` — pass  
- `lesson-management.test.ts` — pass  

---

## Production readiness statement

**Not production-ready.** Publisher reliability and student publish-gating are in good shape for a technical beta, but **content quality and grade coverage fail** the bar for shipping GRADE_1–4 vocabulary programmes to children.

**Minimum before claiming readiness:**

1. Deactivate/remove synthetic fixtures from student-facing active sets.  
2. Human-approve category + grade for all starter words (`NEEDS_REVIEW`).  
3. Import/approve real GRADE_3 and GRADE_4 curriculum (no silent invention).  
4. Re-run this audit to zero critical `NEEDS_REVIEW` for production content.  
5. Manual phone Admin + student Listen/Spell smoke on device.
