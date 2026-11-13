/**
 * Enrich Grade 2–4 Additional Vocabulary placeholders → kid-friendlier meanings.
 * Usage: node ./scripts/enrich-additional-vocab-grades.mjs [--grade 2|3|4]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import xlsx from "xlsx";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const g2script = path.join(path.dirname(fileURLToPath(import.meta.url)), "enrich-additional-vocab-grade2.mjs");
// Re-implement shared helpers inline (Grade 2 module does not export them)

const XLSX = xlsx?.readFile ? xlsx : xlsx?.default ?? xlsx;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../..");
const SRC = path.join(
  process.env.USERPROFILE || process.env.HOME || "",
  "Downloads",
  "Learn_Wise_Grades_2_3_4_Additional_Vocabulary_DRAFT (2).xlsx"
);

const GLOSSARY = {
  subject: "The person, animal, or thing a sentence is about.",
  predicate: "The part of a sentence that tells what the subject does or is.",
  clause: "A group of words with a subject and a verb.",
  phrase: "A small group of words that work together but are not a full sentence.",
  sentence: "A group of words that shares a complete thought.",
  statement: "A sentence that tells something.",
  question: "A sentence that asks something.",
  command: "A sentence that tells someone to do something.",
  exclamation: "A sentence that shows strong feeling.",
  noun: "A word for a person, place, thing, or idea.",
  pronoun: "A word that takes the place of a noun, like he, she, or they.",
  verb: "A word that shows an action or a state of being.",
  adjective: "A word that describes a noun.",
  adverb: "A word that describes a verb, an adjective, or another adverb.",
  synonym: "A word that means almost the same as another word.",
  antonym: "A word that means the opposite of another word.",
  prefix: "Letters added to the beginning of a word to change its meaning.",
  suffix: "Letters added to the end of a word to change its meaning.",
  paragraph: "A group of sentences about one main idea.",
  topic: "What a text or paragraph is mainly about.",
  detail: "A small fact that supports the main idea.",
  concrete: "Something you can see or touch.",
  abstract: "An idea you cannot touch, like love or bravery.",
  tense: "The time a verb shows: past, present, or future.",
  modal: "A helping verb like can, will, or must.",
  active: "When the subject does the action.",
  passive: "When the subject receives the action.",
  evidence: "Facts or examples that support an idea.",
  claim: "A statement you say is true and try to prove.",
  opinion: "What someone thinks or believes.",
  fact: "Something that is true and can be checked.",
  formal: "Careful language used in school or polite talk.",
  informal: "Friendly everyday language with family or friends.",
  audience: "The people who will read or listen to your words.",
  purpose: "The reason you are writing or speaking.",
  draft: "A first try at writing that you can improve later.",
  revise: "To change writing to make it clearer or better.",
  edit: "To fix mistakes in writing.",
  outline: "A short plan of the main points before you write.",
  thesis: "The main idea a writer wants to prove.",
  counterclaim: "The opposite side of an argument.",
  critique: "To carefully judge the good and weak parts of a text.",
  reference: "A source you use to support your ideas.",
  unless: "Except if; if not.",
  condition: "Something that must be true for another thing to happen.",
  result: "What happens at the end.",
  focus: "To give full attention to one thing.",
  inference: "A smart guess using clues from the text.",
  summarize: "To tell the main points in a short way.",
  compare: "To say how things are alike.",
  contrast: "To say how things are different.",
};

function titleCaseTopic(topic) {
  return String(topic || "this lesson").trim();
}

function simpleMeaning(word, topic) {
  const w = String(word || "").toLowerCase().trim();
  if (GLOSSARY[w]) return GLOSSARY[w];
  const t = titleCaseTopic(topic).toLowerCase();
  if (t.includes("noun")) return `A noun-related word used when learning ${titleCaseTopic(topic)}.`;
  if (t.includes("verb") || t.includes("tense") || t.includes("modal") || t.includes("voice"))
    return `A verb-related word used when learning ${titleCaseTopic(topic)}.`;
  if (t.includes("adjective")) return `A describing word used in ${titleCaseTopic(topic)}.`;
  if (t.includes("adverb")) return `A word that tells how, when, or where in ${titleCaseTopic(topic)}.`;
  if (t.includes("pronoun")) return `A pronoun word used in ${titleCaseTopic(topic)}.`;
  if (t.includes("writing") || t.includes("essay") || t.includes("speech") || t.includes("paper"))
    return `A writing word used when practising ${titleCaseTopic(topic)}.`;
  if (t.includes("reading") || t.includes("literary") || t.includes("text"))
    return `A reading word that helps with ${titleCaseTopic(topic)}.`;
  if (t.includes("listen") || t.includes("communicat") || t.includes("speech"))
    return `A speaking and listening word for ${titleCaseTopic(topic)}.`;
  return `A useful school word for learning ${titleCaseTopic(topic)}.`;
}

function exampleSentence(word, topic) {
  const w = String(word || "").trim();
  const t = titleCaseTopic(topic);
  const patterns = [
    `We learned the word “${w}” in our ${t} lesson.`,
    `Can you use “${w}” in a sentence about ${t}?`,
    `In class, Maya explained what “${w}” means.`,
    `The teacher asked us to find “${w}” while studying ${t}.`,
  ];
  let h = 0;
  for (const ch of w.toLowerCase()) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return patterns[h % patterns.length];
}

function guessPos(word, topic) {
  const t = String(topic || "").toLowerCase();
  if (t.includes("verb") || t.includes("tense") || t.includes("modal")) return "verb";
  if (t.includes("adjective")) return "adjective";
  if (t.includes("adverb")) return "adverb";
  if (t.includes("pronoun")) return "pronoun";
  return "noun";
}

async function fetchDefinition(word) {
  const w = encodeURIComponent(String(word).toLowerCase());
  try {
    const res = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${w}`);
    if (!res.ok) return null;
    const data = await res.json();
    for (const m of data?.[0]?.meanings || []) {
      const def = m?.definitions?.[0]?.definition;
      if (def && def.length > 8 && def.length < 180) {
        return { definition: def.replace(/\s+/g, " ").trim(), pos: m.partOfSpeech || null };
      }
    }
  } catch {
    return null;
  }
  return null;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function enrichSheet(wb, sheetName) {
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { defval: "" });
  const cache = new Map();
  let fromGlossary = 0;
  let fromApi = 0;
  let fromFallback = 0;

  for (let i = 0; i < rows.length; i++) {
    const rec = rows[i];
    const word = String(rec.Word || "").trim();
    const topic = String(rec["Original Topic / Lesson"] || "").trim();
    const key = word.toLowerCase();
    let meaning = GLOSSARY[key] || null;
    let pos = guessPos(word, topic);

    if (meaning) fromGlossary += 1;
    else {
      if (!cache.has(key)) {
        cache.set(key, await fetchDefinition(key));
        await sleep(60);
      }
      const api = cache.get(key);
      if (api?.definition) {
        meaning = api.definition;
        if (api.pos) pos = api.pos;
        fromApi += 1;
      } else {
        meaning = simpleMeaning(word, topic);
        fromFallback += 1;
      }
    }
    if (meaning.length > 140) meaning = meaning.slice(0, 137).replace(/\s+\S*$/, "") + "…";
    rec["Meaning (draft)"] = meaning;
    rec["Example Sentence (draft)"] = exampleSentence(word, topic);
    rec["Part of Speech"] = pos;
    rec["Review Status"] = "Enriched — ready for activate";
    if ((i + 1) % 100 === 0 || i + 1 === rows.length) console.log(`  ${sheetName}: ${i + 1}/${rows.length}`);
  }
  return { rows, fromGlossary, fromApi, fromFallback };
}

async function main() {
  const gradeArg = process.argv.includes("--grade")
    ? Number(process.argv[process.argv.indexOf("--grade") + 1])
    : null;
  const grades = gradeArg ? [gradeArg] : [2, 3, 4];
  if (!fs.existsSync(SRC)) throw new Error(`Missing ${SRC}`);
  const wb = XLSX.readFile(SRC);
  const outWb = XLSX.utils.book_new();
  if (wb.Sheets.Overview) XLSX.utils.book_append_sheet(outWb, wb.Sheets.Overview, "Overview");

  const summary = {};
  for (const g of [2, 3, 4]) {
    const name = `Grade ${g}`;
    if (!wb.Sheets[name]) continue;
    if (!grades.includes(g)) {
      XLSX.utils.book_append_sheet(outWb, wb.Sheets[name], name);
      continue;
    }
    console.log(`Enriching ${name}…`);
    const { rows, ...stats } = await enrichSheet(wb, name);
    summary[name] = { rows: rows.length, ...stats };
    XLSX.utils.book_append_sheet(outWb, XLSX.utils.json_to_sheet(rows), name);
  }
  if (wb.Sheets["All Vocabulary"]) {
    XLSX.utils.book_append_sheet(outWb, wb.Sheets["All Vocabulary"], "All Vocabulary");
  }
  const out = path.join(ROOT, "docs", "curriculum", "Learn_Wise_Grades_2_3_4_Additional_Vocabulary_ENRICHED.xlsx");
  fs.mkdirSync(path.dirname(out), { recursive: true });
  XLSX.writeFile(outWb, out);
  console.log(JSON.stringify({ out, summary }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
