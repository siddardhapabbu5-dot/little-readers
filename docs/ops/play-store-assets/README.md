# Play Store assets — Little Readers

Prepared for Google Play listing (Step 3). **No AAB / Console upload.**

## Graphics created

| File | Size | Format | Notes |
|------|------|--------|-------|
| `play-icon-512.png` | 512×512 | 32-bit PNG (alpha) | Downscaled from `apps/mobile/assets/icon.png` after removing flat gray backdrop |
| `feature-graphic-1024x500.png` | 1024×500 | 24-bit PNG (no alpha) | Brand lavender gradient + logo + login copy |
| `feature-graphic-1024x500.jpg` | 1024×500 | JPEG | Same art; preferred upload if PNG alpha checks fail |
| `brand-logo-1024-transparent.png` | 1024×1024 | 32-bit PNG (alpha) | Working master (not a Console-required upload) |

Source inspection: `icon.png`, `adaptive-icon.png`, and `splash.png` are the same 1024×1024 artwork with an **opaque light-gray** backdrop (not true transparency). Gray was keyed out for store assets only; app source files were **not** modified.

Feature copy taken from existing login branding:
- Learn • Listen • Spell  
- A little learning, a big adventure!

## Screenshots — not captured in this step

Folder: `screenshots/` (empty pending device capture).

| Target filename | Screen | App route / entry | Why blocked here |
|-----------------|--------|-------------------|------------------|
| `01-student-home-1080x1920.png` | Student Home | `/(tabs)/home` | No Android device/emulator attached (`adb devices` empty); Metro not running |
| `02-listen-learn-1080x1920.png` | Listen & Learn | Home → Listen → `category-play` / play with `LISTEN` | Same |
| `03-spelling-practice-1080x1920.png` | Spelling Practice | Home → Spell → play with `SPELL` | Same |
| `04-rewards-progress-1080x1920.png` | Rewards & Progress | `/(tabs)/rewards` | Same |
| `05-parent-dashboard-1080x1920.png` | Parent Dashboard | `/parent` | Same |

**Do not fabricate** these UIs. Capture on a real preview/production build with demo or anonymized data only (no real emails, OTPs, phones, child surnames, or payment IDs).

### Manual capture checklist

1. Install preview APK or run Expo on a phone at portrait **1080×1920** (or crop to 9:16 within Play limits).  
2. Use a throwaway parent account and generic child display name (e.g. “Alex”).  
3. Ensure published vocabulary so Listen/Spell screens are real, not empty placeholders.  
4. Hide system notification shade; avoid overlapping debug banners if possible.  
5. Export PNG or JPEG **without alpha**; save into `screenshots/` with the names above.  
6. Validate: each side 320–3840 px; longest ≤ 2× shortest.

## Validation (this machine)

```
play-icon-512.png                 512×512   Format32bppArgb   ~342 KB  (corner alpha=0)
feature-graphic-1024x500.png     1024×500   Format24bppRgb    ~230 KB
feature-graphic-1024x500.jpg     1024×500   Format24bppRgb     ~76 KB
brand-logo-1024-transparent.png  1024×1024  Format32bppArgb  ~1.0 MB
```
