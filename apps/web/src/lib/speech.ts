/** Browser TTS for Level 1 pronunciation. Gracefully no-ops if unavailable. */

export function speakWord(text: string, options?: { rate?: number; pitch?: number }) {
  if (typeof window === "undefined" || !window.speechSynthesis) return;

  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = "en-US";
  utterance.rate = options?.rate ?? 0.85;
  utterance.pitch = options?.pitch ?? 1.05;

  const voices = window.speechSynthesis.getVoices();
  const english =
    voices.find((v) => v.lang.startsWith("en") && /female|child|samantha|google/i.test(v.name)) ??
    voices.find((v) => v.lang.startsWith("en"));
  if (english) utterance.voice = english;

  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(utterance);
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
