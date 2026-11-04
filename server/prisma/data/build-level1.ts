import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { LEVEL1_CATEGORIES, type VocabSeedWord } from "./level1-vocabulary.js";

const SYNONYMS: Record<string, string[]> = {
  orange: ["amber", "citrusglow"],
  heart: ["loveshape"],
  wave: ["wavyline"],
  line: ["queue", "stripepath"],
  circle: ["circletime", "roundring"],
  sleep: ["slumber"],
  wake: ["awaken"],
  kick: ["footkick"],
  stop: ["halt"],
  match: ["flamestick"],
  smile: ["grin"],
  hug: ["cuddle"],
  kiss: ["peck"],
  brush: ["scrubber"],
};

function uniqueText(base: string, used: Set<string>): string {
  if (!used.has(base)) return base;
  const alts = SYNONYMS[base] ?? [];
  for (const alt of alts) {
    if (!used.has(alt)) return alt;
  }
  let i = 2;
  while (used.has(`${base}${i}`)) i += 1;
  return `${base}${i}`;
}

const EXTRA: VocabSeedWord[] = [
  { text: "balloon", meaning: "a floating party toy", emoji: "🎈" },
  { text: "kite", meaning: "a flying toy on a string", emoji: "🪁" },
  { text: "toy", meaning: "something fun to play with", emoji: "🧸" },
  { text: "ball", meaning: "a round play object", emoji: "⚽" },
  { text: "block", meaning: "a building toy cube", emoji: "🧱" },
  { text: "doll", meaning: "a toy person", emoji: "🪆" },
  { text: "train", meaning: "linked cars on tracks", emoji: "🚂" },
  { text: "car", meaning: "a road vehicle", emoji: "🚗" },
  { text: "bike", meaning: "a two-wheel ride", emoji: "🚲" },
  { text: "boat", meaning: "a water vehicle", emoji: "⛵" },
  { text: "plane", meaning: "a flying vehicle", emoji: "✈️" },
  { text: "truck", meaning: "a large work vehicle", emoji: "🚚" },
  { text: "busride", meaning: "travel on a bus", emoji: "🚌" },
  { text: "swing", meaning: "a hanging play seat", emoji: "🪑" },
  { text: "slide", meaning: "a smooth play slope", emoji: "🛝" },
  { text: "sandbox", meaning: "a box of play sand", emoji: "🏖️" },
  { text: "puzzle", meaning: "a fitting pieces game", emoji: "🧩" },
  { text: "drum", meaning: "a beat instrument", emoji: "🥁" },
  { text: "flute", meaning: "a wind instrument", emoji: "🎶" },
  { text: "guitar", meaning: "a string instrument", emoji: "🎸" },
  { text: "piano", meaning: "a keyed instrument", emoji: "🎹" },
  { text: "robot", meaning: "a machine helper toy", emoji: "🤖" },
  { text: "rocket", meaning: "a space flyer", emoji: "🚀" },
  { text: "planet", meaning: "a world in space", emoji: "🪐" },
  { text: "comet", meaning: "a space ice ball", emoji: "☄️" },
  { text: "astronaut", meaning: "a space traveler", emoji: "🧑‍🚀" },
  { text: "helmet", meaning: "hard head protection", emoji: "⛑️" },
  { text: "glove", meaning: "hand cover", emoji: "🧤" },
  { text: "scarf", meaning: "neck cloth", emoji: "🧣" },
  { text: "hat", meaning: "head cover", emoji: "🎩" },
  { text: "shoe", meaning: "foot cover", emoji: "👟" },
  { text: "sock", meaning: "soft foot cover", emoji: "🧦" },
  { text: "shirt", meaning: "upper body clothes", emoji: "👕" },
  { text: "pants", meaning: "leg clothes", emoji: "👖" },
  { text: "dress", meaning: "one-piece clothes", emoji: "👗" },
  { text: "coat", meaning: "warm outer clothes", emoji: "🧥" },
  { text: "umbrella", meaning: "rain cover", emoji: "☂️" },
  { text: "backpack", meaning: "bag worn on back", emoji: "🎒" },
  { text: "gift", meaning: "a present", emoji: "🎁" },
  { text: "party", meaning: "a fun celebration", emoji: "🥳" },
];

const used = new Set<string>();
const normalized = LEVEL1_CATEGORIES.map((cat) => {
  const words: VocabSeedWord[] = [];
  for (const word of cat.words) {
    const text = uniqueText(word.text, used);
    used.add(text);
    words.push({ ...word, text });
  }
  return { ...cat, words };
});

let extraIdx = 0;
for (const cat of normalized) {
  while (cat.words.length > 75) cat.words.pop();
  while (cat.words.length < 75) {
    const candidate = EXTRA[extraIdx % EXTRA.length];
    extraIdx += 1;
    const text = uniqueText(candidate.text, used);
    if (used.has(text) && text === candidate.text) continue;
    used.add(text);
    cat.words.push({ ...candidate, text });
  }
}

const all = normalized.flatMap((c) => c.words.map((w) => w.text));
const report = {
  total: all.length,
  unique: new Set(all).size,
  categories: normalized.map((c) => ({ code: c.code, count: c.words.length })),
};

const __dirname = dirname(fileURLToPath(import.meta.url));
writeFileSync(
  join(__dirname, "level1-vocabulary.generated.json"),
  JSON.stringify({ report, categories: normalized }, null, 2)
);
console.log(JSON.stringify(report, null, 2));
if (report.total !== 750 || report.unique !== 750) {
  process.exitCode = 1;
}
