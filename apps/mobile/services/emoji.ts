/**
 * Excel A–Z sheets often store private font glyphs that render as □ on phones.
 * Hide those; keep real Unicode emoji for parent/kid play.
 */
export function displayEmoji(raw?: string | null, fallback = "🔤"): string {
  const s = (raw ?? "").trim();
  if (!s || s === "?" || s === "□" || s === "�") return fallback;
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
