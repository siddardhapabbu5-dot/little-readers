-- Challenge World: leaderboard privacy fields, points ledger, friends, classroom challenges.
-- Additive only: no existing rows, progress, certificates, subscriptions or rewards are changed.

-- AlterTable
ALTER TABLE "Child" ADD COLUMN     "globalConsentAt" TIMESTAMP(3),
ADD COLUMN     "globalLeaderboardOptIn" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "leaderboardNickname" TEXT,
ADD COLUMN     "nicknameHidden" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "PointsTransaction" (
    "id" TEXT NOT NULL,
    "childId" TEXT NOT NULL,
    "sessionId" TEXT,
    "source" TEXT NOT NULL,
    "categoryId" TEXT,
    "points" INTEGER NOT NULL,
    "weekStart" TIMESTAMP(3) NOT NULL,
    "dayKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PointsTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WeeklyRanking" (
    "id" TEXT NOT NULL,
    "weekStart" TIMESTAMP(3) NOT NULL,
    "childId" TEXT NOT NULL,
    "nickname" TEXT NOT NULL,
    "points" INTEGER NOT NULL,
    "rank" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WeeklyRanking_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FriendConnection" (
    "id" TEXT NOT NULL,
    "childId" TEXT NOT NULL,
    "friendChildId" TEXT,
    "inviteCode" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'INVITED',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FriendConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClassroomChallenge" (
    "id" TEXT NOT NULL,
    "classroomId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "weekStart" TIMESTAMP(3) NOT NULL,
    "goalPoints" INTEGER NOT NULL DEFAULT 100,
    "childIds" TEXT[],
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClassroomChallenge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeaderboardReport" (
    "id" TEXT NOT NULL,
    "childId" TEXT NOT NULL,
    "reporterUserId" TEXT NOT NULL,
    "reason" TEXT,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "LeaderboardReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompetitionConfig" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "globalEnabled" BOOLEAN NOT NULL DEFAULT true,
    "friendsEnabled" BOOLEAN NOT NULL DEFAULT true,
    "classroomEnabled" BOOLEAN NOT NULL DEFAULT true,
    "pointsJson" TEXT,
    "goalsJson" TEXT,
    "lastFinalizedWeek" TIMESTAMP(3),
    "updatedById" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompetitionConfig_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PointsTransaction_weekStart_childId_idx" ON "PointsTransaction"("weekStart", "childId");

-- CreateIndex
CREATE INDEX "PointsTransaction_childId_createdAt_idx" ON "PointsTransaction"("childId", "createdAt");

-- CreateIndex
CREATE INDEX "PointsTransaction_childId_source_dayKey_idx" ON "PointsTransaction"("childId", "source", "dayKey");

-- CreateIndex
CREATE UNIQUE INDEX "PointsTransaction_sessionId_source_key" ON "PointsTransaction"("sessionId", "source");

-- CreateIndex
CREATE INDEX "WeeklyRanking_weekStart_rank_idx" ON "WeeklyRanking"("weekStart", "rank");

-- CreateIndex
CREATE UNIQUE INDEX "WeeklyRanking_weekStart_childId_key" ON "WeeklyRanking"("weekStart", "childId");

-- CreateIndex
CREATE UNIQUE INDEX "FriendConnection_inviteCode_key" ON "FriendConnection"("inviteCode");

-- CreateIndex
CREATE INDEX "FriendConnection_childId_status_idx" ON "FriendConnection"("childId", "status");

-- CreateIndex
CREATE INDEX "FriendConnection_friendChildId_status_idx" ON "FriendConnection"("friendChildId", "status");

-- CreateIndex
CREATE INDEX "ClassroomChallenge_weekStart_idx" ON "ClassroomChallenge"("weekStart");

-- CreateIndex
CREATE UNIQUE INDEX "ClassroomChallenge_classroomId_weekStart_key" ON "ClassroomChallenge"("classroomId", "weekStart");

-- CreateIndex
CREATE INDEX "LeaderboardReport_status_idx" ON "LeaderboardReport"("status");

-- CreateIndex
CREATE UNIQUE INDEX "LeaderboardReport_childId_reporterUserId_key" ON "LeaderboardReport"("childId", "reporterUserId");

-- AddForeignKey
ALTER TABLE "PointsTransaction" ADD CONSTRAINT "PointsTransaction_childId_fkey" FOREIGN KEY ("childId") REFERENCES "Child"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WeeklyRanking" ADD CONSTRAINT "WeeklyRanking_childId_fkey" FOREIGN KEY ("childId") REFERENCES "Child"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FriendConnection" ADD CONSTRAINT "FriendConnection_childId_fkey" FOREIGN KEY ("childId") REFERENCES "Child"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FriendConnection" ADD CONSTRAINT "FriendConnection_friendChildId_fkey" FOREIGN KEY ("friendChildId") REFERENCES "Child"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClassroomChallenge" ADD CONSTRAINT "ClassroomChallenge_classroomId_fkey" FOREIGN KEY ("classroomId") REFERENCES "Classroom"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaderboardReport" ADD CONSTRAINT "LeaderboardReport_childId_fkey" FOREIGN KEY ("childId") REFERENCES "Child"("id") ON DELETE CASCADE ON UPDATE CASCADE;
