import { Platform } from "react-native";
import * as Speech from "expo-speech";

/** Speaks a word for Listen / Spell. No-ops if TTS is unavailable. */
export async function speakWord(
  text: string,
  options?: { rate?: number; pitch?: number }
) {
  const value = text.trim();
  if (!value) return;

  try {
    Speech.stop();

    // Web browser TTS via speechSynthesis (more reliable in Chrome preview)
    if (Platform.OS === "web" && typeof window !== "undefined" && window.speechSynthesis) {
      const utterance = new SpeechSynthesisUtterance(value);
      utterance.lang = "en-US";
      utterance.rate = options?.rate ?? 0.85;
      utterance.pitch = options?.pitch ?? 1.05;
      const voices = window.speechSynthesis.getVoices();
      const english =
        voices.find(
          (v) => v.lang.startsWith("en") && /female|child|samantha|google/i.test(v.name)
        ) ?? voices.find((v) => v.lang.startsWith("en"));
      if (english) utterance.voice = english;
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(utterance);
      return;
    }

    await Speech.speak(value, {
      language: "en-US",
      rate: options?.rate ?? 0.85,
      pitch: options?.pitch ?? 1.05,
    });
  } catch {
    // Device may block TTS until user gesture / missing voice pack.
  }
}
