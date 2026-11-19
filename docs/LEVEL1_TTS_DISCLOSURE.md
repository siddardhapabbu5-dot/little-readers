# Level-1 — Listen / TTS Disclosure

**Date:** 2026-11-18  
**Mode:** Documentation only (no code or content changes)  
**Status of gate:** Wording ready — **client sign-off pending**

---

## 1. What Listen actually does

| Fact | Detail | Evidence |
|------|--------|----------|
| Activity name in product | **Listen** (code `LISTEN`) | `packages/shared` `ACTIVITY_CATALOG` |
| How the word is heard | **On-device text-to-speech (TTS)** | `apps/mobile/services/speech.ts` → `speakWord()` |
| Android / iOS engine | `expo-speech` (`Speech.speak`) | Same file |
| Web / Expo web | Browser `speechSynthesis` | Same file |
| Kid voice tuning | Slower rate (~0.78), higher pitch (~1.35); prefers child/female EN voices when the OS exposes them | `KID` profile + `kidNameScore` |
| Pre-recorded `audioUrl` files | **Not currently supplied** for Grade-1 vocabulary | Production audit: **0/750** `audioUrl` |
| Microphone speech recognition | **Not part of Grade-1 Listen** | No mic Listen path; no automated pronunciation assessment |

---

## 2. Platform limitations (must disclose)

| Platform | Behaviour | Limitation |
|----------|-----------|------------|
| Android phone | System TTS voice | Quality depends on installed voice pack / language; may be robotic; silent if TTS disabled |
| Android TV | Same TTS helper | TV speaker / accessibility settings matter |
| iOS (when shipped) | System TTS | Voice availability varies by device |
| Web | Browser voices | May require a user tap before first speak; voice list loads asynchronously |
| All | Errors swallowed | If TTS fails, play may continue without sound (catch block in `speakWord`) |

**Actual pronunciation can vary by device and installed voice.**

**Do not claim:** studio-recorded native-speaker audio for every word, guaranteed “teacher voice”, microphone-based speech recognition, or automated pronunciation assessment.

---

## 3. Parent-facing wording (approved draft for client review)

### Short (store / FAQ)

> In Listen, Learn Wise reads each word aloud using your device’s built-in speaking voice (text-to-speech). Sound can vary by phone. Headphones or media volume may be needed. Learn Wise does not use a recorded audio library for Grade 1 words at this time.

### Longer (parent handbook / support)

> **How Listen works**  
> When your child taps Listen (or hears a word during Spell), Learn Wise asks the phone or tablet to speak the English word using the device’s text-to-speech feature. We try to pick a clear, child-friendly English voice when the device offers one. Pronunciation can differ between devices and voice packs.  
>  
> **What this is not**  
> - It is not a pre-recorded human narrator for every word.  
> - It is not speech recognition: the app is not grading how the child pronounces the word into the microphone during Listen.  
> - It does not provide automated pronunciation assessment.  
>  
> **Tips if there is no sound**  
> - Turn up media volume (not only ringtone).  
> - Check that Text-to-speech / Speech Services are enabled in Android settings.  
> - Install or update an English voice pack if the device prompts for one.  
> - Try again after unlocking the screen; some devices block speech until the app is in the foreground.

### Support one-liner

> Grade 1 Listen = device TTS; no stored MP3 per word; no mic scoring in Listen.

---

## 4. Internal technical review

| Item | Result |
|------|--------|
| Listen path uses device TTS | **PASS** |
| Recorded-audio claim avoided in this disclosure | **PASS** |
| Speech-recognition / pronunciation-assessment claims avoided | **PASS** |
| Device/voice variability disclosed | **PASS** |

---

## 5. Client sign-off (do not pre-fill approval)

This section is for the **client** to complete. The engineering team does **not** claim client approval.

| Item | Client response |
|------|-----------------|
| I understand Listen uses **device text-to-speech**, not studio-recorded Grade-1 audio | ☐ Agree |
| I understand **recorded audio is not currently supplied** for Grade-1 words | ☐ Agree |
| I understand pronunciation **can vary by device and installed voice** | ☐ Agree |
| I understand the product does **not** claim microphone speech recognition or automated pronunciation assessment for Listen | ☐ Agree |
| Parent-facing wording in §3 is acceptable for store / FAQ / support use | ☐ Accept / ☐ Request edits |

| Field | Value |
|-------|--------|
| Client name / role | |
| Organisation | |
| Date | |
| Signature / written approval | |
| Outcome | ☐ Approved · ☐ Approved with edits · ☐ Rejected |

**Status:** **BLOCKED** — awaiting human client sign-off. No approval is claimed on the client’s behalf.

---

## 6. Optional future work (not in this gate)

- Generate and attach `audioUrl` assets for Grade-1 (separate content approval).  
- Prefer `audioUrl` when present, TTS fallback otherwise.  
- Surface an in-app “Sound not working?” tip when TTS fails.

**No production changes in this task.**
