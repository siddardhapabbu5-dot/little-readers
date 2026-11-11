/**
 * LOCAL ONLY: repair Level 1 vocabulary after automated test runs.
 * - deletes stamped test words (playfix_, seatfix_, wmhist…, uploadtest…)
 * - recreates / reactivates the approved 750-word Level 1 seed
 * - unpublishes Level 1 categories that are not part of the seed layout
 *
 * Usage (from server/): node ../node_modules/tsx/dist/cli.mjs scripts/restore-local-level1-vocab.ts [--apply]
 */
import { prisma } from "../src/lib/prisma.js";
import { LEVEL1_CATEGORIES, assertLevel1Vocabulary } from "../prisma/data/level1-vocabulary.js";
import { assertDestructiveAllowed } from "./lib/destructive-guard.mjs";

assertDestructiveAllowed("restore-local-level1-vocab");

const TEST_WORD =
  /^(playfix_|seatfix_|dicttest|prog_|pub_|vis_)|^(uploadtest|wmhist|wmword|wmreclass|wmbulk|wmmean|sheetword|lsn|bew|b8w)(\d+|[a-j]{10,})|^w_\d+_/i;

function assertLocalDatabase() {
  const url = process.env.DATABASE_URL ?? "";
  const host = url.match(/@([^:/?]+)/)?.[1] ?? "";
  if (!["localhost", "127.0.0.1"].includes(host)) {
    throw new Error(`Refusing to run: DATABASE_URL host "${host || "unknown"}" is not local`);
  }
}

async function main() {
  assertLocalDatabase();
  const apply = process.argv.includes("--apply");
  const check = assertLevel1Vocabulary();
  if (check.total !== 750 || check.unique !== 750) throw new Error("Seed data is not 750 unique words");

  const level = await prisma.learningLevel.findUnique({ where: { code: "LEVEL_1" } });
  if (!level) throw new Error("LEVEL_1 missing — run the seed first");

  const testWords = (await prisma.vocabularyWord.findMany({ select: { id: true, text: true } })).filter(
    (w) => TEST_WORD.test(w.text)
  );
  console.log(`Test words to delete: ${testWords.length}`);

  const categories = await prisma.learningCategory.findMany({
    where: { group: { levelId: level.id } },
    include: { group: true },
  });
  const seedKeys = new Set(LEVEL1_CATEGORIES.map((c) => `${c.group}:${c.code}`));
  const strays = categories.filter((c) => c.isPublished && !seedKeys.has(`${c.group.code}:${c.code}`));
  console.log(`Stray Level 1 categories to unpublish: ${strays.map((c) => `${c.group.code}:${c.code}`).join(", ") || "none"}`);

  if (!apply) {
    console.log("Dry run. Re-run with --apply to change the local database.");
    return;
  }

  const ids = testWords.map((w) => w.id);
  if (ids.length) {
    await prisma.lessonVocabItem.deleteMany({ where: { vocabularyWordId: { in: ids } } });
    await prisma.vocabProgrammeItem.deleteMany({ where: { vocabularyWordId: { in: ids } } });
    await prisma.questionAttempt.deleteMany({ where: { wordId: { in: ids } } });
    await prisma.vocabularyWord.deleteMany({ where: { id: { in: ids } } });
  }
  if (strays.length) {
    await prisma.learningCategory.updateMany({
      where: { id: { in: strays.map((c) => c.id) } },
      data: { isPublished: false },
    });
  }

  let created = 0;
  let reactivated = 0;
  for (const cat of LEVEL1_CATEGORIES) {
    const category = categories.find((c) => c.group.code === cat.group && c.code === cat.code);
    if (!category) throw new Error(`Category ${cat.group}:${cat.code} missing — run the seed first`);
    for (const [i, word] of cat.words.entries()) {
      const existing = await prisma.vocabularyWord.findUnique({
        where: { categoryId_text: { categoryId: category.id, text: word.text } },
      });
      if (!existing) {
        await prisma.vocabularyWord.create({
          data: {
            categoryId: category.id,
            text: word.text,
            meaning: word.meaning,
            emoji: word.emoji,
            phonetic: word.text.toLowerCase().replace(/[^a-z]/g, ""),
            firstLetter: word.text.charAt(0).toUpperCase(),
            difficulty: 1,
            sortOrder: i + 1,
            isActive: true,
          },
        });
        created++;
      } else if (!existing.isActive) {
        await prisma.vocabularyWord.update({ where: { id: existing.id }, data: { isActive: true } });
        reactivated++;
      }
    }
  }
  console.log(`Deleted test words: ${ids.length}. Created: ${created}. Reactivated: ${reactivated}.`);
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
