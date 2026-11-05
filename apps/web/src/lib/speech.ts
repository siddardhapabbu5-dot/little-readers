/** Browser TTS for Grade 1 — prefers a kid/friendly English voice when available. */

export type SpeakProfile = "kid" | "default";

type SpeakOptions = {
  rate?: number;
  pitch?: number;
  profile?: SpeakProfile;
};

const KID = { rate: 0.78, pitch: 1.35 } as const;

let cachedKidVoice: SpeechSynthesisVoice | null | undefined;
let hooked = false;

function kidNameScore(name: string, lang: string): number {
  const n = `${name} ${lang}`.toLowerCase();
  let score = 0;
  if (!n.includes("en")) return -1;
  if (
    /child|kids|kid|junior|samantha|karen|moira|tessa|fiona|victoria|zira|jenny|aria|salli|ivy|joanna|kimberly|kendra|girl|female/.test(
      n
    )
  ) {
    score += 5;
  }
  if (/google|microsoft|enhanced|premium|neural|natural/.test(n)) score += 2;
  if (/male|man|guy|david|daniel|mark|alex|fred|ralph/.test(n)) score -= 3;
  if (/en-us|en_us|en-gb|en_gb/.test(n)) score += 1;
  return score;
}

function pickKidVoice(): SpeechSynthesisVoice | undefined {
  if (typeof window === "undefined" || !window.speechSynthesis) return undefined;
  const voices = window.speechSynthesis.getVoices();
  if (!voices.length) return undefined;
  if (cachedKidVoice !== undefined) return cachedKidVoice ?? undefined;
  const ranked = voices
    .map((v) => ({ v, score: kidNameScore(v.name, v.lang) }))
    .filter((x) => x.score >= 0)
    .sort((a, b) => b.score - a.score);
  cachedKidVoice = ranked[0]?.v ?? null;
  return cachedKidVoice ?? undefined;
}

function ensureVoices() {
  if (typeof window === "undefined" || !window.speechSynthesis || hooked) return;
  hooked = true;
  window.speechSynthesis.addEventListener("voiceschanged", () => {
    cachedKidVoice = undefined;
  });
}

export function speakWord(text: string, options?: SpeakOptions) {
  if (typeof window === "undefined" || !window.speechSynthesis) return;
  const value = text.trim();
  if (!value) return;

  ensureVoices();
  const profile = options?.profile ?? "kid";
  const utterance = new SpeechSynthesisUtterance(value);
  utterance.lang = "en-US";
  utterance.rate = options?.rate ?? (profile === "kid" ? KID.rate : 0.9);
  utterance.pitch = options?.pitch ?? (profile === "kid" ? KID.pitch : 1);

  const voices = window.speechSynthesis.getVoices();
  const kid = profile === "kid" ? pickKidVoice() : undefined;
  const english =
    voices.find((v) => v.lang.startsWith("en") && /female|samantha|google/i.test(v.name)) ??
    voices.find((v) => v.lang.startsWith("en"));
  utterance.voice = kid ?? english ?? null;

  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(utterance);
}

export function prefetchKidVoice() {
  ensureVoices();
  pickKidVoice();
}

export function playCelebrateTone() {
  if (typeof window === "undefined") return;
  try {
    const ctx = new AudioContext();
    const notes = [523.25, 659.25, 783.99];
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      gain.gain.value = 0.0001;
      osc.connect(gain);
      gain.connect(ctx.destination);
      const t = ctx.currentTime + i * 0.12;
      gain.gain.exponentialRampToValueAtTime(0.08, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.28);
      osc.start(t);
      osc.stop(t + 0.3);
    });
    window.setTimeout(() => void ctx.close(), 1200);
  } catch {
    // AudioContext may be blocked until user gesture — ignore.
  }
}
