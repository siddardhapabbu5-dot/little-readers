-- Batch 7: Lesson management — VocabularyWord links, placement, child progress, session.lessonId

ALTER TABLE "Lesson" ADD COLUMN IF NOT EXISTS "gradeId" TEXT;
ALTER TABLE "Lesson" ADD COLUMN IF NOT EXISTS "groupId" TEXT;
ALTER TABLE "Lesson" ADD COLUMN IF NOT EXISTS "learningCategoryId" TEXT;
ALTER TABLE "Lesson" ADD COLUMN IF NOT EXISTS "isActive" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Lesson" ADD COLUMN IF NOT EXISTS "activitiesJson" TEXT NOT NULL DEFAULT '["LISTEN","SPELL"]';

CREATE TABLE IF NOT EXISTS "LessonVocabItem" (
    "id" TEXT NOT NULL,
    "lessonId" TEXT NOT NULL,
    "vocabularyWordId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "LessonVocabItem_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "LessonVocabItem_lessonId_vocabularyWordId_key"
  ON "LessonVocabItem"("lessonId", "vocabularyWordId");
CREATE INDEX IF NOT EXISTS "LessonVocabItem_lessonId_sortOrder_idx"
  ON "LessonVocabItem"("lessonId", "sortOrder");

CREATE TABLE IF NOT EXISTS "ChildLessonProgress" (
    "id" TEXT NOT NULL,
    "childId" TEXT NOT NULL,
    "lessonId" TEXT NOT NULL,
    "completed" BOOLEAN NOT NULL DEFAULT false,
    "points" INTEGER NOT NULL DEFAULT 0,
    "stars" INTEGER NOT NULL DEFAULT 0,
    "wordsLearned" INTEGER NOT NULL DEFAULT 0,
    "listenCorrect" INTEGER NOT NULL DEFAULT 0,
    "spellCorrect" INTEGER NOT NULL DEFAULT 0,
    "minutesLearned" INTEGER NOT NULL DEFAULT 0,
    "lastPlayedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ChildLessonProgress_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ChildLessonProgress_childId_lessonId_key"
  ON "ChildLessonProgress"("childId", "lessonId");
CREATE INDEX IF NOT EXISTS "ChildLessonProgress_childId_idx" ON "ChildLessonProgress"("childId");
CREATE INDEX IF NOT EXISTS "ChildLessonProgress_lessonId_idx" ON "ChildLessonProgress"("lessonId");

ALTER TABLE "LearningSession" ADD COLUMN IF NOT EXISTS "lessonId" TEXT;

CREATE INDEX IF NOT EXISTS "Lesson_isActive_isPublished_idx" ON "Lesson"("isActive", "isPublished");
CREATE INDEX IF NOT EXISTS "Lesson_learningCategoryId_idx" ON "Lesson"("learningCategoryId");
CREATE INDEX IF NOT EXISTS "Lesson_gradeId_levelId_idx" ON "Lesson"("gradeId", "levelId");
CREATE INDEX IF NOT EXISTS "LearningSession_lessonId_childId_status_idx"
  ON "LearningSession"("lessonId", "childId", "status");

DO $$ BEGIN
  ALTER TABLE "Lesson" ADD CONSTRAINT "Lesson_gradeId_fkey"
    FOREIGN KEY ("gradeId") REFERENCES "LearningGrade"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "Lesson" ADD CONSTRAINT "Lesson_groupId_fkey"
    FOREIGN KEY ("groupId") REFERENCES "LearningGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "Lesson" ADD CONSTRAINT "Lesson_learningCategoryId_fkey"
    FOREIGN KEY ("learningCategoryId") REFERENCES "LearningCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "LessonVocabItem" ADD CONSTRAINT "LessonVocabItem_lessonId_fkey"
    FOREIGN KEY ("lessonId") REFERENCES "Lesson"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "LessonVocabItem" ADD CONSTRAINT "LessonVocabItem_vocabularyWordId_fkey"
    FOREIGN KEY ("vocabularyWordId") REFERENCES "VocabularyWord"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "ChildLessonProgress" ADD CONSTRAINT "ChildLessonProgress_childId_fkey"
    FOREIGN KEY ("childId") REFERENCES "Child"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "ChildLessonProgress" ADD CONSTRAINT "ChildLessonProgress_lessonId_fkey"
    FOREIGN KEY ("lessonId") REFERENCES "Lesson"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "LearningSession" ADD CONSTRAINT "LearningSession_lessonId_fkey"
    FOREIGN KEY ("lessonId") REFERENCES "Lesson"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
