-- CreateEnum
CREATE TYPE "VocabRound" AS ENUM ('LISTEN', 'SPELL', 'LETTER');

-- CreateEnum
CREATE TYPE "LearningSessionStatus" AS ENUM ('IN_PROGRESS', 'COMPLETED', 'ABANDONED');

-- AlterTable
ALTER TABLE "LearningLevel" ADD COLUMN     "ageMax" INTEGER NOT NULL DEFAULT 12,
ADD COLUMN     "ageMin" INTEGER NOT NULL DEFAULT 3;

-- CreateTable
CREATE TABLE "LearningGroup" (
    "id" TEXT NOT NULL,
    "levelId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LearningGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LearningCategory" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "description" TEXT,
    "emoji" TEXT NOT NULL DEFAULT '📚',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "unlockOrder" INTEGER NOT NULL DEFAULT 0,
    "isPublished" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LearningCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VocabularyWord" (
    "id" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "meaning" TEXT NOT NULL,
    "emoji" TEXT NOT NULL,
    "imageUrl" TEXT,
    "audioUrl" TEXT,
    "phonetic" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VocabularyWord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LearningSession" (
    "id" TEXT NOT NULL,
    "childId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "status" "LearningSessionStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    "listenScore" INTEGER NOT NULL DEFAULT 0,
    "spellScore" INTEGER NOT NULL DEFAULT 0,
    "listenCorrect" INTEGER NOT NULL DEFAULT 0,
    "spellCorrect" INTEGER NOT NULL DEFAULT 0,
    "questionsTotal" INTEGER NOT NULL DEFAULT 0,
    "points" INTEGER NOT NULL DEFAULT 0,
    "stars" INTEGER NOT NULL DEFAULT 0,
    "wordsLearned" INTEGER NOT NULL DEFAULT 0,
    "durationSec" INTEGER NOT NULL DEFAULT 0,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "LearningSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuestionAttempt" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "wordId" TEXT NOT NULL,
    "round" "VocabRound" NOT NULL,
    "isCorrect" BOOLEAN NOT NULL,
    "answerGiven" TEXT,
    "usedClue" BOOLEAN NOT NULL DEFAULT false,
    "pointsAwarded" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QuestionAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChildCategoryProgress" (
    "id" TEXT NOT NULL,
    "childId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "wordsLearned" INTEGER NOT NULL DEFAULT 0,
    "listenCorrect" INTEGER NOT NULL DEFAULT 0,
    "listenAttempts" INTEGER NOT NULL DEFAULT 0,
    "spellCorrect" INTEGER NOT NULL DEFAULT 0,
    "spellAttempts" INTEGER NOT NULL DEFAULT 0,
    "points" INTEGER NOT NULL DEFAULT 0,
    "stars" INTEGER NOT NULL DEFAULT 0,
    "completed" BOOLEAN NOT NULL DEFAULT false,
    "minutesLearned" INTEGER NOT NULL DEFAULT 0,
    "lastPlayedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChildCategoryProgress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Achievement" (
    "id" TEXT NOT NULL,
    "childId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "earnedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Achievement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LearningGroup_levelId_idx" ON "LearningGroup"("levelId");

-- CreateIndex
CREATE UNIQUE INDEX "LearningGroup_levelId_code_key" ON "LearningGroup"("levelId", "code");

-- CreateIndex
CREATE INDEX "LearningCategory_groupId_sortOrder_idx" ON "LearningCategory"("groupId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "LearningCategory_groupId_code_key" ON "LearningCategory"("groupId", "code");

-- CreateIndex
CREATE INDEX "VocabularyWord_categoryId_sortOrder_idx" ON "VocabularyWord"("categoryId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "VocabularyWord_text_key" ON "VocabularyWord"("text");

-- CreateIndex
CREATE INDEX "LearningSession_childId_startedAt_idx" ON "LearningSession"("childId", "startedAt");

-- CreateIndex
CREATE INDEX "LearningSession_categoryId_idx" ON "LearningSession"("categoryId");

-- CreateIndex
CREATE INDEX "QuestionAttempt_sessionId_round_idx" ON "QuestionAttempt"("sessionId", "round");

-- CreateIndex
CREATE INDEX "ChildCategoryProgress_childId_idx" ON "ChildCategoryProgress"("childId");

-- CreateIndex
CREATE UNIQUE INDEX "ChildCategoryProgress_childId_categoryId_key" ON "ChildCategoryProgress"("childId", "categoryId");

-- CreateIndex
CREATE INDEX "Achievement_childId_idx" ON "Achievement"("childId");

-- CreateIndex
CREATE UNIQUE INDEX "Achievement_childId_code_key" ON "Achievement"("childId", "code");

-- AddForeignKey
ALTER TABLE "LearningGroup" ADD CONSTRAINT "LearningGroup_levelId_fkey" FOREIGN KEY ("levelId") REFERENCES "LearningLevel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LearningCategory" ADD CONSTRAINT "LearningCategory_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "LearningGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VocabularyWord" ADD CONSTRAINT "VocabularyWord_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "LearningCategory"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LearningSession" ADD CONSTRAINT "LearningSession_childId_fkey" FOREIGN KEY ("childId") REFERENCES "Child"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LearningSession" ADD CONSTRAINT "LearningSession_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "LearningCategory"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestionAttempt" ADD CONSTRAINT "QuestionAttempt_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "LearningSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestionAttempt" ADD CONSTRAINT "QuestionAttempt_wordId_fkey" FOREIGN KEY ("wordId") REFERENCES "VocabularyWord"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChildCategoryProgress" ADD CONSTRAINT "ChildCategoryProgress_childId_fkey" FOREIGN KEY ("childId") REFERENCES "Child"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChildCategoryProgress" ADD CONSTRAINT "ChildCategoryProgress_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "LearningCategory"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Achievement" ADD CONSTRAINT "Achievement_childId_fkey" FOREIGN KEY ("childId") REFERENCES "Child"("id") ON DELETE CASCADE ON UPDATE CASCADE;
