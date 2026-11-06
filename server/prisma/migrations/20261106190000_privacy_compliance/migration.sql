-- Privacy & Compliance module (local/staging only until explicitly approved).
-- Does not modify learning, payment, or student history tables.

CREATE TYPE "PrivacyPolicyStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');
CREATE TYPE "PrivacyRequestStatus" AS ENUM ('SUBMITTED', 'UNDER_REVIEW', 'RESOLVED', 'CLOSED');
CREATE TYPE "PrivacyRequestType" AS ENUM ('ACCOUNT_DELETION', 'DATA_ACCESS', 'OTHER');

CREATE TABLE "PrivacyPolicy" (
    "id" TEXT NOT NULL,
    "status" "PrivacyPolicyStatus" NOT NULL DEFAULT 'DRAFT',
    "version" TEXT NOT NULL DEFAULT '0.0.0-draft',
    "title" TEXT NOT NULL DEFAULT '',
    "content" TEXT NOT NULL DEFAULT '',
    "effectiveDate" TIMESTAMP(3),
    "publicUrl" TEXT,
    "legalBusinessName" TEXT,
    "businessAddress" TEXT,
    "country" TEXT,
    "supportEmail" TEXT,
    "supportPhone" TEXT,
    "dataRetentionInfo" TEXT,
    "deletionRequestContact" TEXT,
    "parentalConsentExplanation" TEXT,
    "childDataDisclosure" TEXT,
    "learningDataDisclosure" TEXT,
    "deviceDataDisclosure" TEXT,
    "thirdPartyDisclosure" TEXT,
    "publishedAt" TIMESTAMP(3),
    "publishedByUserId" TEXT,
    "createdByUserId" TEXT,
    "updatedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PrivacyPolicy_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PrivacyDataRequest" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "requesterEmail" TEXT NOT NULL,
    "requesterName" TEXT,
    "requestType" "PrivacyRequestType" NOT NULL DEFAULT 'ACCOUNT_DELETION',
    "message" TEXT NOT NULL,
    "status" "PrivacyRequestStatus" NOT NULL DEFAULT 'SUBMITTED',
    "adminNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "PrivacyDataRequest_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PrivacyPolicy_status_updatedAt_idx" ON "PrivacyPolicy"("status", "updatedAt");
CREATE INDEX "PrivacyPolicy_version_idx" ON "PrivacyPolicy"("version");
CREATE INDEX "PrivacyDataRequest_status_createdAt_idx" ON "PrivacyDataRequest"("status", "createdAt");
CREATE INDEX "PrivacyDataRequest_requesterEmail_idx" ON "PrivacyDataRequest"("requesterEmail");
CREATE INDEX "PrivacyDataRequest_userId_idx" ON "PrivacyDataRequest"("userId");

ALTER TABLE "PrivacyPolicy" ADD CONSTRAINT "PrivacyPolicy_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PrivacyPolicy" ADD CONSTRAINT "PrivacyPolicy_updatedByUserId_fkey" FOREIGN KEY ("updatedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PrivacyPolicy" ADD CONSTRAINT "PrivacyPolicy_publishedByUserId_fkey" FOREIGN KEY ("publishedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PrivacyDataRequest" ADD CONSTRAINT "PrivacyDataRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
