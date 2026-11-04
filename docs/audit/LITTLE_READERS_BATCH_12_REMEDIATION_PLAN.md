# Batch 12 — Launch Blocker Remediation Plan

**Date:** 2026-11-05  
**Status:** PLAN LOCKED — implement only after this document  
**Constraint:** No live payments, no store submit, no production deploy, no DB wipe, no fabricated vocabulary, no weakened tests.

---

## 1. Inputs inspected

| Source | Finding |
|--------|---------|
| `LITTLE_READERS_BATCH_11_FINAL_LAUNCH_AUDIT.md` | NOT production-ready; 62 PASS / 4 FAIL; L1 density; EAS placeholder; Razorpay merchant E2E NOT TESTED; devices NOT TESTED |
| `LITTLE_READERS_MOBILE_COMPLETE_AUDIT.md` § Batch 11 | Same blockers |
| Live DB (`count-l1-words.mjs`) | 10 published L1 categories; **35** active words total (Family only); 9 categories at **0** |
| Repo seed | `prisma/data/level1-vocabulary.generated.json` — **750 unique** words, **10×75**, validates via `assertLevel1Vocabulary()` |
| Default `db:seed` | Calls `seedLevel1Vocabulary({ includeWords: false })` — structure only (intentional after owner clear) |
| Existing upsert path | `seedLevel1Vocabulary({ includeWords: true })` upserts by `categoryId_text`; does **not** call `clearAllVocabularyWords` |
| EAS | `app.json` `extra.eas.projectId` = `replace-with-eas-project-id` |
| Razorpay | Stub tests exist; no merchant sandbox keys in env |

---

## 2. Failing tests (pre-fix diagnosis)

All four failures are in `server/tests/learning.test.ts` (same root cause: content density).

| # | Test name | Likely assertion / failure mode |
|---|-----------|----------------------------------|
| 1 | `lists learning levels and Level 1 groups/categories/words` | `cats.every(c => c.wordCount >= 75)` and/or words list `>= 75` |
| 2 | `returns Level 1 curriculum with 10 categories of 75 words` | same density assert on `/learning/level-1/:childId` |
| 3 | `starts a listen session with A–D options` | May fail if `categoryId` unset from prior fail, or category has too few words for session |
| 4 | `records attempts and completes with results` | Cascades from session start failure |

**Not** attributed to auth, device lock, subscription, or API regression (those suites passed in Batch 11).  
**Confirm** by re-running the suite once after vocabulary restore; if any non-density failure remains, investigate that suite specifically.

---

## 3. Remediation workstreams

### A. Level 1 vocabulary restore (CRITICAL)

1. Confirm seed JSON licensing/provenance is the project’s original curated Level 1 list (repo-owned generated seed — not an external scrape).
2. Add `server/scripts/restore-level1-vocabulary.mjs` that:
   - Calls `seedLevel1Vocabulary(prisma, { includeWords: true })` only.
   - Does **not** invoke `clearAllVocabularyWords`.
   - Does **not** delete `LearningProgress`, sessions, attempts, lessons, or seats.
   - Prints per-category active counts + total.
3. Add npm script `db:restore-level1-vocab`.
4. Optionally allow `INCLUDE_LEVEL1_WORDS=1` on `db:seed` for fresh envs — **without** changing default to wipe; keep default `includeWords: false` so accidental reseeds do not surprise production-like DBs that rely on Admin dictionary flow. Prefer dedicated restore script for this remediation.
5. Run restore against local DB; verify counts with `count-l1-words.mjs` (**must show 10×≥75 and total ≥750** before claiming).
6. Do not invent words. If seed were incomplete, stop and document missing quantity — seed validates complete, so proceed.

### B. Test suite (CRITICAL)

1. Re-run full Vitest sequential after vocab restore.
2. Target: **0 FAIL**. Do not skip/weaken assertions.
3. If shared-DB pollution reappears, run `db:restore-curriculum` then vocab restore again before blaming code.

### C. EAS project configuration (BLOCKED without account)

1. Document exact fields already correct: `slug`, `bundleIdentifier` / `package` = `com.littlereaders.app`, `eas.json` profiles.
2. Do **not** invent `projectId`.
3. Document owner action: `eas login` → `eas init` / link project → paste real UUID into `app.json` `extra.eas.projectId`.
4. No EAS build execution unless credentials available (expect **NOT TESTED** / **BLOCKED**).

### D. Razorpay sandbox (BLOCKED without merchant keys)

1. Reconfirm stub suite still PASS (no code change unless defect found).
2. Report sandbox E2E as **BLOCKED** / **NOT TESTED** without `RAZORPAY_KEY_*` + webhook URL.
3. Keep `PAYMENT_ENABLED=false` default; do not enable live mode.

### E. Mobile device testing preparation

1. Add practical checklist to Batch 12 report (Android + iPhone).
2. Status remains **NOT TESTED** without physical devices / signed builds.

### F. Final verification

Run and record exact results:

- `prisma migrate status`
- Vitest full
- Server / mobile / website `tsc --noEmit`
- Website `next build`

### G. Documentation

- Create `docs/audit/LITTLE_READERS_BATCH_12_REMEDIATION.md` (final report with honest statuses).
- Append Batch 12 section to `LITTLE_READERS_MOBILE_COMPLETE_AUDIT.md`.

---

## 4. Explicit non-goals

- No UI redesign.
- No Nest cutover.
- No production deploy / live payments / store submit.
- No `clearAllVocabularyWords` / progress wipe.
- No claiming production-ready while EAS/device/Razorpay-merchant/HTTPS blockers remain.

---

## 5. Success criteria

| Item | Done when |
|------|-----------|
| Learning tests | All 4 PASS in full suite |
| L1 vocab | DB proves ≥75 active words × 10 cats, total ≥750 |
| EAS | Config documented; real projectId only if owner supplies |
| Razorpay | Stub PASS; merchant sandbox status honest |
| Devices | Checklist written; physical = NOT TESTED unless executed |
| Report | Batch 12 MD + mobile audit update |

**Plan locked. Proceed to implementation.**
