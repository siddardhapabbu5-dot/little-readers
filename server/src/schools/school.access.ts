import type { UserRole } from "@prisma/client";
import { AppError } from "../lib/errors.js";
import { prisma } from "../lib/prisma.js";

const PLATFORM_ADMINS: UserRole[] = ["ADMIN", "SUPER_ADMIN"];

export function isPlatformAdmin(role: UserRole) {
  return PLATFORM_ADMINS.includes(role);
}

/** Platform admins: any school. School admins: only their active SchoolStaff school. */
export async function assertCanManageSchool(
  actor: { id: string; role: UserRole },
  schoolId: string
) {
  if (isPlatformAdmin(actor.role)) {
    const school = await prisma.school.findUnique({ where: { id: schoolId } });
    if (!school) throw new AppError("School not found", 404);
    return school;
  }

  if (actor.role !== "SCHOOL_ADMIN") {
    throw new AppError("Insufficient permissions", 403);
  }

  const staff = await prisma.schoolStaff.findFirst({
    where: {
      userId: actor.id,
      schoolId,
      isActive: true,
      staffRole: "SCHOOL_ADMIN",
      school: { isActive: true },
    },
    include: { school: true },
  });
  if (!staff) throw new AppError("Insufficient permissions for this school", 403);
  return staff.school;
}

/** Teacher (or school/platform admin) access to a classroom. */
export async function assertClassroomAccess(
  actor: { id: string; role: UserRole },
  classroomId: string,
  opts?: { requireTeacherAssignment?: boolean }
) {
  const classroom = await prisma.classroom.findUnique({
    where: { id: classroomId },
    include: { school: true },
  });
  if (!classroom) throw new AppError("Classroom not found", 404);

  if (isPlatformAdmin(actor.role)) return classroom;

  if (actor.role === "SCHOOL_ADMIN") {
    await assertCanManageSchool(actor, classroom.schoolId);
    return classroom;
  }

  if (actor.role !== "TEACHER") {
    throw new AppError("Insufficient permissions", 403);
  }

  const staff = await prisma.schoolStaff.findFirst({
    where: {
      userId: actor.id,
      schoolId: classroom.schoolId,
      isActive: true,
      staffRole: "TEACHER",
    },
  });
  if (!staff) throw new AppError("Not a teacher at this school", 403);

  if (opts?.requireTeacherAssignment !== false) {
    const link = await prisma.classroomTeacher.findUnique({
      where: {
        classroomId_teacherUserId: {
          classroomId,
          teacherUserId: actor.id,
        },
      },
    });
    if (!link) throw new AppError("Not assigned to this classroom", 403);
  }

  return classroom;
}

export async function listManagedSchoolIds(actor: {
  id: string;
  role: UserRole;
}): Promise<string[] | "ALL"> {
  if (isPlatformAdmin(actor.role)) return "ALL";
  const rows = await prisma.schoolStaff.findMany({
    where: { userId: actor.id, isActive: true },
    select: { schoolId: true },
  });
  return rows.map((r) => r.schoolId);
}

/**
 * Teacher / school admin may view progress for children enrolled in
 * classrooms they are authorized to access. Does not grant parent write rights.
 */
export async function assertTeacherCanViewChild(
  actor: { id: string; role: UserRole },
  childId: string
) {
  const enrollments = await prisma.classroomEnrollment.findMany({
    where: { childId, isActive: true, leftAt: null },
    select: { classroomId: true },
  });
  if (!enrollments.length) {
    throw new AppError("Student is not in an authorized classroom", 403);
  }

  for (const e of enrollments) {
    try {
      await assertClassroomAccess(actor, e.classroomId);
      const child = await prisma.child.findFirst({
        where: { id: childId, isActive: true },
        select: { id: true, displayName: true },
      });
      if (!child) throw new AppError("Child not found", 404);
      return child;
    } catch {
      /* try next classroom */
    }
  }
  throw new AppError("Insufficient permissions for this student", 403);
}
