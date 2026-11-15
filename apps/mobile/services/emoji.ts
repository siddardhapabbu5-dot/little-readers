import { resolveVocabImageUrl } from "./pilot-3d";

/**
 * Excel A–Z sheets often store private font glyphs that render as □ on phones.
 * Hide those; keep real Unicode emoji for parent/kid play.
 *
 * 📚 is the import/category default — not a word-specific picture. Treat it as
 * missing so Listen/Matching can show a letter badge instead of four identical books.
 */
const GENERIC_PLACEHOLDERS = new Set(["📚", "📝", "🔤", "❓", "□", "�", "?"]);

export function isGenericPlaceholderEmoji(raw?: string | null): boolean {
  return GENERIC_PLACEHOLDERS.has((raw ?? "").trim());
}

export function displayEmoji(raw?: string | null, fallback = "🔤"): string {
  const s = (raw ?? "").trim();
  if (!s || s === "?" || s === "□" || s === "�") return fallback;
  if (GENERIC_PLACEHOLDERS.has(s)) return fallback;
  let hasEmoji = false;
  for (const ch of s) {
    const cp = ch.codePointAt(0)!;
    if (cp === 0xfe0f || cp === 0x200d) continue;
    if (cp >= 0xe000 && cp <= 0xfaff) return fallback;
    if (
      (cp >= 0x1f300 && cp <= 0x1faff) ||
      (cp >= 0x1f000 && cp <= 0x1f2ff) ||
      (cp >= 0x2600 && cp <= 0x27bf) ||
      (cp >= 0x2300 && cp <= 0x23ff) ||
      (cp >= 0x2b00 && cp <= 0x2bff)
    ) {
      hasEmoji = true;
    }
  }
  return hasEmoji ? s : fallback;
}

/** Picture for Listen / Matching: image URL, real emoji, or first-letter tile. */
export function playOptionVisual(opt: {
  text?: string | null;
  emoji?: string | null;
  imageUrl?: string | null;
  letter?: string | null;
  /** When set, staging Batch D1 may overlay a text-free 3D pilot asset (no DB write). */
  wordId?: string | null;
}) {
  const imageUrl = resolveVocabImageUrl(opt.wordId, opt.imageUrl);
  const letter = (
    opt.letter ||
    (opt.text ?? "").trim().charAt(0) ||
    "?"
  ).toUpperCase();
  const emoji = displayEmoji(opt.emoji, "");
  if (imageUrl) return { kind: "image" as const, imageUrl, letter, emoji: emoji || "🔤" };
  if (emoji && !isGenericPlaceholderEmoji(emoji)) {
    return { kind: "emoji" as const, imageUrl: null, letter, emoji };
  }
  return { kind: "letter" as const, imageUrl: null, letter, emoji: "🔤" };
}
