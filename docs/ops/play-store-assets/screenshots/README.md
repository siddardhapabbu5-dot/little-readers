# Play Store screenshots (1080×1920)

**Status (Step 3.1):** Capture environment prepared. **No genuine screenshots yet** — no Android emulator/device was attached.

Target files (save here when captured):

| File | Screen | In-app path |
|------|--------|-------------|
| `01-student-home-1080x1920.png` | Student Home | `/(tabs)/home` |
| `02-listen-learn-1080x1920.png` | Listen & Learn | Home → Listen activity (`LISTEN`) |
| `03-spelling-practice-1080x1920.png` | Spelling Practice | Home → Spell activity (`SPELL`) |
| `04-rewards-progress-1080x1920.png` | Rewards & Progress | `/(tabs)/rewards` |
| `05-parent-dashboard-1080x1920.png` | Parent Dashboard | `/parent` |

## Anonymized demo account (local API only)

| Field | Value |
|-------|--------|
| Email | `parent@littlereaders.test` |
| Password | `ParentDemo1` |
| Display name | Demo Parent |
| OTP mobile (local) | `+919876543210` |

These logins are ensured on **local** API boot (`NODE_ENV !== production`). Do **not** use real parent/student data. Prefer generic child labels (local DB may show names like `SeatA_…` — acceptable for store art if not PII).

## Capture helper

After a device/emulator is connected:

```powershell
cd "docs\ops\play-store-assets\screenshots"
..\capture-adb-screenshots.ps1
```

Manual `adb` (same folder):

```powershell
$adb = "$env:TEMP\platform-tools\adb.exe"   # or SDK platform-tools
& $adb shell wm size 1080x1920              # emulator may support this
& $adb exec-out screencap -p > 01-student-home-1080x1920.png
```

## Spec

- Portrait **1080×1920** (9:16) preferred  
- PNG or JPEG, **no alpha**  
- No OTPs, passwords, real emails, or private student data on screen  
- Do not fabricate UI  

See `../CAPTURE_SETUP.md` for Android Studio / Expo Go setup.
