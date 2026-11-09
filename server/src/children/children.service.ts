import type { CreateChildInput, UpdateChildInput } from "@little-readers/validation";
import { parseBirthDateDdMmYyyy } from "@little-readers/validation";
import { inferLevelFromBirthYear } from "@little-readers/shared";
import { AppError } from "../lib/errors.js";
import { prisma } from "../lib/prisma.js";
import { tryAssignLearningSeat } from "../subscriptions/subscription.service.js";

function resolveBirthFields(input: { birthDate?: string; birthYear?: number }) {
  if (input.birthDate) {
    try {
      const parsed = parseBirthDateDdMmYyyy(input.birthDate);
      return { birthYear: parsed.year, birthDate: parsed.normalized };
    } catch (err) {
      throw new AppError(err instanceof Error ? err.message : "Invalid birthday", 400);
    }
  }
  if (input.birthYear != null) {
    return {
      birthYear: input.birthYear,
      birthDate: `01/01/${input.birthYear}`,
    };
  }
  throw new AppError("Birthday is required (DD/MM/YYYY)", 400);
}

function isElevated(role: string) {
  return role === "ADMIN" || role === "SUPER_ADMIN";
}

/**
 * Resolve a grade id to the canonical academic grade (gradeNumber set).
 * New assignments require active + published academic grades that match the level.
 */
async function resolveAssignableGradeId(
  gradeId: string | null | undefined,
  levelId: string,
  opts: { forNewAssignment: boolean }
): Promise<string | null | undefined> {
  if (gradeId === undefined) return undefined;
  if (gradeId === null || gradeId === "") return null;

  const grade = await prisma.learningGrade.findUnique({
    where: { id: gradeId },
  });
  if (!grade) throw new AppError("Grade not found", 404);

  let target = grade;
  if (grade.gradeNumber == null && grade.canonicalGradeId) {
    const canonical = await prisma.learningGrade.findUnique({
      where: { id: grade.canonicalGradeId },
    });
    if (!canonical) throw new AppError("Canonical grade mapping is broken", 400);
    target = canonical;
  }

  if (target.gradeNumber == null) {
    throw new AppError(
      "Select an academic school grade (not a legacy content band)",
      400,
      { code: "GRADE_NOT_ACADEMIC" }
    );
  }

  if (opts.forNewAssignment) {
    if (!target.isActive || !target.isPublished) {
      throw new AppError("Grade is not available for assignment", 400, {
        code: "GRADE_NOT_PUBLISHED",
      });
    }
  }

  const level = await prisma.learningLevel.findUnique({ where: { id: levelId } });
  if (!level) throw new AppError("Level not found", 400);

  const matchesAssigned =
    target.assignedLevelId != null && target.assignedLevelId === levelId;
  const matchesRange =
    level.startGrade != null &&
    level.endGrade != null &&
    target.gradeNumber >= level.startGrade &&
    target.gradeNumber <= level.endGrade;

  if (!matchesAssigned && !matchesRange) {
    throw new AppError("Grade does not belong to the selected Level", 400, {
      code: "GRADE_LEVEL_MISMATCH",
    });
  }

  return target.id;
}

/** Parent must own the child; ADMIN/SUPER_ADMIN may access any active child. */
export async function assertChildAccess(userId: string, role: string, childId: string) {
  if (isElevated(role)) {
    const child = await prisma.child.findFirst({
      where: { id: childId, isActive: true },
    });
    if (!child) throw new AppError("Child not found", 404);
    return child;
  }

  const child = await prisma.child.findFirst({
    where: { id: childId, parentId: userId, isActive: true },
  });
  if (!child) throw new AppError("Child not found", 404);
  return child;
}

export async function createChild(parentId: string, input: CreateChildInput) {
  const { birthYear, birthDate } = resolveBirthFields(input);

  let level =
    input.levelId != null
      ? await prisma.learningLevel.findUnique({ where: { id: input.levelId } })
      : null;
  const levelCode = input.level ?? (level?.code as string | undefined) ?? inferLevelFromBirthYear(birthYear);
  if (!level) {
    level = await prisma.learningLevel.findUnique({ where: { code: levelCode } });
  }
  const ageGroup = await prisma.ageGroup.findUnique({
    where: { code: level?.code ?? levelCode },
  });

  if (!level || !ageGroup) {
    throw new AppError("Learning levels are not seeded. Run db:seed.", 500);
  }

  const gradeId = await resolveAssignableGradeId(input.gradeId, level.id, {
    forNewAssignment: true,
  });

  const child = await prisma.$transaction(async (tx) => {
    const created = await tx.child.create({
      data: {
        parentId,
        displayName: input.displayName,
        birthYear,
        birthDate,
        levelId: level.id,
        gradeId: gradeId ?? null,
        ageGroupId: ageGroup.id,
        hasLearningSeat: false,
      },
      include: {
        level: { select: { id: true, code: true, label: true } },
        grade: {
          select: { id: true, code: true, label: true, gradeNumber: true },
        },
        ageGroup: { select: { code: true, label: true } },
      },
    });

    await tx.learningProgress.create({
      data: { childId: created.id },
    });

    const seated = await tryAssignLearningSeat(parentId, created.id, tx);
    return { ...created, hasLearningSeat: seated };
  });

  return {
    id: child.id,
    displayName: child.displayName,
    birthYear: child.birthYear,
    birthDate: child.birthDate,
    level: child.level?.code ?? levelCode,
    levelId: child.level?.id ?? level.id,
    gradeId: child.grade?.id ?? null,
    grade: child.grade,
    ageGroup: child.ageGroup?.code ?? levelCode,
    hasLearningSeat: child.hasLearningSeat,
  };
}

export async function listChildrenForParent(parentId: string) {
  const children = await prisma.child.findMany({
    where: { parentId, isActive: true },
    include: {
      level: { select: { id: true, code: true, label: true } },
      grade: {
        select: { id: true, code: true, label: true, gradeNumber: true },
      },
      progress: true,
    },
    orderBy: { createdAt: "asc" },
  });

  return children.map((child) => ({
    id: child.id,
    displayName: child.displayName,
    birthYear: child.birthYear,
    birthDate: child.birthDate ?? `01/01/${child.birthYear}`,
    level: child.level?.code ?? "FOUNDATION",
    levelId: child.level?.id ?? null,
    gradeId: child.grade?.id ?? null,
    grade: child.grade,
    hasLearningSeat: child.hasLearningSeat,
    progress: child.progress,
  }));
}

const ADMIN_PRACTICE_NAME = "Practice";

/**
 * The admin's own Grade 1 test learner. It belongs to the admin account, so it never
 * appears in parent lists, and it holds a learning seat without a subscription.
 */
export async function getOrCreateAdminPracticeChild(adminId: string) {
  let existing = (await listChildrenForParent(adminId))[0];
  if (!existing) {
    const grade1 = await prisma.learningGrade.findFirst({
      where: { gradeNumber: 1 },
      select: { id: true },
    });
    const input: CreateChildInput = {
      displayName: ADMIN_PRACTICE_NAME,
      birthYear: new Date().getFullYear() - 6,
      level: "LEVEL_1",
      ...(grade1 ? { gradeId: grade1.id } : {}),
    };
    try {
      await createChild(adminId, input);
    } catch (err) {
      if (!(err instanceof AppError) || !input.gradeId) throw err;
      await createChild(adminId, { ...input, gradeId: undefined });
    }
    existing = (await listChildrenForParent(adminId))[0];
  }
  if (!existing) throw new AppError("Could not create the practice learner", 500);
  if (!existing.hasLearningSeat) {
    await prisma.child.update({ where: { id: existing.id }, data: { hasLearningSeat: true } });
    existing = { ...existing, hasLearningSeat: true };
  }
  return existing;
}

export async function getChildProfile(userId: string, role: string, childId: string) {
  await assertChildAccess(userId, role, childId);

  const child = await prisma.child.findFirst({
    where: { id: childId, isActive: true },
    include: {
      level: { select: { id: true, code: true, label: true } },
      grade: {
        select: { id: true, code: true, label: true, gradeNumber: true },
      },
      ageGroup: { select: { code: true, label: true } },
      parent: { select: { id: true, name: true, email: true } },
      registeredDevice: true,
      progress: true,
    },
  });
  if (!child) throw new AppError("Child not found", 404);

  return {
    id: child.id,
    displayName: child.displayName,
    birthYear: child.birthYear,
    birthDate: child.birthDate ?? `01/01/${child.birthYear}`,
    level: child.level,
    levelId: child.level?.id ?? null,
    grade: child.grade,
    gradeId: child.grade?.id ?? null,
    ageGroup: child.ageGroup,
    parent: child.parent,
    hasLearningSeat: child.hasLearningSeat,
    progress: child.progress,
    device: child.registeredDevice
      ? {
          registered: child.registeredDevice.isActive && !child.registeredDevice.revokedAt,
          platform: child.registeredDevice.platform,
          deviceLabel: child.registeredDevice.deviceLabel,
          registeredAt: child.registeredDevice.registeredAt,
        }
      : { registered: false },
  };
}

export async function updateChild(
  userId: string,
  role: string,
  childId: string,
  input: UpdateChildInput
) {
  await assertChildAccess(userId, role, childId);

  const birthPatch =
    input.birthDate || input.birthYear !== undefined
      ? resolveBirthFields({
          birthDate: input.birthDate,
          birthYear: input.birthYear,
        })
      : null;

  const existing = await prisma.child.findUniqueOrThrow({
    where: { id: childId },
    select: { birthYear: true, levelId: true, gradeId: true },
  });

  let levelId: string | undefined;
  let ageGroupId: string | undefined;
  if (input.levelId || input.level || birthPatch) {
    let level =
      input.levelId != null
        ? await prisma.learningLevel.findUnique({ where: { id: input.levelId } })
        : null;
    const levelCode =
      input.level ??
      level?.code ??
      inferLevelFromBirthYear(birthPatch?.birthYear ?? existing.birthYear);
    if (!level) {
      level = await prisma.learningLevel.findUnique({ where: { code: levelCode } });
    }
    const ageGroup = await prisma.ageGroup.findUnique({
      where: { code: level?.code ?? levelCode },
    });
    if (!level || !ageGroup) {
      throw new AppError("Learning level not found for update", 400);
    }
    levelId = level.id;
    ageGroupId = ageGroup.id;
  }

  const nextLevelId = levelId ?? existing.levelId;
  if (!nextLevelId) {
    throw new AppError("Child has no learning level", 400);
  }

  let gradeId = await resolveAssignableGradeId(
    input.gradeId,
    nextLevelId,
    { forNewAssignment: input.gradeId != null && input.gradeId !== "" }
  );

  // If level changed and caller did not send a grade, drop a mismatched prior grade
  // (do not invent a new one).
  if (levelId && input.gradeId === undefined && existing.gradeId) {
    try {
      await resolveAssignableGradeId(existing.gradeId, nextLevelId, {
        forNewAssignment: false,
      });
    } catch {
      gradeId = null;
    }
  }

  const updated = await prisma.child.update({
    where: { id: childId },
    data: {
      ...(input.displayName !== undefined ? { displayName: input.displayName } : {}),
      ...(birthPatch
        ? { birthYear: birthPatch.birthYear, birthDate: birthPatch.birthDate }
        : {}),
      ...(levelId ? { levelId, ageGroupId } : {}),
      ...(gradeId !== undefined ? { gradeId } : {}),
    },
    include: {
      level: { select: { id: true, code: true } },
      grade: {
        select: { id: true, code: true, label: true, gradeNumber: true },
      },
      ageGroup: { select: { code: true } },
    },
  });

  return {
    id: updated.id,
    displayName: updated.displayName,
    birthYear: updated.birthYear,
    birthDate: updated.birthDate ?? `01/01/${updated.birthYear}`,
    level: updated.level?.code ?? "FOUNDATION",
    levelId: updated.level?.id ?? null,
    gradeId: updated.grade?.id ?? null,
    grade: updated.grade,
    ageGroup: updated.ageGroup?.code ?? "FOUNDATION",
  };
}

/**
 * Soft-delete: deactivate child and revoke registered device.
 * Learning history rows are retained (no hard delete of progress).
 */
export async function softDeleteChild(userId: string, role: string, childId: string) {
  await assertChildAccess(userId, role, childId);

  await prisma.$transaction(async (tx) => {
    await tx.child.update({
      where: { id: childId },
      data: { isActive: false, hasLearningSeat: false },
    });
    await tx.studentDevice.updateMany({
      where: { childId, isActive: true },
      data: { isActive: false, revokedAt: new Date() },
    });
  });

  return { id: childId, deleted: true };
}

export async function getChildProgress(userId: string, role: string, childId: string) {
  await assertChildAccess(userId, role, childId);

  const child = await prisma.child.findFirst({
    where: { id: childId, isActive: true },
    include: {
      progress: true,
      level: { select: { code: true, label: true } },
      categoryProgress: {
        include: {
          category: {
            select: {
              label: true,
              emoji: true,
              code: true,
              group: { select: { label: true, code: true } },
            },
          },
        },
        orderBy: { lastPlayedAt: "desc" },
      },
      achievements: { orderBy: { earnedAt: "desc" }, take: 20 },
      learningSessions: {
        where: { status: "COMPLETED" },
        orderBy: { completedAt: "desc" },
        take: 20,
        include: {
          category: { select: { label: true, emoji: true } },
        },
      },
    },
  });

  if (!child) {
    throw new AppError("Child not found", 404);
  }

  return {
    child: {
      id: child.id,
      displayName: child.displayName,
      birthYear: child.birthYear,
      level: child.level,
    },
    progress: child.progress,
    level1: {
      categoriesCompleted: child.categoryProgress.filter((p) => p.completed).length,
      wordsLearned: child.categoryProgress.reduce((s, p) => s + p.wordsLearned, 0),
      points: child.categoryProgress.reduce((s, p) => s + p.points, 0),
      stars: child.categoryProgress.reduce((s, p) => s + p.stars, 0),
      minutesLearned: child.categoryProgress.reduce((s, p) => s + p.minutesLearned, 0),
      categories: child.categoryProgress.map((p) => ({
        label: p.category.label,
        emoji: p.category.emoji,
        group: p.category.group.label,
        completed: p.completed,
        wordsLearned: p.wordsLearned,
        listenCorrect: p.listenCorrect,
        listenAttempts: p.listenAttempts,
        spellCorrect: p.spellCorrect,
        spellAttempts: p.spellAttempts,
        points: p.points,
        stars: p.stars,
        lastPlayedAt: p.lastPlayedAt,
      })),
      recentSessions: child.learningSessions.map((s) => ({
        category: s.category.label,
        emoji: s.category.emoji,
        points: s.points,
        stars: s.stars,
        wordsLearned: s.wordsLearned,
        completedAt: s.completedAt,
      })),
      achievements: child.achievements,
    },
  };
}

/** Admin directory: parent accounts with active child counts (real User rows). */
export async function listParentsForAdmin() {
  const parents = await prisma.user.findMany({
    where: { role: "PARENT", isActive: true },
    select: {
      id: true,
      name: true,
      email: true,
      createdAt: true,
      children: {
        where: { isActive: true },
        select: {
          id: true,
          displayName: true,
          birthYear: true,
          level: { select: { code: true } },
        },
        orderBy: { createdAt: "asc" },
      },
      subscriptions: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { plan: true, status: true, expiresAt: true },
      },
    },
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  return parents.map((p) => ({
    id: p.id,
    name: p.name,
    email: p.email,
    createdAt: p.createdAt,
    childCount: p.children.length,
    children: p.children.map((c) => ({
      id: c.id,
      displayName: c.displayName,
      birthYear: c.birthYear,
      level: c.level?.code ?? null,
    })),
    subscription: p.subscriptions[0] ?? null,
  }));
}
