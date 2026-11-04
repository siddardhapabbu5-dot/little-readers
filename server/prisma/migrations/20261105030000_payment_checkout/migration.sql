-- Batch 10: Razorpay checkout fields on Payment

DO $$ BEGIN
  CREATE TYPE "PaymentPurpose" AS ENUM ('FAMILY_MONTHLY', 'FAMILY_YEARLY', 'EXTRA_SEATS', 'MANUAL_ADMIN');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "purpose" "PaymentPurpose" NOT NULL DEFAULT 'MANUAL_ADMIN';
ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "seatsPurchased" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "planCode" TEXT;
ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "razorpayOrderId" TEXT;
ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "razorpayPaymentId" TEXT;
ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "rawEventId" TEXT;
ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "metadataJson" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "Payment_rawEventId_key" ON "Payment"("rawEventId");
CREATE INDEX IF NOT EXISTS "Payment_razorpayOrderId_idx" ON "Payment"("razorpayOrderId");
CREATE INDEX IF NOT EXISTS "Payment_status_purpose_idx" ON "Payment"("status", "purpose");
