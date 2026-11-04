# Batch 12 — Launch Blocker Remediation

**Date:** 2026-11-05  
**Plan:** `docs/audit/LITTLE_READERS_BATCH_12_REMEDIATION_PLAN.md` (locked before implementation)  
**Constraint:** No live payments, no store submit, no production deploy, no DB wipe, no fabricated vocabulary, no weakened tests.

---

## 1. Original blockers (from Batch 11)

| Blocker | Batch 11 status |
|---------|-----------------|
| Vitest **62 PASS / 4 FAIL** (`learning.test.ts`) | **FAIL** |
| Level 1 vocabulary density (10×≥75) | **FAIL** (~35 words total) |
| EAS `projectId` placeholder | **BLOCKED** |
| Physical Android / iPhone testing | **NOT TESTED** |
| Razorpay merchant sandbox E2E + public webhook | **NOT TESTED** / **BLOCKED** |
| Production HTTPS / backups / monitoring | **NOT TESTED** |

---

## 2. Failing tests — exact identification

**Before remediation:** 4 failures, all in `server/tests/learning.test.ts`.

| # | Exact test name | Error / assertion | Root cause |
|---|-----------------|-------------------|------------|
| 1 | `Level 1 learning API > lists learning levels and Level 1 groups/categories/words` | `wordCount >= 75` (and related word-list asserts) | L1 categories empty/near-empty after earlier vocabulary clear; default `db:seed` uses `includeWords: false` |
| 2 | `Level 1 learning API > returns Level 1 curriculum with 10 categories of 75 words` | `cats.every(c => c.wordCount >= 75)` | Same content gap |
| 3 | `Level 1 learning API > starts a listen session with A–D options` | Cascaded / insufficient category words | Same content gap |
| 4 | `Level 1 learning API > records attempts and completes with results` | Cascaded from session start | Same content gap |

**Ruled out:** auth, device registration, subscription enforcement, and payment API regressions (those suites were already green in Batch 11 and remain green).

**Secondary defect found after vocab restore (1 remaining FAIL):**  
`lists learning levels…` → `expected 0 to be greater than 0` on `sample.displayOrder`.  
**Cause:** residual Family words left from the pre-restore partial state had `sortOrder = 0` (API maps `sortOrder` → `displayOrder`) and sorted first.  
**Fix:** restore script renumbers active L1 words with `sortOrder <= 0` to positive orders **without deleting** them. Assertions unchanged.

---

## 3. Fixes implemented

| Change | Purpose |
|--------|---------|
| `server/scripts/restore-level1-vocabulary.mjs` | Upsert repo seed via `seedLevel1Vocabulary({ includeWords: true })`; renumber residual `sortOrder <= 0`; print verified counts; preserve progress/attempts/sessions |
| `server/package.json` → `db:restore-level1-vocab` | Runnable restore entrypoint |
| Plan + this report | Audit trail |

**Not changed:** test assertions, payment live mode, EAS placeholder ID (no invented Expo project), UI redesign, Nest cutover, production deploy.

**Vocabulary source:** `server/prisma/data/level1-vocabulary.generated.json` — repo-owned curated Level 1 list (`assertLevel1Vocabulary()` → 750 unique / 10×75). No external scrape import this batch. Seed upserts by `(categoryId, text)` — no headword wipe, no progress wipe.

---

## 4. Exact tests before / after

| Run | Result |
|-----|--------|
| Batch 11 (baseline) | **62 PASS / 4 FAIL / 0 skipped** (66) |
| After vocab upsert only | **65 PASS / 1 FAIL** — `displayOrder` on residual `sortOrder=0` |
| After sortOrder normalize | **66 PASS / 0 FAIL / 0 skipped** |

**Final Vitest (executed this batch):**

```
Test Files  15 passed (15)
Tests       66 passed (66)
```

---

## 5. Verified Level 1 vocabulary counts (DB)

Executed via restore script + verification payload after upsert:

| Category code | Label | Active words |
|---------------|-------|-------------:|
| family_people | Family and People | **≥75** (extras retained from prior residual/test rows; e.g. 122 after suite churn) |
| animals | Animals | **≥75** |
| fruits_vegetables | Fruits and Vegetables | **75** |
| colors_shapes | Colors and Shapes | **75** |
| body_parts | Body Parts | **75** |
| school_classroom | School and Classroom | **75** |
| household_objects | Household Objects | **75** |
| food_drinks | Food and Drinks | **75** |
| nature_environment | Nature and Environment | **75** |
| action_words | Action Words (Verbs) | **75** |

| Metric | Verified |
|--------|----------|
| Canonical seed unique headwords | **750** (file + `assertLevel1Vocabulary`) |
| Categories at/above 75 active | **10 / 10** |
| History preserved on restore | `learningProgress` / `questionAttempts` / `learningSessions` counts unchanged across restore |
| Fabricated words | **None** |

**Honest note:** Total active L1 rows can exceed 750 when residual/non-seed or test-created words remain. Product density target (**≥75 × 10**) is met. Canonical curated list size remains **750 unique**. Admin dictionary unpublished entries were not force-published.

---

## 6. EAS configuration status

| Item | Status | Detail |
|------|--------|--------|
| App name / slug | **PASS** | `Little Readers` / `little-readers` |
| Android package | **PASS** | `com.littlereaders.app` |
| iOS bundle id | **PASS** | `com.littlereaders.app` |
| `eas.json` profiles | **PASS** | `development`, `preview` (APK), `production` (AAB) |
| `extra.eas.projectId` | **BLOCKED** | Still `replace-with-eas-project-id` |
| EAS build executed | **NOT TESTED** | No Expo account/project UUID supplied |

### Owner action required (do not invent)

1. Install/login: `npx eas-cli login`
2. From `apps/mobile`: `npx eas init` (or link existing Expo project)
3. Replace `apps/mobile/app.json` → `expo.extra.eas.projectId` with the real UUID
4. Set release env: `EXPO_PUBLIC_API_URL`, `EXPO_PUBLIC_WEB_APP_URL` for staging/production
5. Then: `eas build --profile preview --platform android` (APK) / production AAB; iOS with Apple creds

---

## 7. Razorpay sandbox status

| Check | Status |
|-------|--------|
| Stub order / verify / webhook / idempotency / seats (`batch10-payments`) | **PASS** (executed in full suite) |
| Env template (`.env.example`) | **PASS** — keys documented, `PAYMENT_ENABLED=false` default |
| Merchant `rzp_test_*` keys present in local env | **BLOCKED** / **NOT TESTED** — no configured merchant sandbox secrets for live Checkout UI |
| Real Checkout UI success/fail/cancel | **NOT TESTED** |
| Public webhook endpoint wired in Razorpay dashboard | **NOT TESTED** / **BLOCKED** |
| Live mode | **BLOCKED** — not authorized |

**Still required for sandbox E2E:** merchant approval, test keys, plan paise amounts, `PAYMENT_ENABLED=true` in a non-prod env only, dashboard webhook → `POST /api/payments/webhook`, then manual Checkout matrix.

---

## 8. Physical-device testing status

**Status: NOT TESTED** (no APK/IPA install on physical Android or iPhone this batch).

### Practical checklist (for when devices + EAS builds exist)

**Android phone**

- [ ] Install preview APK  
- [ ] Login / logout (parent)  
- [ ] Create/select child; Kids Home  
- [ ] Learn → category → Listen + Spell; progress saves  
- [ ] Second device blocked; transfer works  
- [ ] Subscription screen → opens website checkout  
- [ ] Back button, keyboard, safe areas, audio interrupt  

**iPhone**

- [ ] Internal/TestFlight install  
- [ ] Same flows as Android  
- [ ] Safe area / notch; background audio interruption  

**Roles**

- [ ] Parent, Teacher, Admin login routing  
- [ ] Teacher classroom progress (web or mobile shell as available)  

Do not mark any row PASS until executed on hardware.

---

## 9. Final verification (executed)

| Check | Result |
|-------|--------|
| `prisma migrate status` | **PASS** — 13 migrations, schema up to date |
| Vitest full suite | **PASS** — **66 / 66** |
| Server `tsc --noEmit` | **PASS** |
| Mobile `tsc --noEmit` | **PASS** |
| Website `tsc --noEmit` | **PASS** |
| Website `next build` | **PASS** |
| Security-related suites in Vitest (auth reset, seats, devices, schools, payments stub) | **PASS** (included in 66) |

---

## 10. Remaining blockers

### Critical / launch-blocking (still open)

1. **EAS projectId** — **BLOCKED** until Expo project linked  
2. **Physical device proof** — **NOT TESTED**  
3. **Razorpay merchant sandbox E2E** — **BLOCKED** / **NOT TESTED** without keys + webhook URL  
4. **Production HTTPS, backups, monitoring, rollback drill** — **NOT TESTED**

### High (ops / release)

- Lock CORS to production origins  
- Real `RESEND_*` for password reset (`PASSWORD_RESET_LOG_ONLY` forbidden in prod)  
- Approved plan prices before enabling payments  
- Dedicated CI database (shared-DB pollution risk mitigated but not eliminated)  
- Admin review of residual extra L1 rows above the 750 canonical set (optional cleanup; not blocking density tests)

### Medium / low

- Mobile Teacher/Admin completeness vs website  
- Matching/Tracing not offered  
- Nest still health-only scaffold  

---

## 11. Launch recommendation

**Little Readers is still NOT production-ready for public launch.**

**Cleared this batch:** automated test suite green; Level 1 density restored from repo seed without wiping learning history; TypeScript + website production build green.

**Still blocking public launch:** Expo project linkage + signed builds + physical device QA; merchant Razorpay sandbox E2E; production hosting/HTTPS/backups/monitoring.

**Batch 12 stop.** Live payments and store submission were not enabled.
