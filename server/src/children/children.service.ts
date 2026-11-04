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
  const levelCode = input.level ?? inferLevelFromBirthYear(birthYear);

  const [level, ageGroup] = await Promise.all([
    prisma.learningLevel.findUnique({ where: { code: levelCode } }),
    prisma.ageGroup.findUnique({ where: { code: levelCode } }),
  ]);

  if (!level || !ageGroup) {
    throw new AppError("Learning levels are not seeded. Run db:seed.", 500);
  }

  const child = await prisma.$transaction(async (tx) => {
    const created = await tx.child.create({
      data: {
        parentId,
        displayName: input.displayName,
        birthYear,
        birthDate,
        levelId: level.id,
        ageGroupId: ageGroup.id,
        hasLearningSeat: false,
      },
      include: {
        level: { select: { code: true } },
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
    ageGroup: child.ageGroup?.code ?? levelCode,
    hasLearningSeat: child.hasLearningSeat,
  };
}

export async function listChildrenForParent(parentId: string) {
  const children = await prisma.child.findMany({
    where: { parentId, isActive: true },
    include: {
      level: { select: { code: true } },
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
    hasLearningSeat: child.hasLearningSeat,
    progress: child.progress,
  }));
}

export async function getChildProfile(userId: string, role: string, childId: string) {
  await assertChildAccess(userId, role, childId);

  const child = await prisma.child.findFirst({
    where: { id: childId, isActive: true },
    include: {
      level: { select: { code: true, label: true } },
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

  let levelId: string | undefined;
  let ageGroupId: string | undefined;
  if (input.level || birthPatch) {
    const levelCode =
      input.level ??
      inferLevelFromBirthYear(
        birthPatch?.birthYear ??
          (
            await prisma.child.findUniqueOrThrow({
              where: { id: childId },
              select: { birthYear: true },
            })
          ).birthYear
      );
    const [level, ageGroup] = await Promise.all([
      prisma.learningLevel.findUnique({ where: { code: levelCode } }),
      prisma.ageGroup.findUnique({ where: { code: levelCode } }),
    ]);
    if (!level || !ageGroup) {
      throw new AppError("Learning level not found for update", 400);
    }
    levelId = level.id;
    ageGroupId = ageGroup.id;
  }

  const updated = await prisma.child.update({
    where: { id: childId },
    data: {
      ...(input.displayName !== undefined ? { displayName: input.displayName } : {}),
      ...(birthPatch
        ? { birthYear: birthPatch.birthYear, birthDate: birthPatch.birthDate }
        : {}),
      ...(levelId ? { levelId, ageGroupId } : {}),
    },
    include: {
      level: { select: { code: true } },
      ageGroup: { select: { code: true } },
    },
  });

  return {
    id: updated.id,
    displayName: updated.displayName,
    birthYear: updated.birthYear,
    birthDate: updated.birthDate ?? `01/01/${updated.birthYear}`,
    level: updated.level?.code ?? "FOUNDATION",
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
