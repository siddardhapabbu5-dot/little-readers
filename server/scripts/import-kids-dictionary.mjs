/**
 * Non-destructive kids dictionary import:
 * upload CSV → classify → approve → publish.
 * Does NOT clear existing vocabulary (safe for production curriculum words).
 *
 * Usage (from server/):
 *   node ./scripts/import-kids-dictionary.mjs
 *   node ./scripts/import-kids-dictionary.mjs path/to/file.csv
 */
import { readFileSync, existsSync } from "node:fs";
import { dirname, join, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";
import {
  bulkApproveAssignments,
  bulkPublishAssignments,
  classifyDictionaryBatch,
  createDictionaryUpload,
  listAssignments,
} from "../src/dictionary/dictionary.service.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const defaultCsv = join(
  root,
  "docs/templates/little-readers-kids-dictionary-template.csv"
);
const csvPath = process.argv[2] ? join(process.cwd(), process.argv[2]) : defaultCsv;

const prisma = new PrismaClient();

async function main() {
  if (!existsSync(csvPath)) {
    throw new Error(`File not found: ${csvPath}`);
  }
  const size = readFileSync(csvPath).length;
  if (size > 5 * 1024 * 1024) {
    throw new Error(`File is ${(size / 1024 / 1024).toFixed(1)}MB — limit is 5MB. Use CSV/XLSX, not largedictionary.pdf.`);
  }

  const admin = await prisma.user.findFirst({
    where: { role: { in: ["ADMIN", "SUPER_ADMIN"] }, isActive: true },
    orderBy: { createdAt: "asc" },
  });
  if (!admin) throw new Error("No ADMIN user found — seed/login first");

  const buffer = readFileSync(csvPath);
  const batch = await createDictionaryUpload({
    adminId: admin.id,
    originalFilename: basename(csvPath),
    mimeType: csvPath.endsWith(".xlsx")
      ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      : "text/csv",
    buffer,
    sourceName: "LEARN WISE Kids Dictionary",
    licence: "Project-owned sample template for LEARN WISE",
  });
  console.log("Uploaded batch:", {
    id: batch.id,
    entryCount: batch.entryCount,
    senseCount: batch.senseCount,
  });

  if (!batch.entryCount) {
    throw new Error("Parse returned 0 entries — check CSV columns: headword,definition,pos,example");
  }

  await classifyDictionaryBatch(batch.id);
  const pending = await listAssignments({ status: "PENDING", take: 2000 });
  const ids = pending.map((p) => p.id);
  console.log("Pending suggestions:", ids.length);

  if (ids.length) {
    console.log("Approve:", await bulkApproveAssignments(ids, admin.id));
    const approved = (await listAssignments({ status: "APPROVED", take: 2000 })).map(
      (p) => p.id
    );
    console.log("Publish:", await bulkPublishAssignments(approved, admin.id));
  }

  const wordCount = await prisma.vocabularyWord.count({ where: { isActive: true } });
  console.log("Active vocabulary words now:", wordCount);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
