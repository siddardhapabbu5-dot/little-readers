# Learn Wise TV – manual test on a physical Android TV / Google TV

There are two TV experiences sharing the same `/api/tv` backend:

- **Learn Wise app on the TV (native, from versionCode 20).** The same package
  `com.littlereaders.app` installs on Android TV / Google TV. On a TV (`Platform.isTV`) it
  shows only the TV screens in `apps/mobile/tv/` (QR pairing, 5 activities); phones are unchanged.
- **Web page `/tv`** (Next.js) for TVs that only have a browser.

In both, the phone only scans/approves and the TV only shows learning for one child.

## 0. Native TV app (versionCode 20+)

1. On the TV: Settings → Device Preferences → About → click **Build** 7 times, then
   Developer options → **USB / Network debugging** on. Note the TV's IP.
2. On the PC:
   ```
   adb connect <TV-IP>:5555
   adb install -r LearnWise-v20-release.apk
   ```
   (Accept the prompt on the TV the first time.)
3. **Learn Wise** appears in the TV launcher's apps row with the purple banner. Open it
   with the remote; it runs landscape and full screen.
4. The release APK talks to the production API (`api.siwiapp.shop`), so pairing on a real
   TV needs the `TvDeviceSession` migration deployed there first. For a local test build a
   debug/dev client with `EXPO_PUBLIC_API_URL=http://<PC-LAN-IP>:4100/api` instead.
5. Run the checklist below (Pairing, Remote navigation, Activities, Progress, Disconnect,
   Layout). Back on the TV home or QR screen exits the app.
6. Phone sanity check with the same build: still portrait-only, camera scanner still works.

Play Console: enable the **Android TV** form factor (Release → Advanced settings → Form
factors), upload TV screenshots (1920×1080) and the banner, and pass Google's TV review.

## 1. What you need

- An Android TV or Google TV with a web browser installed. Many TVs ship **without** a
  browser: install one from the TV's Play Store (e.g. "TV Bro" or "Puffin TV"; Chrome is
  not offered on most TVs). Note which browser and version you used.
- The TV remote (D-pad, OK, Back).
- A parent phone with a Learn Wise build that includes **Connect a TV** (needs a new
  APK/AAB because `expo-camera` was added). Without it, type the code instead of scanning.
- A parent account with at least one child who has an active learning seat.

## 2. Which URL to open

| Setup | URL on the TV |
|---|---|
| Production (only after an approved deploy) | `https://siwiapp.shop/tv` |
| Local network test | `http://<PC-LAN-IP>:3100/tv` |

### Local network setup (no production involved)

1. Find the PC's LAN IP (`ipconfig`, e.g. `192.168.1.20`). TV, phone and PC must be on the same Wi-Fi.
2. Web (`apps/web/.env.local`):
   ```
   NEXT_PUBLIC_API_URL=http://192.168.1.20:4100/api
   NEXT_PUBLIC_TV_CONNECT_URL=http://192.168.1.20:8081
   ```
3. Server (`server/.env`, local only): add `http://192.168.1.20:3100` and
   `http://192.168.1.20:8081` to `CORS_ORIGIN`.
4. Start the API (`npm run dev` in `server`), the web app (`npm run dev` in `apps/web`)
   and, for the phone side, Expo with `EXPO_PUBLIC_API_URL=http://192.168.1.20:4100/api`.
5. Allow ports 3100 / 4100 / 8081 through Windows Firewall for private networks.

## 3. Test checklist

Tick each item and note the TV model, resolution (720p / 1080p / 4K) and browser.

### Pairing
- [ ] `/tv` opens full screen with Learn Wise branding, a QR code, an 8-character code and a countdown.
- [ ] Focus ring is visible on **New code** without touching anything.
- [ ] Phone: Profile → **Connect a TV** → Parent PIN → **Scan TV QR code** reads the code
      (or type it; lowercase / missing dash is accepted).
- [ ] Choose the child → **Connect TV**. Within ~3 seconds the TV shows "Hi, <child>!".
- [ ] The same code cannot be used a second time (phone shows "code not found").
- [ ] Leave the pairing screen for 5 minutes: the code changes by itself.

### Remote navigation (no touch, mouse or keyboard)
- [ ] Up / Down / Left / Right move the yellow focus ring to the nearest button.
- [ ] OK opens the focused activity / topic / answer.
- [ ] Back from topics or a game returns to the activity menu; Back on the home screen leaves the page.

### Activities (use a topic that is unlocked)
For each of **Listen, Spell, Match It, Quiz Time, Surprise Game**:
- [ ] Words and pictures are the Admin vocabulary for that topic (same as the phone).
- [ ] One question at a time, large picture, large choices.
- [ ] **Hear the word** plays audio; **Sound off** on the home screen mutes it.
- [ ] Wrong answer: "Not quite — try again!", that choice is greyed out, you can retry.
- [ ] Right answer: "Great job!", +points, focus jumps to **Next**.
- [ ] Last question shows stars and points, with **Play again** / **Activities**.
- [ ] **◀ Activities** in the header exits mid-game.

### Progress and sync
- [ ] After a game, the TV home points / daily goal update.
- [ ] Open the phone app for the same child: stars, points, words and daily goal match.
- [ ] Pressing OK twice quickly on an answer or on Finish does not double the points.
- [ ] Pair a second child on another TV (or re-pair): each TV shows only its own child's progress.

### Disconnect / revoke / network
- [ ] TV: **Disconnect TV** → confirm screen (focus starts on "No") → **Yes** returns to the QR screen.
- [ ] Phone: Connect a TV → **Disconnect** on the TV row. The TV returns to the QR screen
      on its next action or within about a minute while on the menu.
- [ ] Turn Wi-Fi off during a game: an offline banner appears; turn it on and the answer is saved.
- [ ] Restart the API server: a connected TV stays connected (only a TV showing a QR code gets a new code).
- [ ] Reset the parent's password: the TV returns to the QR screen.

### Layout
- [ ] Nothing is cut off at 720p and 1080p (TV display settings), including Spell with long words.
- [ ] Text is readable from 2–3 metres.

## 4. Known limits (current build)

- TV connections are stored in the `TvDeviceSession` table (migration
  `20261109020000_tv_device_sessions`, additive). It must be applied on production with
  `prisma migrate deploy` before `/tv` goes live there.
- A TV without any browser cannot open `/tv`; use the native Learn Wise app (section 0).
- Scanning the QR with the phone's camera app opens the Learn Wise app directly
  (Android App Link) once a build with this change is installed **and**
  `https://siwiapp.shop/.well-known/assetlinks.json` is live with the Play App Signing
  SHA-256 added (Play Console → App integrity). Until then it opens the web app, and logging
  in there signs the parent out of the phone app. Use the in-app **Connect a TV** scanner.

### App Link check (after install + deploy)

```
adb shell pm verify-app-links --re-verify com.littlereaders.app
adb shell pm get-app-links com.littlereaders.app
```
`siwiapp.shop` should show `verified`.
