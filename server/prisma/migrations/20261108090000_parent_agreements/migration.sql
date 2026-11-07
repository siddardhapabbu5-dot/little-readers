-- AlterEnum
ALTER TYPE "ConsentType" ADD VALUE IF NOT EXISTS 'SUBSCRIPTION_TERMS';
ALTER TYPE "ConsentType" ADD VALUE IF NOT EXISTS 'MARKETING';
ALTER TYPE "PolicyDocumentType" ADD VALUE IF NOT EXISTS 'SUBSCRIPTION_REFUND';

-- CreateTable
CREATE TABLE "PolicyDocumentVersion" (
    "id" TEXT NOT NULL,
    "type" "PolicyDocumentType" NOT NULL,
    "version" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "effectiveDate" TIMESTAMP(3) NOT NULL,
    "requiresReacceptance" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "fileName" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "fileSha256" TEXT NOT NULL,
    "fileData" BYTEA NOT NULL,
    "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "publishedByUserId" TEXT,

    CONSTRAINT "PolicyDocumentVersion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PolicyDocumentVersion_type_version_key" ON "PolicyDocumentVersion"("type", "version");
CREATE INDEX "PolicyDocumentVersion_type_publishedAt_idx" ON "PolicyDocumentVersion"("type", "publishedAt");

-- AlterTable
ALTER TABLE "ParentalConsent" ADD COLUMN "policyVersionId" TEXT;
ALTER TABLE "ParentalConsent" ADD COLUMN "source" TEXT;
CREATE INDEX "ParentalConsent_policyVersionId_idx" ON "ParentalConsent"("policyVersionId");
ALTER TABLE "ParentalConsent" ADD CONSTRAINT "ParentalConsent_policyVersionId_fkey" FOREIGN KEY ("policyVersionId") REFERENCES "PolicyDocumentVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "Payment" ADD COLUMN "receiptNumber" TEXT;
CREATE UNIQUE INDEX "Payment_receiptNumber_key" ON "Payment"("receiptNumber");
