-- Phase 10C: Child.gradeId + LearningGrade.canonicalGradeId (non-destructive)

ALTER TABLE "LearningGrade" ADD COLUMN "canonicalGradeId" TEXT;
ALTER TABLE "Child" ADD COLUMN "gradeId" TEXT;

CREATE INDEX "LearningGrade_canonicalGradeId_idx" ON "LearningGrade"("canonicalGradeId");
CREATE INDEX "Child_gradeId_idx" ON "Child"("gradeId");
CREATE INDEX "Child_levelId_idx" ON "Child"("levelId");

ALTER TABLE "LearningGrade"
  ADD CONSTRAINT "LearningGrade_canonicalGradeId_fkey"
  FOREIGN KEY ("canonicalGradeId") REFERENCES "LearningGrade"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Child"
  ADD CONSTRAINT "Child_gradeId_fkey"
  FOREIGN KEY ("gradeId") REFERENCES "LearningGrade"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- Map legacy GRADE_n → academic row with matching gradeNumber (when present).
UPDATE "LearningGrade" AS content
SET "canonicalGradeId" = academic.id
FROM "LearningGrade" AS academic
WHERE content."gradeNumber" IS NULL
  AND content.code ~ '^GRADE_[0-9]+$'
  AND academic."gradeNumber" IS NOT NULL
  AND academic."gradeNumber" = CAST(substring(content.code from 'GRADE_([0-9]+)$') AS INTEGER)
  AND content."canonicalGradeId" IS NULL;
