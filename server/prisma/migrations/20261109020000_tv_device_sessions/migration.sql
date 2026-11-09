-- Learn Wise TV: parent-approved TV connections survive API restarts and deploys.
-- Additive only: one new table, no existing rows are changed.

-- CreateTable
CREATE TABLE "TvDeviceSession" (
    "id" TEXT NOT NULL,
    "parentId" TEXT NOT NULL,
    "childId" TEXT NOT NULL,
    "deviceLabel" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "revokedReason" TEXT,

    CONSTRAINT "TvDeviceSession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TvDeviceSession_tokenHash_key" ON "TvDeviceSession"("tokenHash");

-- CreateIndex
CREATE INDEX "TvDeviceSession_parentId_revokedAt_idx" ON "TvDeviceSession"("parentId", "revokedAt");

-- CreateIndex
CREATE INDEX "TvDeviceSession_childId_idx" ON "TvDeviceSession"("childId");

-- CreateIndex
CREATE INDEX "TvDeviceSession_expiresAt_idx" ON "TvDeviceSession"("expiresAt");

-- AddForeignKey
ALTER TABLE "TvDeviceSession" ADD CONSTRAINT "TvDeviceSession_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TvDeviceSession" ADD CONSTRAINT "TvDeviceSession_childId_fkey" FOREIGN KEY ("childId") REFERENCES "Child"("id") ON DELETE CASCADE ON UPDATE CASCADE;
