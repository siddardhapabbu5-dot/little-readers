-- CreateEnum
CREATE TYPE "VocabPublisherRunStatus" AS ENUM ('RUNNING', 'PAUSED', 'STOPPED');

-- CreateEnum
CREATE TYPE "VocabPublishJobStatus" AS ENUM ('PENDING', 'CLAIMED', 'SUCCEEDED', 'FAILED', 'CANCELLED');

-- CreateTable
CREATE TABLE "VocabPublisherConfig" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Kolkata',
    "publishHour" INTEGER NOT NULL DEFAULT 6,
    "publishMinute" INTEGER NOT NULL DEFAULT 0,
    "status" "VocabPublisherRunStatus" NOT NULL DEFAULT 'RUNNING',
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedById" TEXT,

    CONSTRAINT "VocabPublisherConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VocabPublishJob" (
    "id" TEXT NOT NULL,
    "dayId" TEXT NOT NULL,
    "programmeId" TEXT NOT NULL,
    "dueDate" DATE NOT NULL,
    "status" "VocabPublishJobStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 5,
    "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastError" TEXT,
    "claimedAt" TIMESTAMP(3),
    "claimedBy" TEXT,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VocabPublishJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdminAlert" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "programmeId" TEXT,
    "dayId" TEXT,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT,

    CONSTRAINT "AdminAlert_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "VocabPublishJob_dayId_key" ON "VocabPublishJob"("dayId");

-- CreateIndex
CREATE INDEX "VocabPublishJob_status_nextAttemptAt_idx" ON "VocabPublishJob"("status", "nextAttemptAt");

-- CreateIndex
CREATE INDEX "VocabPublishJob_programmeId_status_idx" ON "VocabPublishJob"("programmeId", "status");

-- CreateIndex
CREATE INDEX "VocabPublishJob_dueDate_status_idx" ON "VocabPublishJob"("dueDate", "status");

-- CreateIndex
CREATE INDEX "AdminAlert_isRead_createdAt_idx" ON "AdminAlert"("isRead", "createdAt");

-- CreateIndex
CREATE INDEX "AdminAlert_type_createdAt_idx" ON "AdminAlert"("type", "createdAt");

-- AddForeignKey
ALTER TABLE "VocabPublisherConfig" ADD CONSTRAINT "VocabPublisherConfig_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VocabPublishJob" ADD CONSTRAINT "VocabPublishJob_dayId_fkey" FOREIGN KEY ("dayId") REFERENCES "VocabProgrammeDay"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdminAlert" ADD CONSTRAINT "AdminAlert_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Seed default publisher config
INSERT INTO "VocabPublisherConfig" ("id", "timezone", "publishHour", "publishMinute", "status", "updatedAt")
VALUES ('default', 'Asia/Kolkata', 6, 0, 'RUNNING', CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;
