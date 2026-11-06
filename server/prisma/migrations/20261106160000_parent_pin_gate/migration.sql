-- Additive Parent PIN gate (no data loss).
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "parentPinHash" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "parentPinUpdatedAt" TIMESTAMP(3);
