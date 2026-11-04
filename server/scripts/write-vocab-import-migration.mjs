import fs from "node:fs";
import path from "node:path";

const dir = path.resolve("prisma/migrations/20261104110000_vocab_import_batches");
fs.mkdirSync(dir, { recursive: true });

const sql = `-- CreateEnum
CREATE TYPE "VocabImportStatus" AS ENUM ('PENDING', 'IMPORTED', 'FAILED', 'CANCELLED');

CREATE TABLE "VocabImportBatch" (
    "id" TEXT NOT NULL,
    "adminId" TEXT NOT NULL,
    "levelId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "originalFilename" TEXT NOT NULL,
    "storedPath" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "fileExt" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "fileHash" TEXT NOT NULL,
    "status" "VocabImportStatus" NOT NULL DEFAULT 'PENDING',
    "extractedCount" INTEGER NOT NULL DEFAULT 0,
    "validCount" INTEGER NOT NULL DEFAULT 0,
    "invalidCount" INTEGER NOT NULL DEFAULT 0,
    "duplicateCount" INTEGER NOT NULL DEFAULT 0,
    "importedCount" INTEGER NOT NULL DEFAULT 0,
    "skippedCount" INTEGER NOT NULL DEFAULT 0,
    "previewJson" TEXT NOT NULL,
    "parseNotes" TEXT,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "importedAt" TIMESTAMP(3),
    CONSTRAINT "VocabImportBatch_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "VocabImportBatch_adminId_createdAt_idx" ON "VocabImportBatch"("adminId", "createdAt");
CREATE INDEX "VocabImportBatch_categoryId_createdAt_idx" ON "VocabImportBatch"("categoryId", "createdAt");
CREATE INDEX "VocabImportBatch_fileHash_idx" ON "VocabImportBatch"("fileHash");
CREATE INDEX "VocabImportBatch_status_idx" ON "VocabImportBatch"("status");

ALTER TABLE "VocabImportBatch" ADD CONSTRAINT "VocabImportBatch_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "VocabImportBatch" ADD CONSTRAINT "VocabImportBatch_levelId_fkey" FOREIGN KEY ("levelId") REFERENCES "LearningLevel"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "VocabImportBatch" ADD CONSTRAINT "VocabImportBatch_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "LearningCategory"("id") ON DELETE CASCADE ON UPDATE CASCADE;
`;

fs.writeFileSync(path.join(dir, "migration.sql"), sql, { encoding: "utf8" });
console.log("Wrote", path.join(dir, "migration.sql"));
