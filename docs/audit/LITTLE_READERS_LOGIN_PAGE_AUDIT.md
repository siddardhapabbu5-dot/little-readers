# Little Readers – Complete Mobile Login Page Audit

**Date:** 2026-11-04  
**Scope:** Expo / React Native login screen (`apps/mobile/app/login.tsx`) and related auth helpers  
**Mode:** Audit only — **no application code was modified** while producing this report  
**Runtime under test:** Expo web phone preview at `http://localhost:8083/login` (PhoneFrame ~390×844)  
**Design reference:** `apps/mobile/assets/login-design-exact.jpg` (576×1024 JPEG, full-bleed art)

---

## 1. Overall login page status

| Area | Status |
|------|--------|
| Visual match to design art (branding / composition) | **PARTIAL** |
| Interactive overlays (email / password / buttons) | **FAIL** (systematic misalignment / ghost text) |
| Client validation | **PASS** |
| Backend authentication (wrong password / success path) | **PASS** (API + friendly errors; success verified earlier in session) |
| Role-based redirect after login | **PASS** (Parent → `/parent` verified previously; mapping in `routeForRole`) |
| Forgot password | **PARTIAL** (info tip only; no recovery screen) |
| Create Parent Account | **PARTIAL** (works when message overlay absent; blocked when errors shown) |
| Keyboard / scroll (native) | **NOT TESTED** on device |
| Physical Android | **NOT TESTED** |
| Physical iOS | **NOT TESTED** |
| Accessibility | **FAIL** / **PARTIAL** |
| Security (token storage, rate limit, no raw errors) | **PARTIAL** / **PASS** with notes |

**Verdict:** Authentication logic is largely sound. The login **UI architecture** (single JPEG + percentage-placed absolute overlays) is fragile and currently shows **verified overlapping / ghost-placeholder / truncated text** defects in the Expo web phone preview. Do not treat the screen as launch-ready until overlay alignment is rebuilt or replaced with real layout components.

---

## 2. Layout audit

Architecture: the entire chrome (logo, title, tagline, kids, white card, fields, buttons, footer art) is **painted inside one image**. Live `TextInput`s and invisible `Pressable` hit zones are positioned with `%` of measured stage size.

| Check | Status | Notes |
|-------|--------|-------|
| App logo position / size / aspect | **PARTIAL** | In-art only; `resizeMode="cover"` crops sides when frame aspect ≠ 0.5625 |
| Little Readers title | **PASS** (visual, in art) | Not a live Text node |
| Tagline | **PASS** (visual, in art) | |
| Header spacing | **PARTIAL** | PhoneFrame notch + art status bar = double top chrome on web preview |
| Login “card” | **PASS** (visual, in art) | Radius / shadow / padding are baked into JPEG — not adjustable in RN |
| Footer / Create Account | **PARTIAL** | Visible; hit zone can be covered by message box |
| Background colour | **PASS** | Root `#E6E0FF` + art lavender |

**File:** `apps/mobile/app/login.tsx`, `apps/mobile/components/PhoneFrame.tsx`, `apps/mobile/assets/login-design-exact.jpg`

---

## 3. Overlapping issues (critical)

Evidence from screenshots: `audit-login-default.png`, `audit-login-empty-validation.png`, invalid-email / wrong-password captures, show-password capture, `audit-login-viewport-320x568.png`.

| Issue ID | Description | Element / location | Severity | Evidence | Recommended fix |
|----------|-------------|--------------------|----------|----------|-----------------|
| OV-01 | Ghost / duplicate placeholder text over fields | Email & password region of login card | **Critical** | Default screenshot: art placeholders + RN placeholders / field fills stack | Replace art-field text with real inputs, or crop art fields blank and use single RN placeholders |
| OV-02 | Stray / clipped “Email” / “E” near envelope icon | Left of email field | **High** | Default + filled screenshots | Same as OV-01; ensure overlay bg fully covers art label area or remove labels from art |
| OV-03 | Typed / revealed password text floats above painted password box | Between email and password | **Critical** | Show-password screenshot: `WrongPassword1` above field while placeholder still in box | Recalibrate or abandon % overlays; use flex layout |
| OV-04 | Horizontal line / border artifacts through field area | Email/password stack | **Medium** | Default screenshot | Align opaque field rects exactly to art; or redraw art without conflicting strokes |
| OV-05 | Validation / error message box overlaps “New to Little Readers?” and Create Account | Message box at `forgotTop + 40` | **Critical** | Empty validation + invalid email + wrong password screenshots; Create Account click **intercepted** by message `div` | Reserve layout space above footer; use ScrollView; lower z-index conflicts; don’t cover hit targets |
| OV-06 | Illustrations vs card | Header kids / footer books | **Low** | Design-intended overlap in art | None unless cropping with `cover` worsens crop |
| OV-07 | Status bar vs header | Art includes 9:41 status; PhoneFrame adds notch | **Medium** (web preview) | Visual double chrome | Native: use SafeArea; web: hide art status or frame notch |
| OV-08 | Bottom art vs safe area / home indicator | Footer illustrations | **Medium** | Content near bottom edge | SafeArea padding; test on notched devices (**NOT TESTED** physically) |

No evidence of logo overlapping title as separate live nodes (both are in JPEG). Keyboard-vs-fields overlap: **NOT TESTED** on native keyboards.

---

## 4. Spacing and alignment issues

| Issue ID | Description | Severity | Evidence |
|----------|-------------|----------|----------|
| SP-01 | Overlay tops are hard-coded fractions (`emailTop=0.436`, `passwordTop=0.488`, `loginTop=0.605`, …) — drift by aspect / density | **High** | Code + multi-viewport measure (`relTop` stable but visual mismatch) |
| SP-02 | Error box placement crowds Forgot Password ↔ registration gap | **High** | Screenshots with message box |
| SP-03 | Field height `max(32, 2.8% h)` vs painted field height inconsistent across sizes | **Medium** | 320×568: `relH` 0.071 vs intended ~0.028 |
| SP-04 | No ScrollView; no vertical breathing room when messages appear | **High** | OV-05 |
| SP-05 | Left/right `side + 40` / `+ 52` guessed vs icon gutters | **Medium** | Truncation on narrow preview |

---

## 5. Responsive design issues

| Issue ID | Description | Status | Severity |
|----------|-------------|--------|----------|
| RS-01 | Layout depends on full-bleed JPEG + absolute % — not intrinsic RN layout | **FAIL** | Critical |
| RS-02 | `resizeMode="cover"` changes crop when PhoneFrame aspect ≠ art 576:1024 | **FAIL** | High |
| RS-03 | Small browser viewport 320×568: placeholder truncation (“Enter your email addres”, “Enter your passw”), worse ghosting | **FAIL** | High |
| RS-04 | PhoneFrame fixed 390×844 on web — shrinking the browser only scales the frame; not a true Android density matrix | **PARTIAL** | Medium |
| RS-05 | Small / large Android phones, foldables | **NOT TESTED** | — |
| RS-06 | iPhone SE / standard / Dynamic Island / notch safe areas | **NOT TESTED** | — |
| RS-07 | Landscape | **NOT TESTED** (portrait-only assumption) | — |
| RS-08 | No horizontal overflow observed in phone frame | **PASS** (web preview) | — |

---

## 6. Typography issues

| Element | Implementation | Status |
|---------|----------------|--------|
| Little Readers title, taglines, Welcome Back, button labels | Baked into JPEG | **PASS** visually; **FAIL** as live typography (not scalable / not selectable / not SR-readable) |
| Email / password placeholders | RN `placeholder` + art text | **FAIL** (double text, truncation) |
| Error / hint / info | Live `Text` (`hint` accent, `error` danger, `info` primaryDark) | **PASS** readability; **FAIL** placement |
| Font family | System default for overlays; display fonts only in art | **PARTIAL** vs brand |
| Dynamic type / large accessibility text | Not supported for art text | **FAIL** / **MISSING** |

---

## 7. Input field issues

| Check | Status | Notes |
|-------|--------|-------|
| Email placeholder | **PARTIAL** | Correct copy; conflicts with art |
| `keyboardType="email-address"` | **PASS** | |
| Empty validation | **PASS** | “Please enter both email and password.” |
| Invalid email | **PASS** | “Please enter a valid email address.” (`isValidEmail`) |
| Trim email | **PASS** | `email.trim()` before validate/login |
| Password `secureTextEntry` | **PASS** | Toggles with show state |
| Show/hide control | **PASS** functionally; **FAIL** visually (OV-03) |
| Focus styling | **PARTIAL** | `outlineStyle: none` on web; no custom focus ring |
| `returnKeyType` / `onSubmitEditing` email→password→submit | **MISSING** | |
| Input a11y labels | **PARTIAL** | Placeholder only; no `accessibilityLabel` |
| Opaque `#F4F0FE` field fill | **PARTIAL** | Intended to hide art text; incomplete / misaligned → patches & ghosts |

**File:** `apps/mobile/app/login.tsx` lines 105–153; `apps/mobile/services/auth-errors.ts` `isValidEmail`

---

## 8. Button functionality

| Control | Status | Evidence |
|---------|--------|----------|
| Log In | **PASS** | Loading disables inputs + button; empty / invalid / wrong password handled |
| Prevent double submit | **PASS** | `if (loading) return` + `disabled={loading}` |
| Loading copy | **PASS** | “Signing in…” in message box (observed via readonly/disabled state) |
| Successful login + role redirect | **PASS** | Prior session: parent → `/parent` (Ava/Wine dashboard). Reconfirmed mapping in `routeForRole` |
| Invalid credentials | **PASS** | Friendly: “That email or password doesn't look right…” |
| Forgot Password | **PARTIAL** | Sets info string about website reset — **no** navigation to reset screen (**MISSING** flow) |
| Create Parent Account | **PARTIAL** | Navigates to `/register` when clear; **FAIL** when message box intercepts clicks (OV-05) |
| Show password | **PASS** (a11y name toggles Show/Hide) | Visual placement **FAIL** |

Forgot Password `Pressable` has **no** `accessibilityLabel` / role. Create Account hit zone has **no** accessibility name (generic in snapshot).

---

## 9. Keyboard issues

| Check | Status |
|-------|--------|
| `KeyboardAvoidingView` | **PARTIAL** — `behavior` only on iOS (`padding`); Android `undefined` |
| ScrollView when keyboard open | **MISSING** |
| Fields remain visible with keyboard | **NOT TESTED** (native); web soft keyboard **NOT TESTED** |
| Return key chain / submit | **MISSING** |
| Tap outside to dismiss | **NOT TESTED** |
| Unexpected jumps | **NOT TESTED** on device |

---

## 10. Error message issues

| Scenario | Status | Message / notes |
|----------|--------|-----------------|
| Empty fields | **PASS** | Field hint (accent) |
| Invalid email | **PASS** | Field hint |
| Wrong password | **PASS** | Mapped via `friendlyAuthError` (401) |
| Rate limit 429 | **PARTIAL** | Code path + tip exists; **UI not re-tested** this audit (avoid hammering limiter) |
| Network failure | **PARTIAL** | Mapped in `friendlyAuthError`; **NOT TESTED** live |
| 5xx | **PARTIAL** | Mapped; **NOT TESTED** live |
| Inactive account | **PASS** (security) | Backend returns same 401 as bad password (`auth.service.ts`) — no account enumeration |
| Subscription block at login | N/A | Enforced later on learning/device paths — **unchanged** |
| Raw backend dumps | **PASS** | Friendly mapper avoids raw dumps |
| Overlap / contrast | **FAIL** / **PASS** | Placement overlaps footer (**FAIL**); colours readable (**PASS**) |

---

## 11. Visual design issues

| Check | Status |
|-------|--------|
| Lavender / purple / white card look | **PASS** vs reference art |
| Corner radius / shadows | **PASS** (in art) |
| Logo / illustration quality | **PASS** (JPEG); note raster scaling |
| Overlay field patches vs seamless art | **FAIL** | Misaligned fills break polish |
| Loading animation | **PARTIAL** | Text only (“Signing in…”); no spinner on button |
| Consistency with rest of app | **PARTIAL** | Other screens use live components (`ui.tsx` / `kids.tsx`); login is art-overlay |

---

## 12. Accessibility issues

| Issue ID | Description | Severity | Status |
|----------|-------------|----------|--------|
| A11Y-01 | Logo, titles, Welcome Back, Forgot/Create labels not in accessibility tree (image) | High | **FAIL** |
| A11Y-02 | Email/password lack explicit `accessibilityLabel` | Medium | **PARTIAL** |
| A11Y-03 | Forgot Password / Create Account hit zones poorly named (`generic` in snapshot) | High | **FAIL** |
| A11Y-04 | Error text not tied via `accessibilityLiveRegion` / `accessibilityRole="alert"` | Medium | **MISSING** |
| A11Y-05 | Show password has good label | — | **PASS** |
| A11Y-06 | Touch targets: login height ≥48; field height can be ~32 | Medium | **PARTIAL** |
| A11Y-07 | Contrast of art text | — | **NOT TESTED** (WCAG meter) |
| A11Y-08 | Dynamic type | — | **FAIL** for art text |

---

## 13. Authentication and security

| Check | Status | Notes |
|-------|--------|-------|
| `POST /auth/login` | **PASS** | Used by screen |
| JWT access token saved | **PASS** | `saveToken` |
| SecureStore on iOS/Android | **PASS** | `apps/mobile/services/secure.ts` |
| Web preview storage | **PARTIAL** | `localStorage` fallback — OK for preview, not production web auth hardening |
| Password never logged | **PASS** | No password `console.log` in login path |
| Hardcoded secrets in login | **PASS** | None found |
| Friendly errors (no enumeration beyond backend) | **PASS** | |
| Rate limiting | **PASS** (server) | Global `/api` limiter in `server/src/app.ts` |
| Role redirect | **PASS** | `routeForRole` |
| Session expiry → login | **PASS** | `AuthGate` + `notifyUnauthorized` (Batch 1) |
| Login omits device headers (`mobile: false`) | **PASS** (intentional) | Device lock applies to learning APIs with installation id — **not weakened** |
| ONE STUDENT = ONE PHONE | **PASS** (unchanged) | Not bypassed by login screen |
| Subscription enforcement | **PASS** (unchanged) | Not bypassed by login screen |
| HTTPS in production | **NOT TESTED** | Local `EXPO_PUBLIC_API_URL` |

---

## 14. Performance

| Check | Status | Notes |
|-------|--------|-------|
| Full-bleed JPEG load | **PARTIAL** | Single asset; fine for size but raster; cover scaling cost |
| Re-renders on layout | **PARTIAL** | `onLayout` updates box → recomputes all tops each resize |
| Duplicate login requests | **PASS** | Guarded by `loading` |
| Excessive animation | **PASS** | None |
| Navigation after login | **PASS** | `router.replace` |

---

## 15. Android results

| Item | Status |
|------|--------|
| Emulator / physical device | **NOT TESTED** |
| Expo web phone preview (proxy for layout) | **FAIL** on overlays (see §3, §5) |
| Android keyboard avoiding | **NOT TESTED** (code: no Android KAV behavior) |

---

## 16. iOS results

| Item | Status |
|------|--------|
| Simulator / physical device | **NOT TESTED** |
| Expo web phone preview | Same overlay defects |
| iOS `KeyboardAvoidingView` behavior=`padding` | Present in code; **NOT TESTED** with real keyboard |
| Notch / Dynamic Island / safe area | **NOT TESTED**; login has **no** `SafeAreaView` |

---

## 17. Screenshots / visual verification

Captured during this audit (local Cursor screenshot store):

| File | State |
|------|--------|
| `audit-login-default.png` | Idle login — ghost placeholders, stray Email/E, field artifacts |
| `audit-login-empty-validation.png` | Empty submit — message overlaps registration |
| Invalid-email capture | “Please enter a valid email…” overlaps footer copy |
| Show-password capture | Password plaintext floats above field |
| Wrong-password capture | Friendly auth error; password text still misplaced |
| `audit-login-viewport-320x568.png` | Small viewport — truncated placeholders, worse overlap |

**Not captured:** native keyboard-open, live 429 flood UI, physical device photos.

---

## 18. Tests executed (this audit)

| Test | Result |
|------|--------|
| Render login in Expo web preview | **PASS** (loads) |
| Empty form validation | **PASS** |
| Invalid email validation | **PASS** |
| Show/hide password toggle | **PASS** (logic) / **FAIL** (visual) |
| Wrong password auth | **PASS** (friendly error) |
| Loading disables controls | **PASS** |
| Forgot password action | **PARTIAL** (info only) |
| Create account navigation (no overlay) | **PASS** → `/register` |
| Create account with error overlay | **FAIL** (click intercepted) |
| Successful parent login redirect | **PASS** (earlier same session) |
| Overlay geometry / small viewport | **FAIL** |
| Automated Detox/Maestro | **MISSING** |
| Physical Android / iOS | **NOT TESTED** |

---

## 19. Prioritized recommendations

### Critical (fix before launch)

1. **Rebuild login inputs/buttons as real RN layout** (or blank the field regions in art) — eliminate JPEG text + overlay double-rendering (**OV-01…OV-03**).  
2. **Stop covering Create Account with the message box** — ScrollView + reserved error slot (**OV-05**).  
3. **Retest overlays on real small Android + notched iPhone** before calling layout PASS.

### High

4. Add `SafeAreaView` / inset padding; remove double status-bar chrome.  
5. Wire `returnKeyType` / `onSubmitEditing`; Android keyboard avoiding + ScrollView.  
6. Accessibility names for Forgot Password & Create Account; live region for errors.  
7. Implement real forgot-password flow or clearly disable the control until website deep-link exists.

### Medium

8. Prefer `contain` + letterboxing or aspect-matched frame over `cover` cropping.  
9. Focus rings / loading spinner on Log In.  
10. Automated screenshot tests at 320 / 390 / 430 widths.

### Low

11. Compress/optimize login JPEG; consider WebP/PNG for UI sharpness.  
12. Align login visual system with shared `theme.ts` / `ui.tsx` components.

---

## 20. Issue index (quick reference)

| ID | Severity | Status |
|----|----------|--------|
| OV-01 Ghost placeholders | Critical | FAIL |
| OV-03 Password text float | Critical | FAIL |
| OV-05 Error covers Create Account | Critical | FAIL |
| RS-01 Absolute % architecture | Critical | FAIL |
| OV-02 Stray Email/E | High | FAIL |
| SP-02 / SP-04 Message crowding | High | FAIL |
| RS-02 / RS-03 Crop & truncation | High | FAIL |
| A11Y-01 / A11Y-03 Image & unnamed hits | High | FAIL |
| KB-* Keyboard native | — | NOT TESTED / MISSING pieces |
| AUTH-* API / SecureStore / roles | — | Mostly PASS |
| DEV-* Physical devices | — | NOT TESTED |

---

## Approval gate

Per instructions: **audit complete — stopped.**  
No login redesign or code fixes applied in this task.  
Await explicit approval before implementing any recommended fixes.

---

## Fix pass (approved 2026-11-04)

After approval, `apps/mobile/app/login.tsx` was rebuilt:

- Removed percentage absolute overlays on the full design JPEG.
- Header uses a **cropped top band** of `login-design-exact.jpg` (logo + kids only).
- Real RN form card: labels, inputs, show/hide, Log In, Forgot password, Create Account.
- `ScrollView` + `KeyboardAvoidingView` (iOS `padding`, Android `height`) + safe-area padding.
- Errors sit **inside** the card (alert live region) and no longer cover Create Account.
- Accessibility labels on email, password, Log In, Forgot password, Create Account.
- `returnKeyType` next/go + focus password / submit.

**Re-verified (Expo web preview):** clean layout screenshot; empty validation message; Create Account still navigates to `/register` while the error is visible.

Auth API, SecureStore, role redirects, subscription/device rules: unchanged.
