-- Dual payment providers (Google Play Billing + Razorpay website). Additive only.

-- AlterTable
ALTER TABLE "Subscription" ADD COLUMN     "acknowledgedAt" TIMESTAMP(3),
ADD COLUMN     "autoRenewing" BOOLEAN,
ADD COLUMN     "countryCode" TEXT,
ADD COLUMN     "productId" TEXT,
ADD COLUMN     "providerToken" TEXT,
ADD COLUMN     "verificationStatus" TEXT,
ADD COLUMN     "verifiedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "SubscriptionAuditEvent" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "subscriptionId" TEXT,
    "paymentId" TEXT,
    "provider" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "providerEventId" TEXT,
    "fromStatus" TEXT,
    "toStatus" TEXT,
    "detailsJson" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SubscriptionAuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SubscriptionAuditEvent_providerEventId_key" ON "SubscriptionAuditEvent"("providerEventId");

-- CreateIndex
CREATE INDEX "SubscriptionAuditEvent_userId_createdAt_idx" ON "SubscriptionAuditEvent"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "SubscriptionAuditEvent_subscriptionId_idx" ON "SubscriptionAuditEvent"("subscriptionId");

-- CreateIndex
CREATE INDEX "Subscription_provider_status_idx" ON "Subscription"("provider", "status");
