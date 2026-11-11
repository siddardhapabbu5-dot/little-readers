import { PrismaClient } from "@prisma/client";
import { clearAllVocabularyWords } from "../prisma/seeds/level1-vocabulary.js";
import { assertDestructiveAllowed } from "./lib/destructive-guard.mjs";

assertDestructiveAllowed("clear-vocabulary");

const prisma = new PrismaClient();

async function main() {
  const result = await clearAllVocabularyWords(prisma);
  console.log("Vocabulary cleared:", result);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
