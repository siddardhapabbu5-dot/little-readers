ALTER TABLE "VocabularyWord" ADD COLUMN IF NOT EXISTS "firstLetter" TEXT NOT NULL DEFAULT '';
ALTER TABLE "VocabularyWord" ADD COLUMN IF NOT EXISTS "difficulty" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "VocabularyWord" ADD COLUMN IF NOT EXISTS "isActive" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "VocabularyWord" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
UPDATE "VocabularyWord" SET "firstLetter" = UPPER(LEFT("text", 1)) WHERE "firstLetter" = '';
CREATE INDEX IF NOT EXISTS "VocabularyWord_isActive_categoryId_idx" ON "VocabularyWord"("isActive", "categoryId");
CREATE INDEX IF NOT EXISTS "VocabularyWord_firstLetter_idx" ON "VocabularyWord"("firstLetter");