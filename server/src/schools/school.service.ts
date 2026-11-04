import type { UserRole } from "@prisma/client";
import { AppError } from "../lib/errors.js";
import { hashPassword } from "../lib/password.js";
import { prisma } from "../lib/prisma.js";
import {
  assertCanManageSchool,
  assertClassroomAccess,
  isPlatformAdmin,
  listManagedSchoolIds,
} from "./school.access.js";

type Actor = { id: string; role: UserRole };

function schoolInclude() {
  return {
    _count: {
      select: {
        staff: true,
        classrooms: true,
      },
    },
  } as const;
}

export async function listSchools(
  actor: Actor,
  filters?: { q?: string; isActive?: boolean }
) {
  const scope = await listManagedSchoolIds(actor);
  if (scope !== "ALL" && actor.role !== "SCHOOL_ADMIN" && actor.role !== "TEACHER") {
    throw new AppError("Insufficient permissions", 403);
  }
  if (!isPlatformAdmin(actor.role) && actor.role !== "SCHOOL_ADMIN") {
    throw new AppError("Insufficient permissions", 403);
  }

  const where = {
    ...(scope === "ALL" ? {} : { id: { in: scope } }),
    ...(filters?.isActive !== undefined ? { isActive: filters.isActive } : {}),
    ...(filters?.q
      ? {
          OR: [
            { name: { contains: filters.q, mode: "insensitive" as const } },
            { code: { contains: filters.q, mode: "insensitive" as const } },
            { contactEmail: { contains: filters.q, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };

  const schools = await prisma.school.findMany({
    where,
    include: schoolInclude(),
    orderBy: { name: "asc" },
  });

  const withStudents = await Promise.all(
    schools.map(async (s) => {
      const studentCount = await prisma.classroomEnrollment.count({
        where: { isActive: true, classroom: { schoolId: s.id, isActive: true } },
      });
      const teacherCount = await prisma.schoolStaff.count({
        where: { schoolId: s.id, isActive: true, staffRole: "TEACHER" },
      });
      return {
        ...s,
        teacherCount,
        classroomCount: s._count.classrooms,
        studentCount,
      };
    })
  );

  return withStudents;
}

export async function getSchool(actor: Actor, schoolId: string) {
  await assertCanManageSchool(actor, schoolId);
  const school = await prisma.school.findUnique({
    where: { id: schoolId },
    include: {
      staff: {
        where: { isActive: true },
        include: {
          user: { select: { id: true, name: true, email: true, role: true, isActive: true } },
        },
        orderBy: { createdAt: "asc" },
      },
      classrooms: {
        orderBy: { name: "asc" },
        include: {
          _count: {
            select: {
              enrollments: true,
              teachers: true,
            },
          },
        },
      },
    },
  });
  if (!school) throw new AppError("School not found", 404);

  const studentCount = await prisma.classroomEnrollment.count({
    where: { isActive: true, classroom: { schoolId, isActive: true } },
  });

  return { ...school, studentCount };
}

export async function createSchool(
  actor: Actor,
  input: {
    name: string;
    code?: string;
    contactEmail?: string;
    contactPhone?: string;
    address?: string;
    notes?: string;
  }
) {
  if (!isPlatformAdmin(actor.role)) {
    throw new AppError("Only platform admins can create schools", 403);
  }
  const name = input.name.trim();
  if (!name) throw new AppError("School name is required", 400);

  return prisma.school.create({
    data: {
      name,
      code: input.code?.trim() || null,
      contactEmail: input.contactEmail?.trim() || null,
      contactPhone: input.contactPhone?.trim() || null,
      address: input.address?.trim() || null,
      notes: input.notes?.trim() || null,
      isActive: true,
    },
  });
}

export async function updateSchool(
  actor: Actor,
  schoolId: string,
  patch: {
    name?: string;
    code?: string | null;
    contactEmail?: string | null;
    contactPhone?: string | null;
    address?: string | null;
    notes?: string | null;
    isActive?: boolean;
  }
) {
  await assertCanManageSchool(actor, schoolId);
  if (patch.isActive !== undefined && !isPlatformAdmin(actor.role)) {
    throw new AppError("Only platform admins can activate/deactivate schools", 403);
  }

  return prisma.school.update({
    where: { id: schoolId },
    data: {
      ...(patch.name !== undefined ? { name: patch.name.trim() } : {}),
      ...(patch.code !== undefined ? { code: patch.code?.trim() || null } : {}),
      ...(patch.contactEmail !== undefined
        ? { contactEmail: patch.contactEmail?.trim() || null }
        : {}),
      ...(patch.contactPhone !== undefined
        ? { contactPhone: patch.contactPhone?.trim() || null }
        : {}),
      ...(patch.address !== undefined ? { address: patch.address?.trim() || null } : {}),
      ...(patch.notes !== undefined ? { notes: patch.notes?.trim() || null } : {}),
      ...(patch.isActive !== undefined ? { isActive: patch.isActive } : {}),
    },
  });
}

export async function setSchoolActive(actor: Actor, schoolId: string, isActive: boolean) {
  return updateSchool(actor, schoolId, { isActive });
}

export async function createTeacherAccount(
  actor: Actor,
  schoolId: string,
  input: {
    name: string;
    email: string;
    password: string;
    staffRole?: "TEACHER" | "SCHOOL_ADMIN";
  }
) {
  await assertCanManageSchool(actor, schoolId);
  const staffRole = input.staffRole ?? "TEACHER";
  if (staffRole === "SCHOOL_ADMIN" && !isPlatformAdmin(actor.role)) {
    // School admins may create teachers only
    throw new AppError("Only platform admins can create school admin accounts", 403);
  }

  const email = input.email.toLowerCase().trim();
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) throw new AppError("An account with this email already exists", 409);

  const passwordHash = await hashPassword(input.password);
  const userRole: UserRole = staffRole === "SCHOOL_ADMIN" ? "SCHOOL_ADMIN" : "TEACHER";

  return prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        name: input.name.trim(),
        email,
        passwordHash,
        role: userRole,
        isActive: true,
      },
    });
    const staff = await tx.schoolStaff.create({
      data: {
        schoolId,
        userId: user.id,
        staffRole,
        isActive: true,
      },
    });
    return {
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        isActive: user.isActive,
      },
      staff,
    };
  });
}

export async function listSchoolTeachers(actor: Actor, schoolId: string) {
  await assertCanManageSchool(actor, schoolId);
  return prisma.schoolStaff.findMany({
    where: { schoolId },
    include: {
      user: { select: { id: true, name: true, email: true, role: true, isActive: true } },
    },
    orderBy: { createdAt: "asc" },
  });
}

export async function updateTeacherStaff(
  actor: Actor,
  userId: string,
  patch: { name?: string; isActive?: boolean; schoolId?: string }
) {
  const staffRows = await prisma.schoolStaff.findMany({
    where: { userId },
    include: { user: true },
  });
  if (!staffRows.length) throw new AppError("Teacher/staff not found", 404);

  const schoolId = patch.schoolId ?? staffRows[0].schoolId;
  await assertCanManageSchool(actor, schoolId);

  return prisma.$transaction(async (tx) => {
    if (patch.name !== undefined) {
      await tx.user.update({
        where: { id: userId },
        data: { name: patch.name.trim() },
      });
    }
    if (patch.isActive !== undefined) {
      await tx.user.update({
        where: { id: userId },
        data: { isActive: patch.isActive },
      });
      await tx.schoolStaff.updateMany({
        where: { userId, schoolId },
        data: { isActive: patch.isActive },
      });
    }
    return tx.schoolStaff.findFirst({
      where: { userId, schoolId },
      include: {
        user: { select: { id: true, name: true, email: true, role: true, isActive: true } },
      },
    });
  });
}

export async function createClassroom(
  actor: Actor,
  schoolId: string,
  input: { name: string; code?: string; gradeLabel?: string }
) {
  await assertCanManageSchool(actor, schoolId);
  const name = input.name.trim();
  if (!name) throw new AppError("Classroom name is required", 400);

  try {
    return await prisma.classroom.create({
      data: {
        schoolId,
        name,
        code: input.code?.trim() || null,
        gradeLabel: input.gradeLabel?.trim() || null,
        isActive: true,
      },
    });
  } catch (e: unknown) {
    if (String(e).includes("Unique constraint")) {
      throw new AppError("A classroom with this name already exists at this school", 409);
    }
    throw e;
  }
}

export async function updateClassroom(
  actor: Actor,
  classroomId: string,
  patch: { name?: string; code?: string | null; gradeLabel?: string | null; isActive?: boolean }
) {
  const classroom = await prisma.classroom.findUnique({ where: { id: classroomId } });
  if (!classroom) throw new AppError("Classroom not found", 404);
  await assertCanManageSchool(actor, classroom.schoolId);

  return prisma.classroom.update({
    where: { id: classroomId },
    data: {
      ...(patch.name !== undefined ? { name: patch.name.trim() } : {}),
      ...(patch.code !== undefined ? { code: patch.code?.trim() || null } : {}),
      ...(patch.gradeLabel !== undefined
        ? { gradeLabel: patch.gradeLabel?.trim() || null }
        : {}),
      ...(patch.isActive !== undefined ? { isActive: patch.isActive } : {}),
    },
  });
}

export async function assignTeacherToClassroom(
  actor: Actor,
  classroomId: string,
  teacherUserId: string
) {
  const classroom = await prisma.classroom.findUnique({ where: { id: classroomId } });
  if (!classroom) throw new AppError("Classroom not found", 404);
  await assertCanManageSchool(actor, classroom.schoolId);

  const staff = await prisma.schoolStaff.findFirst({
    where: {
      userId: teacherUserId,
      schoolId: classroom.schoolId,
      isActive: true,
      staffRole: "TEACHER",
    },
  });
  if (!staff) {
    throw new AppError("Teacher must be active staff at this school", 400);
  }

  return prisma.classroomTeacher.upsert({
    where: {
      classroomId_teacherUserId: { classroomId, teacherUserId },
    },
    create: { classroomId, teacherUserId },
    update: {},
  });
}

export async function unassignTeacherFromClassroom(
  actor: Actor,
  classroomId: string,
  teacherUserId: string
) {
  const classroom = await prisma.classroom.findUnique({ where: { id: classroomId } });
  if (!classroom) throw new AppError("Classroom not found", 404);
  await assertCanManageSchool(actor, classroom.schoolId);

  await prisma.classroomTeacher.deleteMany({
    where: { classroomId, teacherUserId },
  });
  return { ok: true };
}

export async function enrollChildInClassroom(
  actor: Actor,
  classroomId: string,
  childId: string
) {
  // Teachers may enroll into their assigned classrooms; school admins into any in school
  const classroom =
    actor.role === "TEACHER"
      ? await assertClassroomAccess(actor, classroomId)
      : await (async () => {
          const c = await prisma.classroom.findUnique({ where: { id: classroomId } });
          if (!c) throw new AppError("Classroom not found", 404);
          await assertCanManageSchool(actor, c.schoolId);
          return c;
        })();

  if (!classroom.isActive) throw new AppError("Classroom is inactive", 400);

  const child = await prisma.child.findFirst({
    where: { id: childId, isActive: true },
    select: { id: true, displayName: true, parentId: true },
  });
  if (!child) throw new AppError("Child profile not found or inactive", 404);

  const existing = await prisma.classroomEnrollment.findUnique({
    where: { classroomId_childId: { classroomId, childId } },
  });
  if (existing?.isActive) {
    throw new AppError("Child is already enrolled in this classroom", 409);
  }

  if (existing) {
    return prisma.classroomEnrollment.update({
      where: { id: existing.id },
      data: { isActive: true, leftAt: null, enrolledAt: new Date() },
      include: {
        child: {
          select: { id: true, displayName: true, birthYear: true, levelId: true },
        },
      },
    });
  }

  return prisma.classroomEnrollment.create({
    data: { classroomId, childId, isActive: true },
    include: {
      child: {
        select: { id: true, displayName: true, birthYear: true, levelId: true },
      },
    },
  });
}

export async function unenrollChildFromClassroom(
  actor: Actor,
  classroomId: string,
  childId: string
) {
  if (actor.role === "TEACHER") {
    await assertClassroomAccess(actor, classroomId);
  } else {
    const c = await prisma.classroom.findUnique({ where: { id: classroomId } });
    if (!c) throw new AppError("Classroom not found", 404);
    await assertCanManageSchool(actor, c.schoolId);
  }

  const row = await prisma.classroomEnrollment.findUnique({
    where: { classroomId_childId: { classroomId, childId } },
  });
  if (!row || !row.isActive) throw new AppError("Enrollment not found", 404);

  // Soft leave — preserve Child learning history
  return prisma.classroomEnrollment.update({
    where: { id: row.id },
    data: { isActive: false, leftAt: new Date() },
  });
}

export async function getClassroomDetail(actor: Actor, classroomId: string) {
  await assertClassroomAccess(actor, classroomId, {
    requireTeacherAssignment: actor.role === "TEACHER",
  });

  return prisma.classroom.findUnique({
    where: { id: classroomId },
    include: {
      school: { select: { id: true, name: true, isActive: true } },
      teachers: {
        include: {
          teacher: { select: { id: true, name: true, email: true, isActive: true } },
        },
      },
      enrollments: {
        where: { isActive: true },
        include: {
          child: {
            select: {
              id: true,
              displayName: true,
              birthYear: true,
              levelId: true,
              level: { select: { code: true, label: true } },
            },
          },
        },
        orderBy: { enrolledAt: "asc" },
      },
      assignments: {
        include: {
          lesson: {
            select: {
              id: true,
              title: true,
              isPublished: true,
              isActive: true,
              status: true,
            },
          },
        },
        orderBy: { assignedAt: "desc" },
      },
    },
  });
}
