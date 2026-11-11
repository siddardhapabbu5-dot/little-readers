-- Grade-wise entitlement (additive, nullable). Existing rows keep NULL = legacy family access.
ALTER TABLE "Subscription" ADD COLUMN "childId" TEXT;
ALTER TABLE "Subscription" ADD COLUMN "levelId" TEXT;

CREATE INDEX "Subscription_childId_levelId_idx" ON "Subscription"("childId", "levelId");

ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_childId_fkey" FOREIGN KEY ("childId") REFERENCES "Child"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_levelId_fkey" FOREIGN KEY ("levelId") REFERENCES "LearningLevel"("id") ON DELETE SET NULL ON UPDATE CASCADE;
