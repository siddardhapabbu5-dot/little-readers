import fs from "node:fs";
import path from "node:path";

const dir = path.resolve(
  "prisma/migrations/20261104120000_device_subscription_enforcement"
);
fs.mkdirSync(dir, { recursive: true });

const sql = `-- AlterEnum SubscriptionStatus
ALTER TYPE "SubscriptionStatus" ADD VALUE IF NOT EXISTS 'TRIALING';
ALTER TYPE "SubscriptionStatus" ADD VALUE IF NOT EXISTS 'PAST_DUE';
ALTER TYPE "SubscriptionStatus" ADD VALUE IF NOT EXISTS 'SUSPENDED';
ALTER TYPE "SubscriptionStatus" ADD VALUE IF NOT EXISTS 'GRACE';

-- AlterTable Subscription
ALTER TABLE "Subscription" ADD COLUMN IF NOT EXISTS "graceEndsAt" TIMESTAMP(3);

-- CreateTable StudentDevice
CREATE TABLE "StudentDevice" (
    "id" TEXT NOT NULL,
    "childId" TEXT NOT NULL,
    "installationId" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "deviceLabel" TEXT,
    "appVersion" TEXT,
    "registeredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "StudentDevice_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "StudentDevice_childId_key" ON "StudentDevice"("childId");
CREATE UNIQUE INDEX "StudentDevice_installationId_childId_key" ON "StudentDevice"("installationId", "childId");
CREATE INDEX "StudentDevice_installationId_idx" ON "StudentDevice"("installationId");
CREATE INDEX "StudentDevice_isActive_idx" ON "StudentDevice"("isActive");

ALTER TABLE "StudentDevice" ADD CONSTRAINT "StudentDevice_childId_fkey" FOREIGN KEY ("childId") REFERENCES "Child"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable DeviceTransferEvent
CREATE TABLE "DeviceTransferEvent" (
    "id" TEXT NOT NULL,
    "childId" TEXT NOT NULL,
    "approvedByUserId" TEXT NOT NULL,
    "previousInstallationId" TEXT,
    "newInstallationId" TEXT,
    "reason" TEXT,
    "action" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DeviceTransferEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "DeviceTransferEvent_childId_createdAt_idx" ON "DeviceTransferEvent"("childId", "createdAt");
CREATE INDEX "DeviceTransferEvent_approvedByUserId_idx" ON "DeviceTransferEvent"("approvedByUserId");

ALTER TABLE "DeviceTransferEvent" ADD CONSTRAINT "DeviceTransferEvent_childId_fkey" FOREIGN KEY ("childId") REFERENCES "Child"("id") ON DELETE CASCADE ON UPDATE CASCADE;
`;

fs.writeFileSync(path.join(dir, "migration.sql"), sql, { encoding: "utf8" });
console.log("Wrote", path.join(dir, "migration.sql"));
