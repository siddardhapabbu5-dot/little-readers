# LEARN WISE – UI/UX Scrolling & Screen Layout Audit

Date: 10 Nov 2026 · Scope: `apps/mobile` (Expo 54, Android/iOS + web export at `/app`) and `apps/web` (Next.js 15 website + Admin dashboard).
Work was local only: no production, schema, migration, payment-setting, deploy, merge or APK/AAB changes.

Updated the same day with a follow-up round (section 9): tablet layout, loading-spinner shift, Admin → Subscriptions contrast, the 8 server test failures, and Android/iPhone device test plans.

## 1. Summary

Final status after the follow-up round:

| Result | Count |
| --- | --- |
| PASS | 5 |
| FIXED | 14 |
| PARTIAL | 2 |
| FAIL | 0 |
| NOT TESTED | 4 |

The biggest problems found and fixed:

1. **22 mobile screens with text inputs had no keyboard handling** (admin forms, parent dashboard, agreements, devices, privacy request, TV connect, child profile, teacher). The keyboard could cover fields and Save buttons, and taps on buttons while the keyboard was open were swallowed. Fixed with one shared `KeyboardScroll` component.
2. **The phone web app (`siwiapp.shop/app`) drew a fake phone bezel on real phones.** On a 360 px phone the app was squeezed into roughly 316 px with a "Phone preview" caption above it. The bezel now only appears on wide desktop windows.
3. **Eight Admin dashboard pages scrolled sideways on phones and tablets** (Subscriptions was 899 px wide on a 375 px phone, and the sidebar and "Log out" button were pushed off-screen). Root cause: the admin CSS grid let wide tables and long e-mails stretch the whole column.
4. **Two policy-document modals and the parent PIN modal could not scroll**, so Save/Publish and the keypad were clipped on short screens or with the keyboard open.

## 2. How it was tested

A headless Chrome script (`%TEMP%\lw-layout-audit.mjs`, raw DevTools protocol, no new packages) loaded every route, signed in as the local demo parent, admin and super admin where needed, and measured each page at 7 sizes:

| Size | Represents |
| --- | --- |
| 320×568 | Small phone; also 400 % browser zoom of a 1280 px window |
| 375×667 | Standard phone |
| 414×896 | Large phone |
| 844×390 | Phone landscape |
| 768×1024 | Tablet |
| 1366×768 | Desktop |
| 1920×1080 | Large desktop |

Plus two "keyboard open" sizes (320×300 and 375×360) for every form screen.

For each page and size it recorded:

- sideways page overflow (page wider than the screen);
- any element or form control pushed off the left/right edge (including clipping inside React Native scroll areas);
- any input, button or link that cannot be reached by scrolling;
- sticky/fixed bars taller than 30 % of the screen;
- buttons under 24 px tall.

Coverage:

| App | Routes | Checks |
| --- | --- | --- |
| Website (public, parent, admin, super admin) | 41 | 287 + 18 keyboard-height |
| Expo app on web (public, parent, admin, super admin) | 42 | 294 + 54 keyboard-height |

Screenshots were taken of login (phone + desktop) and Admin → Subscriptions (phone + desktop) to confirm the visual result.

**Not available:** physical Android/iOS devices, Android emulator and iOS simulator. Everything that depends on the real on-screen keyboard, native gestures or native pickers is marked NOT TESTED or noted as "device not tested" below.

## 3. Screens inspected

**Mobile (`apps/mobile/app`, 56 screens):**

- Auth: `login`, `register`, `forgot-password`, `reset-password`, `change-password`, `admin-forgot-password`, `admin-reset-password`
- Tabs: `(tabs)/home`, `learn`, `games`, `rewards`, `profile`
- Learning: `play`, `quiz`, `matching`, `revision`, `category-play`, `challenge-world`, `lesson/[id]`, `certificate`, `rewards-all`, `learning-history`
- Parent: `parent`, `agreements`, `subscription`, `payment-return`, `receipt/[id]`, `devices`, `child/[id]`, `child-setup/[id]`, `parent-challenges`, `privacy-request`, `tv-connect`, `legal`
- Staff: `teacher`, `admin`, `super-admin`, and the 20 `admin-*` screens
- Shared layout components: `ui.tsx` (`Screen`, `Field`, buttons), `PhoneFrame`, `AppTabBar`, `AdminTabBar`, `AuthGate`, `ParentGateModal`, `CountryCodePicker`, `PolicyDocumentsSection`

**Website (`apps/web/src/app`, 52 pages):**

- Marketing and legal: `/`, `/about`, `/contact`, `/for-parents`, `/for-schools`, `/help`, `/pricing`, `/privacy`, `/terms`, `/refund-policy`, `/shipping-policy`
- Auth: `/login`, `/register`, `/forgot-password`, `/reset-password`, `/admin/forgot-password`, `/admin/reset-password`
- Parent and kids: `/parent`, `/parent/checkout`, `/parent/payments`, `/kids`, `/kids/lessons`, `/kids/level-1`, `/student`, `/tv`
- Admin: `/admin`, `/admin/devices`, `/admin/schools`, `/admin/subscriptions`, and all 11 `/admin/vocabulary/*` pages
- `/super-admin`
- Shared: `globals.css`, `login-exact.css`, `tv.css`, `AdminShell`, `PortalShell`, `MarketingPage`

Not measured: dynamic-id pages (`/admin/schools/[id]`, `/kids/lessons/[id]`, `/kids/level-1/play`). The teacher and school portals need logins the demo seed doesn't have; they redirect to login and were measured only as the login page.

## 4. The 25 audit points

| # | Point | Status | Evidence / notes |
| --- | --- | --- | --- |
| 1 | Login – vertical scrolling | **FIXED** | Mobile login already used a keyboard-aware scroll view and passed at all 9 sizes. Website login: the sticky header (133 px when wrapped on a phone) covered 44 % of the screen at keyboard height. It now scrolls away on short screens (`max-height: 520px`). Re-tested: pass. |
| 2 | Email / phone input alignment | PASS | Measured: no input narrower than 60 px or off-screen on any login/register/OTP page at any size. Screenshot confirms aligned fields (phone + desktop). |
| 3 | Password input visibility & alignment | PASS | Show/hide eye inside the field, same width as email. Measured and screenshot. |
| 4 | Login button position & visibility | PASS | Full-width, visible above the fold at 375×667 and reachable at keyboard heights. |
| 5 | Forgot Password without unnecessary scrolling | PASS | Visible above the fold at 375×667 (screenshot) and reachable at 320×300. |
| 6 | Keyboard opening – screen adjusts | **FIXED** | 22 input screens and 2 modals now lift content above the keyboard (`KeyboardAvoidingView`, plus iOS keyboard insets). Simulated keyboard heights: all fields and Save buttons reachable on all 27 mobile form routes and 9 web form routes. Real keyboard on a device: NOT TESTED. |
| 7 | Keyboard closing – returns to position | NOT TESTED | Code: `KeyboardAvoidingView` removes its padding when the keyboard hides; drag-to-dismiss enabled (`on-drag` on Android, `interactive` on iOS). Needs a real device. |
| 8 | Small screens – content scrolls | **FIXED** | Phone-bezel removed on phones (PhoneFrame); parent PIN modal made scrollable; website overflows at 320 px fixed (`/terms`, `/admin/reset-password`, `/parent/payments`, `/parent/checkout`, 8 admin pages). All 83 routes pass at 320×568. |
| 9 | Large screens – no unnecessary stretching | **FIXED** | The 22 form screens cap content at 760 px. Follow-up: the 7 tab/learning screens that still stretched (Rewards, Profile, Revision, Challenge World, Lesson, All Rewards, Learning History) now cap at 720 px like Home, Learn, Games, Play, Quiz, Matching and Category Play already did. On the web app, touch-screen tablets now get the full-screen layout instead of the desktop phone preview. Measured at 768×1024, 1024×768 and 1024×1366: no sideways overflow; screenshots show centred content. Website pages already have max-widths (720–1200 px); verified at 1920×1080. |
| 10 | Header – fixed/scrolling behaviour | **FIXED** | Admin sidebar on ≤900 px becomes a compact horizontal strip instead of 15 stacked links that pushed the content a full screen down. Login sticky headers turn static on short screens. Measured: no sticky bar over 30 % of the screen at any tested size. |
| 11 | Footer must not overlap content | **FIXED** | Tab bars sit in normal layout flow (not absolute), so nothing is hidden behind them. On the phone web app they now respect the browser's bottom safe area (iPhone home bar) now that the bezel is gone. Website footer is its own grid row. |
| 12 | Validation errors remain visible | PARTIAL | Code: errors render inline in the scrolling form (`ErrorText`), so they move with the form and are reachable with the keyboard open. Pages with error banners were measured; forms were not submitted with invalid data in this run. |
| 13 | Dropdown inside screen bounds | **FIXED** | Long `<select>` labels widened admin pages past the screen (Categories, Groups, Words, Lessons). Selects now shrink to their container. The mobile country picker is a full-screen modal list (in bounds). Native dropdown pop-ups are drawn by the OS/browser. |
| 14 | Date picker not clipped | PASS | The only date pickers are native browser `<input type="date">` on Admin → Six-month programme (drawn by the browser, outside page layout). The mobile app uses typed `YYYY-MM-DD` fields, not pickers. Opening the native picker was not exercised. |
| 15 | Modal / popup positioning & scrolling | **FIXED** | Policy-document Edit and Publish modals: now scroll, cap at 92 % of the screen height and lift above the keyboard. Parent PIN modal: scrollable and centred. Version-history and country-picker modals were already scrollable. Modals not opened on a device. |
| 16 | Submit button reachable at bottom | **FIXED** | Measured "unreachable control" check: 0 unreachable inputs/buttons on all form routes at 320×300 and 375×360. |
| 17 | Back button – navigation & scroll position | NOT TESTED | Code: the Expo stack keeps the previous screen mounted, so Back returns to its scroll position. Website uses browser history. Not exercised interactively. |
| 18 | Page navigation opens at correct position | NOT TESTED | Code: Next.js App Router scrolls to top on navigation; each new Expo screen starts at top. Not exercised interactively. |
| 19 | Landscape responsive | **FIXED** | Web and phone-web-app tested at 844×390: no overflow after fixes (the Words admin page overflowed before). The native app is portrait-locked in `app.json` by design, so native landscape doesn't apply. |
| 20 | Android & iOS consistent scrolling | NOT TESTED | One shared component handles both platforms (padding on iOS, height on Android, drag-to-dismiss on both). No devices or simulators available. |
| 21 | Browser zoom usable | **FIXED** | 320 px width equals 400 % zoom of a 1280 px window or 200 % of 640 px. All pages pass at 320 px after fixes. Viewport meta allows pinch-zoom (`width=device-width, initial-scale=1`, no `user-scalable=no`). |
| 22 | No unwanted horizontal page movement | **FIXED** | Before: 11 website pages overflowed sideways. After: 0 of 41 website routes and 0 of 42 phone-web-app routes overflow at any of the 7 sizes. The only off-edge items left are decorative background circles (no text or controls) that are clipped on purpose. |
| 23 | Nested scrolling without conflicts | PARTIAL | Website: admin nav strip and data tables scroll sideways inside their own box (`overscroll-behavior-x: contain`) while the page scrolls vertically; measured, no page overflow. Mobile: horizontal filter chips inside the vertical admin-grades scroll, and scrollable modals. Touch-gesture conflicts on a real device not tested. |
| 24 | Loading screen – no jumping | **FIXED** | The sign-in check (`AuthGate`) shows a full-screen centred spinner (no jump). Follow-up: the 12 admin screens that inserted a spinner into the page (pushing content down about 20 px) now use a shared `LoadingSlot` whose spinner floats over the content and takes no space. Measured by polling a heading's position every 100 ms during load on `admin-users` and `admin-schools` (phone and desktop): one constant position from first paint to loaded. |
| 25 | No overlapping, clipping or hidden fields | **FIXED** | Combined result of points 8, 13, 15, 16 and 22. Every measured route at every size: no off-screen form control and no unreachable control. |

## 5. Problems, root causes and fixes

| Problem | Root cause | Fix |
| --- | --- | --- |
| Keyboard covers fields and Save buttons on 22 mobile screens; taps on buttons ignored while keyboard open | Plain `ScrollView` with no `KeyboardAvoidingView` and no `keyboardShouldPersistTaps` | New shared `KeyboardScroll` in `components/ui.tsx`: `KeyboardAvoidingView` (padding on iOS, height on Android), `keyboardShouldPersistTaps="handled"`, drag-to-dismiss, iOS keyboard insets, and a 760 px centred content cap. Swapped in as the main scroller on the 22 screens; all props and refs (e.g. `admin-levels` scroll-to-top) preserved. |
| Phone web app squeezed inside a fake phone frame on real phones | `PhoneFrame` drew the desktop bezel whenever `Platform.OS === "web"`, regardless of screen size | Bezel only when the window is at least 600×700. Otherwise full-screen. |
| Policy Edit/Publish modals clipped with keyboard | Fixed-height card with 3–4 inputs, not scrollable, no keyboard avoidance | Backdrop is a `KeyboardAvoidingView`; card is a `ScrollView` capped at 92 % of the screen height. |
| Parent PIN modal clipped on short phones | About 650 px tall card in a non-scrolling centred backdrop | Backdrop is a `ScrollView` with `flexGrow` centring. |
| Tab bars on phone web app ignore the iPhone home-bar area | Web branch hard-coded 10 px / 8 px bottom padding (made sense inside the bezel only) | Use `max(safe-area inset, 10px)` on web too. |
| Website pages wider than a 320 px screen (`/terms`, `/admin/reset-password`) | `.shell` grid had no column sizing, so one long word widened the whole grid (header and footer too) | `grid-template-columns: minmax(0, 1fr)` and `overflow-wrap: break-word` on body. |
| Admin dashboard sideways scroll on phones/tablets, "Log out" off-screen | `.vocab-admin` grid used `1fr` (minimum = content width), so wide tables, long selects and e-mails stretched it. Inline `minWidth: 320` on the Subscriptions search. Fixed 2-column Devices layout. | `minmax(0, 1fr)` columns, `min-width: 0` on main; inputs/selects/buttons shrink to the column; long text wraps (not inside tables); tables scroll in their own box on ≤900 px. Subscriptions search wraps. Devices uses a new `.admin-split` class that stacks on ≤900 px. |
| Admin nav pushes content a full screen down on phones | 15 links stacked vertically above the content | On ≤900 px the nav becomes a horizontal scroll strip. |
| Parent checkout header and Cashfree mobile field off-screen at 320 px | Header flex rows without wrapping | `flexWrap: "wrap"` and `minmax(0, 1fr)` page column. |
| Parent payments list 7–15 px too wide at 320 px | Non-wrapping header row and long payment references | Wrapping header; references wrap anywhere. |
| Portal shells (teacher/school) cramped at 320 px | 24 px + 28 px fixed padding | Padding scales with `clamp()`. |
| Website login header covers fields with keyboard open | `position: sticky` header 133 px tall on phones | Static header when the screen is under 520 px tall. |
| TV "New code" button only 18–22 px tall on phones | TV sizes in `em` scale down on small screens | `min-height: max(2.6em, 44px)`. |
| Inputs could exceed their container site-wide | No global max-width on form controls | `input, select, textarea { max-width: 100% }` and `img, video, svg { max-width: 100% }`. |

## 6. Files changed

**Mobile – shared components**

- `apps/mobile/components/ui.tsx` – new `KeyboardScroll`.
- `apps/mobile/components/PhoneFrame.tsx` – full-screen below 600×700.
- `apps/mobile/components/PolicyDocumentsSection.tsx` – Edit/Publish modals scroll and avoid the keyboard.
- `apps/mobile/components/ParentGateModal.tsx` – scrollable backdrop.
- `apps/mobile/components/AppTabBar.tsx`, `AdminTabBar.tsx` – safe-area bottom on web.

**Mobile – screens switched to `KeyboardScroll`**

- `admin-challenges`, `admin-dictionary`, `admin-grades`, `admin-lessons`, `admin-levels`, `admin-parent-devices`, `admin-privacy`, `admin-programme`, `admin-schools`, `admin-seats`, `admin-structure`, `admin-subscription-plans`, `admin-users`, `admin-words`
- `agreements`, `devices`, `parent-challenges`, `parent`, `privacy-request`, `teacher`, `tv-connect`, `child/[id]`

**Website**

- `apps/web/src/app/globals.css` – shell grid, global form-control limits, admin layout, admin nav strip, table scrolling, `.admin-split`, short-screen login header.
- `apps/web/src/app/login/login-exact.css` – short-screen header.
- `apps/web/src/app/tv/tv.css` – minimum button height.
- `apps/web/src/app/admin/devices/page.tsx` – `.admin-split`.
- `apps/web/src/app/admin/subscriptions/page.tsx` – wrapping search.
- `apps/web/src/app/parent/checkout/page.tsx` – wrapping header.
- `apps/web/src/app/parent/payments/page.tsx` – wrapping header and references.
- `apps/web/src/components/PortalShell.tsx` – responsive padding.

No API calls, authentication, subscription/payment logic or database code was changed. No packages were added.

## 7. Test results

| Check | Result |
| --- | --- |
| Website layout audit, 41 routes × 7 sizes | **Pass** – 0 sideways overflow, 0 off-screen controls, 0 unreachable controls (before fixes: 11 pages failing) |
| Website keyboard-height audit, 9 form routes × 2 | **Pass** (login failed before the sticky-header fix) |
| Phone web app layout audit, 42 routes × 7 sizes | **Pass** – only decorative clipped circles on tab screens and the admin dashboard header |
| Phone web app keyboard-height audit, 27 form routes × 2 | **Pass** |
| `tsc --noEmit` – mobile | **Pass** |
| `tsc --noEmit` – web | **Pass** |
| Lint – web (`next lint`) | **Not available** – the project has no ESLint config, so `next lint` opens an interactive setup prompt. Not configured, to avoid adding tooling. |
| Lint – mobile | **Not available** – no lint script |
| Server test suite (vitest) | 182 passed, 8 failed – the same 8 failures as before this work; all 8 are pre-existing and unrelated to the UI or recent payment work (root causes in section 9.4) |
| Physical Android / iOS devices, emulators, simulators | **NOT TESTED** – none available |
| Real on-screen keyboard, native date/dropdown pop-ups, touch gestures | **NOT TESTED** |

## 8. Remaining issues

Updated after the follow-up round. Items 2–4 of the original list (tablet width, loading shift, Subscriptions contrast) are now fixed (section 9).

1. **Device testing needed** (points 6, 7, 12, 15, 17, 18, 20, 23): run the Android and iPhone test plans in sections 9.5 and 9.6 on a development or internal build. Until then those points stay NOT TESTED / PARTIAL.
2. **Stale server tests (8 failures):** these are pre-existing. Three tests need updating to match intended behaviour, and two depend on local seed data (section 9.4). They were not changed in this task, because "fixing" them means either changing test expectations or editing the local database, and neither was requested.
3. ~~Other admin pages share the low-contrast pattern~~ – fixed on all Admin pages in section 10.1.
4. **Lint tooling:** the website has no ESLint config and `next lint` is deprecated, so a lint setup could be added separately.
5. **Not measured:** teacher/school portals with real data (no demo logins). Game screens were opened and played at tablet size in section 10.2; a lesson could not be played end to end because no published lesson is assigned to the demo child's level.
6. **Not shipped:** the mobile changes reach users only in the next app build or `/app` deploy. Nothing was deployed in this task.

## 9. Follow-up round (10 Nov 2026)

Scope: only the six remaining items from section 8. No redesign; no changes to authentication, payments, subscriptions, API code or database schema; nothing committed, pushed or deployed.

### 9.1 Tablet responsiveness – FIXED

Finding: Home, Learn, Games, Play, Quiz, Matching, Category Play and Certificate already capped their content at 640–720 px. Seven screens did not, and on the web app real tablets were shown the desktop "phone preview" bezel (the bezel appeared whenever the window was at least 600×700, which includes every tablet).

Fix:

- Rewards, Profile, Revision, Challenge World, Lesson, All Rewards and Learning History: the main scroll content now uses the same `width: "100%", maxWidth: 720, alignSelf: "center"` as the other tab screens.
- `PhoneFrame` (web only): touch screens (`pointer: coarse`) always get the full-screen layout. The bezel now appears only on desktop browsers with a mouse.

Verified: 8 tab/learning routes × 3 tablet sizes (768×1024 portrait, 1024×768 landscape, 1024×1366 iPad Pro) as the demo parent, with touch emulation: 0 sideways overflow, 0 off-screen or unreachable controls. Screenshots show centred content with the tab bar across the bottom. The only "off-edge" items are the decorative background clouds, as before. The native app is portrait-only (`app.json`) and iPad is enabled (`supportsTablet: true`), so the portrait tablet layout is the one native iPad users see.

### 9.2 Loading layout shift – FIXED

Root cause: 12 admin screens rendered `{busy ? <ActivityIndicator/> : null}` in the normal page flow, so every load or refresh inserted a 20 px row (plus the list gap) and pushed everything below it down, then pulled it back up.

Fix: new shared `LoadingSlot` in `components/ui.tsx`. It is always rendered, takes no height, and shows the spinner in a small white bubble floating over the content (`position: absolute`, `zIndex`, plus Android `elevation` so it stays above cards). Taps pass through it. Applied to: `admin-dictionary`, `admin-lessons`, `admin-parent-devices`, `admin-privacy`, `admin-programme`, `admin-reports` (was a 20 px spinner with an extra 20 px margin), `admin-schools`, `admin-seats`, `admin-structure`, `admin-users`, `admin-words`, `super-admin`.

Verified: on `admin-users` (heading "Search") and `admin-schools` (heading "Create school"), the heading's top position was sampled every 100 ms for 6 s from navigation, at 375×667 and 1366×768. Each run produced exactly one position after first paint, so nothing moves while loading. Layout audit of 5 of these screens at phone and desktop size: all pass.

Not changed: non-admin screens with the same pattern (`teacher`, `(tabs)/learn`, `(tabs)/rewards`, `lesson/[id]`, `certificate`, `challenge-world`, `receipt/[id]`, `agreements`, `parent-challenges`). They were left as is because this round covered Admin screens only; `LoadingSlot` can be dropped in the same way if a shift is seen there.

### 9.3 Admin → Subscriptions contrast – FIXED

Root cause: the white `.panel` boxes inherit the dark admin shell's text colour `#e2e8f0` (light grey), giving about 1.2:1 contrast on white. Helper text used `#94a3b8` (about 2.6:1). WCAG AA needs 4.5:1.

Fix (Subscriptions page only, via a wrapping `.admin-subs` class):

- Panel text `#0f172a` (about 17:1 on white).
- Table header row: `#f1f5f9` background, `#334155` bold text, a 2 px divider, no wrapping.
- Table cells: 8×10 px padding, light row dividers, alternate-row tint, top-aligned.
- Helper text inside panels: `#475569` (about 7.5:1).
- Amount column no longer wraps ("USD" and "0.00" stay on one line).

Text on the dark background (headings, intro paragraph) was already readable and is unchanged. Verified with screenshots at 375×667 and 1366×768; layout audit still passes (no overflow).

### 9.4 Server test failures – pre-existing, not caused by recent changes

Run: `vitest run` in `server` with `NODE_ENV` and `CI` cleared (when they are left set to `production`/`1`, 35 tests fail because production safety checks kick in, so they must be cleared). Result: 182 passed, 8 failed, identical before and after this UI work.

The last three commits (`22a91c7` dual payments, `e696e8e` Cashfree, `6ad3018` brochure) did not change any failing test file or the services those tests exercise. Evidence per failure:

| Test file (failures) | Error | Root cause | Introduced |
| --- | --- | --- | --- |
| `content-structure.test.ts` (1) | expected `suggest` to be `"deactivate"`, got `"force"` | The service was deliberately changed to return `"force"`; the test was never updated | Service change `4e84954` (5 Nov), after the test (`c019021`). Stale test |
| `policy-documents.test.ts` (1) | expected 3 policy documents, got 4 | "LEARN WISE Subscription & Refund Policy" was added as a fourth document | `34b0286` (8 Nov), after the test (`400d4a6`, 7 Nov). Stale test |
| `vocab-import.test.ts` (1) | confirm returned 400 "No valid selected words to import" | The test uploads the word `uploadtest<timestamp>`; the word-quality gate now rejects words containing digits (`wordQualityIssue`: "Word contains numbers") | Quality gate `72763e5` (8 Nov). Stale test data |
| `learning.test.ts` (4) | expected 10 Level 1 categories, got 11; then listen session 400 and complete 404 | Local database has a duplicate `family_people` category in group A (37 words, created 9 Nov) alongside the seeded one in group B. The other 3 failures follow from the first (they pick categories from the same list) | Local test data, not code |
| `vocab-programme-grades.test.ts` (1) | `activeWords` expected > 0 | Local database has 0 words for GRADE_3 and GRADE_4 (GRADE_1: 10 active of 841, GRADE_2: 1 of 9). The test needs seeded words in all four grades | Local seed data, not code |

How it was checked: test files and services compared against `git log`; error bodies printed with a temporary log line (removed afterwards); local category and per-grade word counts read with a temporary read-only test file (deleted afterwards). No data was changed.

Suggested follow-up (not done, needs approval): update the three stale tests to the current behaviour (`"force"`, 4 documents, a letters-only test word), and either reseed the local database or make the two data-dependent tests create their own fixtures.

### 9.5 Android physical-device test plan – NOT TESTED (prepared)

Setup: a development or internal-testing build of `com.littlereaders.app` (no new AAB was built for this task). Use at least one small phone (about 360×640 dp, e.g. an older Samsung A-series) and one large phone (e.g. Galaxy S24), ideally on Android 15 or 16, because the app runs edge-to-edge (`edgeToEdgeEnabled: true`) and Android 15+ no longer resizes edge-to-edge apps for the keyboard by default. Test with both gesture navigation and 3-button navigation if possible, and with the Gboard and Samsung keyboards.

Record for each check: device, Android version, navigation mode, PASS/FAIL, and a screenshot or screen recording on FAIL.

**A. Keyboard opening**

| # | Screen | Steps | Expected |
| --- | --- | --- | --- |
| A1 | Login | Tap Email, then Password | Field and Login button stay visible above the keyboard; the screen scrolls, not the whole window |
| A2 | Register / Forgot password / Change password | Tap the last field | Last field and submit button visible above the keyboard |
| A3 | Parent dashboard (Add child form) | Tap each field top to bottom | Every focused field is fully visible; you can scroll to Save with the keyboard open |
| A4 | Agreements, Privacy request, Devices, TV connect, Child profile | Tap the bottom-most input | Input visible; submit button reachable by scrolling |
| A5 | Admin → Privacy, Structure, Words, Users, Schools | Tap a search or form field near the bottom | Field lifts above the keyboard; the admin tab bar does not cover it |
| A6 | Any form | With the keyboard open, tap a button (e.g. Save) | The button works on the first tap (the keyboard does not swallow the tap) |
| A7 | Policy documents → Edit and Publish modals (Admin → Privacy) | Open the modal, tap the last input | Modal scrolls, the input and Save/Publish are reachable, nothing clipped at the top |
| A8 | Parent PIN modal | Open from a parent-gated action on the small phone | Keypad and Cancel fully visible or reachable by scrolling |

**B. Keyboard closing**

| # | Steps | Expected |
| --- | --- | --- |
| B1 | Close the keyboard with the system Back gesture/button | Layout returns to its original position with no leftover blank gap at the bottom |
| B2 | Drag the form downwards while the keyboard is open | Keyboard dismisses (`on-drag`); content does not jump |
| B3 | Submit a form with the keyboard's Enter/Done key | Keyboard closes; error or success message is visible without manual scrolling |
| B4 | Submit with invalid data (e.g. wrong password, empty field) | Error text appears inline near the field and stays visible (point 12) |

**C. Scrolling**

| # | Steps | Expected |
| --- | --- | --- |
| C1 | Scroll Home, Learn, Games, Rewards, Profile to the bottom | Last item fully visible above the tab bar; nothing hidden behind it |
| C2 | Horizontal rows (Home activities, Learn level row, Challenge World tabs, Admin grade chips) | Swiping sideways scrolls the row only; a vertical swipe scrolls the page (no fighting gestures) |
| C3 | Open a long admin list (Users, Words), scroll down, open an item, press Back | Returns to the same scroll position (point 17) |
| C4 | Open a new screen from a scrolled list | New screen starts at the top (point 18) |
| C5 | Pull to refresh on Admin → Reports | Refresh spinner shows; content does not shift down when loading finishes |
| C6 | Open any admin screen listed in 9.2 | Loading spinner floats over the content; nothing moves when loading ends |

**D. Modals**

| # | Steps | Expected |
| --- | --- | --- |
| D1 | Country-code picker on Login/Register | List fills the screen, scrolls, search works with the keyboard open, closes with Back |
| D2 | Policy version history, Edit, Publish modals | Scroll inside the modal; the page behind does not scroll |
| D3 | System Back while a modal is open | Closes the modal, not the screen behind it |
| D4 | Date fields on Admin → Programme (typed `YYYY-MM-DD`) | Keyboard opens; field stays visible |

**E. Safe areas and edge-to-edge**

| # | Steps | Expected |
| --- | --- | --- |
| E1 | Every tab screen, gesture navigation | Tab bar sits above the gesture handle; labels not overlapped |
| E2 | Same with 3-button navigation | Tab bar sits above the button bar, not behind it |
| E3 | Top of every screen | Headers and Back buttons are below the status bar and camera cut-out |
| E4 | Rotate the phone | App stays portrait (locked in `app.json`) |
| E5 | Set system font size and display size to the largest | Text wraps; buttons and fields stay on screen; forms still scroll to submit |

### 9.6 iPhone test plan – NOT TESTED (prepared)

Setup: TestFlight or development build (no new build was made for this task). Use a small iPhone (iPhone SE 2nd/3rd gen, 4.7-inch, home button) and a Face ID iPhone with a Dynamic Island (iPhone 14 Pro or later). Optionally an iPad, because `supportsTablet` is enabled. Also test the web app at `siwiapp.shop/app` in Safari once the follow-up changes are deployed.

Run the same checks as Android sections A–D, with these iPhone differences:

| # | Check | Expected on iPhone |
| --- | --- | --- |
| I1 | Keyboard opening (A1–A8) | Content is padded up (`padding` behaviour) and scroll insets adjust automatically; the focused field is visible above the keyboard and its QuickType/suggestions bar |
| I2 | Keyboard closing | Swiping down on the form drags the keyboard away interactively (`interactive` dismiss); tapping outside a field or Return/Done closes it; layout returns with no gap |
| I3 | No system Back button | Use the on-screen ← Back buttons and the left-edge swipe-back gesture; swipe-back must not trigger while a modal is open |
| I4 | Number pad / phone fields (PIN, OTP, mobile number) | These keyboards have no Return key; confirm the submit button is reachable above the keyboard and tapping it works first time |
| I5 | Password AutoFill bar | The AutoFill/strong-password bar above the keyboard does not cover the Password field or Login button |
| I6 | Safe area – Face ID iPhone | Headers below the Dynamic Island; tab bar sits above the home indicator; no text under the rounded corners |
| I7 | Safe area – iPhone SE | No gap above the tab bar (no home indicator); PIN modal and policy modals fit or scroll on the 667 pt screen |
| I8 | Scrolling | Bounce at top and bottom does not reveal a broken background; horizontal rows scroll sideways without stealing vertical scroll |
| I9 | Modals | Country picker and policy modals scroll; dragging a modal's content does not scroll the screen behind |
| I10 | Dynamic Type | Settings → Display & Brightness → Text Size at the largest setting: text wraps, forms still scroll to submit |
| I11 | iPad (optional) | Portrait layout centred with a 720–760 px content column; tab bar full width; nothing stretched edge to edge |
| I12 | Safari web app (`/app`) | Full screen with no phone-preview bezel on iPhone and iPad; tab bar clears the home indicator; the address bar collapsing and expanding does not hide the tab bar |

### 9.7 Files changed in the follow-up round

**Mobile – shared components**

- `apps/mobile/components/ui.tsx` – new `LoadingSlot` component and its `loadingSlot` / `loadingBubble` styles.
- `apps/mobile/components/PhoneFrame.tsx` – full-screen on touch screens (`pointer: coarse`) as well as small windows.

**Mobile – loading shift (spinner replaced with `LoadingSlot`; unused `ActivityIndicator` imports removed)**

- `apps/mobile/app/admin-dictionary.tsx`
- `apps/mobile/app/admin-lessons.tsx`
- `apps/mobile/app/admin-parent-devices.tsx`
- `apps/mobile/app/admin-privacy.tsx`
- `apps/mobile/app/admin-programme.tsx`
- `apps/mobile/app/admin-reports.tsx`
- `apps/mobile/app/admin-schools.tsx`
- `apps/mobile/app/admin-seats.tsx`
- `apps/mobile/app/admin-structure.tsx`
- `apps/mobile/app/admin-users.tsx`
- `apps/mobile/app/admin-words.tsx`
- `apps/mobile/app/super-admin.tsx`

**Mobile – tablet width cap (`content` style only)**

- `apps/mobile/app/(tabs)/rewards.tsx`
- `apps/mobile/app/(tabs)/profile.tsx`
- `apps/mobile/app/revision.tsx`
- `apps/mobile/app/challenge-world.tsx`
- `apps/mobile/app/lesson/[id].tsx`
- `apps/mobile/app/rewards-all.tsx`
- `apps/mobile/app/learning-history.tsx`

**Website – Subscriptions contrast**

- `apps/web/src/app/admin/subscriptions/page.tsx` – `.admin-subs` wrapper, darker helper text inside panels, non-wrapping amount cell.
- `apps/web/src/app/globals.css` – `.admin-subs .panel` text colour, table header, cell padding, dividers and row tint.

**Docs**

- `docs/LEARN_WISE_UI_LAYOUT_AUDIT.md` – this section and the updated summary, points 9 and 24, test results and remaining issues.

**Not changed:** server code, server tests (a temporary log line in `vocab-import.test.ts` and a temporary read-only test file were added for the investigation and fully removed), database, authentication, payments, subscriptions logic, `app.json`, packages.

### 9.8 Follow-up test results

| Check | Result |
| --- | --- |
| `tsc --noEmit` – mobile | **Pass** |
| `tsc --noEmit` – web | **Pass** |
| Tablet layout audit, 8 routes × 3 tablet sizes (Expo web, parent, touch emulation) | **Pass** – 0 overflow, 0 off-screen or unreachable controls |
| Loading-shift measurement, `admin-users` and `admin-schools` × 2 sizes | **Pass** – heading position constant from first paint |
| Admin layout audit, 5 `LoadingSlot` screens × 2 sizes | **Pass** |
| Admin → Subscriptions audit and screenshots, 375×667 and 1366×768 | **Pass** – readable dark text, no overflow |
| Server tests | 182 passed, 8 failed – pre-existing (9.4) |
| Android / iPhone physical devices | **NOT TESTED** – plans in 9.5 and 9.6 |

## 10. Admin readability and tablet game testing (10 Nov 2026)

### 10.1 Admin website text readability – FIXED

Method: a contrast check (WCAG AA: 4.5:1 for normal text, 3:1 for large text) measured every visible text element and input placeholder against its real background, on all 18 Admin pages: `/admin`, `/admin/devices`, `/admin/schools`, `/admin/schools/[id]`, `/admin/subscriptions`, all 11 `/admin/vocabulary/*` pages, `/admin/forgot-password`, `/admin/reset-password` (plus `/super-admin`).

Before: 10 pages failed. Root cause: white `.panel` boxes inherited the dark shell's light text `#e2e8f0` (1.2:1), links were light blue `#93c5fd` (1.8:1), helper text was `#94a3b8` (2.6:1), `.muted` text on the dark background was `#6b7280` (3.7:1), and dark Devices inputs used the browser's default grey placeholder (3.9:1).

Fix (the Subscriptions styling, applied to every Admin panel):

- `apps/web/src/app/globals.css`: `.vocab-admin-main .panel` dark text `#0f172a`; links `#1d4ed8`; `.muted` `#475569` inside panels and `#94a3b8` on the dark background; panel tables get the shaded header row, cell padding, dividers and alternate-row tint; dark inputs get a `#94a3b8` placeholder. The Subscriptions-only `.admin-subs` rules were replaced by these shared rules.
- `apps/web/src/app/admin/vocabulary/lessons/page.tsx`, `apps/web/src/app/admin/vocabulary/words/page.tsx`: helper text inside panels `#94a3b8` → `#475569`.
- `apps/web/src/app/admin/devices/page.tsx`: `admin-dark-field` class on its two dark inputs.
- `apps/web/src/app/admin/subscriptions/page.tsx`: removed the now-redundant `.admin-subs` wrapper.

After: 0 low-contrast text on all 16 signed-in Admin pages at 375×667 and 1366×768. Layout audit at 375×667, 768×1024 and 1366×768: 0 overflow, 0 off-screen or unreachable controls (48 checks). `/admin/forgot-password` and `/admin/reset-password` were left as is: they use the public login styling, and their only findings are the brand-blue link and button at 4.1–4.3:1 (just under 4.5:1), shared with the main login page.

### 10.2 Games at tablet size – tested

Method: the Expo web app in headless Chrome at 768×1024 and 1024×768 with touch emulation, signed in as the demo parent (child on Level 2, with Level 1 topics open). Screens were reached by real touch taps through the app (Learn → topic → activity, and Games tab → game → topic). Each screen was checked for the URL parameters against the API ids, content, layout overflow, scrolling, touch-target size, JavaScript errors, one answer tap, and Back.

| Screen | Entry | Parameters | Result |
| --- | --- | --- | --- |
| Category Play | Learn → Family and People | `categoryId`, `childId`, `title` match the API | PASS |
| Listen (`/play`, `startRound=LISTEN`) | Category Play → Start Listen | correct | PASS – 4 picture answers fit; wrong answer shows "Nice try! Listen again." |
| Spell (`/play`, `startRound=SPELL`) | Category Play → Start Spell | correct | **FIXED** – keys were phone-sized 42×48 px on tablets; now 46×56 px in two rows (A–M, N–Z). Typing and backspace verified |
| Match It (`/matching`) | Category Play → Start Match It | correct | PASS – word/picture columns fit; tapped word highlights |
| Quiz Time (`/quiz`) | Category Play → Start Quiz Time, and Games tab → Quiz Time → topic | correct | PASS – 2×2 answers fit in landscape; tap advances |
| Surprise Game | Category Play → Start Surprise Game | correct plus `surprise=1` | PASS (opened Quiz) |
| Revision (`/revision`) | URL the app builds (Revision World tile disabled until words are learned) | correct | PASS – topic revision loads; Revision World shows its "learn a few more words first" empty state |
| Lesson (`/lesson/[id]`) | URL the app builds (no lesson assigned to this child's level) | – | PASS for the error state ("Lesson not found"); playing a lesson not tested (no data) |
| Certificate (`/certificate`) | invalid id and no id | – | invalid id: "Certificate not found". No id: **FIXED** (was an endless spinner; now shows "Certificate not found") |
| Missing parameters (`/play`, `/quiz`, `/matching`, `/revision`) | opened with no parameters | – | PASS – each shows "Could not start …", no crash |

Both orientations: 0 horizontal overflow, 0 clipped or unreachable controls, 0 JavaScript errors; Back returned to the right screen on every activity.

Observations (not changed):

- Locked topics ignore taps by design (padlock). Most local Level 1 topics have 0 active words, and the word lists contain test fixtures (`playfix_…`); this is local data, not UI.
- The Learn tab opened Level 1, while the Games tab uses the child's own level (Level 2), so the two tabs can show different "Family and People" topics. The ids passed were correct for what was tapped.
- `/category-play` opened without parameters shows a generic "Category" page whose activities then report "Could not start". Not reachable from the app.
- Admin → Schools list at tablet width shows narrow school cards with large gaps (layout, not readability).

Files changed: `apps/mobile/app/play.tsx` (larger Spell keys on screens ≥600 px wide), `apps/mobile/app/certificate.tsx` (no-id error message).
