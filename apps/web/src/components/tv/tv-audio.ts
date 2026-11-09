import { playCelebrateTone, speakWord } from "../../lib/speech";

const SOUND_KEY = "lw_tv_sound";

export function getSoundOn() {
  try {
    return window.localStorage.getItem(SOUND_KEY) !== "off";
  } catch {
    return true;
  }
}

export function saveSoundOn(on: boolean) {
  try {
    window.localStorage.setItem(SOUND_KEY, on ? "on" : "off");
  } catch {
    /* ignore */
  }
}

let current: HTMLAudioElement | null = null;

/** Uploaded pronunciation audio when the word has it, otherwise the browser voice. */
export function sayWord(text: string, audioUrl?: string | null) {
  if (!getSoundOn()) return;
  current?.pause();
  current = null;
  if (audioUrl && /^(https?:|data:audio)/.test(audioUrl)) {
    const audio = new Audio(audioUrl);
    current = audio;
    audio.play().catch(() => speakWord(text, { profile: "kid" }));
    return;
  }
  speakWord(text, { profile: "kid" });
}

export function cheer() {
  if (getSoundOn()) playCelebrateTone();
}
