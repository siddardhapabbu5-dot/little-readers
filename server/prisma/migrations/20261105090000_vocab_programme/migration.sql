-- CreateEnum
CREATE TYPE "VocabProgrammeStatus" AS ENUM ('DRAFT', 'APPROVED', 'ACTIVE', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "VocabProgrammeDayStatus" AS ENUM ('SCHEDULED', 'PUBLISHED', 'SKIPPED', 'FAILED');

-- CreateTable
CREATE TABLE "VocabProgramme" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "gradeId" TEXT NOT NULL,
    "startDate" DATE NOT NULL,
    "endDate" DATE NOT NULL,
    "dailyTarget" INTEGER NOT NULL DEFAULT 1,
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Kolkata',
    "status" "VocabProgrammeStatus" NOT NULL DEFAULT 'DRAFT',
    "createdById" TEXT NOT NULL,
    "approvedById" TEXT,
    "activatedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "activatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VocabProgramme_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VocabProgrammeDay" (
    "id" TEXT NOT NULL,
    "programmeId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "status" "VocabProgrammeDayStatus" NOT NULL DEFAULT 'SCHEDULED',
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VocabProgrammeDay_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VocabProgrammeItem" (
    "id" TEXT NOT NULL,
    "dayId" TEXT NOT NULL,
    "vocabularyWordId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "VocabProgrammeItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VocabProgrammePublishLog" (
    "id" TEXT NOT NULL,
    "dayId" TEXT NOT NULL,
    "result" TEXT NOT NULL,
    "error" TEXT,
    "ranAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VocabProgrammePublishLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "VocabProgramme_gradeId_status_idx" ON "VocabProgramme"("gradeId", "status");

-- CreateIndex
CREATE INDEX "VocabProgramme_status_startDate_idx" ON "VocabProgramme"("status", "startDate");

-- CreateIndex
CREATE INDEX "VocabProgrammeDay_programmeId_status_idx" ON "VocabProgrammeDay"("programmeId", "status");

-- CreateIndex
CREATE INDEX "VocabProgrammeDay_date_status_idx" ON "VocabProgrammeDay"("date", "status");

-- CreateIndex
CREATE UNIQUE INDEX "VocabProgrammeDay_programmeId_date_key" ON "VocabProgrammeDay"("programmeId", "date");

-- CreateIndex
CREATE INDEX "VocabProgrammeItem_dayId_sortOrder_idx" ON "VocabProgrammeItem"("dayId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "VocabProgrammeItem_dayId_vocabularyWordId_key" ON "VocabProgrammeItem"("dayId", "vocabularyWordId");

-- CreateIndex
CREATE INDEX "VocabProgrammePublishLog_dayId_ranAt_idx" ON "VocabProgrammePublishLog"("dayId", "ranAt");

-- AddForeignKey
ALTER TABLE "VocabProgramme" ADD CONSTRAINT "VocabProgramme_gradeId_fkey" FOREIGN KEY ("gradeId") REFERENCES "LearningGrade"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VocabProgramme" ADD CONSTRAINT "VocabProgramme_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VocabProgramme" ADD CONSTRAINT "VocabProgramme_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VocabProgramme" ADD CONSTRAINT "VocabProgramme_activatedById_fkey" FOREIGN KEY ("activatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VocabProgrammeDay" ADD CONSTRAINT "VocabProgrammeDay_programmeId_fkey" FOREIGN KEY ("programmeId") REFERENCES "VocabProgramme"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VocabProgrammeItem" ADD CONSTRAINT "VocabProgrammeItem_dayId_fkey" FOREIGN KEY ("dayId") REFERENCES "VocabProgrammeDay"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VocabProgrammeItem" ADD CONSTRAINT "VocabProgrammeItem_vocabularyWordId_fkey" FOREIGN KEY ("vocabularyWordId") REFERENCES "VocabularyWord"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VocabProgrammePublishLog" ADD CONSTRAINT "VocabProgrammePublishLog_dayId_fkey" FOREIGN KEY ("dayId") REFERENCES "VocabProgrammeDay"("id") ON DELETE CASCADE ON UPDATE CASCADE;
