import type { UserRole } from "@prisma/client";
import { AppError } from "../lib/errors.js";
import { prisma } from "../lib/prisma.js";
import { assertClassroomAccess, isPlatformAdmin } from "./school.access.js";

type Actor = { id: string; role: UserRole };

export async function getTeacherMe(actor: Actor) {
  if (
    actor.role !== "TEACHER" &&
    actor.role !== "SCHOOL_ADMIN" &&
    !isPlatformAdmin(actor.role)
  ) {
    throw new AppError("Insufficient permissions", 403);
  }

  const staff = await prisma.schoolStaff.findMany({
    where: { userId: actor.id, isActive: true },
    include: {
      school: {
        select: { id: true, name: true, code: true, isActive: true },
      },
    },
  });

  const classroomLinks = await prisma.classroomTeacher.findMany({
    where: {
      teacherUserId: actor.id,
      classroom: { isActive: true, school: { isActive: true } },
    },
    include: {
      classroom: {
        select: {
          id: true,
          name: true,
          gradeLabel: true,
          schoolId: true,
          school: { select: { id: true, name: true } },
          _count: {
            select: { enrollments: { where: { isActive: true } } },
          },
        },
      },
    },
    orderBy: { assignedAt: "asc" },
  });

  // School admins see all classrooms in their schools
  let schoolClassrooms: typeof classroomLinks = [];
  if (actor.role === "SCHOOL_ADMIN" || isPlatformAdmin(actor.role)) {
    const schoolIds =
      actor.role === "SCHOOL_ADMIN"
        ? staff.map((s) => s.schoolId)
        : undefined;
    const rooms = await prisma.classroom.findMany({
      where: {
        isActive: true,
        ...(schoolIds ? { schoolId: { in: schoolIds } } : {}),
        school: { isActive: true },
      },
      select: {
        id: true,
        name: true,
        gradeLabel: true,
        schoolId: true,
        school: { select: { id: true, name: true } },
        _count: {
          select: { enrollments: { where: { isActive: true } } },
        },
      },
      orderBy: { name: "asc" },
      take: isPlatformAdmin(actor.role) ? 100 : undefined,
    });
    schoolClassrooms = rooms.map((classroom) => ({
      id: `view-${classroom.id}`,
      classroomId: classroom.id,
      teacherUserId: actor.id,
      assignedAt: new Date(0),
      classroom,
    }));
  }

  const classrooms =
    actor.role === "TEACHER"
      ? classroomLinks.map((l) => ({
          id: l.classroom.id,
          name: l.classroom.name,
          gradeLabel: l.classroom.gradeLabel,
          schoolId: l.classroom.schoolId,
          schoolName: l.classroom.school.name,
          studentCount: l.classroom._count.enrollments,
        }))
      : schoolClassrooms.map((l) => ({
          id: l.classroom.id,
          name: l.classroom.name,
          gradeLabel: l.classroom.gradeLabel,
          schoolId: l.classroom.schoolId,
          schoolName: l.classroom.school.name,
          studentCount: l.classroom._count.enrollments,
        }));

  return {
    userId: actor.id,
    role: actor.role,
    schools: staff.map((s) => s.school),
    classrooms,
  };
}

export async function getClassroomProgress(actor: Actor, classroomId: string) {
  await assertClassroomAccess(actor, classroomId, {
    requireTeacherAssignment: actor.role === "TEACHER",
  });

  const enrollments = await prisma.classroomEnrollment.findMany({
    where: { classroomId, isActive: true },
    include: {
      child: {
        select: {
          id: true,
          displayName: true,
          birthYear: true,
          level: { select: { code: true, label: true } },
          lessonProgress: {
            include: {
              lesson: {
                select: { id: true, title: true, isPublished: true, isActive: true },
              },
            },
          },
        },
      },
    },
    orderBy: { enrolledAt: "asc" },
  });

  const assignments = await prisma.classroomLessonAssignment.findMany({
    where: { classroomId },
    include: {
      lesson: { select: { id: true, title: true, isPublished: true, isActive: true } },
    },
  });
  const assignedLessonIds = new Set(assignments.map((a) => a.lessonId));

  const students = enrollments.map((e) => {
    const progress = e.child.lessonProgress.filter(
      (p) => p.lesson.isActive && p.lesson.isPublished
    );
    const completed = progress.filter((p) => p.completed);
    const inProgress = progress.filter((p) => !p.completed && p.lastPlayedAt);
    const assignedCompleted = completed.filter((p) => assignedLessonIds.has(p.lessonId));
    const assignedPending = assignments.filter(
      (a) =>
        a.lesson.isActive &&
        a.lesson.isPublished &&
        !completed.some((c) => c.lessonId === a.lessonId)
    );

    return {
      childId: e.child.id,
      displayName: e.child.displayName,
      birthYear: e.child.birthYear,
      level: e.child.level,
      summary: {
        lessonsStarted: progress.length,
        lessonsCompleted: completed.length,
        lessonsInProgress: inProgress.length,
        points: progress.reduce((n, p) => n + p.points, 0),
        stars: progress.reduce((n, p) => n + p.stars, 0),
        assignedCompleted: assignedCompleted.length,
        assignedPending: assignedPending.length,
      },
      lessons: progress.map((p) => ({
        lessonId: p.lessonId,
        title: p.lesson.title,
        completed: p.completed,
        points: p.points,
        stars: p.stars,
        lastPlayedAt: p.lastPlayedAt,
        assigned: assignedLessonIds.has(p.lessonId),
      })),
      pendingAssignedLessons: assignedPending.map((a) => ({
        lessonId: a.lessonId,
        title: a.lesson.title,
      })),
    };
  });

  return {
    classroomId,
    assignedLessons: assignments.map((a) => ({
      lessonId: a.lessonId,
      title: a.lesson.title,
      assignedAt: a.assignedAt,
      isPublished: a.lesson.isPublished,
      isActive: a.lesson.isActive,
    })),
    students,
    report: {
      studentCount: students.length,
      totalCompletedLessons: students.reduce((n, s) => n + s.summary.lessonsCompleted, 0),
      totalPoints: students.reduce((n, s) => n + s.summary.points, 0),
    },
  };
}

export async function listPublishedLessonsForTeachers(_actor: Actor) {
  const lessons = await prisma.lesson.findMany({
    where: { isPublished: true, isActive: true, status: "PUBLISHED" },
    select: {
      id: true,
      title: true,
      description: true,
      gradeId: true,
      levelId: true,
      learningCategoryId: true,
      _count: { select: { vocabItems: true } },
    },
    orderBy: [{ sortOrder: "asc" }, { title: "asc" }],
    take: 200,
  });
  return lessons.map((l) => ({
    id: l.id,
    title: l.title,
    description: l.description,
    gradeId: l.gradeId,
    levelId: l.levelId,
    learningCategoryId: l.learningCategoryId,
    wordCount: l._count.vocabItems,
  }));
}

export async function assignLessonToClassroom(
  actor: Actor,
  classroomId: string,
  lessonId: string
) {
  await assertClassroomAccess(actor, classroomId, {
    requireTeacherAssignment: actor.role === "TEACHER",
  });

  const lesson = await prisma.lesson.findFirst({
    where: { id: lessonId, isPublished: true, isActive: true, status: "PUBLISHED" },
  });
  if (!lesson) throw new AppError("Published active lesson not found", 404);

  return prisma.classroomLessonAssignment.upsert({
    where: { classroomId_lessonId: { classroomId, lessonId } },
    create: {
      classroomId,
      lessonId,
      assignedByUserId: actor.id,
    },
    update: {},
    include: {
      lesson: { select: { id: true, title: true } },
    },
  });
}

export async function unassignLessonFromClassroom(
  actor: Actor,
  classroomId: string,
  lessonId: string
) {
  await assertClassroomAccess(actor, classroomId, {
    requireTeacherAssignment: actor.role === "TEACHER",
  });

  await prisma.classroomLessonAssignment.deleteMany({
    where: { classroomId, lessonId },
  });
  return { ok: true };
}
