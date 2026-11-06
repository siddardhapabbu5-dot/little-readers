# Screenshot capture environment setup — Little Readers

Prepared for Step 3.1. Does **not** install Android Studio automatically (not present on this machine).

## Current machine status (inspected)

| Component | Status |
|-----------|--------|
| Expo / RN | Expo ~52, RN 0.76.9 — `apps/mobile` |
| Node / Java | Node v24 / Java 17 present |
| Local API | **Running** `http://127.0.0.1:4100/api` (health OK) |
| Local DB / Redis | Docker `little-readers-db`, `little-readers-redis` healthy |
| Demo parent login | **OK** against local API |
| ADB | Present at `%TEMP%\platform-tools\adb.exe` — **no devices** |
| Android SDK | **Missing** (`%LOCALAPPDATA%\Android\Sdk` not found) |
| Android Studio / emulator | **Not installed** — no AVDs |
| Mobile `.env` | Points to **production** API (`api.siwiapp.shop`) — do not edit for this step; override at process start for local capture |

## Safest local run path (recommended)

Use a **local API + Expo Go or emulator**, not production, so demo accounts work and no real customer data appears.

### A. Install Android emulator (required for reliable 1080×1920 Play shots)

1. Install Android Studio:
   ```powershell
   winget install Google.AndroidStudio --accept-package-agreements --accept-source-agreements
   ```
2. Open Android Studio → **More Actions → Virtual Device Manager** → Create Device  
   - Phone: Pixel 6 / Pixel 7  
   - System image: API 34 (or 35) Google APIs  
3. In AVD advanced settings (or cold boot + `adb`): set resolution **1080×1920** density 420  
4. Confirm:
   ```powershell
   & "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe" devices -l
   & "$env:LOCALAPPDATA\Android\Sdk\emulator\emulator.exe" -list-avds
   ```

### B. Start local API (if not already up)

```powershell
cd "C:\Users\harsh\OneDrive\Documents\Desktop\SIWI-Read IT & Spell IT\server"
$env:DATABASE_URL = 'postgresql://little_readers:change_me_strong_password@127.0.0.1:5437/little_readers?schema=public'
$env:PORT = '4100'
# Use existing project env for JWT/CORS as already configured for local
node ..\node_modules\tsx\dist\cli.mjs src/index.ts
```

Demo accounts are auto-ensured on non-production boot.

### C. Start Expo against **local** API (do not rewrite committed `.env`)

From `apps/mobile`, start Metro **without** loading the production `.env`:

```powershell
cd "C:\Users\harsh\OneDrive\Documents\Desktop\SIWI-Read IT & Spell IT\apps\mobile"
$env:EXPO_NO_DOTENV = '1'
$env:EXPO_PUBLIC_API_URL = 'http://10.0.2.2:4100/api'   # Android emulator → host loopback
$env:EXPO_PUBLIC_WEB_APP_URL = 'http://127.0.0.1:3000'
$env:EXPO_PUBLIC_WEB_URL = 'http://127.0.0.1:3000'
$env:EXPO_PUBLIC_ENABLE_DEMO = '1'
node ..\..\node_modules\expo\bin\cli start --port 8081
```

- **Emulator:** use `http://10.0.2.2:4100/api`  
- **Physical phone on same Wi‑Fi:** use your PC LAN IP, e.g. `http://192.168.x.x:4100/api`, and open Expo Go to the Metro URL  

Press `a` in the Expo CLI once an emulator/device is connected (requires `android` toolchain), or scan the QR with Expo Go.

### D. Navigate routes for the five shots

Login: `parent@littlereaders.test` / `ParentDemo1`

1. Open a child learning session → **Student Home** `/(tabs)/home`  
2. Tap **Listen** on a category → capture mid-activity (Listen & Learn)  
3. Tap **Spell** → capture Spelling Practice  
4. Tab **Rewards** → `/(tabs)/rewards`  
5. Parent gate if prompted → **Parent** `/parent`  

Hide password fields / OTP screens. Use anonymized child names only.

### E. Capture

```powershell
cd "C:\Users\harsh\OneDrive\Documents\Desktop\SIWI-Read IT & Spell IT\docs\ops\play-store-assets\screenshots"
..\capture-adb-screenshots.ps1 -AdbPath "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe"
```

Or one-off:

```powershell
adb exec-out screencap -p > 01-student-home-1080x1920.png
```

Validate size (should be 1080×1920 or crop afterward).

## Alternative: physical USB device

1. Enable Developer options → USB debugging  
2. `adb devices` must show `device`  
3. Install Expo Go **or** an existing **preview** APK (do not build a new AAB/APK in this step unless separately approved)  
4. Point the build/session at **local** API if using demo logins (production may not have demo users)  
5. Run `capture-adb-screenshots.ps1`

## Not recommended for Play listing

- **Expo web** screenshots — different chrome than Android; Play expects phone screenshots of the Android app  
- **Production API** with real parents/students — PII risk; demo users are not ensured in production  

## What Step 3.1 does / does not do

| Done | Not done |
|------|----------|
| Inspected tooling | Install Android Studio (manual) |
| Confirmed local API + demo login | Capture PNG files (no device) |
| Wrote capture script + this guide | Generate AAB/APK |
| Left app code / deps / prod config unchanged | Commit / push / publish |
