# Little Readers – Complete Home Page Audit (Pre-Release)

**Date:** 2026-11-06  
**Mode:** Inspection only — **no application code was modified**  
**Primary surface:** Mobile Home tab `apps/mobile/app/(tabs)/home.tsx` and connected Kids Zone tabs / play / parent / subscription / devices  
**Runtime evidence:** Static code + prior Phase 10 audits. **Physical Android/iOS Home open:** **NOT TESTED** in this pass (ADB unavailable).

---

## Overall readiness assessment

| Area | Verdict |
|------|---------|
| Home UI polish / branding | **NOT READY** — kids dashboard exists but lacks brand logo/tagline; several metrics are synthetic |
| Student dashboard data fidelity | **PARTIAL** — progress/categories can come from API; daily goal / streak / Listen-Spell tags are misleading |
| Learning modules (Listen & Spell) | **PARTIAL** — `play.tsx` implements LISTEN → LETTER → SPELL with API sessions; Games/Matching/Quiz not built; Level‑1 750-word corpus **not guaranteed** in seed |
| Navigation | **PARTIAL** — core tabs work in code; several parent tools only via Profile; no parent PIN gate |
| Subscription / device lock | **PARTIAL** — APIs + screens exist; payments often disabled; device register tied mainly to Learn, not Home |
| Security (tokens / AuthGate) | **PARTIAL / PASS (code)** — SecureStore + AuthGate + API roles; device/session bypass **NOT TESTED** live |
| Pre-release Home readiness | **NOT READY** for child pilot marketing as a complete “Home dashboard” |

**Bottom line:** Home is a functional kids entry shell wired to real curriculum APIs when a child + seat + vocabulary exist. It is **not** a complete branded Home, and several visible widgets imply daily/weekly/achievement behaviour that the code does not compute from real calendar data.

---

## Master findings table

| No. | Feature | Current Status | Issue Found | Priority | Recommended Fix |
|-----|---------|----------------|-------------|----------|-----------------|
| 1 | Little Readers logo on Home | **NOT IMPLEMENTED** | Home header is hamburger + search only; no books logo | P2 | Add brand mark to `KidsHeader` / Home hero |
| 2 | Branding / tagline on Home | **NOT IMPLEMENTED** | Tagline exists on login, not Home | P3 | Optional Home brand strip |
| 3 | Welcome + student name | **PARTIALLY WORKING** | Uses `child.displayName`, else parent first name / `"Champ"` | P1 | Require active child; empty-state CTA to Parent |
| 4 | Profile image / avatar | **PARTIALLY WORKING** | Hardcoded emoji `🧒` in `WelcomeHero` | P2 | Per-child avatar or photo field when available |
| 5 | Home layout / SafeArea | **PASS** (code) | `SafeAreaView edges={["top"]}` + ScrollView | P3 | Device matrix still needed |
| 6 | Header icons meaning | **PARTIALLY WORKING** | ☰ → Profile; 🔍 → Learn (not search) | P2 | Rename a11y labels / icon to match action |
| 7 | Footer / tab bar | **PASS** (code) | Custom `AppTabBar` with safe bottom inset | — | — |
| 8 | Overlap / scroll | **PASS** (code) | Vertical + nested horizontal ScrollViews | P3 | Test small Android heights |
| 9 | Loading state on Home | **FAIL** | No spinner/skeleton while APIs load | P1 | Show loading until child/progress resolved |
| 10 | Empty child state | **FAIL** | Still shows Daily Goal / sections with empty data | P1 | Blocker empty state → add/select child |
| 11 | Rate-limit errors | **PARTIALLY WORKING** | 429 cleared silently (`home.tsx`) — user sees stale/empty UI | P2 | Soft “try again” without scary errors |
| 12 | Student level / age on Home | **NOT IMPLEMENTED** | `child.level` fetched but never displayed | P1 | Show level/age band under welcome |
| 13 | Learning categories on Home | **PARTIALLY WORKING** | From `/learning/levels/.../groups` when child set | P1 | Depends on DB vocabulary; empty common |
| 14 | Continue Learning | **PARTIALLY WORKING** | Heuristic pick of in-progress/unlocked category → `/play` | P2 | Prefer lastPlayedAt from progress API |
| 15 | Daily Goal card | **FAIL** | `dailyCompleted = Math.min(wordsLearned, 5)` — lifetime words, not today | P0 | Real daily counters or remove “Daily” label |
| 16 | Recommended Listen/Spell tags | **FAIL** | `i % 2 === 0 ? "Listen" : "Spell"` cosmetic only | P1 | Remove fake mode tags or open specific round |
| 17 | Points / stars on Home | **NOT IMPLEMENTED** | Progress loaded but Home does not show stars/points | P2 | Surface summary from progress API |
| 18 | Achievements on Home | **NOT IMPLEMENTED** | Rewards tab only | P3 | Optional teaser |
| 19 | Recent activity | **NOT IMPLEMENTED** | No recent sessions list on Home | P2 | Use session history if API exposes it |
| 20 | Alphabet module (dedicated) | **NOT IMPLEMENTED** | Letter round inside category play only | P2 | Clarify product: A–Z as category vs subject |
| 21 | Listen activity | **PARTIALLY WORKING** | Implemented in `play.tsx` + session API | P1 | Device E2E **NOT TESTED** |
| 22 | Spell activity | **PARTIALLY WORKING** | SPELL round + attempts API | P1 | Device E2E **NOT TESTED** |
| 23 | Pronunciation / audio | **PARTIALLY WORKING** | `expo-speech` TTS (`speech.ts`), not cloud audioUrl primary | P2 | Prefer `audioUrl` when present |
| 24 | Matching / Quiz games | **NOT IMPLEMENTED** | `games.tsx` placeholder “coming soon” | P1 | Hide tab or ship modules |
| 25 | Level‑1 750 words / 10×75 | **FAIL** / **NOT TESTED** live | Seed uses `includeWords: false`; corpus not auto-filled | P0 | Verify production DB counts; restore vocab if missing |
| 26 | Progress persistence | **PASS** (code) | Attempts + complete session update DB progress | — | Live verify |
| 27 | Resume session | **PARTIALLY WORKING** | Lesson path supports `resume: true`; category start omits count | P2 | Explicit Resume UX on Home |
| 28 | Tab: Home / Learn / Games / Rewards / Profile | **PASS** (code) | Wired in `(tabs)/_layout.tsx` | — | — |
| 29 | Kids Zone naming | **PARTIALLY WORKING** | Copy says Kids Zone; no dedicated route name | P3 | Align labels |
| 30 | Parent dashboard from Home | **PARTIALLY WORKING** | Via Profile → Parent (parents land on `/parent` after login) | P2 | Shortcut for parents |
| 31 | Subscription from Home | **PARTIALLY WORKING** | Profile / Learn seat gate | P2 | — |
| 32 | Device transfer from Home | **PARTIALLY WORKING** | Profile → Devices | P2 | — |
| 33 | Hardware back / deep links | **NOT TESTED** | Scheme `littlereaders` configured | P2 | Manual device tests |
| 34 | Dead / misleading buttons | **FAIL** | Fake Daily Goal; fake Recommend tags; Games empty | P1 | Fix or remove |
| 35 | Parent login → kids Home | **PARTIALLY WORKING** | `routeForRole(PARENT)` → `/parent` not Home | P2 | Document intentional |
| 36 | Student role Home | **PARTIALLY WORKING** | STUDENT role maps to Home; OTP creates PARENT users | P1 | Clarify account model in UX |
| 37 | Child isolation | **PASS** (code) | Children scoped by parent; AuthGate + API roles | P1 | Penetration **NOT TESTED** |
| 38 | Parent PIN / gate | **NOT IMPLEMENTED** | Kids can open Profile → Subscription/Devices without PIN | P0 | Parent gate before adult screens |
| 39 | Subscription screen | **PARTIALLY WORKING** | `subscription.tsx` loads `/subscriptions/me`, plans, payments | P1 | Live payment often off |
| 40 | Payment integration | **PARTIALLY WORKING** | Razorpay path gated by `PAYMENT_ENABLED` (default false) | P0 for paid launch | Enable + E2E only when intended |
| 41 | Expired subscription handling | **PARTIALLY WORKING** | Play redirects 402 seat/subscription codes → `/subscription` | P1 | Home should surface same gate |
| 42 | One-device-per-student | **PARTIALLY WORKING** | Register on Learn; assert on sessions; parent transfer UI | P0 | Ensure Home→Play also registers / asserts |
| 43 | Parent not inheriting student device lock | **PASS** (code) | Device routes require parent/admin; lock is child-scoped | — | — |
| 44 | Home APIs | **PARTIALLY WORKING** | `/children`, `/learning/progress/:id`, groups catalog | P1 | Handle empty + errors visibly |
| 45 | Hardcoded / sample UI metrics | **FAIL** | Daily goal, streak, coin fallback, Listen/Spell tags | P0 | Use real metrics or relabel |
| 46 | Token storage | **PASS** (code) | `expo-secure-store` with try/catch | — | — |
| 47 | Protected Home routes | **PASS** (code) | `AuthGate` + `ROLE_SETS.kidsLearning` | — | — |
| 48 | Launch / Home perf on device | **NOT TESTED** | — | P1 | ADB / Firebase performance |
| 49 | Home crash on open | **NOT TESTED** | Prior v7 React crash fixed in v8/v9 Metro pin | P0 if repro | Confirm v9 opens Home after login |
| 50 | Ages 1–3 UX | **PARTIALLY WORKING** | Large cards/emoji; adult Profile/Subscription reachable | P1 | Separate kid vs parent chrome |

---

## A. Home Page UI Audit

**File:** `apps/mobile/app/(tabs)/home.tsx`  
**Components:** `KidsHeader`, `WelcomeHero`, `DailyGoalCard`, `ContinueCard`, `RecommendCard`, `SectionRow` in `apps/mobile/components/kids.tsx`  
**Chrome:** `apps/mobile/components/AppTabBar.tsx`

| Check | Status | Notes |
|-------|--------|-------|
| Logo | **NOT IMPLEMENTED** | No logo on Home |
| Branding / tagline | **NOT IMPLEMENTED** | Login-only branding |
| Welcome + name | **PARTIALLY WORKING** | Child name preferred; weak fallbacks |
| Avatar | **PARTIALLY WORKING** | Fixed emoji, not photo |
| Layout / alignment | **PASS** (code) | Padding 20, gap 16 |
| Header / footer | **PASS** (code) | Header icons + tab bar |
| Overlap | **PASS** (code) | No absolute overlays on Home |
| Scroll | **PASS** (code) | ScrollView + horizontal recommend |
| Safe area | **PASS** (code) | Top safe; tab bar handles bottom |
| Responsive Android/iPhone/tablet | **NOT TESTED** | — |
| Keyboard | **N/A** | No text fields on Home |
| Blank / clipped | **PARTIALLY WORKING** | Empty data still shows goal/sections |

**Platforms:** Implemented for all RN targets; visual QA **NOT TESTED** on device.

---

## B. Student Dashboard Audit

| Check | Status | Evidence |
|-------|--------|----------|
| Student name | **PARTIALLY WORKING** | `WelcomeHero name={child?.displayName ?? …}` |
| Profile | **PARTIALLY WORKING** | Emoji only |
| Level / age group | **NOT IMPLEMENTED** on Home | `child.level` unused in JSX |
| Categories | **PARTIALLY WORKING** | From curriculum groups API |
| Lessons completed / pending | **NOT IMPLEMENTED** on Home | Lessons list is on Learn tab |
| Progress % | **PARTIALLY WORKING** | Continue card % from wordsLearned/wordCount |
| Points / stars | **NOT IMPLEMENTED** on Home | Loaded in `progress` state unused for display |
| Achievements | **NOT IMPLEMENTED** on Home | Rewards tab |
| Daily activity | **FAIL** | Not calendar-based |
| Continue Learning | **PARTIALLY WORKING** | Heuristic → `/play` |
| Recent activity | **NOT IMPLEMENTED** | — |
| DB vs static | **FAIL** for Daily Goal / Recommend tags; **PASS** potential for categories/progress when DB filled | |

**Detail — Daily Goal (P0)**  
- **File:** `apps/mobile/app/(tabs)/home.tsx` (`dailyCompleted = Math.min(words, 5)`)  
- **Problem:** Displays “Daily Goal” using lifetime `wordsLearned`.  
- **Expected:** Completions since local midnight (or remove Daily).  
- **Platforms:** All.

**Detail — Recommend tags (P1)**  
- **File:** `home.tsx` RecommendCard `tag={i % 2 === 0 ? "Listen" : "Spell"}`  
- **Problem:** Tag does not control mode; both open full play flow.  
- **Expected:** Accurate label or generic “Play”.  
- **Platforms:** All.

---

## C. Learning Modules Audit

| Module | Status | Notes |
|--------|--------|-------|
| Listen | **PARTIALLY WORKING** | `play.tsx` round `LISTEN` + `/learning/sessions` |
| First letter | **PARTIALLY WORKING** | Round `LETTER` |
| Spell | **PARTIALLY WORKING** | Round `SPELL` + keyboard letters |
| Alphabet-only course | **NOT IMPLEMENTED** | No dedicated alphabet track on Home |
| Reading lessons | **PARTIALLY WORKING** | Optional `lesson/[id]` + Learn lessons list |
| Matching / Quiz / Revision | **NOT IMPLEMENTED** | `games.tsx` placeholder |
| Audio | **PARTIALLY WORKING** | Device TTS via `expo-speech` |
| Score / stars / complete | **PASS** (code) | Attempts + complete endpoints |
| Next/Previous word | **PARTIALLY WORKING** | Sequential `qIndex`; no free prev in UI |
| Retry | **PARTIALLY WORKING** | Wrong answer allows retry patterns in play |
| Resume | **PARTIALLY WORKING** | Lesson `resume: true` |
| Level 1 = 750 words / 10×75 | **FAIL** / env-dependent | Seed: `seedLevel1Vocabulary(..., { includeWords: false })` — words not auto-created |

**Do not mark Listen/Spell “complete” for release** until device E2E against production API with seated child and non-empty categories.

**Stub APIs (out of Home but related):** Phase 10B noted `/api/reading/attempt`, `/spelling/attempt`, `/speech/assess` as 501 stubs — Kids Zone uses `/learning/sessions*` instead.

---

## D. Navigation Audit

| Target | Entry | Status |
|--------|-------|--------|
| Home | Tab | **PASS** (code) |
| Learn | Tab / 🔍 | **PASS** (code) |
| Games | Tab | **PARTIALLY WORKING** — placeholder only |
| Rewards | Tab | **PASS** (code) → API |
| Profile | Tab / ☰ | **PASS** (code) |
| Parent | Profile menu | **PASS** (code) |
| Subscription | Profile / Learn seat gate | **PASS** (code) |
| Devices | Profile | **PASS** (code) |
| Play | Continue / Recommend / Learn cards | **PASS** (code) |
| Rewards all | Rewards “See all” | **PASS** (code) `rewards-all.tsx` |
| Settings | — | **NOT IMPLEMENTED** as kid Settings (admin settings separate) |
| Logout | Profile | **PASS** (code) `clearSession` → `/login` |
| Android back | — | **NOT TESTED** |
| Deep links | `littlereaders` scheme | **NOT TESTED** |

No evidence of intentional “Kids Zone” route distinct from `(tabs)`.

---

## E. Parent / Student Access Audit

| Check | Status | Notes |
|-------|--------|-------|
| Parent login | **PARTIALLY WORKING** | OTP + staff email; lands `/parent` |
| Student account creation | **PARTIALLY WORKING** | Register creates PARENT User + Child |
| Student selection | **PARTIALLY WORKING** | Active child in SecureStore; Parent screen manages kids |
| Parent↔student link | **PASS** (code) | `Child.parentId` |
| Parent dashboard | **PASS** (code) | `/parent` |
| Parent consent | **PASS** (code) | Register consents |
| Parent gate | **NOT IMPLEMENTED** | Kids Profile exposes subscription/devices |
| Role permissions | **PASS** (code) | `AuthGate` + server `requireRoles` |
| Cross-student privacy | **PASS** (code intent) | Owned-child checks; live abuse tests **NOT TESTED** |

---

## F. Subscription and Device Restriction Audit

| Check | Status | Implemented vs placeholder |
|-------|--------|----------------------------|
| Subscription screen | **PARTIALLY WORKING** | Real API wiring |
| Current status display | **PARTIALLY WORKING** | Shows `sub.status` |
| Expired handling | **PARTIALLY WORKING** | Session start 402 → subscription |
| Payment | **PARTIALLY WORKING** | UI + services; **live charge** gated off by default |
| One phone per student | **PARTIALLY WORKING** | Register/transfer/assert services |
| Second device block | **PARTIALLY WORKING** | Server assert; **NOT TESTED** on 2 phones |
| Transfer/reset | **PARTIALLY WORKING** | `devices.tsx` + admin parent devices |
| Parent/teacher/admin exempt from student device lock | **PASS** (code) | Lock is child learning device, not parent OTP session |

**Gap:** Device registration runs on **Learn** focus (`learn.tsx`), not on **Home**. Home → Continue → Play may hit server assert without prior client register UX. Expected: register or clear error before play.

---

## G. API and Database Audit

| API used from Home | Purpose | Status |
|--------------------|---------|--------|
| `GET /children` | Resolve active child | **PASS** (code) |
| `GET /learning/progress/:childId` | Summary | **PASS** (code); Home underuses payload |
| `GET /learning/levels/:level/groups?childId=` | Categories | **PASS** (code) |
| SecureStore user/child | Cache | **PASS** (code) |

| Issue | Status | Priority |
|-------|--------|----------|
| No loading UI | **FAIL** | P1 |
| Silent 429 | **PARTIALLY WORKING** | P2 |
| Empty categories look like “broken Home” | **FAIL** UX | P1 |
| Duplicate fetches on every focus | **PARTIALLY WORKING** | P3 |
| Hardcoded daily/recommend presentation | **FAIL** | P0 |

Database: progress models exist; Level‑1 word volume depends on admin import / restore scripts — **not** proven by Home alone.

---

## H. Security Audit

| Check | Status | Notes |
|-------|--------|-------|
| JWT in SecureStore | **PASS** (code) | Fallback memory if keystore fails |
| AuthGate on tabs | **PASS** (code) | |
| API authorization | **PASS** (code intent) | Server enforces |
| Parent tools without PIN | **FAIL** vs child-safety expectation | P0 product |
| Token/OTP in audit output | N/A | Not reproduced here |
| Subscription bypass | **NOT TESTED** | Do not assume |
| Device restriction bypass | **NOT TESTED** | |
| Logs leaking secrets | **NOT TESTED** | Prior OTP_DEV console only in non-prod |

---

## I. Performance Audit

| Check | Status |
|-------|--------|
| App launch / Home load time | **NOT TESTED** |
| Image load | **PASS** (code) — Home mostly emoji, few bitmaps |
| Memory / rerenders | **NOT TESTED** |
| Audio | **NOT TESTED** on Home (play uses speech) |
| Offline / reconnect | **PARTIALLY WORKING** — AuthGate can use cached role; Home errors on fetch fail |
| Home crash | **NOT TESTED** on v9 |
| iOS safe area | **PASS** (code) / **NOT TESTED** device |

---

## J. Complete Missing Features List (Home-centric)

1. Brand logo / tagline on Home.  
2. Real daily learning activity.  
3. Display of level, age band, stars, points on Home.  
4. Real profile photo/avatar.  
5. Recent activity feed.  
6. Parent PIN / gate before adult settings from Kids chrome.  
7. Dedicated Matching / Quiz / Revision games.  
8. Guaranteed Level‑1 750-word catalog in environment under test.  
9. Home loading + empty-child empty states.  
10. Accurate Listen/Spell labeling on recommendations.  
11. Settings screen for kids (if required by product).  
12. Device register path when entering Play from Home.  
13. Hardware-back and deep-link QA.  
14. Live payment (if pilot requires paid seats).

---

## K. Prioritized Bug / Fix List

### P0 – Critical
1. **Fake Daily Goal** — `home.tsx` lifetime words labeled daily.  
2. **Level‑1 vocabulary readiness** — confirm 10×75 in target DB; restore if empty.  
3. **Parent gate missing** — kids can reach subscription/devices.  
4. **Confirm v9 Home opens after login** on S24 (device **NOT TESTED** this audit).  
5. **Payment off** — do not sell seats until `PAYMENT_ENABLED` + E2E approved.

### P1 – High
1. Empty child / empty curriculum Home UX.  
2. Loading indicator on Home.  
3. Show student level on Home.  
4. Remove or fix Recommend Listen/Spell tags.  
5. Games tab honesty (hide or implement).  
6. Home→Play device registration parity with Learn.  
7. Synthetic streak/coins on Rewards (`rewards.tsx`).  
8. Device matrix for Home layout.

### P2 – Medium
1. Logo/branding on Home.  
2. Avatar personalization.  
3. Recent activity.  
4. Prefer `audioUrl` over TTS when available.  
5. Continue Learning uses `lastPlayedAt`.  
6. a11y labels for header icons.

### P3 – Low
1. Tagline on Home.  
2. Kids Zone naming consistency.  
3. Deduplicate focus fetches.

---

## Final testing matrix (this pass)

| Scenario | Result |
|----------|--------|
| Fresh install Home | **NOT TESTED** |
| First-time / returning login → Home | **NOT TESTED** (code: parents → `/parent`) |
| Navigate all tabs | **CODE PASS** / device **NOT TESTED** |
| Progress updates after play | **CODE PASS** / device **NOT TESTED** |
| Logout / login | **CODE PASS** |
| Offline | **NOT TESTED** |
| Session expiry | **PARTIALLY** AuthGate 401 clears session |
| Multi screen sizes | **NOT TESTED** |

---

## Files inspected (non-exhaustive)

- `apps/mobile/app/(tabs)/home.tsx`  
- `apps/mobile/app/(tabs)/learn.tsx`  
- `apps/mobile/app/(tabs)/games.tsx`  
- `apps/mobile/app/(tabs)/rewards.tsx`  
- `apps/mobile/app/(tabs)/profile.tsx`  
- `apps/mobile/app/(tabs)/_layout.tsx`  
- `apps/mobile/components/kids.tsx`  
- `apps/mobile/components/AppTabBar.tsx`  
- `apps/mobile/components/AuthGate.tsx`  
- `apps/mobile/app/play.tsx`  
- `apps/mobile/app/devices.tsx`  
- `apps/mobile/app/subscription.tsx`  
- `apps/mobile/app/rewards-all.tsx`  
- `apps/mobile/services/secure.ts`, `api.ts`, `auth-errors.ts`, `speech.ts`  
- `server/src/learning/learning.service.ts`, `devices/device.service.ts`  
- `server/prisma/seed.ts`  

---

**Inspection complete. No code was changed. Awaiting your review and approval before any fixes.**
