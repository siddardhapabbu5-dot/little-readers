# Level-1 / Grade-1 — Production Acceptance Audit

**Date (UTC):** 2026-11-18  
**Mode:** Production-safe, **read-only** (no content edits, no payment/subscription changes, no DB writes, no deploy)  
**Environment:** `https://api.siwiapp.shop` · `https://siwiapp.shop` · VPS `/var/www/siwi`  
**Scope:** Grade-1 / Level-1 only  

**Prior live confirmation (owner):** Admin login **PASS**, Parent login **PASS**, Grade-1 learning **PASS**.

---

## Executive verdict

### **READY WITH CONDITIONS**

Grade-1 curriculum data on production meets the 10×75 = **750** published-word target. All 10 categories are `PUBLISHED`. Image URLs are present for all 750 words; a 60/60 sample probe returned HTTP OK. Public API/web health is OK.

**Conditions before unqualified client handover:**
1. Document clearly that “Listen/Speak” uses **on-device TTS** (`expo-speech`), not stored `audioUrl` files (all 750 `audioUrl` are null).  
2. Complete remaining **Android device** checklist items that are still **BLOCKED** without a physical install session in this audit.  
3. Optionally re-confirm subscription expiry / grade lock with a dedicated test subscription (not executed — read-only).

---

## 1. Content audit

| Check | Result | Evidence |
|-------|--------|----------|
| Level `LEVEL_1` published/active | **PASS** | Prisma: `isPublished=true`, `isActive=true`, label `Level 1 – Ages 1–3` |
| 10 Grade-1 categories | **PASS** | Exactly 10 categories under Level-1 groups |
| All categories published | **PASS** | 10/10 `isPublished=true`, `status=PUBLISHED` |
| 750 vocabulary records | **PASS** | 750 total / 750 `isActive` in those categories |
| 75 words per category | **PASS** | Each category `total=75`, `active=75` |
| Duplicate headwords within Grade-1 set | **PASS** | 0 duplicates on normalized `text` |
| Image URL present | **PASS** | 750/750 have `imageUrl` |
| Image URL reachability (sample) | **PASS** | 60/60 sampled HEAD/GET OK |
| Audio URL present | **FAIL** (product design gap) | **0/750** have `audioUrl` |
| Broken media (sampled images) | **PASS** | 0 failures in sample |
| Missing records vs 750 target | **PASS** | No shortfall |

### Categories (production)

| Category | Code | Status | Active words |
|----------|------|--------|-------------:|
| Action Words (Verbs) | `action_words` | PUBLISHED | 75 |
| Animals | `animals` | PUBLISHED | 75 |
| Body Parts | `body_parts` | PUBLISHED | 75 |
| Colors and Shapes | `colors_shapes` | PUBLISHED | 75 |
| Family and People | `family_people` | PUBLISHED | 75 |
| Food and Drinks | `food_drinks` | PUBLISHED | 75 |
| Fruits and Vegetables | `fruits_vegetables` | PUBLISHED | 75 |
| Household Objects | `household_objects` | PUBLISHED | 75 |
| Nature and Environment | `nature_environment` | PUBLISHED | 75 |
| School and Classroom | `school_classroom` | PUBLISHED | 75 |

Sample image pattern: `https://api.siwiapp.shop/media/vocab/pilot/batch-d1/{id}.jpg`.

Artifact: `/tmp/siwi-g1-audit.json` on VPS (read-only query output).

---

## 2. Learning audit

| Flow | Result | Evidence |
|------|--------|----------|
| Learn (Listen / activity catalog) | **PASS** | Owner live Grade-1 learning PASS; code: `category-play` Learn section + `LISTEN` |
| Speak (honest representation) | **PASS with note** | No separate speech-recognition “Speak” product path for Grade-1 core loop; Listen/Spell use **device TTS** via `speakWord` (`apps/mobile/services/speech.ts`). UI copy: “Listen first, then spell.” |
| Understand / meaning activities | **PASS** | Quiz/meaning paths exist in activity catalog; owner learning PASS |
| Play (games) | **PASS** | Matching / Quiz / Surprise wired via `services/activities.ts` |
| Complete category | **PASS** | Progress + certificate hooks in `category-play.tsx`; owner PASS |
| Next topic unlock | **PASS** | `unlockOrder` present on categories; owner learning PASS |
| Resume learning | **PASS** | `progress.resume` + Continue → `LISTEN` in `category-play.tsx`; owner PASS |
| Progress saving | **PASS** | `/learning/progress/...` client calls; owner PASS |
| Parent progress view | **PASS** | Owner parent login PASS; parent web `/parent` HTTP 200 |

### Speak honesty statement

Grade-1 does **not** play pre-recorded word MP3s from `audioUrl` (all null). Hearing the word is **on-device text-to-speech**. This is acceptable if marketed as TTS Listen, **not** as recorded native-speaker audio library.

---

## 3. Parent and subscription audit

| Check | Result | Evidence |
|-------|--------|----------|
| Parent login | **PASS** | Owner live confirmation |
| Child profile access | **PASS** | Owner Grade-1 learning PASS implies child context |
| Grade-1 subscription plans configured | **PASS** | Active plans `LEVEL_1_1M/3M/6M/12M` bound to Level-1 id |
| Payment + activation (live purchase) | **NOT TESTED** | Read-only; no payment executed |
| Subscription expiry behaviour | **NOT TESTED** | No subscription mutation / time travel |
| Grade access restrictions | **PASS** (config) | Separate Level-2/3/4 plans exist; Level-1 plans scoped by `levelId` |
| Parent session security | **PASS** | Login-auth deploy live; single-device sessions counted (16 active); policy unchanged |

---

## 4. Admin audit

| Check | Result | Evidence |
|-------|--------|----------|
| Admin login | **PASS** | Owner live confirmation |
| Admin web shell reachable | **PASS** | `https://siwiapp.shop/admin` HTTP 200 |
| Category management | **BLOCKED** | No interactive publish/edit performed (read-only) |
| Vocabulary editing | **BLOCKED** | Not exercised live |
| Image/audio management | **BLOCKED** | Images exist in DB/CDN; admin UI ops not exercised |
| Publish/unpublish | **BLOCKED** | Would modify production — skipped |
| Grade-1 content visibility | **PASS** | DB shows 10 published categories / 750 active words |

---

## 5. Android audit

| Check | Result | Evidence |
|-------|--------|----------|
| Package / versionCode (repo) | **PASS** (config) | `com.littlereaders.app`, versionCode **27** in `app.json` |
| Installed app login | **BLOCKED** | No physical device session in this audit |
| Parent dashboard | **BLOCKED** | Device |
| Child Grade-1 access | **BLOCKED** | Device (owner may have PASS separately — not re-verified here) |
| Topic navigation | **BLOCKED** | Device |
| Audio playback | **BLOCKED** | Device; expects TTS, not `audioUrl` |
| Background / resume | **BLOCKED** | Device |
| Error handling | **BLOCKED** | Device |

---

## 6. Production safety

| Rule | Status |
|------|--------|
| Read-only DB queries only | **PASS** |
| No Grade-1 content modification | **PASS** |
| No payment/subscription changes | **PASS** |
| No migrations / record updates | **PASS** |
| No new deploy | **PASS** |
| No Level-2/3/4 changes | **PASS** |
| Unrelated WIP untouched | **PASS** |
| Temporary audit script removed from server | **PASS** |

---

## 7. Public surface checks

| URL | Result |
|-----|--------|
| `GET /api/health` | **PASS** `status:ok` |
| `/kids`, `/kids/level-1` | **PASS** 200 |
| `/login`, `/parent`, `/admin`, `/pricing` | **PASS** 200 |

---

## Related reports

1. `docs/LEVEL1_TEST_CASES_AND_RESULTS.md`  
2. `docs/LEVEL1_DEFECT_REGISTER.md`  
3. `docs/LEVEL1_CLIENT_HANDOVER_READINESS.md`  

**Stop:** No fixes or deploys performed. Awaiting approval.
