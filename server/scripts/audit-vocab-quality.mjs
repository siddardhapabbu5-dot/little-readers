/**
 * Content-quality audit for GRADE_1–4 active vocabulary.
 * Read-only. Flags NEEDS_REVIEW — does not reclassify or invent words.
 */
import { PrismaClient } from "@prisma/client";

const p = new PrismaClient();

const ADULT_OR_UNSUITABLE = [
  "weapon",
  "kill",
  "death",
  "suicide",
  "alcohol",
  "drug",
  "sex",
  "nude",
  "violence",
  "murder",
];

const THEME_HINTS = {
  animals: /\b(cat|dog|bird|fish|lion|tiger|animal|pet|zoo|horse|cow|duck)\b/i,
  food: /\b(apple|banana|bread|food|fruit|milk|rice|egg|eat|meal)\b/i,
  family: /\b(mom|dad|baby|brother|sister|family|friend|people|teacher)\b/i,
  home: /\b(bed|bag|home|house|door|room|chair|table)\b/i,
  colors: /\b(red|blue|green|yellow|color|colour)\b/i,
  school: /\b(school|pencil|book|read|write|learn)\b/i,
  nature: /\b(flower|tree|sun|rain|plant|nature|river|sky)\b/i,
  body: /\b(hand|eye|ear|nose|foot|body|head)\b/i,
};

function estimateSyllables(word) {
  const w = word.toLowerCase().replace(/[^a-z]/g, "");
  if (!w) return 0;
  const groups = w.match(/[aeiouy]+/g);
  let n = groups ? groups.length : 1;
  if (w.endsWith("e") && n > 1) n -= 1;
  return Math.max(1, n);
}

function meaningOk(meaning) {
  if (!meaning || meaning.trim().length < 3) return "empty or too short meaning";
  if (meaning.trim().length > 220) return "meaning too long for child UI";
  const lower = meaning.toLowerCase();
  if (ADULT_OR_UNSUITABLE.some((x) => lower.includes(x))) return "unsuitable content in meaning";
  if (/\b(cf\.|ibid|et al|taxon|genus|phylum)\b/i.test(meaning)) return "adult/academic register";
  return null;
}

function categoryMismatch(text, meaning, categoryLabel) {
  const blob = `${text} ${meaning}`;
  const cat = categoryLabel.toLowerCase();
  const hits = Object.entries(THEME_HINTS)
    .filter(([, re]) => re.test(blob))
    .map(([k]) => k);
  if (!hits.length) return null;

  const expects = {
    animals: /animal/i,
    food: /food|fruit|meal/i,
    family: /family|people/i,
    home: /home|house|everyday/i,
    colors: /color|colour/i,
    school: /school|learn|classroom/i,
    nature: /nature|environment|plant/i,
    body: /body/i,
  };

  for (const theme of hits) {
    const re = expects[theme];
    if (re && !re.test(cat)) {
      // Strong mismatch examples: food/animal word parked under Family
      if (
        (theme === "animals" || theme === "food" || theme === "colors" || theme === "nature") &&
        /family|people/i.test(cat)
      ) {
        return `theme looks like "${theme}" but category is "${categoryLabel}"`;
      }
    }
  }
  return null;
}

function isSynthetic(text) {
  return /^(dicttest|wmbulk|wmword|playfix_|prog_|pub_|vis_|seatfix_|bulk)/i.test(text);
}

const grades = await p.learningGrade.findMany({
  where: { code: { in: ["GRADE_1", "GRADE_2", "GRADE_3", "GRADE_4"] } },
  orderBy: { sortOrder: "asc" },
});

const report = {
  generatedAt: new Date().toISOString(),
  grades: [],
  duplicates: { sameGradeHeadwords: [], crossGradeHeadwords: [], duplicateSenseDefs: [] },
  needsReview: [],
  totals: {},
};

const headwordIndex = new Map();

for (const g of grades) {
  const words = await p.vocabularyWord.findMany({
    where: {
      isActive: true,
      category: { group: { level: { gradeId: g.id } } },
    },
    include: {
      category: { select: { id: true, code: true, label: true } },
      dictionarySense: {
        include: {
          entry: {
            select: {
              headword: true,
              sourceName: true,
              licence: true,
              sourceRef: true,
              normalizedHeadword: true,
            },
          },
        },
      },
    },
    orderBy: [{ text: "asc" }],
  });

  const byNorm = new Map();
  let approvedKids = 0;
  let synthetic = 0;

  for (const w of words) {
    const norm = (w.dictionarySense?.entry?.normalizedHeadword || w.text)
      .toLowerCase()
      .trim();
    if (!byNorm.has(norm)) byNorm.set(norm, []);
    byNorm.get(norm).push(w);
    if (!headwordIndex.has(norm)) headwordIndex.set(norm, []);
    headwordIndex.get(norm).push({
      grade: g.code,
      wordId: w.id,
      text: w.text,
      category: w.category.label,
    });

    const reasons = [];
    const meaning = w.meaning || "";
    const len = w.text.replace(/[^a-zA-Z]/g, "").length;
    const syl = estimateSyllables(w.text);

    if (isSynthetic(w.text)) {
      synthetic += 1;
      reasons.push("synthetic/test fixture headword — not production curriculum content");
    } else {
      approvedKids += 1;
    }

    const mIssue = meaningOk(meaning);
    if (mIssue) reasons.push(mIssue);

    const catIssue = categoryMismatch(w.text, meaning, w.category.label);
    if (catIssue) reasons.push(catIssue);

    if (g.code === "GRADE_1" && !isSynthetic(w.text)) {
      if (len >= 9 && syl >= 3) {
        reasons.push(
          `possibly too hard for ages ~3–4 (len=${len}, ~${syl} syllables) — not length-only; review meaning complexity`
        );
      }
      if (meaning.split(/\s+/).length > 18) {
        reasons.push("meaning may be too complex for Grade 1 readers");
      }
    }

    if (g.code === "GRADE_4" && !isSynthetic(w.text) && len <= 4 && syl === 1) {
      // Only flag if meaning is also very early
      if (meaning.split(/\s+/).length <= 6) {
        reasons.push(
          "very early concrete word on GRADE_4 — confirm intentional placement (not length-only heuristic)"
        );
      }
    }

    if (w.origin === "DICTIONARY") {
      const entry = w.dictionarySense?.entry;
      if (!entry) reasons.push("DICTIONARY word missing sense/entry link");
      else if (!entry.sourceName && !entry.sourceRef) {
        reasons.push("missing sourceName and sourceRef (template CSV often has none — confirm licence)");
      }
    }

    if (reasons.length) {
      report.needsReview.push({
        status: "NEEDS_REVIEW",
        grade: g.code,
        wordId: w.id,
        text: w.text,
        meaning: meaning.slice(0, 180),
        category: w.category.label,
        origin: w.origin,
        sourceName: w.dictionarySense?.entry?.sourceName ?? null,
        sourceRef: w.dictionarySense?.entry?.sourceRef ?? null,
        reasons,
      });
    }
  }

  for (const [norm, list] of byNorm) {
    if (list.length > 1) {
      report.duplicates.sameGradeHeadwords.push({
        grade: g.code,
        headword: norm,
        count: list.length,
        wordIds: list.map((x) => x.id),
        categories: list.map((x) => x.category.label),
      });
    }
  }

  report.grades.push({
    code: g.code,
    label: g.label,
    isActive: g.isActive,
    activeWords: words.length,
    curriculumLikeWords: approvedKids,
    syntheticOrTestWords: synthetic,
    withSense: words.filter((w) => w.dictionarySenseId).length,
    sampleCurriculum: words
      .filter((w) => !isSynthetic(w.text))
      .slice(0, 10)
      .map((w) => ({
        text: w.text,
        meaning: w.meaning.slice(0, 80),
        category: w.category.label,
        sourceRef: w.dictionarySense?.entry?.sourceRef ?? null,
        sourceName: w.dictionarySense?.entry?.sourceName ?? null,
      })),
  });
}

for (const [norm, list] of headwordIndex) {
  const gradeSet = [...new Set(list.map((x) => x.grade))];
  if (gradeSet.length > 1) {
    report.duplicates.crossGradeHeadwords.push({
      headword: norm,
      grades: gradeSet,
      placements: list,
      synthetic: isSynthetic(norm),
    });
  }
}

const senses = await p.dictionarySense.findMany({
  include: { entry: { select: { normalizedHeadword: true } } },
});
const senseKey = new Map();
for (const s of senses) {
  const key = `${s.entry.normalizedHeadword}::${s.definition.trim().toLowerCase()}`;
  if (!senseKey.has(key)) senseKey.set(key, []);
  senseKey.get(key).push(s.id);
}
for (const [key, ids] of senseKey) {
  if (ids.length > 1) {
    report.duplicates.duplicateSenseDefs.push({ key, senseIds: ids, count: ids.length });
  }
}

report.totals = {
  activeWords: report.grades.reduce((s, g) => s + g.activeWords, 0),
  curriculumLikeWords: report.grades.reduce((s, g) => s + g.curriculumLikeWords, 0),
  syntheticOrTestWords: report.grades.reduce((s, g) => s + g.syntheticOrTestWords, 0),
  needsReview: report.needsReview.length,
  sameGradeDupes: report.duplicates.sameGradeHeadwords.length,
  crossGradeDupes: report.duplicates.crossGradeHeadwords.length,
  duplicateSenseDefs: report.duplicates.duplicateSenseDefs.length,
};

console.log(JSON.stringify(report, null, 2));
await p.$disconnect();
