/**
 * Builds the Grade 2–4 curriculum workbooks (Read Me / Topics / Words) from the source topic
 * spreadsheets plus the drafted vocabulary in prisma/data/curriculum-draft-words.json.
 *
 * Usage (no database access):
 *   node scripts/build-curriculum-workbooks.mjs <Grade_4_5_6.xlsx> <English_Topics_7_12.xlsx> [outDir]
 */
import { readFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const XLSX = require("xlsx");

const here = path.dirname(fileURLToPath(import.meta.url));
const [src456, src712, outArg] = process.argv.slice(2);
if (!src456 || !src712) {
  console.error("Usage: node scripts/build-curriculum-workbooks.mjs <Grade_4_5_6.xlsx> <English_Topics_7_12.xlsx> [outDir]");
  process.exit(1);
}
const outDir = path.resolve(outArg ?? path.join(here, "../../docs/curriculum"));
const drafts = JSON.parse(readFileSync(path.join(here, "../prisma/data/curriculum-draft-words.json"), "utf8"));

/** Age → child grade (LEVEL) and group. Grade 2 keeps its existing local group labels. */
const AGE_MAP = {
  4: { level: "LEVEL_2", group: "C", label: "Group C – English Topics Set 1" },
  5: { level: "LEVEL_2", group: "D", label: "Group D – English Topics Set 2" },
  6: { level: "LEVEL_2", group: "E", label: "Group E – English Topics Set 3" },
  7: { level: "LEVEL_3", group: "C", label: "Group C – Age 7 Topics" },
  8: { level: "LEVEL_3", group: "D", label: "Group D – Age 8 Topics" },
  9: { level: "LEVEL_3", group: "E", label: "Group E – Age 9 Topics" },
  10: { level: "LEVEL_4", group: "C", label: "Group C – Age 10 Topics" },
  11: { level: "LEVEL_4", group: "D", label: "Group D – Age 11 Topics" },
  12: { level: "LEVEL_4", group: "E", label: "Group E – Age 12 Topics" },
};

const LEVEL_LABEL = {
  LEVEL_2: "Grade 2 – Ages 4–6",
  LEVEL_3: "Grade 3 – Ages 7–9",
  LEVEL_4: "Grade 4 – Ages 10–12",
};

function codeFromLabel(label) {
  return label
    .normalize("NFKD")
    .replace(/&/g, " and ")
    .replace(/['’`.]/g, "")
    .replace(/[^A-Za-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toUpperCase()
    .slice(0, 48);
}

const clean = (v) => String(v ?? "").replace(/\s+/g, " ").trim();
const isEmoji = (s) => /\p{Extended_Pictographic}/u.test(s);

function readTopics(file) {
  const wb = XLSX.readFile(file);
  const topics = [];
  for (const name of wb.SheetNames) {
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, defval: "", blankrows: false });
    let age = null;
    for (const r of rows) {
      const first = clean(r[0]);
      const heading = first.match(/^GRADE\s+(\d+)\b/i);
      if (heading) {
        age = Number(heading[1]);
        continue;
      }
      if (!first || /^English Topic/i.test(first) || /^ENGLISH CURRICULUM/i.test(first)) continue;
      if (age == null) throw new Error(`${path.basename(file)} / ${name}: topic "${first}" before any GRADE heading`);
      topics.push({
        age,
        topic: first,
        sourceSymbol: clean(r[1]),
        dailyConversation: clean(r[2]),
        exampleSentence: clean(r[3]),
        source: `${path.basename(file)} / ${name}`,
      });
    }
  }
  return topics;
}

const all = [...readTopics(src456), ...readTopics(src712)];
const byLevel = new Map();
const problems = [];
const usedDrafts = new Set();

for (const t of all) {
  const map = AGE_MAP[t.age];
  if (!map) {
    problems.push(`No grade mapping for age ${t.age} (${t.topic})`);
    continue;
  }
  const code = codeFromLabel(t.topic);
  const draft = drafts[map.level]?.[code];
  if (!draft) problems.push(`${map.level} ${code}: no drafted words`);
  else usedDrafts.add(`${map.level}/${code}`);
  if (!byLevel.has(map.level)) byLevel.set(map.level, []);
  byLevel.get(map.level).push({ ...t, ...map, code, draft });
}
for (const [level, codes] of Object.entries(drafts)) {
  if (level.startsWith("_")) continue;
  for (const code of Object.keys(codes)) {
    if (!usedDrafts.has(`${level}/${code}`)) problems.push(`${level} ${code}: drafted words have no source topic`);
  }
}
if (problems.length) {
  console.error("Curriculum build failed:\n- " + problems.join("\n- "));
  process.exit(1);
}

mkdirSync(outDir, { recursive: true });
const report = [];
for (const [level, topics] of byLevel) {
  const gradeCode = `GRADE_${level.replace("LEVEL_", "")}`;
  const topicRows = [[
    "Grade Code", "Group Code", "Group Label", "Category Code", "Topic", "Symbol",
    "Daily Conversation", "Example Sentence", "Sort Order", "Status", "Needs Review",
    "Age", "Source Symbol", "Source",
  ]];
  const wordRows = [[
    "Category Code", "Word", "Meaning", "Example Sentence", "Emoji", "Phonetic",
    "Difficulty", "Sort Order", "Needs Review",
  ]];
  const perGroup = new Map();
  let replacedSymbols = 0;
  for (const t of topics) {
    const order = (perGroup.get(t.group) ?? 0) + 1;
    perGroup.set(t.group, order);
    const symbol = isEmoji(t.sourceSymbol) ? t.sourceSymbol : t.draft.symbol;
    if (symbol !== t.sourceSymbol) replacedSymbols += 1;
    topicRows.push([
      gradeCode, t.group, t.label, t.code, t.topic, symbol,
      t.dailyConversation, t.exampleSentence, order, "DRAFT", "YES",
      t.age, t.sourceSymbol, t.source,
    ]);
    t.draft.words.forEach(([word, meaning, example, emoji, difficulty], i) => {
      wordRows.push([t.code, word, meaning, example, emoji, "", difficulty, i + 1, "YES"]);
    });
  }

  const wb = XLSX.utils.book_new();
  const readMe = [
    [`Learn Wise curriculum workbook — ${LEVEL_LABEL[level]} (${gradeCode})`],
    [""],
    ["Topics: names, daily conversation and example sentence are copied from the source spreadsheet (column Source)."],
    ["Symbol: the source symbol when it is a real emoji; otherwise a suggested emoji (see Source Symbol for the original)."],
    ["Words: DRAFT suggestions written for review — not from an approved source. Needs Review = YES on every row."],
    ["Import creates topics as DRAFT. Nothing is shown to children until an admin approves and publishes each topic."],
    ["Mandatory columns — Topics: Grade Code, Group Code, Category Code, Topic. Words: Category Code, Word, Meaning, Emoji."],
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(readMe), "Read Me");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(topicRows), "Topics");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(wordRows), "Words");
  const file = path.join(outDir, `LearnWise-${gradeCode.replace("_", "-")}-Curriculum.xlsx`);
  XLSX.writeFile(wb, file);
  report.push(`${gradeCode}: ${topicRows.length - 1} topics, ${wordRows.length - 1} words, ${replacedSymbols} symbols suggested → ${file}`);
}
console.log(report.join("\n"));
