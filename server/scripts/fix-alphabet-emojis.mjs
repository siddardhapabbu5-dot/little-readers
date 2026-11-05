/**
 * Re-map broken Excel private-use symbols on alphabet words to real emoji.
 * Usage: node scripts/fix-alphabet-emojis.mjs
 */
import { PrismaClient } from "@prisma/client";

// Compile-free: duplicate minimal resolve logic for script (keep in sync with alphabet-emoji.ts)
const WORD_EMOJI = {
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

function isBrokenExcelSymbol(text) {
  if (!text) return true;
  for (const ch of text) {
    const cp = ch.codePointAt(0);
    if (cp === 0xfe0f || cp === 0x200d) continue;
    if (
      (cp >= 0xe000 && cp <= 0xfaff) ||
      (cp >= 0xf0000 && cp <= 0xffffd) ||
      (cp >= 0x100000 && cp <= 0x10fffd)
    )
      return true;
  }
  return false;
}

function looksLikeEmoji(text) {
  for (const ch of text) {
    const cp = ch.codePointAt(0);
    if (cp === 0xfe0f || cp === 0x200d) continue;
    if (
      (cp >= 0x1f300 && cp <= 0x1faff) ||
      (cp >= 0x1f000 && cp <= 0x1f2ff) ||
      (cp >= 0x2600 && cp <= 0x27bf) ||
      (cp >= 0x2300 && cp <= 0x23ff) ||
      (cp >= 0x2b00 && cp <= 0x2bff)
    )
      return true;
  }
  return false;
}

function resolve(word, emoji) {
  if (emoji && emoji !== "?" && !isBrokenExcelSymbol(emoji) && looksLikeEmoji(emoji)) {
    return emoji;
  }
  const key = String(word || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
  return WORD_EMOJI[key] || WORD_EMOJI[key.replace(/\s+/g, "")] || "🔤";
}

const prisma = new PrismaClient();

const words = await prisma.vocabularyWord.findMany({
  where: { origin: "CATEGORY_IMPORT", isActive: true },
  select: { id: true, text: true, emoji: true },
});

let fixed = 0;
for (const w of words) {
  const next = resolve(w.text, w.emoji);
  if (next !== w.emoji) {
    await prisma.vocabularyWord.update({
      where: { id: w.id },
      data: { emoji: next },
    });
    fixed += 1;
    console.log(`${w.text}: ${JSON.stringify(w.emoji)} → ${next}`);
  }
}
console.log(`Fixed ${fixed} of ${words.length} CATEGORY_IMPORT words`);
await prisma.$disconnect();
