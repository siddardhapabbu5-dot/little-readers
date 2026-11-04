/** Level 1 Ages 1–3: 10 categories × 75 unique vocabulary words = 750. */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export type VocabSeedWord = { text: string; meaning: string; emoji: string };

export type VocabSeedCategory = {
  code: string;
  label: string;
  emoji: string;
  group: "A" | "B";
  words: VocabSeedWord[];
};

const __dirname = dirname(fileURLToPath(import.meta.url));
const generated = JSON.parse(
  readFileSync(join(__dirname, "level1-vocabulary.generated.json"), "utf8")
) as { categories: VocabSeedCategory[] };

export const LEVEL1_CATEGORIES: VocabSeedCategory[] = generated.categories;

export function assertLevel1Vocabulary() {
  const all = LEVEL1_CATEGORIES.flatMap((c) => c.words.map((w) => w.text));
  const counts = LEVEL1_CATEGORIES.map((c) => ({ code: c.code, count: c.words.length }));
  const unique = new Set(all);
  return {
    categories: counts,
    total: all.length,
    unique: unique.size,
    duplicates: all.filter((t, i) => all.indexOf(t) !== i),
  };
}
