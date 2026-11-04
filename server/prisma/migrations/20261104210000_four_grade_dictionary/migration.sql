-- CreateEnum
CREATE TYPE "LearningLevelKind" AS ENUM ('GRADE_BAND', 'DIFFICULTY');
CREATE TYPE "DictionaryImportStatus" AS ENUM ('PENDING', 'PARSED', 'CLASSIFIED', 'FAILED', 'CANCELLED');
CREATE TYPE "VocabAssignmentStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'PUBLISHED');
CREATE TYPE "VocabWordOrigin" AS ENUM ('LEGACY', 'DICTIONARY', 'CATEGORY_IMPORT');

-- CreateTable LearningGrade
CREATE TABLE "LearningGrade" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "ageMin" INTEGER NOT NULL,
    "ageMax" INTEGER NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LearningGrade_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "LearningGrade_code_key" ON "LearningGrade"("code");

-- AlterTable LearningLevel
ALTER TABLE "LearningLevel" ADD COLUMN "kind" "LearningLevelKind" NOT NULL DEFAULT 'GRADE_BAND';
ALTER TABLE "LearningLevel" ADD COLUMN "gradeId" TEXT;
CREATE INDEX "LearningLevel_gradeId_idx" ON "LearningLevel"("gradeId");
ALTER TABLE "LearningLevel" ADD CONSTRAINT "LearningLevel_gradeId_fkey" FOREIGN KEY ("gradeId") REFERENCES "LearningGrade"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Alter VocabularyWord: drop global unique(text), allow per-category uniqueness
DROP INDEX IF EXISTS "VocabularyWord_text_key";
ALTER TABLE "VocabularyWord" ADD COLUMN "origin" "VocabWordOrigin" NOT NULL DEFAULT 'LEGACY';
ALTER TABLE "VocabularyWord" ADD COLUMN "dictionarySenseId" TEXT;
CREATE UNIQUE INDEX "VocabularyWord_categoryId_text_key" ON "VocabularyWord"("categoryId", "text");
CREATE INDEX "VocabularyWord_dictionarySenseId_idx" ON "VocabularyWord"("dictionarySenseId");

-- DictionaryImportBatch
CREATE TABLE "DictionaryImportBatch" (
    "id" TEXT NOT NULL,
    "adminId" TEXT NOT NULL,
    "originalFilename" TEXT NOT NULL,
    "storedPath" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "fileExt" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "fileHash" TEXT NOT NULL,
    "status" "DictionaryImportStatus" NOT NULL DEFAULT 'PENDING',
    "sourceName" TEXT,
    "licence" TEXT,
    "extractedCount" INTEGER NOT NULL DEFAULT 0,
    "entryCount" INTEGER NOT NULL DEFAULT 0,
    "senseCount" INTEGER NOT NULL DEFAULT 0,
    "duplicateCount" INTEGER NOT NULL DEFAULT 0,
    "assignmentCount" INTEGER NOT NULL DEFAULT 0,
    "parseNotes" TEXT,
    "errorMessage" TEXT,
    "previewJson" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "classifiedAt" TIMESTAMP(3),
    CONSTRAINT "DictionaryImportBatch_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "DictionaryImportBatch_adminId_createdAt_idx" ON "DictionaryImportBatch"("adminId", "createdAt");
CREATE INDEX "DictionaryImportBatch_fileHash_idx" ON "DictionaryImportBatch"("fileHash");
CREATE INDEX "DictionaryImportBatch_status_idx" ON "DictionaryImportBatch"("status");
ALTER TABLE "DictionaryImportBatch" ADD CONSTRAINT "DictionaryImportBatch_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- DictionaryEntry
CREATE TABLE "DictionaryEntry" (
    "id" TEXT NOT NULL,
    "normalizedHeadword" TEXT NOT NULL,
    "headword" TEXT NOT NULL,
    "pronunciation" TEXT,
    "audioUrl" TEXT,
    "sourceName" TEXT,
    "licence" TEXT,
    "sourceRef" TEXT,
    "importBatchId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "DictionaryEntry_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "DictionaryEntry_normalizedHeadword_key" ON "DictionaryEntry"("normalizedHeadword");
CREATE INDEX "DictionaryEntry_importBatchId_idx" ON "DictionaryEntry"("importBatchId");
ALTER TABLE "DictionaryEntry" ADD CONSTRAINT "DictionaryEntry_importBatchId_fkey" FOREIGN KEY ("importBatchId") REFERENCES "DictionaryImportBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- DictionarySense
CREATE TABLE "DictionarySense" (
    "id" TEXT NOT NULL,
    "entryId" TEXT NOT NULL,
    "senseIndex" INTEGER NOT NULL DEFAULT 0,
    "definition" TEXT NOT NULL,
    "wordType" TEXT,
    "synonymsJson" TEXT,
    "antonymsJson" TEXT,
    "examplesJson" TEXT,
    "relationsJson" TEXT,
    "rawPayloadJson" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "DictionarySense_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "DictionarySense_entryId_senseIndex_key" ON "DictionarySense"("entryId", "senseIndex");
CREATE INDEX "DictionarySense_entryId_idx" ON "DictionarySense"("entryId");
ALTER TABLE "DictionarySense" ADD CONSTRAINT "DictionarySense_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "DictionaryEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "VocabularyWord" ADD CONSTRAINT "VocabularyWord_dictionarySenseId_fkey" FOREIGN KEY ("dictionarySenseId") REFERENCES "DictionarySense"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- VocabularyGradeAssignment
CREATE TABLE "VocabularyGradeAssignment" (
    "id" TEXT NOT NULL,
    "senseId" TEXT NOT NULL,
    "gradeId" TEXT NOT NULL,
    "levelId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "status" "VocabAssignmentStatus" NOT NULL DEFAULT 'PENDING',
    "difficultyScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "confidenceScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "explanation" TEXT NOT NULL,
    "classificationVersion" TEXT NOT NULL,
    "publishedWordId" TEXT,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "VocabularyGradeAssignment_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "VocabularyGradeAssignment_senseId_gradeId_categoryId_key" ON "VocabularyGradeAssignment"("senseId", "gradeId", "categoryId");
CREATE INDEX "VocabularyGradeAssignment_status_confidenceScore_idx" ON "VocabularyGradeAssignment"("status", "confidenceScore");
CREATE INDEX "VocabularyGradeAssignment_gradeId_status_idx" ON "VocabularyGradeAssignment"("gradeId", "status");
CREATE INDEX "VocabularyGradeAssignment_categoryId_status_idx" ON "VocabularyGradeAssignment"("categoryId", "status");
ALTER TABLE "VocabularyGradeAssignment" ADD CONSTRAINT "VocabularyGradeAssignment_senseId_fkey" FOREIGN KEY ("senseId") REFERENCES "DictionarySense"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "VocabularyGradeAssignment" ADD CONSTRAINT "VocabularyGradeAssignment_gradeId_fkey" FOREIGN KEY ("gradeId") REFERENCES "LearningGrade"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "VocabularyGradeAssignment" ADD CONSTRAINT "VocabularyGradeAssignment_levelId_fkey" FOREIGN KEY ("levelId") REFERENCES "LearningLevel"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "VocabularyGradeAssignment" ADD CONSTRAINT "VocabularyGradeAssignment_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "LearningCategory"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "VocabularyGradeAssignment" ADD CONSTRAINT "VocabularyGradeAssignment_publishedWordId_fkey" FOREIGN KEY ("publishedWordId") REFERENCES "VocabularyWord"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "VocabularyGradeAssignment" ADD CONSTRAINT "VocabularyGradeAssignment_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Seed four grades + link LEVEL_1…4
INSERT INTO "LearningGrade" ("id", "code", "label", "ageMin", "ageMax", "sortOrder") VALUES
  ('grade_seed_1', 'GRADE_1', 'Grade 1', 1, 3, 1),
  ('grade_seed_2', 'GRADE_2', 'Grade 2', 4, 6, 2),
  ('grade_seed_3', 'GRADE_3', 'Grade 3', 7, 9, 3),
  ('grade_seed_4', 'GRADE_4', 'Grade 4', 10, 12, 4);

UPDATE "LearningLevel" SET "gradeId" = 'grade_seed_1', "ageMin" = 1, "ageMax" = 3, "kind" = 'GRADE_BAND', "label" = 'Level 1 – Ages 1–3 (Grade 1)' WHERE "code" = 'LEVEL_1';
UPDATE "LearningLevel" SET "gradeId" = 'grade_seed_2', "ageMin" = 4, "ageMax" = 6, "kind" = 'GRADE_BAND', "label" = 'Level 2 – Ages 4–6 (Grade 2)' WHERE "code" = 'LEVEL_2';
UPDATE "LearningLevel" SET "gradeId" = 'grade_seed_3', "ageMin" = 7, "ageMax" = 9, "kind" = 'GRADE_BAND', "label" = 'Level 3 – Ages 7–9 (Grade 3)' WHERE "code" = 'LEVEL_3';
UPDATE "LearningLevel" SET "gradeId" = 'grade_seed_4', "ageMin" = 10, "ageMax" = 12, "kind" = 'GRADE_BAND', "label" = 'Level 4 – Ages 10–12 (Grade 4)' WHERE "code" = 'LEVEL_4';
