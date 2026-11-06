# Little Readers – Mobile UI & Global Registration Batch

**Date:** 2026-11-06  
**Scope:** Eight requested mobile UI / registration corrections only  
**Release APK:** **Not generated** — waiting for approval  

---

## Summary

| # | Issue | Status |
|---|--------|--------|
| 1 | Top header overlapping books / content | **PASS** (code) |
| 2 | Welcome screen baby photos covered by Welcome Back | **PASS** (code) |
| 3 | Remove email/password sign-in option from main UI | **PASS** (code; staff path retained) |
| 4 | Create Parent Account → Create Student Account | **PASS** (labels + student Child create) |
| 5 | Decorative books/pencils covering email registration form | **PASS** (code) |
| 6 | Email input screen jumping / keyboard | **PASS** (code) |
| 7 | Parent OTP → Student OTP labels + API check | **PASS** (UI); API remains guardian mobile |
| 8 | Worldwide country codes + E.164 | **PASS** (validation); SMS intl **BLOCKED** |

**Worldwide readiness claim:** **NOT claimed.** International number validation works in automated tests; live international SMS / OTP delivery is **not** proven on device.

---

## 1. Top header overlapping

### Original issue
Little Readers title/header overlapped books / scene content; content top padding and safe area were wrong.

### Root cause
Login used a single full-bleed `login-bg-scene.jpg` with `resizeMode="contain"` plus live brand text and a short `mascotGap`, so title text sat on top of the in-scene books logo and characters.

### Changes implemented
- Recomposed login: lavender sky + bottom decorative art only (`login-bottom-scene.jpg`).
- Live header row: books logo + brand + boy/girl mascot images (`login-books-logo.jpg`, `login-boy.jpg`, `login-girl.jpg`).
- Safe-area top padding + scroll content bottom padding sized to bottom art.
- Form card sits below the hero row so title and books no longer stack.

### Files
- `apps/mobile/app/login.tsx`

### Screenshots
- Before / after device screenshots: **BLOCKED** (no ADB device in this run). Code-level layout verified by inspection.

---

## 2. Welcome screen baby photos

### Original issue
Boy/girl characters covered by “Welcome Back!” card.

### Root cause
Characters lived only inside the background JPEG; the white card was positioned too high (`mascotGap` insufficient / scene crop).

### Changes implemented
- Boy and girl are live `Image` nodes flanking the brand, above the Welcome card.
- Welcome card no longer overlays the character images.

### Files
- `apps/mobile/app/login.tsx`

---

## 3. Remove email/password sign-in options

### Original issue
Main login showed Peer tabs: Parent OTP | Email for Parent / Admin / Super Admin.

### Root cause
Dual `LoginMode` UI advertised email/password as a primary student/parent path.

### Changes implemented
- Removed mode tabs from the main student login surface.
- Default UI is Student OTP only.
- Email/password APIs (`/auth/login`), forgot-password routes, and admin recovery **unchanged**.
- Discreet **Staff sign-in** link reveals email/password for Admin / Super Admin only (preserves administrator authentication without advertising email sign-in on the student surface).
- Dev demo fill buttons remain only inside staff mode.

### Files
- `apps/mobile/app/login.tsx`

### API / DB
- **No API deleted.** No schema change.

---

## 4. Correct account creation type (Create Student Account)

### Original issue
UI said “Create Parent Account” / “Parent signup”.

### Root cause
Product copy described the guardian User registration endpoint as “parent account”, while the intended family action is student onboarding linked to a guardian.

### Architecture (inspected)
- `POST /auth/register` → `registerParent` creates `User` with role `PARENT` (guardian login).
- Student learning profiles are `Child` rows via `POST /children`, linked by `parentId`.
- There is **no** separate student User role for OTP; OTP targets the guardian `User.mobileE164`.

### Changes implemented
- All registration UI copy → **Create Student Account** (heading, button, a11y, messages).
- Register form collects: student name, guardian email, password, mobile + country, student birthday.
- Flow: `POST /auth/register` (guardian User + optional `mobileE164`) then `POST /children` (student profile linked to that guardian).
- Does **not** invent a second orphan parent account for the student; one guardian User owns the Child.

### Files
- `apps/mobile/app/register.tsx`
- `apps/mobile/app/login.tsx` (footer CTA)

### API / DB
- Uses existing endpoints only. **No schema migration.**

---

## 5. Create account email mode background

### Original issue
Books/pencils decorative art covered registration form fields.

### Root cause
Full-bleed scene art competed with form opacity / z-order.

### Changes implemented
- Register uses dimmed bottom art (`opacity: 0.55`) behind an opaque white form card (`zIndex` / elevation).
- Form remains scrollable above the decoration.

### Files
- `apps/mobile/app/register.tsx`

---

## 6. Email input screen jumping

### Original issue
Focusing email jumped scroll to top; password hard to reach.

### Root cause
No reliable ScrollView focus handling; KeyboardAvoidingView alone on a non-scrolling stack.

### Changes implemented
- `KeyboardAvoidingView` + `ScrollView` with `keyboardShouldPersistTaps="handled"`.
- iOS `automaticallyAdjustKeyboardInsets`.
- Focus handlers scroll focused field into view (`scrollTo`) instead of resetting to top.
- Same pattern on login staff email mode and register.

### Files
- `apps/mobile/app/login.tsx`
- `apps/mobile/app/register.tsx`

### Device keyboard tests
- Android / iOS physical: **BLOCKED** (no device). Code path implemented.

---

## 7. OTP terminology (Student OTP)

### Original issue
UI said “Parent OTP”.

### API inspection
- Endpoints remain `/parent/auth/send-otp` and `/parent/auth/verify-otp`.
- OTP is sent to the **registered guardian** `User.mobileE164` with role `PARENT` (`otp.service.ts`).
- This is **not** a Child-phone OTP. Product label “Student OTP” means student-family mobile login via the guardian number stored on the parent User.

### Changes implemented
- UI labels / placeholders / resend / verify button / messages → **Student OTP**.
- Backend recipient logic **unchanged** (correct for the data model).

### Files
- `apps/mobile/app/login.tsx`

### Remaining note
If product later needs true student-phone OTP distinct from guardian accounts, that requires a new auth path — out of scope for this batch.

---

## 8. Worldwide country code support

### Original issue
Phone UI hardcoded `+91` only.

### Changes implemented

**A. Country selection**
- Searchable country picker (`CountryCodePicker`) using `libphonenumber-js` `getCountries()`.
- Shows flag emoji, country name, calling code.
- Default **IN / +91**.

**B. Phone input**
- Calling code separated from national number.
- Client validation via `validateNationalPhone` (`libphonenumber-js`).

**C. Backend**
- `normalizeMobileE164` rewritten with `libphonenumber-js`.
- Stores / matches E.164 on existing `User.mobileE164`.
- SMS providers already accept E.164; **international SMS delivery depends on MSG91/HTTP provider configuration** — not verified live.

**D. Existing users**
- `+91##########` re-normalization preserves the same E.164 (covered by unit tests).
- No bulk rewrite of stored numbers.

**E. Admin**
- `admin-parent-devices.tsx` country picker when linking mobiles.

### Files
- `apps/mobile/utils/phone.ts` (new)
- `apps/mobile/components/CountryCodePicker.tsx` (new)
- `apps/mobile/app/login.tsx`
- `apps/mobile/app/register.tsx`
- `apps/mobile/app/admin-parent-devices.tsx`
- `server/src/parent-auth/mobile.ts`
- `server/tests/mobile-e164.test.ts` (new)
- `apps/mobile/package.json` / `server/package.json` — `libphonenumber-js`

### Database
- **No migration.** Continues using `User.mobileE164`.

---

## Tests executed

| Test | Result |
|------|--------|
| `server` `tests/mobile-e164.test.ts` (IN, US, GB, AE, AU, SG + invalid) | **PASS** (7/7) |
| `server` `tsc --noEmit` | **PASS** |
| Mobile `tsc --noEmit` | **FAIL** / pre-existing: widespread `TS2786` JSX vs React 19 types in monorepo (not introduced by this batch; same class of errors on untouched tab screens) |
| Registration flow on device | **BLOCKED** |
| Login / Student OTP on device | **BLOCKED** |
| Country picker on device | **BLOCKED** |
| Existing Indian +91 OTP regression on device | **BLOCKED** |
| Keyboard / scroll on device | **BLOCKED** |
| Android / iOS layout matrix | **BLOCKED** |
| International SMS delivery (US/UK/AE/…) | **BLOCKED** / **NOT READY** to claim |
| New release APK | **Not built** (awaiting approval) |

---

## Remaining issues

1. Physical device / ADB still unavailable → layout and OTP SMS cannot be signed off on hardware.
2. Do **not** market “worldwide SMS ready” until MSG91 (or HTTP provider) is confirmed for non-IN destinations and live OTP verified.
3. Mobile TypeScript project still reports React 18/19 JSX component typing noise across the app (pre-existing monorepo issue).
4. Canada shares `+1` with US in calling-code → ISO hint mapping; national validation still uses selected ISO (`CA` vs `US`) on the client.

---

## Explicit non-goals (unchanged)

- Payment gateway, subscription pricing, learning content, word database, device locking — **not modified** beyond admin mobile country picker for parent device linking.

---

## Approval gate

Implementation complete for the eight corrections.  
**Waiting for approval before generating a new release APK.**
