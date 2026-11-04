/**
 * Dictionary grade classification engine (classify-v1).
 * Heuristic suggestions only — does NOT guarantee developmental suitability.
 * Never invents definitions or word types.
 */

export const CLASSIFICATION_VERSION = "classify-v1";

export type GradeCode = "GRADE_1" | "GRADE_2" | "GRADE_3" | "GRADE_4";

export type CategoryHint = {
  id: string;
  code: string;
  label: string;
  gradeCode: GradeCode;
  levelId: string;
  gradeId: string;
};

export type ClassifyInput = {
  headword: string;
  definition: string;
  wordType?: string | null;
};

export type ClassifySuggestion = {
  gradeCode: GradeCode;
  gradeId: string;
  levelId: string;
  categoryId: string;
  difficultyScore: number;
  confidenceScore: number;
  explanation: string;
};

const EARLY_CONCRETE = new Set(
  [
    "mom", "dad", "mum", "baby", "cat", "dog", "ball", "sun", "moon", "red",
    "blue", "milk", "water", "hand", "eye", "ear", "nose", "mouth", "run",
    "jump", "eat", "drink", "apple", "banana", "car", "bus", "book", "toy",
  ].map((w) => w.toLowerCase())
);

const ABSTRACT_HINTS = [
  "concept", "theory", "abstract", "philosophy", "hypothesis", "ideology",
  "metaphor", "complex", "analysis", "phenomenon",
];

const CATEGORY_KEYWORDS: Record<string, string[]> = {
  FAMILY: ["family", "mother", "father", "mom", "dad", "parent", "sister", "brother", "baby", "friend", "people", "boy", "girl"],
  ANIMALS: ["animal", "dog", "cat", "bird", "fish", "lion", "tiger", "pet", "zoo", "insect"],
  FRUITS: ["fruit", "vegetable", "apple", "banana", "orange", "carrot", "food plant"],
  COLORS: ["colour", "color", "shape", "red", "blue", "circle", "square", "triangle"],
  BODY: ["body", "hand", "foot", "eye", "ear", "nose", "head", "leg", "arm"],
  SCHOOL: ["school", "teacher", "classroom", "pencil", "book", "desk", "lesson"],
  HOUSEHOLD: ["house", "home", "chair", "table", "door", "window", "bed", "cup"],
  FOOD: ["food", "drink", "eat", "milk", "bread", "rice", "water", "juice"],
  NATURE: ["nature", "tree", "flower", "sky", "rain", "sun", "cloud", "river", "environment"],
  ACTION: ["run", "jump", "walk", "play", "sleep", "sing", "dance", "action", "verb"],
};

function estimateSyllables(word: string): number {
  const w = word.toLowerCase().replace(/[^a-z]/g, "");
  if (!w) return 1;
  const groups = w.match(/[aeiouy]+/g);
  let n = groups ? groups.length : 1;
  if (w.endsWith("e") && n > 1) n -= 1;
  return Math.max(1, n);
}

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

function scoreDifficulty(input: ClassifyInput): number {
  const head = input.headword.trim();
  const def = input.definition.trim();
  const syllables = estimateSyllables(head);
  const len = head.replace(/\s+/g, "").length;
  const defLen = def.length;
  const abstractHits = ABSTRACT_HINTS.filter((h) =>
    def.toLowerCase().includes(h)
  ).length;
  const early = EARLY_CONCRETE.has(head.toLowerCase()) ? -25 : 0;

  // Mix length, syllables, definition complexity, abstractness — not length alone.
  let score =
    len * 2.2 +
    syllables * 12 +
    Math.min(defLen, 220) * 0.12 +
    abstractHits * 8 +
    early;

  if (input.wordType?.toLowerCase().includes("verb")) score += 3;
  if (input.wordType?.toLowerCase().includes("noun")) score -= 2;

  return clamp(score, 0, 100);
}

function gradeFromDifficulty(score: number): GradeCode {
  if (score < 28) return "GRADE_1";
  if (score < 48) return "GRADE_2";
  if (score < 68) return "GRADE_3";
  return "GRADE_4";
}

function matchCategory(
  input: ClassifyInput,
  categories: CategoryHint[]
): { category: CategoryHint; confidenceBoost: number; reason: string } {
  const hay = `${input.headword} ${input.definition}`.toLowerCase();
  let best: CategoryHint | null = null;
  let bestHits = 0;
  let bestKey = "";

  for (const [key, words] of Object.entries(CATEGORY_KEYWORDS)) {
    const hits = words.filter((w) => hay.includes(w)).length;
    if (hits > bestHits) {
      bestHits = hits;
      bestKey = key;
    }
  }

  const byCode = (codePart: string) =>
    categories.find((c) => c.code.toUpperCase().includes(codePart) || c.label.toUpperCase().includes(codePart));

  const map: Record<string, () => CategoryHint | undefined> = {
    FAMILY: () => byCode("FAMILY") || byCode("PEOPLE"),
    ANIMALS: () => byCode("ANIMAL"),
    FRUITS: () => byCode("FRUIT") || byCode("VEGETABLE"),
    COLORS: () => byCode("COLOR") || byCode("COLOUR") || byCode("SHAPE"),
    BODY: () => byCode("BODY"),
    SCHOOL: () => byCode("SCHOOL") || byCode("CLASS"),
    HOUSEHOLD: () => byCode("HOUSE") || byCode("HOME") || byCode("OBJECT"),
    FOOD: () => byCode("FOOD") || byCode("DRINK"),
    NATURE: () => byCode("NATURE") || byCode("ENVIRON"),
    ACTION: () => byCode("ACTION"),
  };

  best = (bestKey && map[bestKey]?.()) || categories[0] || null;
  if (!best) {
    throw new Error("No categories available for classification");
  }

  const boost = bestHits > 0 ? Math.min(0.25, bestHits * 0.08) : 0;
  return {
    category: best,
    confidenceBoost: boost,
    reason:
      bestHits > 0
        ? `category keywords matched (${bestKey || "general"})`
        : "no strong category keywords; defaulted to first available category",
  };
}

/**
 * Suggest one or more grade assignments for a sense.
 * Near boundary scores may yield a secondary grade suggestion.
 */
export function classifySense(
  input: ClassifyInput,
  categoriesByGrade: Record<GradeCode, CategoryHint[]>
): ClassifySuggestion[] {
  const difficultyScore = scoreDifficulty(input);
  const primaryGrade = gradeFromDifficulty(difficultyScore);
  const grades: GradeCode[] = [primaryGrade];

  // Multi-grade when near a boundary (±4 points)
  const boundaries = [
    { at: 28, low: "GRADE_1" as GradeCode, high: "GRADE_2" as GradeCode },
    { at: 48, low: "GRADE_2" as GradeCode, high: "GRADE_3" as GradeCode },
    { at: 68, low: "GRADE_3" as GradeCode, high: "GRADE_4" as GradeCode },
  ];
  for (const b of boundaries) {
    if (Math.abs(difficultyScore - b.at) <= 4) {
      const other = primaryGrade === b.low ? b.high : b.low;
      if (!grades.includes(other)) grades.push(other);
    }
  }

  const out: ClassifySuggestion[] = [];
  for (const gradeCode of grades) {
    const cats = categoriesByGrade[gradeCode] ?? [];
    if (!cats.length) continue;
    const { category, confidenceBoost, reason } = matchCategory(input, cats);
    const isPrimary = gradeCode === primaryGrade;
    const confidence = clamp(
      (isPrimary ? 0.62 : 0.45) + confidenceBoost - Math.abs(difficultyScore - 40) * 0.002,
      0.2,
      0.92
    );
    const syllables = estimateSyllables(input.headword);
    out.push({
      gradeCode,
      gradeId: category.gradeId,
      levelId: category.levelId,
      categoryId: category.id,
      difficultyScore: Math.round(difficultyScore * 10) / 10,
      confidenceScore: Math.round(confidence * 100) / 100,
      explanation: [
        `${CLASSIFICATION_VERSION} heuristic suggestion (not a guarantee of developmental suitability).`,
        `Signals: length=${input.headword.length}, estimatedSyllables=${syllables}, definitionChars=${input.definition.length}, difficultyScore=${difficultyScore.toFixed(1)}.`,
        `Suggested ${gradeCode}${isPrimary ? " (primary)" : " (secondary near boundary)"}.`,
        reason + ".",
        input.wordType ? `POS provided: ${input.wordType}.` : "POS not provided in source — not invented.",
      ].join(" "),
    });
  }
  return out;
}
