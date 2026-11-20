-- Additive: Admin shared-email OTP purpose + credential metadata.
-- Does not modify existing Student/Parent/Admin rows or subscriptions.

-- Postgres: enum ADD VALUE cannot run inside a transaction block on some versions.
ALTER TYPE "EmailOtpPurpose" ADD VALUE 'ADMIN_SHARED_STUDENT_CREATE';

ALTER TABLE "ChildStudentCredential"
  ADD COLUMN IF NOT EXISTS "accountCreationMethod" TEXT,
  ADD COLUMN IF NOT EXISTS "verificationReference" TEXT;

CREATE INDEX IF NOT EXISTS "ChildStudentCredential_accountCreationMethod_idx"
  ON "ChildStudentCredential"("accountCreationMethod");
