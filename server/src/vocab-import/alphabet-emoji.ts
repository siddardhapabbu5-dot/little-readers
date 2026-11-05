/**
 * Excel "Symbol" cells often store Segoe UI Symbol private-use codes (U+Fxxx)
 * that look fine in Excel but render as □ on phones. Prefer real Unicode emoji.
 */

const WORD_EMOJI: Record<string, string> = {
  apple: "🍎",
  ball: "⚽",
  cat: "🐱",
  dog: "🐶",
  elephant: "🐘",
  fish: "🐟",
  grapes: "🍇",
  house: "🏠",
  "ice cream": "🍦",
  icecream: "🍦",
  juice: "🧃",
  kite: "🪁",
  lion: "🦁",
  mango: "🥭",
  nest: "🪺",
  orange: "🍊",
  parrot: "🦜",
  queen: "👑",
  rabbit: "🐰",
  sun: "☀️",
  tiger: "🐯",
  umbrella: "☂️",
  van: "🚐",
  watch: "⌚",
  xylophone: "🎵",
  yak: "🐂",
  zebra: "🦓",
};

const LETTER_EMOJI: Record<string, string> = {
  A: "🍎",
  B: "⚽",
  C: "🐱",
  D: "🐶",
  E: "🐘",
  F: "🐟",
  G: "🍇",
  H: "🏠",
  I: "🍦",
  J: "🧃",
  K: "🪁",
  L: "🦁",
  M: "🥭",
  N: "🪺",
  O: "🍊",
  P: "🦜",
  Q: "👑",
  R: "🐰",
  S: "☀️",
  T: "🐯",
  U: "☂️",
  V: "🚐",
  W: "⌚",
  X: "🎵",
  Y: "🐂",
  Z: "🦓",
};

/**
 * Excel Symbol cells often store Segoe UI font codes in PUA / CJK-compat ranges
 * (U+E000–U+FAFF) that look fine in Excel but show as □ on phones.
 */
export function isBrokenExcelSymbol(text: string): boolean {
  if (!text) return true;
  for (const ch of text) {
    const cp = ch.codePointAt(0)!;
    if (cp === 0xfe0f || cp === 0x200d) continue; // emoji style / ZWJ
    if (
      (cp >= 0xe000 && cp <= 0xfaff) ||
      (cp >= 0xf0000 && cp <= 0xffffd) ||
      (cp >= 0x100000 && cp <= 0x10fffd)
    ) {
      return true;
    }
  }
  return false;
}

/** Rough check for real emoji / symbol pictographs phones can render. */
export function looksLikeEmoji(text: string): boolean {
  for (const ch of text) {
    const cp = ch.codePointAt(0)!;
    if (cp === 0xfe0f || cp === 0x200d) continue;
    if (
      (cp >= 0x1f300 && cp <= 0x1faff) ||
      (cp >= 0x1f000 && cp <= 0x1f2ff) ||
      (cp >= 0x2600 && cp <= 0x27bf) ||
      (cp >= 0x2300 && cp <= 0x23ff) ||
      (cp >= 0x2b00 && cp <= 0x2bff)
    ) {
      return true;
    }
  }
  return false;
}

/** True if the string is usable as an on-device emoji/glyph (not tofu / Excel glyph / ?). */
export function isDisplayableEmoji(text: string | null | undefined): boolean {
  const s = (text ?? "").trim();
  if (!s || s === "?" || s === "□" || s === "�") return false;
  if (isBrokenExcelSymbol(s)) return false;
  return looksLikeEmoji(s);
}

export function resolveAlphabetEmoji(input: {
  symbol?: string | null;
  word?: string | null;
  capitalLetter?: string | null;
  fallback?: string;
}): string {
  const symbol = (input.symbol ?? "").trim();
  if (isDisplayableEmoji(symbol)) return symbol;

  const key = (input.word ?? "").trim().toLowerCase().replace(/\s+/g, " ");
  if (key && WORD_EMOJI[key]) return WORD_EMOJI[key];
  const compact = key.replace(/\s+/g, "");
  if (compact && WORD_EMOJI[compact]) return WORD_EMOJI[compact];

  const letter = (input.capitalLetter ?? key.charAt(0) ?? "")
    .trim()
    .toUpperCase()
    .charAt(0);
  if (letter && LETTER_EMOJI[letter]) return LETTER_EMOJI[letter];

  return input.fallback || "🔤";
}
