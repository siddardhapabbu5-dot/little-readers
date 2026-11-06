# Google Play Store listing preparation — Little Readers

**Status:** Preparation only (Step 2). No AAB created, no Play Console access, no publish.  
**App ID:** `com.littlereaders.app` · **Display name:** Little Readers · **version / versionCode:** 1.0.0 / 10  
**Branch baseline:** `fix/phase-10c-critical-defects` (accepted `b1eb6ef`; privacy work may still be local)

---

## 1. Existing branding inspection

| Asset | Path | Observed |
|-------|------|----------|
| Launcher / marketing icon source | `apps/mobile/assets/icon.png` | 1024×1024 PNG, ~1.2 MB, 3D books + stars on transparent background |
| Adaptive icon foreground | `apps/mobile/assets/adaptive-icon.png` | Same artwork as `icon.png` (1024×1024); background `#F3E8FF` in `app.json` |
| Splash | `apps/mobile/assets/splash.png` | Same artwork as icon (1024×1024); splash bg `#F3E8FF` |
| Feature graphic | — | **Missing** |
| Store screenshots | — | **None in repo** |
| Favicon | `apps/mobile/assets/favicon.png` | **Missing** (web/mobile asset; not required for Play) |

**Brand:** Soft 3D stack of blue/red/green books with yellow stars — child-friendly education look. App chrome uses light purple/lavender tones (`#F3E8FF` / `#E8E2FF`).

**Play icon note:** Console requires a separate **512×512** high-res listing icon (32-bit PNG, alpha OK, ≤1024 KB). Source exists at 1024×1024; export/downscale still needed. Confirm file size after export (current 1024 asset is already >1 MB).

---

## 2. Required Play listing assets

Official requirements (Google Play Console Help — preview assets):

| Asset | Required? | Spec |
|-------|-----------|------|
| App icon (listing) | Yes | **512×512** px, 32-bit PNG with alpha, ≤1024 KB |
| Feature graphic | Yes | **1024×500** px, JPEG or 24-bit PNG **no alpha** |
| Phone screenshots | Yes (min 2) | JPEG or 24-bit PNG (no alpha); each side **320–3840** px; longest side ≤ 2× shortest |
| Tablet / large-screen screenshots | Recommended if claiming tablets | Prefer 9:16 portrait min **1080×1920** (or 16:9 landscape min **1920×1080**); large-screen section often expects ≥4 at 1080–7680 |
| Promo video | Optional | YouTube URL |
| TV / Wear / Automotive / XR | N/A | Not targeted |

**Highly recommended for discovery:** ≥4 phone screenshots at ≥1080px (portrait **1080×1920** or landscape **1920×1080**).

---

## 3. Draft store listing copy

> Legal/business names, support addresses, and claims requiring counsel review are placeholders or marked DRAFT. Do not invent company details.

### App name
```
Little Readers
```
(≤30 characters)

### Short description (DRAFT — ≤80 characters)
```
Parent-guided reading & spelling practice for kids — listen, spell, and learn.
```
(Character count: 78)

### Full description (DRAFT)
```
Little Readers helps children build vocabulary, reading, and spelling skills through short, guided practice sessions.

Parents create and manage child profiles. Kids practice with listen-and-spell style activities, track progress, and earn rewards as they learn. Parents can review progress, manage devices, and control access with parental tools.

What you can do
• Practice vocabulary with listen and spell activities
• Follow structured learning levels and categories
• See stars, points, and progress for each child
• Use a parent account to manage children and learning seats
• Keep learning tied to one registered student device per child

Designed for families
Little Readers is built for parents or guardians who manage learning for their children. Parental confirmation is required at registration. Adult settings are protected behind a parent gate.

Privacy
We take learner data seriously. Role-based access, parental consent records, and school-level isolation where applicable help keep child learning data protected. Child advertising is not part of this app.

Support
Contact: [SUPPORT_EMAIL_PLACEHOLDER]
Privacy policy: [PRIVACY_POLICY_URL_PLACEHOLDER]

Notes for reviewers
• Student learning requires an internet connection
• Subscription / payment features may be inactive until billing is enabled by the operator
• Demo mode must be off in production store builds
```

### Feature highlights (for Console “What’s new” / internal brief — DRAFT)
1. Parent-managed child learning profiles  
2. Listen & spell vocabulary practice  
3. Progress, stars, and rewards  
4. One-device student registration for learning continuity  
5. Parent PIN gate for adult tools  
6. No in-app child advertising in current product scope  

### Support contact placeholder
```
Support email: [SUPPORT_EMAIL_PLACEHOLDER]
Support phone: [SUPPORT_PHONE_PLACEHOLDER — optional]
Developer / seller name: [LEGAL_BUSINESS_NAME_PLACEHOLDER]
```
Wire to published Privacy & Compliance admin fields and server `SUPPORT_EMAIL` when available. Do not invent values.

### Privacy policy URL placeholder
```
https://siwiapp.shop/privacy
```
**Condition:** Only use after an authorized admin **publishes** a complete privacy policy (Step 1 module). Until published, the public page shows an unpublished state and must **not** be treated as a live legal policy for Play submission.

Alternate placeholder if a different public host is chosen later:
```
[PRIVACY_POLICY_URL_PLACEHOLDER]
```

---

## 4. Screenshot plan (exact dimensions)

Capture on a real phone or emulator at these targets:

| Slot | Device type | Recommended exact size | Content to show |
|------|-------------|------------------------|-----------------|
| 1 | Phone | **1080×1920** (9:16) | Home / daily learning |
| 2 | Phone | **1080×1920** | Listen activity |
| 3 | Phone | **1080×1920** | Spell activity |
| 4 | Phone | **1080×1920** | Rewards / progress |
| 5 | Phone | **1080×1920** | Parent dashboard (adult UI) |
| 6–8 | Phone | **1080×1920** | Optional: levels, devices, subscription |

**Minimum to publish listing:** 2 phone screenshots (any compliant size).  
**Recommended:** 4–8 at 1080×1920.  
**Tablet (if listing tablet support):** at least 1080×1920 (or 1920×1080) — app declares `supportsTablet` on iOS; Android tablet optimization not specially claimed — capture only if quality is acceptable.

**Do not** overlay misleading badges (“#1”, “Editor’s Choice”, fake ratings) on screenshots or icon.

---

## 5. Age rating and target audience

### Target audience (Console — confirm with product owner)
Likely declaration given product design:
- **Primary users:** Children (learning UI) **and** Parents/guardians (accounts, payments, devices)
- Age groups typically selected for this product type include **under 13** (and possibly 13–15 / 16–17 / 18+) — **final selection must be confirmed** before submit

Selecting children (especially under 13) triggers **Google Play Families policy** obligations.

### Content rating (IARC questionnaire)
Complete in Play Console. Expected themes to answer honestly from product behaviour:
- No violence, gambling, or unrestricted web browsing for kids  
- Educational / language learning  
- User accounts / social features limited to family/school roles (not open social network)  
- Purchases: subscription capability exists; **live payments currently disabled** until approved — answer according to **shipping build** behaviour  

Do not guess the final IARC label; run the questionnaire.

---

## 6. Families policy & Data Safety (from product / privacy assessment)

### Families — items that need confirmation
| Topic | Observed in product | Confirmation still needed |
|-------|---------------------|---------------------------|
| Targets children | Yes — kids learning chrome | Exact age groups in Console |
| Ads / AAID | No ad SDKs found; `AD_ID` not requested; mic/camera/location/contacts blocked | Confirm no future ad SDK before submit |
| Location | Blocked in `app.json` | Keep blocked for child-targeted builds |
| Child-appropriate content | Vocabulary/learning content | Content review sign-off |
| SDKs | Expo / RN stack; payments via Razorpay when enabled | Full SDK inventory + Families-approved SDKs if ads ever added |
| Privacy policy | Module exists; **unpublished until admin publishes** | Live published URL |
| Parental consent | Registration requires explicit consents + published policy | Legal wording review |
| Account deletion | Request workflow (no auto-delete) | Play requires in-app + web deletion **path**; confirm process + URL |

### Data Safety — draft declaration map (verify before Console submit)

Based on current architecture (not legal advice):

| Data type | Collected? | Shared? | Purpose (draft) | Notes |
|-----------|------------|---------|-----------------|-------|
| Name | Yes (parent; child display name) | No (app function) | App functionality, account | |
| Email | Yes (parent/admin) | No | Account, support | |
| Phone | Optional (parent OTP) | SMS provider when OTP live | Account | Confirm provider in form when SMS enabled |
| User IDs | Yes | No | Account, device lock | |
| Passwords | Stored hashed server-side | No | Account | Declare account credentials handling per Console guidance |
| Photos | Admin document/image pick only | No | App functionality (admin) | Usage string exists; not for child learning |
| App activity / learning progress | Yes | No | App functionality | Attempts, stars, progress |
| Device or other IDs | Installation ID for student device lock | No | App functionality, fraud prevention / device limit | Not AAID |
| Purchase history | When payments enabled | Payment processor (Razorpay) | App functionality | Currently `PAYMENT_ENABLED` off — declare for **shipping** config |
| Approximate/precise location | No | — | — | |
| Contacts | No | — | — | |
| Advertising data | No | — | — | |

**Security practices (draft):**
- Data encrypted in transit (HTTPS)  
- Account creation  
- Users can request deletion (review workflow; not automatic wipe)  
- Committed to Families policy — only after compliance review  

**Must match:** published privacy policy + real build behaviour.

---

## 7. Play Console account & app registration requirements

External / operator actions (this prep does **not** create accounts):

1. **Google Play Console developer account** (one-time registration fee; organization or individual)  
2. **Identity / organization verification** as required by Google for the account type  
3. **Create app** in Console: name Little Readers, package `com.littlereaders.app`  
4. **App signing:** Play App Signing (EAS production AAB upload later — not in this step)  
5. **Store listing** locale(s), graphics, descriptions  
6. **Privacy policy URL** (published)  
7. **App access** instructions for reviewers (demo parent credentials if gated)  
8. **Ads declaration** (contains ads? → No for current product)  
9. **Content rating** questionnaire  
10. **Target audience & content** / Families  
11. **Data safety** form  
12. **Financial features** / in-app purchases declaration matching billing state  
13. **Countries / pricing**  
14. **Testing track** (internal → closed → production) before public release  

**EAS already configured (codebase):** Expo owner `tjgf-hjgl`, project id present; production profile builds **AAB**; submit stub uses `track: internal`, `releaseStatus: draft`. Google service-account / Play credentials must be configured in Expo/EAS by the operator — **not done in this step**.

---

## 8. Missing external information checklist

- [ ] Legal business / seller name  
- [ ] Business address & country  
- [ ] Confirmed support email (and optional phone)  
- [ ] Published privacy policy URL (admin publish + public HTTPS)  
- [ ] Account deletion / privacy request public instructions finalized  
- [ ] Play Console developer account ownership  
- [ ] Organization verification documents  
- [ ] 512×512 listing icon export (≤1 MB)  
- [ ] 1024×500 feature graphic  
- [ ] ≥2 (preferably ≥4) phone screenshots at required sizes  
- [ ] Target age group final selection  
- [ ] IARC content rating completed  
- [ ] Data Safety answers signed off against shipping build  
- [ ] Families policy compliance review  
- [ ] Whether live payments/SMS are on in the submitted build  
- [ ] Reviewer demo login credentials  
- [ ] Production AAB approval (separate step — not this prep)  
- [ ] Contact for Play policy / legal counsel review of listing claims  

---

## 9. Remaining blockers (summary)

1. **Privacy policy not publishable as store URL** until admin completes and publishes content.  
2. **No feature graphic; no store screenshots** in project.  
3. **Listing icon** needs 512×512 export under 1 MB.  
4. **Support / legal entity** details not filled (must not invent).  
5. **Play Console account** not created/accessed in this step.  
6. **AAB / upload** explicitly deferred.  
7. **Families + Data Safety** need human confirmation against final shipping flags (payments/SMS).  
8. Local privacy implementation may still need merge/deploy before the policy URL is production-live.
