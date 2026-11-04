# Content Structure Admin CRUD — Pre-implementation contracts

**Date:** 2026-11-04  
**Constraint:** No duplicate hierarchies. Reuse `LearningGrade` → `LearningLevel` → `LearningGroup` → `LearningCategory`.

---

## 1. Existing models (as-is)

| Model | Key fields | Notes |
|-------|------------|--------|
| `LearningGrade` | code, label, ageMin, ageMax, sortOrder | Missing description, isActive |
| `LearningLevel` | code, label, description?, ageMin/Max, kind GRADE_BAND\|DIFFICULTY, gradeId?, sortOrder | Missing isActive |
| `LearningGroup` | levelId, code, label, sortOrder | Unique (levelId, code). Missing isActive |
| `LearningCategory` | groupId, code, label, description?, emoji, sortOrder, unlockOrder, **isPublished** | Soft-hide via isPublished |

Kids learning lists published categories + active words. Dictionary assignments FK to grade/level/category.

**Do not** invent a second Grade/Level tree.

---

## 2. Schema deltas (additive only)

| Model | Add |
|-------|-----|
| LearningGrade | `description String?`, `isActive Boolean @default(true)` |
| LearningLevel | `isActive Boolean @default(true)` |
| LearningGroup | `description String?`, `isActive Boolean @default(true)` |
| LearningCategory | no new flag — use `isPublished` as activate/deactivate |

Migration seeds no new grades beyond ensuring GRADE_1…4 remain; **does not rewrite** `VocabularyGradeAssignment` rows.

---

## 3. API contracts (new under `/api/admin/content`)

All routes: `requireAuth` + `ADMIN|SUPER_ADMIN`. PARENT → 403.

### Grades
- `GET /grades`
- `POST /grades` `{ code, label, ageMin, ageMax, description?, sortOrder?, isActive? }`
- `PATCH /grades/:id` (no silent remapping of assignments)
- `POST /grades/:id/deactivate` — sets isActive=false
- Hard `DELETE` only if zero levels/assignments; else 409 → deactivate

### Levels
- `GET /levels?gradeId=`
- `POST /levels` `{ code, label, gradeId, kind, ageMin?, ageMax?, description?, sortOrder?, isActive? }` — gradeId required for DIFFICULTY; GRADE_BAND may link grade
- `PATCH /levels/:id`
- `POST /levels/:id/deactivate`
- Delete blocked if groups/children/sessions path referenced

### Groups
- `GET /groups?levelId=`
- `POST /groups` `{ levelId, code, label, description?, sortOrder?, isActive? }`
- `PATCH /groups/:id` (may move levelId if target valid; refuse duplicate code)
- `POST /groups/:id/deactivate`

### Categories
- `GET /categories?groupId=&levelId=`
- `POST /categories` `{ groupId, code, label, description?, emoji?, sortOrder?, unlockOrder?, isPublished? }`
- `PATCH /categories/:id` (may move groupId)
- `POST /categories/:id/deactivate` → `isPublished=false`
- Delete blocked if words/sessions/progress/assignments exist

### Validation
- ageMin ≤ ageMax; ages 0–18
- codes: uppercase slug `[A-Z0-9_]+`
- level.gradeId must exist when set
- group.levelId must exist and preferably active
- category.groupId must exist

---

## 4. UI
- Website: upgrade Manage Grades/Levels/Groups/Categories pages to forms
- Mobile: Admin structure screen using same APIs

## 5. Non-goals
- Inventing vocabulary words
- Changing dictionary assignment grades automatically
- NestJS (Express only)
