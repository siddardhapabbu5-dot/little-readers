/**
 * Replace Grade 2 placeholder meanings/examples with kid-friendly content.
 * Writes a new workbook under docs/curriculum/ (does not touch production).
 *
 * Usage: node ./scripts/enrich-additional-vocab-grade2.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import xlsx from "xlsx";

const XLSX = xlsx?.readFile ? xlsx : xlsx?.default ?? xlsx;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../..");
const SRC = path.join(
  process.env.USERPROFILE || process.env.HOME || "",
  "Downloads",
  "Learn_Wise_Grades_2_3_4_Additional_Vocabulary_DRAFT (2).xlsx"
);
const OUT = path.join(
  ROOT,
  "docs",
  "curriculum",
  "Learn_Wise_Grade_2_Additional_Vocabulary_ENRICHED.xlsx"
);

/** Grammar / school terms — ages ~4–6 friendly where possible */
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
  main: "Most important.",
  idea: "A thought or something you think of.",
  concrete: "Something you can see or touch.",
  abstract: "An idea you cannot touch, like love or bravery.",
  common: "A noun for any person, place, or thing (not a special name).",
  proper: "A noun that names one special person, place, or thing and starts with a capital letter.",
  antecedent: "The noun a pronoun refers back to.",
  agreement: "When words in a sentence match correctly, like he runs.",
  tense: "The time a verb shows: past, present, or future.",
  modal: "A helping verb like can, will, or must.",
  active: "When the subject does the action.",
  passive: "When the subject receives the action.",
  voice: "Whether a sentence is active or passive.",
  perfect: "A verb form that shows an action is finished, often with have or had.",
  progressive: "A verb form that shows an action is still happening.",
  comprehension: "Understanding what you read.",
  context: "The words around a word that help you understand it.",
  inference: "A smart guess using clues from the text.",
  summarize: "To tell the main points in a short way.",
  predict: "To say what you think will happen next.",
  compare: "To say how things are alike.",
  contrast: "To say how things are different.",
  cause: "Why something happens.",
  effect: "What happens because of a cause.",
  sequence: "The order in which things happen.",
  setting: "Where and when a story happens.",
  character: "A person or animal in a story.",
  plot: "What happens in a story from start to end.",
  theme: "The big lesson or message of a story.",
  draft: "A first try at writing that you can improve later.",
  revise: "To change writing to make it clearer or better.",
  edit: "To fix mistakes in writing.",
  proofread: "To check writing carefully for small errors.",
  outline: "A short plan of the main points before you write.",
  introduction: "The beginning that tells what the writing is about.",
  conclusion: "The ending that wraps up the main idea.",
  evidence: "Facts or examples that support an idea.",
  claim: "A statement you say is true and try to prove.",
  opinion: "What someone thinks or believes.",
  fact: "Something that is true and can be checked.",
  formal: "Careful language used in school or polite talk.",
  informal: "Friendly everyday language with family or friends.",
  audience: "The people who will read or listen to your words.",
  purpose: "The reason you are writing or speaking.",
  condition: "Something that must be true for another thing to happen.",
  result: "What happens at the end.",
  unless: "Except if; if not.",
  focus: "To give full attention to one thing.",
  listen: "To pay attention to sounds or spoken words.",
  speak: "To say words out loud.",
  write: "To put words on paper or a screen.",
  read: "To look at words and understand them.",
};

function titleCaseTopic(topic) {
  return String(topic || "this lesson").trim();
}

function isPlaceholder(meaning) {
  return /vocabulary example used to practise/i.test(String(meaning || ""));
}

function simpleMeaning(word, topic) {
  const w = String(word || "").toLowerCase().trim();
  if (GLOSSARY[w]) return GLOSSARY[w];

  // Gentle topic-aware fallbacks (still better than placeholders)
  const t = titleCaseTopic(topic).toLowerCase();
  if (t.includes("noun")) {
    return `A word used when talking about people, places, things, or ideas in ${titleCaseTopic(topic)}.`;
  }
  if (t.includes("verb") || t.includes("tense") || t.includes("modal") || t.includes("voice")) {
    return `A word connected with actions or verb forms in ${titleCaseTopic(topic)}.`;
  }
  if (t.includes("adjective")) {
    return `A describing word used in ${titleCaseTopic(topic)}.`;
  }
  if (t.includes("adverb")) {
    return `A word that tells how, when, or where in ${titleCaseTopic(topic)}.`;
  }
  if (t.includes("pronoun")) {
    return `A pronoun word used in ${titleCaseTopic(topic)}.`;
  }
  if (t.includes("synonym") || t.includes("antonym")) {
    return `A word-study example used when learning ${titleCaseTopic(topic)}.`;
  }
  if (t.includes("prefix") || t.includes("suffix")) {
    return `A word-part example used when learning ${titleCaseTopic(topic)}.`;
  }
  if (t.includes("reading") || t.includes("comprehension")) {
    return `A reading word that helps with ${titleCaseTopic(topic)}.`;
  }
  if (t.includes("writing") || t.includes("paragraph") || t.includes("sentence")) {
    return `A writing word used when practising ${titleCaseTopic(topic)}.`;
  }
  return `A useful school word for learning ${titleCaseTopic(topic)}.`;
}

function exampleSentence(word, topic) {
  const w = String(word || "").trim();
  const t = titleCaseTopic(topic);
  // Prefer natural short classroom sentences
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
  const w = String(word || "").toLowerCase();
  const t = String(topic || "").toLowerCase();
  if (GLOSSARY[w] && /(noun|pronoun|verb|adjective|adverb|prefix|suffix)/.test(w)) {
    if (w.includes("noun") || w === "subject" || w === "predicate" || w === "clause" || w === "phrase")
      return "noun";
  }
  if (t.includes("verb") || t.includes("tense") || t.includes("modal")) return "verb";
  if (t.includes("adjective")) return "adjective";
  if (t.includes("adverb")) return "adverb";
  if (t.includes("pronoun")) return "pronoun";
  if (t.includes("noun")) return "noun";
  return "noun";
}

async function fetchDefinition(word) {
  const w = encodeURIComponent(String(word).toLowerCase());
  const url = `https://api.dictionaryapi.dev/api/v2/entries/en/${w}`;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    const meanings = data?.[0]?.meanings;
    if (!Array.isArray(meanings)) return null;
    for (const m of meanings) {
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

async function main() {
  if (!fs.existsSync(SRC)) throw new Error(`Source workbook missing: ${SRC}`);
  const wb = XLSX.readFile(SRC);
  const sheetName = "Grade 2";
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { defval: "" });
  console.log(`Enriching ${rows.length} Grade 2 rows…`);

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

    if (meaning) {
      fromGlossary += 1;
    } else {
      if (!cache.has(key)) {
        const api = await fetchDefinition(key);
        cache.set(key, api);
        await sleep(80); // be gentle to free API
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

    // Shorten very long API defs for kids
    if (meaning.length > 140) meaning = meaning.slice(0, 137).replace(/\s+\S*$/, "") + "…";

    rec["Meaning (draft)"] = meaning;
    rec["Example Sentence (draft)"] = exampleSentence(word, topic);
    rec["Part of Speech"] = pos;
    rec["Review Status"] = GLOSSARY[key] || cache.get(key)?.definition ? "Enriched — spot-check" : "Enriched — needs teacher check";

    if ((i + 1) % 50 === 0 || i + 1 === rows.length) {
      console.log(`  ${i + 1}/${rows.length}`);
    }
  }

  const outWb = XLSX.utils.book_new();
  // Keep Overview if present
  if (wb.Sheets.Overview) {
    XLSX.utils.book_append_sheet(outWb, wb.Sheets.Overview, "Overview");
  }
  const g2 = XLSX.utils.json_to_sheet(rows);
  XLSX.utils.book_append_sheet(outWb, g2, "Grade 2");
  // Copy other grade sheets unchanged for convenience
  for (const name of ["Grade 3", "Grade 4", "All Vocabulary"]) {
    if (wb.Sheets[name]) XLSX.utils.book_append_sheet(outWb, wb.Sheets[name], name);
  }

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  XLSX.writeFile(outWb, OUT);

  console.log(
    JSON.stringify(
      {
        out: OUT,
        rows: rows.length,
        fromGlossary,
        fromApi,
        fromFallback,
        sample: rows.slice(0, 5).map((r) => ({
          word: r.Word,
          meaning: r["Meaning (draft)"],
          example: r["Example Sentence (draft)"],
        })),
      },
      null,
      2
    )
  );
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
