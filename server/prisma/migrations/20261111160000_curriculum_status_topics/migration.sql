-- Curriculum review workflow and topic fields (additive, nullable / defaulted).
CREATE TYPE "CategoryStatus" AS ENUM ('DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'PUBLISHED', 'UNPUBLISHED');

ALTER TABLE "LearningCategory" ADD COLUMN "status" "CategoryStatus" NOT NULL DEFAULT 'DRAFT';
ALTER TABLE "LearningCategory" ADD COLUMN "symbol" TEXT;
ALTER TABLE "LearningCategory" ADD COLUMN "dailyConversation" TEXT;
ALTER TABLE "LearningCategory" ADD COLUMN "exampleSentence" TEXT;
ALTER TABLE "LearningCategory" ADD COLUMN "needsReview" BOOLEAN NOT NULL DEFAULT false;

-- Categories children can already see keep exactly that visibility.
UPDATE "LearningCategory" SET "status" = 'PUBLISHED' WHERE "isPublished" = true;

CREATE INDEX "LearningCategory_status_idx" ON "LearningCategory"("status");

ALTER TABLE "VocabularyWord" ADD COLUMN "exampleSentence" TEXT;
