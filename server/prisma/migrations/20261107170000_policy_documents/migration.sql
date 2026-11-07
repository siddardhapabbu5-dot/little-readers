-- CreateEnum
CREATE TYPE "PolicyDocumentType" AS ENUM ('PRIVACY_POLICY', 'TERMS_OF_SERVICE', 'PARENTAL_CONSENT');

-- CreateTable
CREATE TABLE "PolicyDocument" (
    "id" TEXT NOT NULL,
    "type" "PolicyDocumentType" NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "version" TEXT NOT NULL DEFAULT '',
    "fileName" TEXT,
    "fileSize" INTEGER,
    "fileSha256" TEXT,
    "fileData" BYTEA,
    "uploadedAt" TIMESTAMP(3),
    "uploadedByUserId" TEXT,
    "updatedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PolicyDocument_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PolicyDocument_type_key" ON "PolicyDocument"("type");
