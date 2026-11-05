import { Platform } from "react-native";
import * as Speech from "expo-speech";

export type SpeakProfile = "kid" | "default";

type SpeakOptions = {
  rate?: number;
  pitch?: number;
  /** Grade 1 / early primary — higher pitch, slower, child-like voice when available */
  profile?: SpeakProfile;
};

const KID = {
  rate: 0.78,
  pitch: 1.35,
} as const;

let cachedNativeKidVoice: string | null | undefined;
let cachedWebKidVoice: SpeechSynthesisVoice | null | undefined;
let webVoicesHooked = false;

function kidNameScore(name: string, lang: string): number {
  const n = `${name} ${lang}`.toLowerCase();
  let score = 0;
  if (!n.includes("en")) return -1;
  if (/child|kids|kid|junior|samantha|karen|moira|tessa|fiona|victoria|zira|jenny|aria|salli|ivy|joanna|kimberly|kendra|girl|female/.test(n))
    score += 5;
  if (/google|microsoft|enhanced|premium|neural|natural/.test(n)) score += 2;
  if (/male|man|guy|david|daniel|mark|alex|fred|ralph/.test(n)) score -= 3;
  if (n.includes("en-us") || n.includes("en_us") || n.includes("en-gb") || n.includes("en_gb"))
    score += 1;
  return score;
}

async function pickNativeKidVoice(): Promise<string | undefined> {
  if (cachedNativeKidVoice !== undefined) {
    return cachedNativeKidVoice ?? undefined;
  }
  try {
    const listVoices = (
      Speech as unknown as {
        getAvailableVoicesAsync?: () => Promise<
          Array<{ identifier: string; name?: string; language?: string }>
        >;
      }
    ).getAvailableVoicesAsync;
    if (!listVoices) {
      cachedNativeKidVoice = null;
      return undefined;
    }
    const voices = await listVoices();
    const ranked = voices
      .map((v) => ({
        id: v.identifier,
        score: kidNameScore(v.name || v.identifier, v.language || ""),
      }))
      .filter((v) => v.score >= 0)
      .sort((a, b) => b.score - a.score);
    cachedNativeKidVoice = ranked[0]?.id ?? null;
  } catch {
    cachedNativeKidVoice = null;
  }
  return cachedNativeKidVoice ?? undefined;
}

function pickWebKidVoice(): SpeechSynthesisVoice | undefined {
  if (typeof window === "undefined" || !window.speechSynthesis) return undefined;
  const voices = window.speechSynthesis.getVoices();
  if (!voices.length) return undefined;
  if (cachedWebKidVoice !== undefined) {
    return cachedWebKidVoice ?? undefined;
  }
  const ranked = voices
    .map((v) => ({ v, score: kidNameScore(v.name, v.lang) }))
    .filter((x) => x.score >= 0)
    .sort((a, b) => b.score - a.score);
  cachedWebKidVoice = ranked[0]?.v ?? null;
  return cachedWebKidVoice ?? undefined;
}

function ensureWebVoicesLoaded() {
  if (typeof window === "undefined" || !window.speechSynthesis || webVoicesHooked) return;
  webVoicesHooked = true;
  window.speechSynthesis.addEventListener("voiceschanged", () => {
    cachedWebKidVoice = undefined;
  });
}

/** Speaks a word for Listen / Spell. Grade-1 uses a kid-friendly voice when available. */
export async function speakWord(text: string, options?: SpeakOptions) {
  const value = text.trim();
  if (!value) return;

  const profile = options?.profile ?? "kid";
  const rate = options?.rate ?? (profile === "kid" ? KID.rate : 0.9);
  const pitch = options?.pitch ?? (profile === "kid" ? KID.pitch : 1);

  try {
    Speech.stop();
    ensureWebVoicesLoaded();

    // Web browser TTS via speechSynthesis (Expo web / Chrome preview)
    if (Platform.OS === "web" && typeof window !== "undefined" && window.speechSynthesis) {
      const utterance = new SpeechSynthesisUtterance(value);
      utterance.lang = "en-US";
      utterance.rate = rate;
      utterance.pitch = pitch;
      const kid = profile === "kid" ? pickWebKidVoice() : undefined;
      const voices = window.speechSynthesis.getVoices();
      const fallback =
        voices.find((v) => v.lang.startsWith("en") && /female|samantha|google/i.test(v.name)) ??
        voices.find((v) => v.lang.startsWith("en"));
      utterance.voice = kid ?? fallback ?? null;
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(utterance);
      return;
    }

    const voice = profile === "kid" ? await pickNativeKidVoice() : undefined;
    await Speech.speak(value, {
      language: "en-US",
      rate,
      pitch,
      ...(voice ? { voice } : {}),
    });
  } catch {
    // Device may block TTS until user gesture / missing voice pack.
  }
}

/** Warm up voice list so the first Play tap is fast. */
export function prefetchKidVoice() {
  ensureWebVoicesLoaded();
  if (Platform.OS !== "web") {
    void pickNativeKidVoice();
  } else {
    pickWebKidVoice();
  }
}
