import type { CreateChildInput } from "@little-readers/validation";
import { inferLevelFromBirthYear } from "@little-readers/shared";
import { AppError } from "../lib/errors.js";
import { prisma } from "../lib/prisma.js";

export async function createChild(parentId: string, input: CreateChildInput) {
  const levelCode = input.level ?? inferLevelFromBirthYear(input.birthYear);

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
        birthYear: input.birthYear,
        levelId: level.id,
        ageGroupId: ageGroup.id,
      },
      include: {
        level: { select: { code: true } },
        ageGroup: { select: { code: true, label: true } },
      },
    });

    await tx.learningProgress.create({
      data: { childId: created.id },
    });

    return created;
  });

  return {
    id: child.id,
    displayName: child.displayName,
    birthYear: child.birthYear,
    level: child.level?.code ?? levelCode,
    ageGroup: child.ageGroup?.code ?? levelCode,
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
    level: child.level?.code ?? "FOUNDATION",
    progress: child.progress,
  }));
}

export async function getChildProgress(parentId: string, childId: string) {
  const child = await prisma.child.findFirst({
    where: { id: childId, parentId, isActive: true },
    include: {
      progress: true,
      level: { select: { code: true, label: true } },
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
  };
}
