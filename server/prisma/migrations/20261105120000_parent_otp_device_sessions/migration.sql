-- Phase 9: Parent OTP + single active device sessions

CREATE TYPE "ParentSessionStatus" AS ENUM ('ACTIVE', 'REVOKED', 'EXPIRED');

ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "mobileE164" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "User_mobileE164_key" ON "User"("mobileE164");
CREATE INDEX IF NOT EXISTS "User_mobileE164_idx" ON "User"("mobileE164");

CREATE TABLE IF NOT EXISTS "ParentOtpVerification" (
    "id" TEXT NOT NULL,
    "parentId" TEXT,
    "mobileE164" TEXT NOT NULL,
    "otpHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "verifiedAt" TIMESTAMP(3),
    "consumedAt" TIMESTAMP(3),
    "invalidatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ParentOtpVerification_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ParentOtpVerification_mobileE164_createdAt_idx"
  ON "ParentOtpVerification"("mobileE164", "createdAt");
CREATE INDEX IF NOT EXISTS "ParentOtpVerification_parentId_idx"
  ON "ParentOtpVerification"("parentId");
CREATE INDEX IF NOT EXISTS "ParentOtpVerification_expiresAt_idx"
  ON "ParentOtpVerification"("expiresAt");

ALTER TABLE "ParentOtpVerification"
  ADD CONSTRAINT "ParentOtpVerification_parentId_fkey"
  FOREIGN KEY ("parentId") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS "ParentDeviceSession" (
    "id" TEXT NOT NULL,
    "parentId" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "deviceName" TEXT,
    "platform" TEXT NOT NULL,
    "appVersion" TEXT,
    "refreshTokenHash" TEXT NOT NULL,
    "status" "ParentSessionStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "revokedReason" TEXT,

    CONSTRAINT "ParentDeviceSession_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ParentDeviceSession_parentId_status_idx"
  ON "ParentDeviceSession"("parentId", "status");
CREATE INDEX IF NOT EXISTS "ParentDeviceSession_deviceId_idx"
  ON "ParentDeviceSession"("deviceId");
CREATE INDEX IF NOT EXISTS "ParentDeviceSession_expiresAt_idx"
  ON "ParentDeviceSession"("expiresAt");

ALTER TABLE "ParentDeviceSession"
  ADD CONSTRAINT "ParentDeviceSession_parentId_fkey"
  FOREIGN KEY ("parentId") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- At most one ACTIVE session per parent (PostgreSQL partial unique index).
CREATE UNIQUE INDEX IF NOT EXISTS "ParentDeviceSession_one_active_per_parent"
  ON "ParentDeviceSession"("parentId")
  WHERE "status" = 'ACTIVE';
