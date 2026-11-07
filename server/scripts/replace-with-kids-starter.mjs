/**
 * Clear published vocabulary and load the 50-word kids starter
 * through dictionary upload → classify → approve → publish.
 *
 * Usage (from server/): node ./scripts/replace-with-kids-starter.mjs
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";
import { clearAllVocabularyWords } from "../prisma/seeds/level1-vocabulary.ts";
import {
  bulkApproveAssignments,
  bulkPublishAssignments,
  classifyDictionaryBatch,
  createDictionaryUpload,
  listAssignments,
} from "../src/dictionary/dictionary.service.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const csvPath = join(
  root,
  "docs/templates/little-readers-kids-dictionary-template.csv"
);

const prisma = new PrismaClient();

async function main() {
  const admin = await prisma.user.findFirst({
    where: { role: { in: ["ADMIN", "SUPER_ADMIN"] }, isActive: true },
    orderBy: { createdAt: "asc" },
  });
  if (!admin) throw new Error("No ADMIN user found — seed/login first");

  const cleared = await clearAllVocabularyWords(prisma);
  console.log("Cleared vocabulary:", cleared);

  const buffer = readFileSync(csvPath);
  const batch = await createDictionaryUpload({
    adminId: admin.id,
    originalFilename: "little-readers-kids-dictionary-template.csv",
    mimeType: "text/csv",
    buffer,
    sourceName: "LEARN WISE Kids Starter",
    licence: "Project-owned sample template for LEARN WISE",
  });
  console.log("Uploaded batch:", {
    id: batch.id,
    entryCount: batch.entryCount,
    senseCount: batch.senseCount,
  });

  await classifyDictionaryBatch(batch.id);
  const pending = await listAssignments({ status: "PENDING", take: 500 });
  const ids = pending.map((p) => p.id);
  console.log("Pending suggestions:", ids.length);

  if (ids.length) {
    const approved = await bulkApproveAssignments(ids, admin.id);
    console.log("Approve:", approved);
    // Re-fetch approved (publish accepts APPROVED or PENDING)
    const toPublish = (
      await listAssignments({ status: "APPROVED", take: 500 })
    ).map((p) => p.id);
    const alsoPending = (
      await listAssignments({ status: "PENDING", take: 500 })
    ).map((p) => p.id);
    const publishIds = [...new Set([...toPublish, ...alsoPending])];
    const published = await bulkPublishAssignments(publishIds, admin.id);
    console.log("Publish:", published);
  }

  const wordCount = await prisma.vocabularyWord.count({
    where: { isActive: true },
  });
  console.log("Active vocabulary words now:", wordCount);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
