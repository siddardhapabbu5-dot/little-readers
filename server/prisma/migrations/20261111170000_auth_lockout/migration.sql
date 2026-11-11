-- T-SEC-04 / T-SEC-06: server-side lockout for passwords and Parent PINs (additive only).
ALTER TABLE "User" ADD COLUMN "failedLoginCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "User" ADD COLUMN "loginLockedUntil" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN "parentPinFailedCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "User" ADD COLUMN "parentPinLockedUntil" TIMESTAMP(3);
