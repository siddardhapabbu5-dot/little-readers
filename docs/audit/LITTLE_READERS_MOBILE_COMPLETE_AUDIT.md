# Little Readers – Complete Mobile Application Audit

**Audit date:** 2026-11-04  
**Scope:** `apps/mobile` (Expo / React Native) + shared Express API (`server`) used by mobile  
**Mode:** Audit-first — no production code, schema, or security rules were changed for this report  
**Environment verified:** Local Windows · Expo Metro web preview · API `:4100` · PostgreSQL  

**Status legend**

| Status | Meaning |
|--------|---------|
| **PASS** | Verified working |
| **FAIL** | Verified broken |
| **PARTIAL** | Implemented but incomplete |
| **MISSING** | Not implemented |
| **NOT TESTED** | Cannot verify in current environment |

---

## 1. Executive summary

The Little Readers mobile app is a **functional Level‑1 parent + kids learning client** with real authentication, SecureStore sessions, subscription eligibility, and backend-enforced **one-student–one-phone** device lock. Core loops (login → parent dashboard → select child → Learn → Listen/Spell play → rewards) work against the live API.

It is **not yet a complete multi-role product** for App Store / Play Store release:

- Teacher, Admin, and Super Admin are **stubs or thin read-only shells**.
- Forgot/reset password, edit/delete child, notifications, matching/tracing games, Levels 2–4 content, and payment renewals are **missing or website-only**.
- Role-based route **guards are weak** (many screens are reachable if the user knows the path).
- Index redirect always sends authenticated users to kids tabs, which can **override** role-specific post-login routing on cold start.
- Physical Android/iOS device builds and store submission were **not executed** in this audit.

**Automated checks run:** Mobile TypeScript `tsc --noEmit` **PASS**; Server Vitest **20/20 PASS** (auth, learning, device/subscription, vocab-import).

---

## 2. Total screens identified

| Category | Count |
|----------|------:|
| Implemented Expo Router screens (app routes) | **16** |
| Bottom tab destinations | **5** |
| Stack/modal-style destinations | **11** |
| Required by product brief (parent/kids/teacher/admin/super-admin) | **~70+ conceptual screens** |
| Gap (missing or stub vs brief) | **Large** (see §4) |

### Implemented routes (`apps/mobile/app`)

| Route | Screen | Primary role intent |
|-------|--------|---------------------|
| `/` | Bootstrap redirect | All |
| `/login` | Premium login (design image + hit zones) | All |
| `/register` | Parent registration | Parent |
| `/(tabs)/home` | Kids home dashboard | Parent/Kids |
| `/(tabs)/learn` | Level 1 groups/categories | Kids |
| `/(tabs)/games` | Games hub (links to Learn) | Kids |
| `/(tabs)/rewards` | Progress / badges / challenge | Kids |
| `/(tabs)/profile` | Profile + menu + logout | All |
| `/play` | Listen + Spell session | Kids |
| `/parent` | Parent dashboard | Parent |
| `/subscription` | Subscription status | Parent/Admin |
| `/devices` | Device register status + transfer | Parent/Admin |
| `/admin` | Admin overview (levels + subs list) | Admin |
| `/teacher` | Teacher placeholder notes | Teacher |

---

## 3. Existing screens (inventory)

### Authentication

| Screen | Route | Exists | Opens | Data/API | Options | Buttons | Status |
|--------|-------|--------|-------|----------|---------|---------|--------|
| Login | `/login` | Yes | Yes | `POST /auth/login` | Email/password, show/hide, create account | Log In, Forgot (info only), Create account | **PARTIAL** |
| Registration | `/register` | Yes | Yes | `POST /auth/register` | Name/email/password + consents | Submit | **PASS** (parent only) |
| Forgot password | — | No mobile flow | — | — | Login shows website note | Soft info only | **MISSING** |
| Reset password | — | No | — | — | — | — | **MISSING** |
| Logout | Profile | Yes | Yes | Clears SecureStore token/user/child | Logout | Works; device lock retained | **PASS** |
| Session expiry redirect | — | No dedicated handler | — | 401 not globally intercepted | — | — | **PARTIAL** |
| Invalid credentials UX | Login | Yes | Yes | ApiError mapped | Friendly message | — | **PASS** |
| Loading / error states | Login/Register | Yes | Yes | — | Loading disables submit | — | **PASS** |

### Parent module

| Screen / feature | Route | Status | Notes |
|------------------|-------|--------|-------|
| Parent Dashboard | `/parent` | **PARTIAL** | Lists children + progress summaries; Add Child |
| My Children | `/parent` | **PASS** | From `GET /children` |
| Add Child | `/parent` | **PASS** | `POST /children` |
| Edit Child | — | **MISSING** | No mobile UI; no child update route in Express children router |
| View Child Profile | — | **MISSING** | Only card summary on parent screen |
| Delete Child | — | **MISSING** | No API/UI |
| Learning Progress | `/parent` + `/rewards` | **PARTIAL** | Summary fields only |
| Rewards / Achievements | `/(tabs)/rewards` | **PARTIAL** | Uses progress API; fallback badge labels if empty |
| Subscription | `/subscription` | **PARTIAL** | Read `GET /subscriptions/me`; no in-app payment |
| Device Management | `/devices` | **PASS** | Status + transfer + history |
| Device Transfer | `/devices` | **PASS** | `POST /devices/transfer` |
| Notifications | — | **MISSING** | |
| Parent Settings | — | **MISSING** | Profile tab is shared menu only |

### Student / Kids module

| Screen / feature | Route | Status | Notes |
|------------------|-------|--------|-------|
| Kids Home | `/(tabs)/home` | **PASS** | Real progress + curriculum snippets |
| Learning Levels | Learn | **PARTIAL** | Level 1 only wired |
| Group A / B | Learn filters | **PASS** | Filter pills + groups from API |
| 10 Level 1 categories | Learn | **PASS** | Backend reports 10 cats / ~754 words |
| Category details | — | **MISSING** | Goes straight to `/play` |
| Vocabulary list | — | **MISSING** | Exists on API; not shown in mobile UI |
| Listen Game | `/play` Round 1 | **PASS** | TTS + options + attempts API |
| Spell / Letter | `/play` Round 2 | **PARTIAL** | First-letter + optional full word; not full spelling curriculum |
| Letter recognition | `/play` | **PASS** | Gentle first letter |
| Matching activities | — | **MISSING** | |
| Tracing activities | — | **MISSING** | |
| Results | `/play` DONE | **PARTIAL** | Score card only |
| Rewards / Badges | Rewards tab | **PARTIAL** | |
| Learning History | — | **MISSING** | API returns `history`; UI unused |
| Kids Profile | Profile tab | **PARTIAL** | Account menu, not child avatar profile |

### Teacher module

| Screen / feature | Status | Notes |
|------------------|--------|-------|
| Teacher Dashboard | **PARTIAL** | `/teacher` static copy only — no API |
| Assigned Classes / Students / Assignments / Reports | **MISSING** | Nest school APIs not wired to mobile |
| Notifications / Profile | **MISSING** | |

### Admin module

| Screen / feature | Status | Notes |
|------------------|--------|-------|
| Admin Dashboard | **PARTIAL** | Levels list + subscription list |
| Schools / Classes / Users / Roles | **MISSING** | |
| Vocabulary upload | **MISSING** on mobile (intentional — website) | **PASS** as product decision |
| Device / Subscription links | **PASS** | Navigate to shared screens |
| Reports / Settings / Notifications | **MISSING** | |

### Super Admin module

| Feature | Status |
|---------|--------|
| Platform dashboard, school/admin management, plans, audit logs | **MISSING** on mobile (`SUPER_ADMIN` currently routes to same `/admin` shell) |

---

## 4. Missing screens (vs product brief)

High-impact missing mobile surfaces:

1. Forgot / Reset Password  
2. Edit / Delete Child; dedicated Child Profile  
3. Category detail + vocabulary browser  
4. Matching / Tracing games  
5. Learning history timeline  
6. Notifications (all roles)  
7. Teacher classes/students/assignments/reports  
8. Admin schools/users/roles/full CRUD  
9. Super Admin platform console  
10. In-app subscription purchase / renew  
11. Levels Foundation / Elementary / Advanced content UIs (backend shells empty)  
12. Auth session refresh / global 401 gate  

---

## 5. Working screens (verified)

| Area | Evidence |
|------|----------|
| Login / Register | Code + prior smoke + API tests |
| Parent list/add children | API + UI |
| Kids Home / Learn / Rewards | API-backed |
| Play Listen→Spell→complete | Learning tests + UI |
| Devices status/transfer | Device tests + UI |
| Subscription read | `GET /subscriptions/me` |
| Logout | Clears SecureStore |
| Mobile TypeScript | `tsc --noEmit` PASS |
| Server suites | 20/20 PASS |

---

## 6. Broken / high-risk screens

| Item | Status | Notes |
|------|--------|-------|
| Teacher screen | **FAIL** as product feature | Opens but no real data/actions |
| Admin completeness | **FAIL** vs brief | Read-only subset only |
| Forgot password control | **FAIL** as recovery | Does not reset passwords |
| Index vs role redirect | **FAIL** UX | See navigation §7 |
| Overlay login hit zones | **PARTIAL** | Visual match PASS; hit-target alignment may drift by device aspect ratio (**NOT TESTED** on all phones) |

---

## 7. Navigation audit

### Verified behaviour

| Check | Status | Notes |
|-------|--------|-------|
| Login → role route | **PARTIAL** | `routeForRole`: PARENT→`/parent`, ADMIN/SUPER→`/admin`, TEACHER→`/teacher` |
| Cold start `/` | **FAIL** / risk | Authenticated users always `Redirect` to `/(tabs)/home`, not role dashboard |
| Register success | **PARTIAL** | Goes to `/(tabs)/home`, not `/parent` |
| Bottom tabs | **PASS** | home/learn/games/rewards/profile |
| Back via SoftButton / IconButton | **PASS** where present | Uses `router.back()` or explicit tab |
| Android hardware back | **NOT TESTED** | No custom `BackHandler`; Expo Router default assumed |
| iOS swipe back | **NOT TESTED** on device | Stack default |
| Drawer navigation | **MISSING** | Hamburger on Home opens Profile, not drawer |
| Deep links / scheme | **PARTIAL** | `scheme: littlereaders` in app.json; no authz deep-link rules |
| Logout → login | **PASS** | |
| Unauthorized deep screens | **FAIL** | `/admin`, `/teacher`, `/parent`, `/play` lack client route guards |
| Child switch updates data | **PARTIAL** | `saveActiveChild` + focus reload; Home may need re-focus to refresh |

### Broken / incorrect redirects

| Issue ID | Description | Severity |
|----------|-------------|----------|
| NAV-01 | After login PARENT goes to `/parent`, but app relaunch sends user to kids Home | High |
| NAV-02 | Register lands on kids tabs instead of Parent dashboard | Medium |
| NAV-03 | Profile exposes Teacher notes to all roles | Medium |
| NAV-04 | Games tab is a dead hub (only links to Learn) | Low |

### Duplicate routes / loops

- No infinite navigation loops found in code.  
- Multiple entry points to Learn (`Home`, `Games`, `Profile`, `Parent`) — intentional, not harmful.  
- Device management reachable from Parent, Learn, Profile, Admin — shared screen (good), but easy to open without parent context for non-parents (**PARTIAL**).

---

## 8. Duplicate functionality report

| Duplicate item | Locations | Actively used? | Why | Recommendation | Risk if merged |
|----------------|-----------|----------------|-----|----------------|----------------|
| Progress fetch | `home.tsx`, `parent.tsx`, `rewards.tsx` | Yes | Per-screen focus loads | Shared `useChildProgress` hook | Low |
| Children list fetch | `home`, `learn`, `parent`, `devices` | Yes | No global store | Lightweight context/store | Low |
| Device register on Learn focus | `learn.tsx` | Yes | Enforces device bind | Keep one call site; avoid Home also registering | Medium if duplicated later |
| UI Card/Button primitives | `components/ui.tsx` + `components/kids.tsx` | Yes | Design system split | Keep; document ownership | Low |
| Auth error mapping | `login.tsx` uses `auth-errors.ts` | Yes | — | Reuse in register | Low |
| Level 1 curriculum load | `home` + `learn` | Yes | — | Cache by childId | Low |
| Website vs mobile kids play | `apps/web/.../play` + `apps/mobile/play` | Yes | Dual clients | Shared types already; keep separate UI | N/A |
| Subscription stubs in API | `/subscriptions/verify` 501 vs real `/subscriptions/me` | Both exist | Phase stubs | Document; don’t call stubs from mobile | Medium confusion |
| Badge fallbacks | Soft-coded titles when API empty | Yes | UX | Prefer server achievements only when seeded | Low |

**No duplicate Prisma models or duplicate mobile route files** found after earlier cleanup of old flat `home.tsx`/`kids.tsx`.

---

## 9. Dead buttons and incomplete options

| Issue ID | Element | Location | Status | Notes |
|----------|---------|----------|--------|-------|
| UI-01 | Forgot password | `login.tsx` | **PARTIAL** | Sets info text only; no API |
| UI-02 | Rewards “See all” | `rewards.tsx` | **FAIL** | `onAction={() => undefined}` |
| UI-03 | Home menu ☰ | `home.tsx` | **PARTIAL** | Opens Profile, not menu drawer |
| UI-04 | Home search 🔍 | `home.tsx` | **PARTIAL** | Opens Learn; no search |
| UI-05 | Teacher list items | `teacher.tsx` | **FAIL** | Static text, not actionable |
| UI-06 | Games cards | `games.tsx` | **PARTIAL** | Only navigates to Learn |
| UI-07 | Parent “Set active” | `parent.tsx` | **PARTIAL** | Saves child but no confirmation / no immediate Home refresh |
| UI-08 | Login design hit zones | `login.tsx` | **PARTIAL** | Invisible Pressables; mis-taps possible on odd aspect ratios |
| UI-09 | Delete / Edit child | — | **MISSING** | |
| UI-10 | Admin CRUD controls | `admin.tsx` | **MISSING** | Read-only lists |

---

## 10. API integration report

### Mobile → Express endpoints in use

| Endpoint | Used by | Status |
|----------|---------|--------|
| `POST /auth/login` | Login | **PASS** |
| `POST /auth/register` | Register | **PASS** |
| `GET /children` | Parent/Home/Learn/Devices | **PASS** |
| `POST /children` | Parent | **PASS** |
| `GET /learning/levels` | Admin | **PASS** |
| `GET /learning/levels/1/groups?childId=` | Home/Learn | **PASS** |
| `GET /learning/progress/:childId` | Home/Parent/Rewards | **PASS** |
| `POST /learning/sessions` | Play | **PASS** |
| `POST /learning/sessions/:id/attempts` | Play | **PASS** |
| `POST /learning/sessions/:id/complete` | Play | **PASS** |
| `POST /devices/register` | Learn | **PASS** |
| `GET /devices/children/:id` | Devices | **PASS** |
| `GET /devices/children/:id/transfers` | Devices | **PASS** |
| `POST /devices/transfer` | Devices | **PASS** |
| `GET /subscriptions/me` | Subscription/Home | **PASS** |
| `GET /subscriptions/admin` | Admin/Subscription | **PASS** (role-gated server-side) |

### Not used by mobile (but available / website)

- Vocab import `/admin/vocabulary/*` (correctly website-only)  
- Word list endpoints under learning (no vocab browser UI)  
- `/parent/dashboard` aggregate (mobile calls progress directly)  

### Gaps

| Issue ID | Description | Severity |
|----------|-------------|----------|
| API-01 | No mobile global handler for 401 → login | High |
| API-02 | Login uses `mobile: false` (no device headers on auth) — intentional for parent login | Info |
| API-03 | Phase stub routes still mounted (`/lessons`, `/subscriptions/verify`, etc.) return 501 | Low if unused |
| API-04 | Children update/delete APIs absent | Medium |

JWT is stored in SecureStore (native) / localStorage (web preview). Headers `Authorization`, `X-Client-Platform`, `X-Installation-Id` applied for mobile requests.

---

## 11. Database consistency report

| Check | Status | Notes |
|-------|--------|-------|
| Level 1 content | **PASS** | ~754 words, 10 categories, 2 groups (API audit) |
| Levels 2–4 | **PARTIAL** | Rows exist; 0 words/categories |
| Parent–child ownership | **PASS** | Enforced in children/learning services |
| Progress scoped by `childId` | **PASS** | |
| Duplicate vocabulary risk | **PARTIAL** | Import system exists; mobile doesn’t manage it |
| Cross-tenant isolation | **NOT TESTED** deeply | School multi-tenant Nest path incomplete on mobile |
| Website ↔ mobile shared DB | **PASS** (architecture) | Same Postgres/Prisma |

---

## 12. Subscription security report

| Scenario | Status | Evidence |
|----------|--------|----------|
| Active subscription eligible | **PASS** | Demo parent ACTIVE; learning allowed |
| Trial / past-due / grace / suspended UX | **MISSING** mobile-specific messaging | Backend enum extended; UI mostly shows status string |
| Expired blocks learning | **PASS** (server tests / service) | Enforced server-side with device checks |
| Mobile payment / renew | **MISSING** | Read-only subscription screen |
| Same rules web vs mobile | **PASS** intent | Shared subscription service |
| Stub verify endpoints | **PARTIAL** | 501 stubs must not be used by clients |

---

## 13. One-student–one-device security report

| Scenario | Status | Evidence |
|----------|--------|----------|
| First registration | **PASS** | `POST /devices/register` |
| Same installation re-verify | **PASS** | Tests |
| Second phone blocked | **PASS** | 403 message shown in Play/Learn |
| Logout does not release device | **PASS** | Documented + secure.ts keeps installation id |
| Transfer / revoke | **PASS** | Devices screen + API + tests |
| Concurrent registration | **PASS** (tests cover conflict) | |
| Enforcement backend not UI-only | **PASS** | `assertStudentDeviceAllowed` on learning sessions |
| App reinstall new installation id | **PASS** behaviour | Requires parent transfer — by design |
| Audit history | **PASS** | Transfer events listed in UI |

---

## 14. Android compatibility

| Check | Status |
|-------|--------|
| Expo Android package configured | **PASS** (`com.littlereaders.app`) |
| EAS preview APK profile exists | **PASS** (config only) |
| EAS build executed | **NOT TESTED** / not run |
| Physical device / emulator run | **NOT TESTED** |
| Hardware back button | **NOT TESTED** |
| Keyboard avoiding | **PARTIAL** | Used on login/register; play less covered |
| Safe area | **PARTIAL** | Most tabs use SafeAreaView edges top |
| Small/large screen matrix | **NOT TESTED** |
| Login overlay alignment | **NOT TESTED** on varied DPIs |

---

## 15. iOS compatibility

| Check | Status |
|-------|--------|
| Bundle id configured | **PASS** |
| Tablet support flag | **PASS** |
| EAS iOS build | **NOT TESTED** |
| Notch / Dynamic Island | **NOT TESTED** on device |
| Keyboard / safe bottom | **PARTIAL** in code |
| App Store assets / privacy nutrition | **MISSING** |

---

## 16. Performance issues

| Issue ID | Description | Severity |
|----------|-------------|----------|
| PERF-01 | Parent dashboard N+1 progress fetches per child | Medium |
| PERF-02 | Learn registers device on every focus | Low–Medium |
| PERF-03 | Home + Learn both fetch full Level 1 groups | Medium |
| PERF-04 | Login full-bleed JPG may be heavy on low-end devices | Low |
| PERF-05 | No offline cache / queue | Medium for field use |
| PERF-06 | Web Metro preview ≠ native perf | Info |

No memory-leak instrumentation run (**NOT TESTED**).

---

## 17. Test results

| Suite | Result |
|-------|--------|
| `apps/mobile` TypeScript `tsc --noEmit` | **PASS** |
| `server` Vitest (auth, learning, device-subscription, vocab-import) | **PASS** 20/20 |
| Expo Doctor / ESLint dedicated mobile lint | **NOT TESTED** (no separate mobile eslint script observed) |
| Detox / Maestro / detox E2E | **MISSING** |
| Android Gradle / EAS build | **NOT TESTED** |
| iOS Xcode / EAS build | **NOT TESTED** |
| Physical device QA | **NOT TESTED** |

---

## 18. Critical bugs

| Issue ID | Module | Feature | Description | File(s) | Severity | Recommended solution |
|----------|--------|---------|-------------|---------|----------|----------------------|
| CRIT-01 | Navigation | Cold start | Authenticated users always land on kids Home, ignoring role dashboards | `app/index.tsx` | Critical | Redirect by stored user.role (same as `routeForRole`) |
| CRIT-02 | AuthZ | Route guards | `/admin`, `/teacher`, `/play`, `/devices` open without client role checks | Multiple app routes | Critical | Add auth gate layout / redirect |
| CRIT-03 | Teacher | Module | Teacher “dashboard” is non-functional placeholder | `app/teacher.tsx` | Critical (if teacher is in-scope for launch) | Hide route until Nest APIs wired, or implement |
| CRIT-04 | Release | Builds | No verified Android/iOS binary in this audit | `eas.json` | Critical for store | Run EAS preview builds + device QA |

---

## 19. High-priority bugs

| Issue ID | Module | Description | File(s) | Recommended solution |
|----------|--------|-------------|---------|----------------------|
| HIGH-01 | Auth | No forgot/reset password on mobile | `login.tsx` | Deep-link to web reset or implement API |
| HIGH-02 | Auth | No global 401 → login | `services/api.ts` | Centralize session expiry handling |
| HIGH-03 | Parent | No edit/delete child | `parent.tsx` + children routes | Add APIs + UI with confirmation |
| HIGH-04 | Kids | Matching/tracing missing | — | Schedule Phase curriculum or mark out of scope |
| HIGH-05 | Levels | Foundation/Elementary/Advanced empty | DB + mobile | Block UI until content seeded |
| HIGH-06 | UX | Rewards “See all” no-op | `rewards.tsx` | Implement or remove action |
| HIGH-07 | Devices | Rate-limit 429 during QA | server rate limit | Raise limit in dev; keep prod limits |

---

## 20. Medium-priority issues

| Issue ID | Description | Recommended solution |
|----------|-------------|----------------------|
| MED-01 | Register redirects to Home not Parent | Align with `routeForRole` |
| MED-02 | Profile shows Teacher to everyone | Role-filter menu |
| MED-03 | Games tab redundant | Merge into Learn or real game pickers |
| MED-04 | Login hit-zone drift risk | Prefer compositional UI or responsive absolute layout tests |
| MED-05 | Parent N+1 progress calls | Batch endpoint or `/parent/dashboard` |
| MED-06 | History from progress API unused | Add Learning History screen |
| MED-07 | Subscription UI lacks plan marketing / renew CTA | Only when payments exist |
| MED-08 | Android back not explicitly handled on tabs | Document Expo defaults; test devices |

---

## 21. Low-priority improvements

| Issue ID | Description |
|----------|-------------|
| LOW-01 | Replace emoji icons with consistent vector/3D asset pack |
| LOW-02 | Add pull-to-refresh on lists |
| LOW-03 | Accessibility labels on login invisible hit targets |
| LOW-04 | Reduce duplicate curriculum fetches with simple cache |
| LOW-05 | PhoneFrame web preview is not a substitute for device QA |
| LOW-06 | `app.json` EAS projectId still placeholder |

---

## 22. Recommended implementation order

1. **AuthZ + routing hardening** — CRIT-01, CRIT-02, HIGH-02, MED-01, MED-02  
2. **Parent completeness** — edit/delete child, clearer active-child UX (HIGH-03, UI-07)  
3. **Kids learning gaps in scope for v1** — history screen; remove/disable no-op actions (HIGH-06, MED-06)  
4. **Device/subscription polish** — friendlier 429; expired-sub messaging (HIGH-07, §12)  
5. **Teacher/Admin** — hide incomplete modules from menus until APIs exist (CRIT-03) **or** implement Nest-backed teacher flows  
6. **Content** — seed next levels only when ready (HIGH-05)  
7. **Release engineering** — EAS Android/iOS builds + real device matrix (CRIT-04, §14–15)  
8. **Password recovery** — web deep link or native flow (HIGH-01)  
9. **Performance** — batch progress, cache curriculum (PERF-01–03)  
10. **Duplicate consolidation** — shared hooks (section 8) after behaviour stable  

---

## Appendix A – File map (mobile)

```
apps/mobile/app/
  _layout.tsx
  index.tsx
  login.tsx
  register.tsx
  play.tsx
  parent.tsx
  subscription.tsx
  devices.tsx
  admin.tsx
  teacher.tsx
  (tabs)/_layout.tsx
  (tabs)/home.tsx
  (tabs)/learn.tsx
  (tabs)/games.tsx
  (tabs)/rewards.tsx
  (tabs)/profile.tsx
apps/mobile/components/
  ui.tsx, kids.tsx, AppTabBar.tsx, PhoneFrame.tsx
apps/mobile/services/
  api.ts, secure.ts, speech.ts, auth-errors.ts
```

## Appendix B – Explicit non-claims

- No physical Android or iPhone testing was performed in this audit.  
- No EAS/Android/iOS store build was completed during this audit.  
- No production data migration or duplicate deletion was performed.  
- Website admin vocabulary upload was treated as **intentionally out of mobile scope**.

---

## Approval gate

Per instructions: **await approval** before major code changes, removing duplicates, or altering subscription/device security behaviour.

Suggested first approval batch (safe, high value):

1. Fix `index.tsx` role-based redirect (CRIT-01).  
2. Add client route guards (CRIT-02).  
3. Hide/disable Teacher & incomplete Admin menu items for non-ready roles (CRIT-03 mitigation).  
4. Fix Rewards “See all” no-op (HIGH-06).  
5. Align register redirect with parent dashboard (MED-01).

**Status:** Batch 1 approved and implemented — see section below. Stopped before Batch 2.

---

## Batch 1 implementation (2026-11-04)

### Scope completed

1. Role-based login / cold-start redirect  
2. Client route guards + expired-session handling  
3. Hide/disable unfinished Teacher / Admin / Games options (no deletions, no fake data)  
4. Rewards “See all” dedicated screen with real API data  
5. Regression checks (automated + live API probes)

### Files changed

| File | Change |
|------|--------|
| `apps/mobile/services/auth-errors.ts` | Added `routeForRole`, `ROLE_SETS`, `roleAllowed` |
| `apps/mobile/services/session.ts` | Global 401 handler registry |
| `apps/mobile/services/api.ts` | Calls `notifyUnauthorized` on 401 when a token was sent |
| `apps/mobile/components/AuthGate.tsx` | New guard: token + `GET /auth/me` role check |
| `apps/mobile/app/_layout.tsx` | Wires unauthorized → clear session → `/login` |
| `apps/mobile/app/index.tsx` | Cold start verifies `/auth/me` then `routeForRole` |
| `apps/mobile/app/login.tsx` | Already uses `routeForRole` after login |
| `apps/mobile/app/register.tsx` | Redirects via `routeForRole` (parents → `/parent`) |
| `apps/mobile/app/(tabs)/_layout.tsx` | `AuthGate` `kidsLearning` |
| `apps/mobile/app/parent.tsx` | `AuthGate` `parentFamily` |
| `apps/mobile/app/admin.tsx` | `AuthGate` `admin` + incomplete-on-mobile note |
| `apps/mobile/app/super-admin.tsx` | **New** Super Admin overview (live levels/subs only) |
| `apps/mobile/app/teacher.tsx` | `AuthGate` `teacher` + “not finished” banner (no fake actions) |
| `apps/mobile/app/play.tsx` | `AuthGate` `kidsLearning` |
| `apps/mobile/app/devices.tsx` | `AuthGate` `parentFamily` |
| `apps/mobile/app/subscription.tsx` | `AuthGate` `parentFamily` |
| `apps/mobile/app/rewards-all.tsx` | **New** See-all rewards screen |
| `apps/mobile/app/(tabs)/rewards.tsx` | “See all” → `/rewards-all`; no fake badge strip when empty |
| `apps/mobile/app/(tabs)/profile.tsx` | Role-filtered menus; Teacher row disabled |
| `apps/mobile/app/(tabs)/games.tsx` | Matching/tracing marked Soon (disabled) |
| `docs/audit/LITTLE_READERS_MOBILE_COMPLETE_AUDIT.md` | This Batch 1 report |

**Not changed:** database schema, subscription rules, device lock/transfer logic, website apps, learning progress formulas.

### Redirect changes

| Role | Destination |
|------|----------------|
| `PARENT` | `/parent` |
| `STUDENT` | `/(tabs)/home` |
| `TEACHER` | `/teacher` |
| `ADMIN` / `SCHOOL_ADMIN` | `/admin` |
| `SUPER_ADMIN` | `/super-admin` |
| Unknown / default | `/(tabs)/home` |

Cold start (`index.tsx`) and login/register use backend-authenticated user role (`/auth/login` response or refreshed `/auth/me`). Expired/invalid tokens clear session and send the user to `/login`.

### Routes secured (AuthGate)

| Route | Allowed roles |
|-------|----------------|
| `/(tabs)/*` | PARENT, STUDENT, ADMIN, SUPER_ADMIN, SCHOOL_ADMIN |
| `/play` | same as kids learning |
| `/rewards-all` | same as kids learning |
| `/parent` | PARENT, ADMIN, SUPER_ADMIN, SCHOOL_ADMIN |
| `/devices` | parentFamily |
| `/subscription` | parentFamily |
| `/admin` | ADMIN, SUPER_ADMIN, SCHOOL_ADMIN |
| `/super-admin` | SUPER_ADMIN |
| `/teacher` | TEACHER, ADMIN, SUPER_ADMIN, SCHOOL_ADMIN |

Unauthorized role → redirect to that role’s home via `routeForRole`. Missing/expired session → `/login`. Backend still enforces API authorization independently.

### Screens hidden or disabled

- Profile: removed universal “Teacher notes”; Teacher entry shown only to `TEACHER` and **disabled** (“Soon”).
- Profile: Parent / Subscription / Devices only for parent-family roles; Admin / Super Admin links only for those roles.
- Teacher screen: incomplete banner; planned items are copy only (not actionable).
- Admin / Super Admin: explicit “not finished on mobile” notes; no fake CRUD.
- Games: Matching & tracing card disabled; Listen & Spell path via Learn kept.

### Rewards implementation

- Tab “See all” opens `/rewards-all`.
- Loads `GET /learning/progress/:childId` (same source as Rewards tab).
- Shows real `summary` stars/points/words/lessons and `achievements[]`.
- Loading spinner + empty state when no badges; **no invented badges** on the See-all screen.
- Preserves existing progress calculations (client only displays API fields).

### Tests executed

| Test | Result |
|------|--------|
| `apps/mobile` `tsc --noEmit` | **PASS** (exit 0) |
| `server` `npm test` (20 tests: auth, learning, device-subscription, vocab-import) | **PASS** (4 files, 20/20) |
| `routeForRole` mapping unit check (PARENT/STUDENT/TEACHER/ADMIN/SUPER_ADMIN/SCHOOL_ADMIN) | **PASS** |
| Live `POST /auth/login` parent@littlereaders.test → role PARENT → `/parent` | **PASS** |
| Live `GET /auth/me` after parent login | **PASS** (role PARENT) |
| Live admin@littlereaders.test → role ADMIN → `/admin` | **PASS** |
| Parent `GET /subscriptions/admin` | **PASS** blocked (**403**) |
| Admin `GET /subscriptions/admin` | **PASS** (**200**) |
| Invalid token `GET /auth/me` | **PASS** (**401** Invalid or expired token) |
| `GET /learning/progress/:childId` (Ava) | **PASS** (summary stars/points + 2 real achievements) |
| Device lock / one-phone enforcement suite | **PASS** (unchanged behaviour in `device-subscription.test.ts`) |
| Subscription enforcement suite | **PASS** (unchanged) |
| Website code modified? | **No** — not re-run; files untouched |
| Physical device / Expo UI deep-link bypass | **NOT TESTED** (no Detox/Maestro; no phone run in this batch) |
| Teacher live login | **NOT TESTED** — `UserRole` enum in Prisma is only `PARENT` \| `ADMIN` \| `SUPER_ADMIN`; no seeded TEACHER/STUDENT |
| Student live login | **NOT TESTED** — same (no STUDENT role in Express schema) |
| Super Admin live login | **NOT TESTED** — no seeded `SUPER_ADMIN` user (`admin@…` is `ADMIN`) |

### Actual test results (honest)

- Parent and Admin role redirects are verified against the running API and `routeForRole`.
- Unauthorized admin API access by parents is blocked by the backend (403).
- Expired/invalid sessions return 401; mobile wires 401 → clear session → login.
- Rewards payload used by See-all is real (e.g. Ava: 24 stars, 240 points, 2 achievements).
- Device + subscription regression suites still pass; schema and those services were not edited.
- Teacher / Student / Super Admin **mobile UI** redirects are implemented in code and unit-checked, but **live credential login for those three roles was not possible** with current seed + Prisma enum.

### Remaining issues (out of Batch 1 / for Batch 2+)

- No seeded `SUPER_ADMIN` (or TEACHER/STUDENT) demo accounts for end-to-end mobile login.
- Prisma `UserRole` still lacks TEACHER/STUDENT — mobile routes anticipate them; Express auth cannot issue those roles without a future schema/product decision.
- Forgot password / reset still MISSING on mobile.
- Teacher Nest school APIs still not wired (screen correctly marked incomplete).
- Admin mobile still read-only overview.
- Home ☰ / search still soft shortcuts (Profile / Learn), not full drawer/search.
- Levels 2–4 still empty content.
- No native E2E for AuthGate deep-link bypass on device.
- Overlay login hit-zone alignment still device-dependent.

**Batch 1 stop.** Awaiting approval before Batch 2.

---

## Batch 2 implementation (2026-11-04)

### Architecture decisions (inspected before schema work)

| Topic | Decision |
|-------|----------|
| **Students** | **Child profiles under PARENT** remain the learning identity. No `STUDENT` UserRole added. Kids Home / Learn / Play / Rewards continue via parent JWT + `childId` + device lock. |
| **Teachers** | **Deferred.** Prisma has no School/Class/Assignment models; Nest school APIs are stubs. Mobile Teacher screen stays an honest “waiting on APIs” shell — **no fake rosters**. |
| **TEACHER / STUDENT enum expansion** | **Not migrated in Batch 2** — would imply duplicate auth without school tenancy. Documented for Nest Phase cutover (`PlatformRole` in `packages/types`). |
| **Super Admin** | Same Express JWT auth; seed `superadmin@littlereaders.test`. Mobile `/super-admin` = live levels + subscriptions only (no invented school console). |
| **Password reset** | Single Express auth stack + `PasswordResetToken` table; email via Resend or non-prod log mode; never claim success without delivery. |
| **Levels 2–4** | `LearningLevel` rows `LEVEL_2`…`LEVEL_4` with **0 words**; mobile Learn shows structure + “Soon”; **no invented vocabulary**. Level 1 preserved. |

### Files changed / added

| Area | Files |
|------|--------|
| Schema / migration | `server/prisma/schema.prisma` (`PasswordResetToken`), `server/prisma/migrations/20261104160000_password_reset_tokens/` |
| Auth API | `server/src/auth/auth.service.ts`, `auth.routes.ts`, `server/src/lib/email.ts`, `server/src/config/env.ts` |
| Validation | `packages/validation/src/index.ts` (`forgotPasswordSchema`, `resetPasswordSchema`) |
| Seed | `server/prisma/seed.ts` — SUPER_ADMIN + LEVEL_2/3/4 shells |
| Learning | `server/src/learning/learning.service.ts` — `1`–`4` → `LEVEL_n` |
| Mobile | `forgot-password.tsx`, `reset-password.tsx`, `login.tsx` (Forgot → route), `learn.tsx` (level chips), `teacher.tsx`, `super-admin.tsx`, `profile.tsx` (logout replace) |
| Web | `apps/web/src/app/forgot-password/page.tsx`, `reset-password/page.tsx` |
| Tests | `server/tests/password-reset.test.ts` |

### APIs added

| Method | Path | Behaviour |
|--------|------|-----------|
| POST | `/api/auth/forgot-password` | Validates email; unknown → `accepted:false` (no fake send); known → token + email/log; **503** if delivery not configured in prod |
| POST | `/api/auth/reset-password` | Token + password + confirm; expiry/reuse rejected |

### Database migrations

- Applied: `20261104160000_password_reset_tokens` (PasswordResetToken table).
- **UserRole enum unchanged** (PARENT | ADMIN | SUPER_ADMIN only).

### Security tests (executed)

| Check | Result |
|-------|--------|
| Parent → `/subscriptions/admin` | **403 PASS** |
| Parent → vocab admin levels | **403 PASS** |
| Admin → `/subscriptions/admin` | **200 PASS** |
| Super Admin login + `/auth/me` | **200 SUPER_ADMIN PASS** (after seed) |
| Super Admin → `/subscriptions/admin` | **200 PASS** |
| Invalid bearer `/auth/me` | **401 PASS** |
| AuthGate on protected mobile routes | Preserved from Batch 1 |
| Logout uses `router.replace("/login")` | Implemented (back-stack mitigation) |
| Physical deep-link / back-after-logout on device | **NOT TESTED** |
| Teacher/Student JWT logins | **N/A** — roles not in schema (by design this batch) |

### Regression tests (executed)

| Suite | Result |
|-------|--------|
| `server` vitest (auth, learning, device-subscription, vocab-import, **password-reset**) | **26/26 PASS** |
| Device lock + subscription enforcement | **PASS** (unchanged) |
| Level catalog after seed | LEVEL_1 wc≈759; LEVEL_2/3/4 **wc=0** |
| Parent / Admin live login | **PASS** |
| Website | Forgot/reset pages wired to API; full website E2E **NOT re-run** beyond that |
| Physical Android/iOS | **NOT TESTED** |

### Demo credentials (local seed)

- Parent: `parent@littlereaders.test` / `ParentDemo1`
- Admin: `admin@littlereaders.test` / `AdminDemo1`
- Super Admin: `superadmin@littlereaders.test` / `SuperDemo1`

### Missing / deferred (remaining issues)

- TEACHER UserRole + School/Class/Assignment Nest APIs (Teacher dashboard features).
- STUDENT User accounts (optional school login); kids remain Child-under-Parent.
- Production email: set `RESEND_API_KEY` (+ from address); do not enable `PASSWORD_RESET_LOG_ONLY` in production.
- Prisma client `generate` may need a process restart if Windows EPERM locks `query_engine` while the API is running.
- Native keyboard / Detox deep-link matrix still **NOT TESTED**.
- Admin mobile remains read-only overview.
- Vocabulary for Levels 2–4 awaits owner content.

**Batch 2 stop.**

---

## Batch 3 implementation (2026-11-04) — Parent & Admin completion

### Goals

Complete Parent child management + progress UX; expand Admin / Super Admin mobile dashboards with **real APIs only**; add authorization tests; keep Teacher deferred.

### Backend APIs added (documented gaps → implemented)

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| GET | `/api/children/:id` | PARENT (own) / ADMIN / SUPER_ADMIN | Child profile + device summary |
| PATCH | `/api/children/:id` | same | Update displayName / birthYear / level |
| DELETE | `/api/children/:id` | same | Soft-delete (`isActive=false`) + revoke device |
| GET | `/api/children/admin/parents` | **ADMIN / SUPER_ADMIN only** | Parent directory with children + latest subscription |

Also: learning progress ownership allows ADMIN/SUPER_ADMIN read for support (`getChildLearningOverview` / `getChildProgress` role bypass).

**Still not on Express (documented, not invented):** school registration, audit logs, plan config console, Teacher class APIs, bulk parent user CRUD beyond directory, in-app vocab upload (website remains).

### Mobile files

| File | Change |
|------|--------|
| `apps/mobile/app/parent.tsx` | Empty state; **View / edit** → child detail |
| `apps/mobile/app/child/[id].tsx` | **New** profile, edit, confirm delete, categories, achievements, history |
| `apps/mobile/app/admin.tsx` | Dashboard counts, parents (expand → child), levels, categories, vocab sample, imports, subscriptions |
| `apps/mobile/app/super-admin.tsx` | SUPER_ADMIN-only gate; platform snapshot from same live APIs; Nest Phase 3 gaps listed |

### Validation

- `updateChildSchema` in `packages/validation`
- Soft delete retains learning rows; revokes `StudentDevice`

### Tests executed

| Suite | Result |
|-------|--------|
| `server` vitest (all) | **34/34 PASS** |
| New `children-admin-authz.test.ts` (8) | **PASS** — cross-parent 404 on get/patch/delete; parent blocked from `/admin/parents` (403); admin list + read OK; unauthenticated patch 401 |
| Device / subscription / learning / password-reset / vocab | **PASS** (regression) |
| Mobile `tsc --noEmit` | **PASS** (fixed web-only `outlineStyle` on login input) |
| Physical device UI | **NOT TESTED** |

### API gaps remaining

- No dedicated “manage learning level publish flags” or category CRUD on mobile (admin vocabulary **read** only; uploads on website).
- No Super-Admin-only APIs beyond elevated access to existing admin reads + parent directory.
- Teacher School/Class APIs still absent (deferred).

### Preservation

- Batch 1 AuthGate / role redirects unchanged in spirit.
- Batch 2 password reset / LEVEL_2–4 shells / SUPER_ADMIN seed preserved.
- Subscription + one-device rules not weakened.

**Batch 3 stop.**

---

## Batch 4 implementation (2026-11-04) — Learning experience completion

### Goals

Complete Level 1 Listen → Letter → optional Spell → results on **mobile**, harden progress persistence (duplicate score / double-complete prevention), keep Levels 2–4 empty shells, no invented vocabulary, do not redesign website.

### Completed screens / activities

| Surface | Status | Notes |
|---------|--------|-------|
| Mobile Learn (`(tabs)/learn.tsx`) | **Preserved** | Level 1 groups A/B (10 categories); L2–L4 “Soon” / empty when `wordCount=0` |
| Mobile Play Listen | **Complete** | Target word + emoji/imageUrl, TTS play/replay, A–D audio choices, clue, progress, feedback, Next, client+server duplicate locks |
| Mobile Play Letter (ages 1–3) | **Complete** | 4-letter first-letter matching, clue, try-again |
| Mobile Play Spell | **Complete (optional)** | Full alphabet keyboard, backspace, clear, Okay submit, skip |
| Mobile Results | **Complete** | Mascot, stars/points/accuracy/attempted/correct/words, confetti, Replay / Back / Next category |
| Website Level 1 play | **Unchanged** | Existing web flow left intact |
| Levels 2–4 | **Empty shells** | No fake % or invented words |

### APIs used (existing)

- `POST /learning/sessions` — start with A–D `listenOptions`
- `POST /learning/sessions/:id/attempts` — LISTEN / LETTER / SPELL
- `POST /learning/sessions/:id/complete` — stars/points/accuracy/wordsLearned/nextCategory
- `GET /learning/levels/:key/groups?childId=` — category progress
- `GET /learning/progress/:childId` — overview (parent isolation)

### APIs / service behavior added (no schema migration)

| Change | File |
|--------|------|
| Idempotent correct attempts (`duplicate: true`, no second point award) | `server/src/learning/learning.service.ts` `submitQuestionAttempt` |
| Idempotent session complete (no double progress/achievements) | same, `completeLearningSession` |
| Default LETTER score 6 when `pointsAwarded` omitted | `submitQuestionAttempt` |

**Database:** no new Prisma migrations. Uses existing `LearningSession`, `QuestionAttempt`, `ChildCategoryProgress`, `LearningProgress`, `Achievement`.

### Mobile files

| File | Change |
|------|--------|
| `apps/mobile/app/play.tsx` | Full Listen → Letter → Spell → Results rewrite |
| Website kids play | **Not modified** |

### Scoring (unchanged rules)

- Listen correct: 10 (5 with clue)
- Letter correct: 6 (3 with clue)
- Spell correct: 8 (4 with clue)
- Stars on complete: accuracy ≥90 → 3; ≥70 → 2; ≥40 → 1; else 0

### Missing media / vocabulary (documented, not invented)

- Level 1: **10 categories × ≥75 approved words** verified by existing `learning.test.ts` (seed/DB).
- `imageUrl` / `audioUrl` fields returned on session words; often **null** until owner uploads assets. Mobile falls back to **emoji + TTS** (`expo-speech` / web `speechSynthesis`).
- Levels 2–4: **wordCount=0** — shells only.

### Tests executed

| Suite | Result |
|-------|--------|
| Server vitest (all) | **40/40 PASS** (7 files) |
| New `learning-play.test.ts` (6) | Listen options, Listen+Letter scoring, duplicate Listen idempotent, complete + re-complete stable, parent B blocked from child A progress/session, attempts after close 400 |
| Existing `learning.test.ts` | **PASS** |
| Device / subscription / authz / password-reset / vocab | **PASS** (regression) |
| Mobile `tsc --noEmit` | **PASS** |
| Android / iOS physical UI | **NOT TESTED** (no device run in Batch 4) |

### Remaining issues / limitations

- Client still receives `isCorrect` on listen options (same as website); server trusts client `isCorrect` flag — duplicate guard prevents double scoring but not forged correct answers. Hardening would need stored options or answer verification keys.
- No recorded audio playback when `audioUrl` is null (TTS only).
- Physical-device UX (TTS voice packs, timing) not verified on Android/iOS hardware.
- Teacher School/Class still deferred (Batch 2/3).

### Preservation

- Batches 1–3 AuthGate, password reset, Parent/Admin/Super Admin, subscription + one-device rules unchanged.
- Website design not redesigned.
- No fake vocabulary or placeholder completion % on L2–L4.

**Batch 4 stop.**

---

## Batch 5 — Four-grade dictionary classification (2026-11-04)

**Schema proposal (written before coding):** `docs/audit/LITTLE_READERS_FOUR_GRADE_DICTIONARY_SCHEMA.md`

### Grades (age bands)

| Grade | Ages | Linked `LearningLevel` |
|-------|------|-------------------------|
| GRADE_1 | 1–3 | LEVEL_1 |
| GRADE_2 | 4–6 | LEVEL_2 |
| GRADE_3 | 7–9 | LEVEL_3 |
| GRADE_4 | 10–12 | LEVEL_4 |

`LearningGrade` is new. Existing `LEVEL_1…4` remain the mobile/API level keys (backward compatible) with `kind=GRADE_BAND` + `gradeId`.

Difficulty-within-grade (`LearningLevelKind.DIFFICULTY`) is supported in schema for future bands; not required for Kids Zone yet.

### Dictionary model (no headword duplication per grade)

- `DictionaryEntry` — one normalized headword
- `DictionarySense` — multiple definitions / POS / synonyms / antonyms / examples (only when present in source)
- `DictionaryImportBatch` — full-dictionary upload + licence/source metadata
- `VocabularyGradeAssignment` — PENDING → APPROVED / REJECTED → PUBLISHED; stores difficulty, confidence, explanation, `classificationVersion`
- `VocabularyWord` — kids-facing publish target; unique **`(categoryId, text)`** (was global `text`); `origin` LEGACY | DICTIONARY | CATEGORY_IMPORT

Legacy / empty Level 1 words are **not** auto-reclassified. Prior clear left categories empty; structures mirrored to L2–L4.

### Classification engine

- Version: `classify-v1`
- Signals: length + estimated syllables + definition complexity + abstract hints + early concrete allowlist + category keyword match (**not** length-only)
- Multi-grade suggestions near score boundaries
- Every explanation states suggestions are **not a guarantee of developmental suitability**
- Never invents missing definitions / POS

### APIs

| Method | Path |
|--------|------|
| GET | `/api/admin/dictionary/grades` |
| POST | `/api/admin/dictionary/uploads` (multipart; json/csv/xlsx/docx/pdf/…) |
| GET | `/api/admin/dictionary/imports` |
| POST | `/api/admin/dictionary/imports/:id/classify` |
| GET | `/api/admin/dictionary/assignments?status=&gradeId=&maxConfidence=` |
| PATCH | `/api/admin/dictionary/assignments/:id` |
| POST | `/api/admin/dictionary/assignments/:id/approve\|reject\|publish` |
| POST | `/api/admin/dictionary/assignments/bulk-approve` |

Kids learning still uses published `VocabularyWord` (`isActive`) via existing session APIs. Seats + device locks unchanged. Unpublished dictionary rows are not exposed.

### Admin UI

- Web: `/admin/vocabulary/dictionary` — upload → classify → approve/publish/reject
- Hub link added on vocabulary home

### Tests

| Suite | Result |
|-------|--------|
| `dictionary-grade.test.ts` (3) | **PASS** — classify heuristics, JSON multi-sense import + single entry, approve/publish, grades list |
| `child-seats.test.ts` (2) | **PASS** (regression) |

### Licensing / gaps remaining

- Source name + licence fields stored on batch/entry; admin must supply real licence text for production dictionaries
- No paid dictionary vendor integration
- DIFFICULTY sub-levels within a grade not populated in seed
- Mobile Learn tabs still labelled LEVEL_1…4 (now age-aligned to grades); no separate “Grade” chrome yet
- Bulk publish + low-confidence queue UX is API-complete; web UI lists pending only
- Full regression of historical Level 1 word content N/A (vocabulary was emptied by owner request before this batch)

### Follow-up (post exploration)

Exploration gap: child `inferLevelFromBirthYear` still returned FOUNDATION/ELEMENTARY/ADVANCED. **Fixed** to map ages → `LEVEL_1…LEVEL_4` (1–3 / 4–6 / 7–9 / 10–12) with matching `AgeGroup` seed rows. Legacy FOUNDATION/ELEMENTARY/ADVANCED codes retained for old profiles.

---

## Batch 5b — Content structure Admin CRUD (2026-11-04)

**Pre-impl plan:** `docs/audit/LITTLE_READERS_CONTENT_STRUCTURE_CRUD_PLAN.md`

### Database (additive)

| Model | Added |
|-------|--------|
| `LearningGrade` | `description?`, `isActive`, `updatedAt` |
| `LearningLevel` | `isActive`, `updatedAt` |
| `LearningGroup` | `description?`, `isActive`, `updatedAt` |
| `LearningCategory` | unchanged — activate via `isPublished` |

Migration: `20261104220000_content_structure_active_flags`. **No remapping** of dictionary assignments or existing LEVEL_1…4 codes.

### APIs (`/api/admin/content/*`) — ADMIN / SUPER_ADMIN only

CRUD + deactivate for **grades**, **levels**, **groups**, **categories**.  
Hard DELETE returns **409** when referenced (vocab/sessions/assignments/children) — prefer deactivate/unpublish.  
PARENT → **403**.

### Website (`:3100`)

- `/admin/vocabulary/grades` — create/edit ages/order/activate  
- `/admin/vocabulary/levels` — create difficulty levels under grade  
- `/admin/vocabulary/groups` — create/edit/deactivate  
- `/admin/vocabulary/categories` — create/edit/publish  
- Nav + hub links updated  

### Mobile (`:8081`)

- `/admin-structure` — grades create + activate; levels/categories toggle; groups list  
- Linked from Admin overview (**Manage structure**)  
- Full form editors remain richest on website; same API  

### Tests

| Suite | Result |
|-------|--------|
| `content-structure.test.ts` (4) | **PASS** — parent 403, grade CRUD, level/group/category chain, in-use grade 409 |
| `dictionary-grade.test.ts` | **PASS** |
| `child-seats.test.ts` | **PASS** |

### Remaining gaps

- Mobile create forms for levels/groups/categories (list + toggle only)  
- SoftButton-driven prompt UX on web is functional, not polished  
- Kids catalog does not yet hide inactive **groups** (categories still gate via `isPublished`)  

**Batch 5b stop.**

---

## Batch 6 — Vocabulary word management (2026-11-05)

**Pre-impl plan:** `docs/audit/LITTLE_READERS_VOCABULARY_MANAGEMENT_PLAN.md`

### Models / APIs reused

| Piece | Change |
|-------|--------|
| `VocabularyWord`, `DictionarySense`, `VocabularyGradeAssignment` | **Reused** — no schema migration |
| `GET/POST/PATCH/DELETE /api/admin/vocabulary/words*` | **New** search/detail/create/update/deactivate/safe-delete/reclassify |
| `POST …/assignments/bulk-approve` | **Extended** — per-id success/failure results |
| `POST …/assignments/bulk-reject`, `bulk-publish` | **New** |
| Dictionary import / classify / single approve-publish | Unchanged |
| Seats, devices, learning progress | Untouched — reclassify keeps same `VocabularyWord.id` |

### Website (`:3100`)

- `/admin/vocabulary/words` — search/filters, detail/edit, reclassify, bulk assignment review  
- `/admin/vocabulary/dictionary` — multi-select + bulk approve/reject/publish + max-confidence filter  
- Nav label: **Manage Words**

### Mobile (`:8081`)

- `/admin-words` — search, edit, deactivate, reclassify; **Bulk review on website** link  
- Linked from Admin overview (**Manage words**)

### Security

- All write (and list) routes: `requireAuth` + `ADMIN` / `SUPER_ADMIN`  
- PARENT → **403** (tested)  
- Invalid grade/level/category reclassify → **400**; in-use hard delete → **409**  
- Existing `reviewedById` / `reviewedAt` on assignments used; no new audit subsystem

### Tests (exact)

| Suite | Result |
|-------|--------|
| `word-management.test.ts` (5) | **PASS** — parent 403; CRUD+deactivate+delete; reclassify same id + invalid reject; delete blocked when attempts exist; bulk approve/publish |
| `dictionary-grade.test.ts` (3) | **PASS** — import/classify/publish still works |
| `content-structure.test.ts` (4) | **PASS** |
| `child-seats.test.ts` (2) | **PASS** |
| Mobile `tsc --noEmit` | **PASS** |
| Website `tsc --noEmit` | **PASS** |
| Website `next build` | **FAIL** — pre-existing `/school` prerender `useContext` null (unrelated to Batch 6; admin vocab pages compiled) |

### Remaining gaps

- Mobile has no multi-select bulk review UI (by design — website link)  
- No dedicated audit log table for word edits (uses assignment reviewer fields only)  
- Server root `tsc` still reports pre-existing `findUnique({ text })` mismatches in vocab-import/seed (not introduced here)  
- Lesson CRUD / School-Teacher APIs **not started** (Batch 6 stop)

**Batch 6 stop.**

---

## Batch 7 — Lesson management (2026-11-05)

**Pre-impl plan:** `docs/audit/LITTLE_READERS_LESSON_MANAGEMENT_PLAN.md`

### Models / migration

| Change | Detail |
|--------|--------|
| `Lesson` | + `gradeId`, `groupId`, `learningCategoryId`, `isActive`, `activitiesJson` |
| `LessonVocabItem` | **New** — links lesson → `VocabularyWord` (legacy `LessonWord`→`Word` kept) |
| `ChildLessonProgress` | **New** — per child×lesson progress |
| `LearningSession.lessonId` | Optional — lesson-backed Listen/Spell |
| Migration | `20261105010000_lesson_management` (**applied**) |

### APIs

- **Admin** `/api/admin/lessons` — list/search, CRUD, words put/delete, preview, publish/unpublish/deactivate (ADMIN/SUPER_ADMIN; PARENT **403**)
- **Learning** `GET /learning/lessons`, `GET /sessions/active`; `POST /sessions` accepts `lessonId` **or** `categoryId` with resume
- Publish requires active vocab; dictionary words must have PUBLISHED assignment when dictionary-linked
- Activities configured as `LISTEN`/`SPELL` only

### Website / mobile

- Web: `/admin/vocabulary/lessons` (+ AdminShell **Manage Lessons**)
- Mobile: `/admin-lessons` create/list/publish/deactivate + website editor link

### Build / TS investigations

| Issue | Outcome |
|-------|---------|
| `/school` Next prerender `useContext` null | **Fixed** — `force-dynamic` + inline shell (no `PortalShell`); same for `/teacher` |
| Server `findUnique({ text })` after compound unique | **Fixed** in vocab-import, level1 seed, vocab-import test |
| Prisma `generate` EPERM on Windows DLL lock | Types present; binary rename blocked by running Node — restart API to refresh engine if needed |

### Tests (exact)

| Suite | Result |
|-------|--------|
| `lesson-management.test.ts` (3) | **PASS** |
| `word-management.test.ts` (5) | **PASS** |
| `child-seats.test.ts` (2) | **PASS** |
| Server `tsc --noEmit` | **PASS** |
| Mobile `tsc --noEmit` | **PASS** |
| Website `tsc --noEmit` | **PASS** |
| Website `next build` | **PASS** (incl. `/school`, `/admin/vocabulary/lessons`) |

### Remaining gaps

- Kids UI does not yet surface a dedicated “Lessons” picker (API ready; category Listen/Spell unchanged)
- Mobile lesson editor lacks full drag-reorder vocab (website)
- Matching/Tracing still not implemented (by design)
- Physical-device Listen/Spell-on-lesson: **not physically tested** this batch
- School/Teacher live APIs: **not started** (Batch 7 stop)

**Batch 7 stop.**

---

## Batch 8 — Kids Lessons + Subscription & Child Seats (2026-11-05)

**Pre-impl plan:** `docs/audit/LITTLE_READERS_BATCH_8_PLAN.md`

### APIs / models reused or changed

| Area | Change |
|------|--------|
| `listPublishedLessonsForChild` | Grade/level/category visibility filter; unpublished/inactive hidden; `playStatus` (`NOT_STARTED` / `IN_PROGRESS` / `COMPLETED`); word count from vocab items |
| Learning sessions | Unchanged resume/`lessonId` path; per-child isolation; Listen/Spell only |
| `ChildLessonProgress` | Unchanged — independent progress per child |
| Seats | Existing assign/unassign/grant; **new** `revokeExtraSeats` + `POST /subscriptions/seats/revoke` (409 if capacity would drop below assigned) |
| `GET /subscriptions/admin` | Enriched seat snapshot (included/extra/capacity/assigned/available + children) |
| Migrations | **None** this batch (schema from seats + Batch 7) |

### Kids Lessons

| Surface | Detail |
|---------|--------|
| Mobile | Learn tab → Lessons list with status; `/lesson/[id]` preview + Start/Resume → `/play?lessonId=` |
| Web | `/kids/lessons`, `/kids/lessons/[id]`; play accepts `lessonId` |
| Activities | LISTEN + SPELL only; Matching/Tracing not offered |
| Category play | Preserved alongside lessons |

### Parent / Admin seats

| Surface | Detail |
|---------|--------|
| Parent mobile | Subscription screen: plan, status, dates, seats used/available, assign/unassign |
| Parent web | `/parent` subscription + seat management (same APIs) |
| Admin web | `/admin/subscriptions` — list, grant/revoke extras, assignment status |
| Admin mobile | `/admin-seats` from Admin hub |
| Enforcement | Backend `hasLearningSeat`; 3rd child blocked until grant+assign; no fake payment grant |

### Security / regression tests (exact)

| Suite | Result |
|-------|--------|
| `batch8-lessons-seats.test.ts` (3) | **PASS** — visibility + playStatus; grant/assign/revoke; parent 403 on revoke |
| `child-seats.test.ts` (2) | **PASS** |
| `lesson-management.test.ts` (3) | **PASS** — incl. two-child independent resume + idempotent scoring |
| `word-management.test.ts` (5) | **PASS** |
| Server `tsc --noEmit` | **PASS** |
| Mobile `tsc --noEmit` | **PASS** |
| Website `tsc --noEmit` | **PASS** |
| Website `next build` | **PASS** (incl. `/kids/lessons`, `/admin/subscriptions`) |

### Remaining gaps

- Payment gateway / paid checkout: **not started** (admin grant only)
- Matching/Tracing activities: **not implemented**
- Physical Android/iOS device testing: **not performed** this batch
- School/Teacher live APIs: **not started** (Batch 8 stop)
- Mobile lesson admin editor still lighter than website

**Batch 8 stop.**

---

## Batch 9 — School, Teacher & Classroom Management (2026-11-05)

**Pre-impl plan:** `docs/audit/LITTLE_READERS_BATCH_9_PLAN.md` (written before schema/code)

### Architecture (enrollment)

- **Parent → Child remains canonical.** School does not create a second student account.
- `ClassroomEnrollment.childId` references existing `Child` profiles.
- Home seats, devices, Listen/Spell progress stay on `Child`; teachers only monitor / assign published lessons.
- Implemented on **Express `server/`** (live API). Nest `apps/api` remains health-only.

### Schema / migration

| Change | Detail |
|--------|--------|
| `UserRole` | + `TEACHER`, `SCHOOL_ADMIN` |
| `SchoolStaffRole` | `TEACHER` \| `SCHOOL_ADMIN` |
| Models | `School`, `SchoolStaff`, `Classroom`, `ClassroomTeacher`, `ClassroomEnrollment`, `ClassroomLessonAssignment` |
| Migration | `20261105020000_school_teacher_classroom` (**applied**) |

### APIs

- `/api/admin/schools` — CRUD schools, teachers, classrooms, enroll/unenroll, assign teachers (ADMIN/SUPER_ADMIN/SCHOOL_ADMIN scoped)
- `/api/teacher/*` — me, classroom roster/progress, published lessons, assign lessons, enroll (TEACHER+)
- Isolation: school membership + classroom assignment checks server-side
- Teachers blocked from vocab admin + seat grant; parents blocked from school admin

### Website / mobile

| Surface | Detail |
|---------|--------|
| Web Admin | `/admin/schools`, `/admin/schools/[id]` |
| Web Teacher | `/teacher` live dashboard |
| Web School Admin | `/school` membership hub |
| Mobile | `/teacher` dashboard; `/admin-schools` create/manage |

### Tests / builds (exact)

| Suite | Result |
|-------|--------|
| `batch9-schools.test.ts` (3) | **PASS** — cross-teacher 403; enroll/dup/assign; deactivated teacher 401 |
| `batch8-lessons-seats.test.ts` (3) | **PASS** |
| `child-seats.test.ts` (2) | **PASS** |
| `lesson-management.test.ts` (3) | **PASS** |
| Server `tsc --noEmit` | **PASS** |
| Mobile `tsc --noEmit` | **PASS** |
| Website `tsc --noEmit` | **PASS** |
| Website `next build` | **PASS** (incl. `/admin/schools`, `/teacher`, `/school`) |

### Remaining gaps

- Payment gateway / school license checkout: **not started**
- NestJS tenant cutover / RLS: **not started**
- Rich school-admin classroom student picker UI (enroll by Child ID; no invented directory)
- Physical Android/iOS teacher login: **not performed**
- Separate STUDENT User accounts: deferred (Child profiles remain)

**Batch 9 stop.**

---

## Batch 10 — Payment Gateway & Subscription Checkout (2026-11-05)

**Pre-impl plan:** `docs/audit/LITTLE_READERS_BATCH_10_PAYMENT_PLAN.md`

### Gateway choice

**Razorpay Orders (one-time payments)** with controlled renewal (extend `expiresAt` on verified pay). Razorpay Subscriptions deferred until merchant plans/prices approved. School `SUBSCRIPTION_PACKAGES` unchanged (B2B).

### Env (sandbox — do not commit live secrets)

```
PAYMENT_ENABLED=true
RAZORPAY_KEY_ID=rzp_test_…
RAZORPAY_KEY_SECRET=…
RAZORPAY_WEBHOOK_SECRET=…
PAYMENT_CURRENCY=INR
PLAN_FAMILY_MONTHLY_AMOUNT_PAISE=
PLAN_FAMILY_YEARLY_AMOUNT_PAISE=
PLAN_EXTRA_SEAT_AMOUNT_PAISE=
TAX_RATE_BPS=0
```

Empty plan amounts / `PAYMENT_ENABLED=false` → checkout **503** `PLAN_PRICES_NOT_CONFIGURED` (no invented prices).

### Schema / APIs

| Change | Detail |
|--------|--------|
| Migration | `20261105030000_payment_checkout` |
| `Payment` | + `purpose`, `seatsPurchased`, `planCode`, `razorpayOrderId`, `razorpayPaymentId`, `rawEventId`, `metadataJson` |
| APIs | `GET/POST /payments/plans|orders|verify|me|admin` + `POST /payments/webhook` |
| Activation | Only after signature + Razorpay fetch (or verified webhook); idempotent |
| Manual grants | Still `manual_admin` — distinct from `razorpay` |

### Screens

| Surface | Detail |
|---------|--------|
| Web Parent | `/parent/checkout`, `/parent/payments` |
| Web Admin | `/admin/subscriptions` payment history table |
| Mobile | Plans + history; opens website checkout (`EXPO_PUBLIC_WEB_APP_URL`) — **no native IAP** |

### Webhook

`POST /api/payments/webhook` — HMAC `X-Razorpay-Signature`; events `payment.captured` / failed / refund (refund marks ledger; seats not auto-revoked if assigned).

### Tests / builds

| Suite | Result |
|-------|--------|
| `batch10-payments.test.ts` (3) | **PASS** — invalid sig; verify+idempotent yearly/extra; webhook sig+dup |
| `batch9-schools` / `batch8` / `child-seats` | **PASS** |
| Server / mobile / website `tsc` | **PASS** |
| Website `next build` | **PASS** (incl. `/parent/checkout`, `/parent/payments`) |
| Live Razorpay sandbox UI capture | **Not performed** (stub client + HMAC fixtures) |
| Physical device / store IAP | **Not performed** |

### Remaining production requirements

- Merchant account approval + real sandbox keys + webhook URL on Razorpay dashboard  
- Approved consumer price list in env  
- Live mode cutover  
- Apple IAP / Play Billing for store apps  
- Optional Razorpay Subscriptions auto-renew  

**Batch 10 stop.**

---

## Batch 11 — Final security, testing & launch readiness (2026-11-05)

**Full report:** `docs/audit/LITTLE_READERS_BATCH_11_FINAL_LAUNCH_AUDIT.md`

### Executed this batch

| Check | Result |
|-------|--------|
| Migrate status (13) | **PASS** |
| Vitest sequential | **62 PASS / 4 FAIL** (`learning.test.ts` content density only) |
| Server / mobile / website `tsc` | **PASS** |
| Website `next build` | **PASS** |
| Curriculum visibility restore script | Added — `server/scripts/restore-seed-curriculum.mjs` |
| Vitest shared-DB isolation | `fileParallelism: false` + singleFork |
| `.env.example` | Expanded (Razorpay, reset, mobile URLs) |
| EAS / physical devices / live Razorpay UI | **NOT TESTED** |
| Production deploy | **BLOCKED** (not authorized) |

### Launch recommendation

**NOT production-ready.** Critical gaps: Level 1 vocabulary density, EAS projectId, physical device proof, merchant Razorpay sandbox E2E, HTTPS/backups/monitoring.

**Batch 11 stop.** No live payments; no store submission.

---

## Batch 12 — Launch blocker remediation (2026-11-05)

**Full report:** `docs/audit/LITTLE_READERS_BATCH_12_REMEDIATION.md`  
**Plan:** `docs/audit/LITTLE_READERS_BATCH_12_REMEDIATION_PLAN.md`

### Executed this batch

| Check | Result |
|-------|--------|
| Vitest before | **62 PASS / 4 FAIL** (Batch 11 baseline) |
| Level 1 vocab restore (`db:restore-level1-vocab`) | **PASS** — repo seed 10×75 upserted; progress/attempts/sessions preserved |
| Residual `displayOrder` / `sortOrder=0` normalize | **PASS** — fixed without deletes |
| Vitest after | **66 PASS / 0 FAIL** |
| Migrate status (13) | **PASS** |
| Server / mobile / website `tsc` | **PASS** |
| Website `next build` | **PASS** |
| EAS `projectId` | **BLOCKED** — still placeholder; owner must run `eas init` |
| Physical Android / iPhone | **NOT TESTED** (checklist in Batch 12 report) |
| Razorpay merchant sandbox Checkout | **BLOCKED** / **NOT TESTED** (stub suite **PASS**) |
| Live payments / store submit | **BLOCKED** — not authorized |

### Launch recommendation

**Still NOT production-ready.** Automated tests and Level 1 density blockers cleared; EAS linkage, physical-device QA, merchant Razorpay E2E, and production HTTPS/backups/monitoring remain open.

**Batch 12 stop.** No live payments; no store submission.
