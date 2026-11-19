# Level-1 — Admin Acceptance (Staging Executed)

**Date:** 2026-11-18  
**Environment:** Local staging only — `DATABASE_URL` → `localhost:5437` (`DB_ISOLATION=local_ok`)  
**Runner:** `server/scripts/_staging-admin-acceptance.ts`  
**Overall gate status:** **PASS**  
**Production Grade-1 words/categories:** **untouched**

---

## Safety confirmation

| Check | Result |
|-------|--------|
| Local DB isolation gate | **PASS** (script aborts exit 42 if non-local) |
| Throwaway category code | `qa_handover_<stamp>` |
| Test word text | letter-only `qahandoverfox…` (quality gate forbids `_`/digits in word text) |
| Staging fixtures cleaned | **PASS** (`leftover=0`) |
| Production content mutate | **No** |

Masked parent: `qa_***@test.local`

---

## Case results (Phase 2)

### ADM-01 — Admin login
| Field | Value |
|-------|--------|
| Expected | Staging admin login 200 + access token |
| Actual | `POST /api/auth/login` → 200 |
| Result | **PASS** |
| Evidence | Script row `ADM-01` |

### ADM-02 — Create test vocabulary
| Field | Value |
|-------|--------|
| Expected | Word created in throwaway Level-1 category |
| Actual | `POST /api/admin/vocabulary/words` → **201** |
| Result | **PASS** |
| Evidence | `ADM-02` |

### ADM-03 — Edit test vocabulary
| Field | Value |
|-------|--------|
| Expected | Meaning update persists |
| Actual | `PATCH` → 200; meaning contains `edited` |
| Result | **PASS** |
| Evidence | `ADM-03` |

### ADM-04 — Publish test record / category
| Field | Value |
|-------|--------|
| Expected | Category published |
| Actual | `PATCH /api/admin/content/categories/:id` → 200; `isPublished=true` `status=PUBLISHED` |
| Result | **PASS** |
| Evidence | `ADM-04` |

### ADM-05 — Published content visible (admin + parent path)
| Field | Value |
|-------|--------|
| Expected | Word listed; parent/child can query published category |
| Actual | Admin list includes word; `GET /api/learning/progress/:childId/categories/:catId` → **200** |
| Result | **PASS** |
| Evidence | `ADM-05`, `ADM-05c` |

### ADM-06 — Unpublish + deactivate
| Field | Value |
|-------|--------|
| Expected | Category unpublished; word inactive |
| Actual | `isPublished=false`; deactivate → `isActive=false` |
| Result | **PASS** |
| Evidence | `ADM-06` |

### ADM-07 — Unpublished / inactive no longer treated as active content
| Field | Value |
|-------|--------|
| Expected | Deactivated word not active for consumers |
| Actual | `isActive=false`; default list may still show row but marked inactive (accepted) |
| Result | **PASS** |
| Evidence | `ADM-07` |

### ADM-08 — Grade-1 classification / category assignment
| Field | Value |
|-------|--------|
| Expected | Word under LEVEL_1 group |
| Actual | `category.group.levelId` matches LEVEL_1; category code = TAG |
| Result | **PASS** |
| Evidence | `ADM-08` |

### ADM-09 — Image and media association
| Field | Value |
|-------|--------|
| Expected | `imageUrl` + emoji stored |
| Actual | Both present on created row |
| Result | **PASS** |
| Evidence | `ADM-09` |

### ADM-10 — Validation and duplicate prevention
| Field | Value |
|-------|--------|
| Expected | Duplicate text rejected; empty rejected |
| Actual | Duplicate → **409**; empty → **400** |
| Result | **PASS** |
| Evidence | `ADM-10`, `ADM-10b` |

### ADM-CLEANUP — Remove staging fixtures
| Field | Value |
|-------|--------|
| Expected | Throwaway category/words/parent removed |
| Actual | `leftover=0` |
| Result | **PASS** |
| Evidence | `ADM-CLEANUP` |

---

## Script summary

```
SUMMARY {"pass":14,"fail":0,"total":14}
```

Parent+child setup row `ADM-PARENT-SETUP` also **PASS** (register 201, child 201).

---

## Sign-off

| Role | Date | Outcome |
|------|------|---------|
| Admin tester (staging automated) | 2026-11-18 | **PASS** |
| Owner / client | | Accept / Reject |

**No production Grade-1 content was created, edited, published, or deleted.**
