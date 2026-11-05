import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();
const words = await p.vocabularyWord.findMany({
  select: { text: true, origin: true },
});
const origins = {};
for (const w of words) origins[w.origin] = (origins[w.origin] || 0) + 1;
console.log({
  total: words.length,
  unique: new Set(words.map((w) => w.text.toLowerCase())).size,
  origins,
});
console.log(words.map((w) => w.text).sort().join(", "));
await p.$disconnect();
