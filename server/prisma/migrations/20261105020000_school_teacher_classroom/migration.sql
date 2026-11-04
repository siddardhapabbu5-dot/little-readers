-- Batch 9: School / Teacher / Classroom (enrollment overlays existing Child)

DO $$ BEGIN
  ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'TEACHER';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'SCHOOL_ADMIN';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "SchoolStaffRole" AS ENUM ('TEACHER', 'SCHOOL_ADMIN');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "School" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "contactEmail" TEXT,
    "contactPhone" TEXT,
    "address" TEXT,
    "notes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "School_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "School_code_key" ON "School"("code");
CREATE INDEX IF NOT EXISTS "School_isActive_name_idx" ON "School"("isActive", "name");

CREATE TABLE IF NOT EXISTS "SchoolStaff" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "staffRole" "SchoolStaffRole" NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "SchoolStaff_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "SchoolStaff_userId_schoolId_key" ON "SchoolStaff"("userId", "schoolId");
CREATE INDEX IF NOT EXISTS "SchoolStaff_schoolId_staffRole_idx" ON "SchoolStaff"("schoolId", "staffRole");
CREATE INDEX IF NOT EXISTS "SchoolStaff_userId_isActive_idx" ON "SchoolStaff"("userId", "isActive");

CREATE TABLE IF NOT EXISTS "Classroom" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "gradeLabel" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Classroom_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "Classroom_schoolId_isActive_idx" ON "Classroom"("schoolId", "isActive");
CREATE UNIQUE INDEX IF NOT EXISTS "Classroom_schoolId_name_key" ON "Classroom"("schoolId", "name");

CREATE TABLE IF NOT EXISTS "ClassroomTeacher" (
    "id" TEXT NOT NULL,
    "classroomId" TEXT NOT NULL,
    "teacherUserId" TEXT NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ClassroomTeacher_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ClassroomTeacher_classroomId_teacherUserId_key"
  ON "ClassroomTeacher"("classroomId", "teacherUserId");
CREATE INDEX IF NOT EXISTS "ClassroomTeacher_teacherUserId_idx" ON "ClassroomTeacher"("teacherUserId");

CREATE TABLE IF NOT EXISTS "ClassroomEnrollment" (
    "id" TEXT NOT NULL,
    "classroomId" TEXT NOT NULL,
    "childId" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "enrolledAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leftAt" TIMESTAMP(3),
    CONSTRAINT "ClassroomEnrollment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ClassroomEnrollment_classroomId_childId_key"
  ON "ClassroomEnrollment"("classroomId", "childId");
CREATE INDEX IF NOT EXISTS "ClassroomEnrollment_childId_isActive_idx"
  ON "ClassroomEnrollment"("childId", "isActive");
CREATE INDEX IF NOT EXISTS "ClassroomEnrollment_classroomId_isActive_idx"
  ON "ClassroomEnrollment"("classroomId", "isActive");

CREATE TABLE IF NOT EXISTS "ClassroomLessonAssignment" (
    "id" TEXT NOT NULL,
    "classroomId" TEXT NOT NULL,
    "lessonId" TEXT NOT NULL,
    "assignedByUserId" TEXT NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ClassroomLessonAssignment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ClassroomLessonAssignment_classroomId_lessonId_key"
  ON "ClassroomLessonAssignment"("classroomId", "lessonId");
CREATE INDEX IF NOT EXISTS "ClassroomLessonAssignment_lessonId_idx"
  ON "ClassroomLessonAssignment"("lessonId");
CREATE INDEX IF NOT EXISTS "ClassroomLessonAssignment_assignedByUserId_idx"
  ON "ClassroomLessonAssignment"("assignedByUserId");

DO $$ BEGIN
  ALTER TABLE "SchoolStaff" ADD CONSTRAINT "SchoolStaff_schoolId_fkey"
    FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "SchoolStaff" ADD CONSTRAINT "SchoolStaff_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "Classroom" ADD CONSTRAINT "Classroom_schoolId_fkey"
    FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "ClassroomTeacher" ADD CONSTRAINT "ClassroomTeacher_classroomId_fkey"
    FOREIGN KEY ("classroomId") REFERENCES "Classroom"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "ClassroomTeacher" ADD CONSTRAINT "ClassroomTeacher_teacherUserId_fkey"
    FOREIGN KEY ("teacherUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "ClassroomEnrollment" ADD CONSTRAINT "ClassroomEnrollment_classroomId_fkey"
    FOREIGN KEY ("classroomId") REFERENCES "Classroom"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "ClassroomEnrollment" ADD CONSTRAINT "ClassroomEnrollment_childId_fkey"
    FOREIGN KEY ("childId") REFERENCES "Child"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "ClassroomLessonAssignment" ADD CONSTRAINT "ClassroomLessonAssignment_classroomId_fkey"
    FOREIGN KEY ("classroomId") REFERENCES "Classroom"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "ClassroomLessonAssignment" ADD CONSTRAINT "ClassroomLessonAssignment_lessonId_fkey"
    FOREIGN KEY ("lessonId") REFERENCES "Lesson"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "ClassroomLessonAssignment" ADD CONSTRAINT "ClassroomLessonAssignment_assignedByUserId_fkey"
    FOREIGN KEY ("assignedByUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
