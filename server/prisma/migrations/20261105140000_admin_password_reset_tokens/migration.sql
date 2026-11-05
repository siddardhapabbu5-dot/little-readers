-- Phase: Admin forgot-password recovery (separate from general PasswordResetToken)

ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "passwordChangedAt" TIMESTAMP(3);

CREATE TABLE IF NOT EXISTS "AdminPasswordResetToken" (
    "id" TEXT NOT NULL,
    "adminId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdminPasswordResetToken_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "AdminPasswordResetToken_tokenHash_key"
  ON "AdminPasswordResetToken"("tokenHash");
CREATE INDEX IF NOT EXISTS "AdminPasswordResetToken_adminId_idx"
  ON "AdminPasswordResetToken"("adminId");
CREATE INDEX IF NOT EXISTS "AdminPasswordResetToken_expiresAt_idx"
  ON "AdminPasswordResetToken"("expiresAt");

ALTER TABLE "AdminPasswordResetToken"
  ADD CONSTRAINT "AdminPasswordResetToken_adminId_fkey"
  FOREIGN KEY ("adminId") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
