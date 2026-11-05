-- Phase 10B: Level/Grade publish + grade ranges; SubscriptionPlan catalog

DO $$ BEGIN
  ALTER TYPE "PaymentPurpose" ADD VALUE 'FAMILY_3_MONTH';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TYPE "PaymentPurpose" ADD VALUE 'FAMILY_6_MONTH';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "LearningGrade" ADD COLUMN IF NOT EXISTS "gradeNumber" INTEGER;
ALTER TABLE "LearningGrade" ADD COLUMN IF NOT EXISTS "assignedLevelId" TEXT;
ALTER TABLE "LearningGrade" ADD COLUMN IF NOT EXISTS "isPublished" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "LearningLevel" ADD COLUMN IF NOT EXISTS "startGrade" INTEGER;
ALTER TABLE "LearningLevel" ADD COLUMN IF NOT EXISTS "endGrade" INTEGER;
ALTER TABLE "LearningLevel" ADD COLUMN IF NOT EXISTS "isPublished" BOOLEAN NOT NULL DEFAULT false;

CREATE UNIQUE INDEX IF NOT EXISTS "LearningGrade_gradeNumber_key"
  ON "LearningGrade"("gradeNumber");
CREATE INDEX IF NOT EXISTS "LearningGrade_assignedLevelId_idx"
  ON "LearningGrade"("assignedLevelId");
CREATE INDEX IF NOT EXISTS "LearningGrade_isActive_isPublished_idx"
  ON "LearningGrade"("isActive", "isPublished");
CREATE INDEX IF NOT EXISTS "LearningLevel_isActive_isPublished_idx"
  ON "LearningLevel"("isActive", "isPublished");

DO $$ BEGIN
  ALTER TABLE "LearningGrade"
    ADD CONSTRAINT "LearningGrade_assignedLevelId_fkey"
    FOREIGN KEY ("assignedLevelId") REFERENCES "LearningLevel"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "SubscriptionPlan" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT,
    "durationMonths" INTEGER NOT NULL,
    "amountPaise" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "applicableLevel" TEXT NOT NULL DEFAULT 'ALL',
    "levelId" TEXT,
    "includedSeats" INTEGER NOT NULL DEFAULT 2,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isPublished" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SubscriptionPlan_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "SubscriptionPlan_code_key" ON "SubscriptionPlan"("code");
CREATE INDEX IF NOT EXISTS "SubscriptionPlan_isActive_isPublished_idx"
  ON "SubscriptionPlan"("isActive", "isPublished");
CREATE INDEX IF NOT EXISTS "SubscriptionPlan_applicableLevel_idx"
  ON "SubscriptionPlan"("applicableLevel");
CREATE INDEX IF NOT EXISTS "SubscriptionPlan_levelId_idx" ON "SubscriptionPlan"("levelId");

DO $$ BEGIN
  ALTER TABLE "SubscriptionPlan"
    ADD CONSTRAINT "SubscriptionPlan_levelId_fkey"
    FOREIGN KEY ("levelId") REFERENCES "LearningLevel"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
