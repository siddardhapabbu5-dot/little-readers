-- Architecture B: Student ID credentials + latest-login-wins student sessions

-- Email OTP purpose for Option A self-registration
ALTER TYPE "EmailOtpPurpose" ADD VALUE IF NOT EXISTS 'STUDENT_SELF_REGISTER';

CREATE TABLE IF NOT EXISTS "ChildStudentCredential" (
    "id" TEXT NOT NULL,
    "childId" TEXT NOT NULL,
    "studentLoginId" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "emailVerifiedAt" TIMESTAMP(3),
    "registrationEmail" TEXT,
    "mustChangePassword" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "failedLoginCount" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" TIMESTAMP(3),
    "passwordChangedAt" TIMESTAMP(3),
    "lastLoginAt" TIMESTAMP(3),
    "sessionVersion" INTEGER NOT NULL DEFAULT 0,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChildStudentCredential_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ChildStudentCredential_childId_key" ON "ChildStudentCredential"("childId");
CREATE UNIQUE INDEX IF NOT EXISTS "ChildStudentCredential_studentLoginId_key" ON "ChildStudentCredential"("studentLoginId");
CREATE INDEX IF NOT EXISTS "ChildStudentCredential_isActive_idx" ON "ChildStudentCredential"("isActive");
CREATE INDEX IF NOT EXISTS "ChildStudentCredential_createdByUserId_idx" ON "ChildStudentCredential"("createdByUserId");

ALTER TABLE "ChildStudentCredential"
  ADD CONSTRAINT "ChildStudentCredential_childId_fkey"
  FOREIGN KEY ("childId") REFERENCES "Child"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ChildStudentCredential"
  ADD CONSTRAINT "ChildStudentCredential_createdByUserId_fkey"
  FOREIGN KEY ("createdByUserId") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS "ChildStudentSession" (
    "id" TEXT NOT NULL,
    "credentialId" TEXT NOT NULL,
    "childId" TEXT NOT NULL,
    "deviceInstallationId" TEXT NOT NULL,
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

    CONSTRAINT "ChildStudentSession_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ChildStudentSession_credentialId_status_idx"
  ON "ChildStudentSession"("credentialId", "status");
CREATE INDEX IF NOT EXISTS "ChildStudentSession_childId_status_idx"
  ON "ChildStudentSession"("childId", "status");
CREATE INDEX IF NOT EXISTS "ChildStudentSession_deviceInstallationId_idx"
  ON "ChildStudentSession"("deviceInstallationId");
CREATE INDEX IF NOT EXISTS "ChildStudentSession_expiresAt_idx"
  ON "ChildStudentSession"("expiresAt");

ALTER TABLE "ChildStudentSession"
  ADD CONSTRAINT "ChildStudentSession_credentialId_fkey"
  FOREIGN KEY ("credentialId") REFERENCES "ChildStudentCredential"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ChildStudentSession"
  ADD CONSTRAINT "ChildStudentSession_childId_fkey"
  FOREIGN KEY ("childId") REFERENCES "Child"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- At most one ACTIVE student session per child (latest-login-wins).
CREATE UNIQUE INDEX IF NOT EXISTS "ChildStudentSession_one_active_per_child"
  ON "ChildStudentSession"("childId")
  WHERE "status" = 'ACTIVE';
