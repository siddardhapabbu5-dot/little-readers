# Phase 10C — Grade architecture migration plan

**Branch:** `fix/phase-10c-critical-defects`  
**Rule:** Do not delete legacy grades or learning history.

## Canonical model

| Role | How identified | Used by |
|------|----------------|---------|
| **Academic grade** (canonical) | `LearningGrade.gradeNumber` IS NOT NULL (1–12) + `assignedLevelId` | Parent catalog, Child.gradeId, Admin Academic Setup, subscription level filters |
| **Content grade** (legacy) | `gradeNumber` IS NULL, codes like `GRADE_1`…`GRADE_4` | Vocabulary tree, dictionary assignments, programmes, Structure screen |
| **Level** | `LearningLevel` (`LEVEL_1`… + academic Level-1…3) | Child.levelId, learning play groups, plan `applicableLevel` |

Link: optional `LearningGrade.canonicalGradeId` on a **content** row points at the academic row for the same school year (e.g. `GRADE_1` → grade with `gradeNumber=1`).

## Child profile

| Field | Meaning |
|-------|---------|
| `levelId` | Existing — learning level for curriculum |
| `gradeId` | **New** — optional FK to canonical academic `LearningGrade` |

Validation: grade must be active+published for **new** assignments; `grade.assignedLevelId` must equal `child.levelId` (or grade’s level range must include the child’s level). Historical rows may keep inactive grades.

## Data steps (non-destructive)

1. Add `Child.gradeId`, `LearningGrade.canonicalGradeId` (nullable).  
2. Ensure academic levels LEVEL_1–3 exist (create-if-missing only).  
3. For each content `GRADE_n` (n=1..4): if an academic grade with `gradeNumber=n` exists, set `canonicalGradeId`; else set `gradeNumber=n` on the content row only when no unique conflict (promotes it to dual-role without delete).  
4. **Do not** auto-fill `Child.gradeId` (avoids silent grade reset).  
5. Admin dashboard “Grades” count uses academic grades only (`gradeNumber != null`).

## Rollback

Drop FKs / columns via reverse migration; content rows and history remain.

## Test DB

Run migrate + `SEED_CURRICULUM=1` seed on a disposable database before claiming learning tests PASS.
