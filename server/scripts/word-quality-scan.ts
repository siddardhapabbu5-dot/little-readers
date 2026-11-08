import { prisma } from "../src/lib/prisma.js";
import {
  meaningQualityIssue,
  wordQualityIssue,
} from "../src/vocab-import/file-security.js";

const TEST_WORD = /^(lsn|bew|wmword|wmreclass|wmhist|wmbulk|wmmean|sheetword)[a-j]{10,}$/i;

async function main() {
  const fix = process.argv.includes("--deactivate");
  const words = await prisma.vocabularyWord.findMany({
    where: { isActive: true },
    select: { id: true, text: true, meaning: true },
  });
  const bad = words
    .map((w) => ({
      ...w,
      issue:
        wordQualityIssue(w.text) ??
        meaningQualityIssue(w.meaning) ??
        (TEST_WORD.test(w.text) ? "Automated test word" : null),
    }))
    .filter((w) => w.issue);

  console.log(`Active words: ${words.length}. Failing quality check: ${bad.length}.`);
  for (const w of bad) console.log(` - ${w.text} :: ${w.issue}`);

  if (fix && bad.length) {
    const res = await prisma.vocabularyWord.updateMany({
      where: { id: { in: bad.map((w) => w.id) } },
      data: { isActive: false },
    });
    console.log(`Deactivated ${res.count} words.`);
  }
}

main().finally(() => prisma.$disconnect());
