-- AlterEnum VocabAssignmentStatus: add DRAFT, UNPUBLISHED
ALTER TYPE "VocabAssignmentStatus" ADD VALUE IF NOT EXISTS 'DRAFT';
ALTER TYPE "VocabAssignmentStatus" ADD VALUE IF NOT EXISTS 'UNPUBLISHED';

-- CreateEnum DictionaryPublishAction
DO $$ BEGIN
  CREATE TYPE "DictionaryPublishAction" AS ENUM ('PUBLISH', 'UNPUBLISH');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- DictionaryImportBatch preview/confirm fields
ALTER TABLE "DictionaryImportBatch" ADD COLUMN IF NOT EXISTS "errorReportJson" TEXT;
ALTER TABLE "DictionaryImportBatch" ADD COLUMN IF NOT EXISTS "confirmedAt" TIMESTAMP(3);

-- Assignment-level overrides (never mutate DictionarySense.definition)
ALTER TABLE "VocabularyGradeAssignment" ADD COLUMN IF NOT EXISTS "meaningOverride" TEXT;
ALTER TABLE "VocabularyGradeAssignment" ADD COLUMN IF NOT EXISTS "exampleOverride" TEXT;
ALTER TABLE "VocabularyGradeAssignment" ADD COLUMN IF NOT EXISTS "difficultyOverride" INTEGER;

-- Audit log
CREATE TABLE IF NOT EXISTS "DictionaryPublishEvent" (
    "id" TEXT NOT NULL,
    "assignmentId" TEXT NOT NULL,
    "wordId" TEXT,
    "action" "DictionaryPublishAction" NOT NULL,
    "actorId" TEXT NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DictionaryPublishEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "DictionaryPublishEvent_assignmentId_createdAt_idx" ON "DictionaryPublishEvent"("assignmentId", "createdAt");
CREATE INDEX IF NOT EXISTS "DictionaryPublishEvent_actorId_createdAt_idx" ON "DictionaryPublishEvent"("actorId", "createdAt");
CREATE INDEX IF NOT EXISTS "DictionaryPublishEvent_action_createdAt_idx" ON "DictionaryPublishEvent"("action", "createdAt");

DO $$ BEGIN
  ALTER TABLE "DictionaryPublishEvent" ADD CONSTRAINT "DictionaryPublishEvent_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "VocabularyGradeAssignment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "DictionaryPublishEvent" ADD CONSTRAINT "DictionaryPublishEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
