-- Admin ON/OFF per child activity (missing row = enabled).
CREATE TABLE "ActivitySetting" (
    "code" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "updatedById" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ActivitySetting_pkey" PRIMARY KEY ("code")
);

-- Category completion certificates.
ALTER TABLE "Certificate" ADD COLUMN "categoryId" TEXT;
ALTER TABLE "Certificate" ADD COLUMN "certificateNo" TEXT;
CREATE UNIQUE INDEX "Certificate_certificateNo_key" ON "Certificate"("certificateNo");
CREATE UNIQUE INDEX "Certificate_childId_categoryId_key" ON "Certificate"("childId", "categoryId");

-- Mixed-category sessions (Daily Challenge, Revision World, Mixed Games).
ALTER TABLE "LearningSession" ADD COLUMN "mode" TEXT;
