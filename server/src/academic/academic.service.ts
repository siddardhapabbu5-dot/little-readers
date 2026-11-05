import { AppError } from "../lib/errors.js";
import { prisma } from "../lib/prisma.js";

const CODE_RE = /^[A-Z0-9_]{1,40}$/;

function assertCode(code: string) {
  const normalized = code.trim().toUpperCase();
  if (!CODE_RE.test(normalized)) {
    throw new AppError(
      "Code must be 1–40 chars: A–Z, 0–9, underscore only",
      400
    );
  }
  return normalized;
}

function assertGradeRange(start: number, end: number) {
  if (
    !Number.isInteger(start) ||
    !Number.isInteger(end) ||
    start < 1 ||
    end > 12 ||
    start > end
  ) {
    throw new AppError(
      "Starting grade must be ≤ ending grade and both in 1–12",
      400,
      { code: "INVALID_GRADE_RANGE" }
    );
  }
}

function rangesOverlap(aStart: number, aEnd: number, bStart: number, bEnd: number) {
  return aStart <= bEnd && bStart <= aEnd;
}

async function assertNoLevelRangeConflict(input: {
  startGrade: number;
  endGrade: number;
  excludeId?: string;
}) {
  const others = await prisma.learningLevel.findMany({
    where: {
      isActive: true,
      startGrade: { not: null },
      endGrade: { not: null },
      ...(input.excludeId ? { id: { not: input.excludeId } } : {}),
    },
    select: { id: true, code: true, label: true, startGrade: true, endGrade: true },
  });
  for (const o of others) {
    if (
      o.startGrade != null &&
      o.endGrade != null &&
      rangesOverlap(input.startGrade, input.endGrade, o.startGrade, o.endGrade)
    ) {
      throw new AppError(
        `Grade range conflicts with ${o.label} (${o.code}: ${o.startGrade}–${o.endGrade})`,
        409,
        {
          code: "LEVEL_RANGE_CONFLICT",
          conflict: o,
        }
      );
    }
  }
}

export async function previewLevelRangeImpact(input: {
  levelId?: string;
  startGrade: number;
  endGrade: number;
}) {
  assertGradeRange(input.startGrade, input.endGrade);
  const conflicts: Array<{
    id: string;
    code: string;
    label: string;
    startGrade: number | null;
    endGrade: number | null;
  }> = [];
  const others = await prisma.learningLevel.findMany({
    where: {
      isActive: true,
      startGrade: { not: null },
      endGrade: { not: null },
      ...(input.levelId ? { id: { not: input.levelId } } : {}),
    },
  });
  for (const o of others) {
    if (
      o.startGrade != null &&
      o.endGrade != null &&
      rangesOverlap(input.startGrade, input.endGrade, o.startGrade, o.endGrade)
    ) {
      conflicts.push(o);
    }
  }

  const gradesOutside = input.levelId
    ? await prisma.learningGrade.findMany({
        where: {
          assignedLevelId: input.levelId,
          gradeNumber: { not: null },
          OR: [
            { gradeNumber: { lt: input.startGrade } },
            { gradeNumber: { gt: input.endGrade } },
          ],
        },
        select: { id: true, code: true, label: true, gradeNumber: true },
      })
    : [];

  return {
    conflicts,
    gradesOutsideRange: gradesOutside,
    warning:
      gradesOutside.length > 0
        ? "Some grades assigned to this level fall outside the new range. Children's records will NOT be moved automatically."
        : null,
    safe: conflicts.length === 0,
  };
}

export async function listLevelsAdmin(includeInactive = true) {
  return prisma.learningLevel.findMany({
    where: includeInactive ? undefined : { isActive: true },
    orderBy: [{ sortOrder: "asc" }, { code: "asc" }],
    include: {
      schoolGrades: {
        orderBy: { gradeNumber: "asc" },
        select: {
          id: true,
          code: true,
          label: true,
          gradeNumber: true,
          isActive: true,
          isPublished: true,
        },
      },
      _count: { select: { children: true, groups: true, subscriptionPlans: true } },
    },
  });
}

export async function createLevel(input: {
  code: string;
  label: string;
  startGrade: number;
  endGrade: number;
  description?: string;
  sortOrder?: number;
  isActive?: boolean;
  isPublished?: boolean;
}) {
  const code = assertCode(input.code);
  const label = input.label.trim();
  if (!label) throw new AppError("Level name is required", 400);
  assertGradeRange(input.startGrade, input.endGrade);
  await assertNoLevelRangeConflict({
    startGrade: input.startGrade,
    endGrade: input.endGrade,
  });

  const dup = await prisma.learningLevel.findFirst({
    where: { OR: [{ code }, { label: { equals: label, mode: "insensitive" } }] },
  });
  if (dup) {
    throw new AppError("Level name or code already exists", 409, {
      code: "LEVEL_DUPLICATE",
    });
  }

  return prisma.learningLevel.create({
    data: {
      code,
      label,
      startGrade: input.startGrade,
      endGrade: input.endGrade,
      ageMin: Math.max(3, input.startGrade + 2),
      ageMax: Math.min(18, input.endGrade + 5),
      description: input.description?.trim() || null,
      sortOrder: input.sortOrder ?? input.startGrade,
      isActive: input.isActive ?? true,
      isPublished: input.isPublished ?? false,
      kind: "GRADE_BAND",
    },
  });
}

export async function updateLevel(
  id: string,
  patch: {
    label?: string;
    startGrade?: number;
    endGrade?: number;
    description?: string | null;
    sortOrder?: number;
    isActive?: boolean;
    isPublished?: boolean;
  }
) {
  const existing = await prisma.learningLevel.findUnique({ where: { id } });
  if (!existing) throw new AppError("Level not found", 404);

  const startGrade = patch.startGrade ?? existing.startGrade;
  const endGrade = patch.endGrade ?? existing.endGrade;
  if (startGrade != null && endGrade != null) {
    assertGradeRange(startGrade, endGrade);
    await assertNoLevelRangeConflict({
      startGrade,
      endGrade,
      excludeId: id,
    });
  }

  if (patch.label) {
    const clash = await prisma.learningLevel.findFirst({
      where: {
        id: { not: id },
        label: { equals: patch.label.trim(), mode: "insensitive" },
      },
    });
    if (clash) {
      throw new AppError("Level name already exists", 409, {
        code: "LEVEL_DUPLICATE",
      });
    }
  }

  return prisma.learningLevel.update({
    where: { id },
    data: {
      ...(patch.label !== undefined ? { label: patch.label.trim() } : {}),
      ...(startGrade != null ? { startGrade } : {}),
      ...(endGrade != null ? { endGrade } : {}),
      ...(patch.description !== undefined
        ? { description: patch.description?.trim() || null }
        : {}),
      ...(patch.sortOrder !== undefined ? { sortOrder: patch.sortOrder } : {}),
      ...(patch.isActive !== undefined ? { isActive: patch.isActive } : {}),
      ...(patch.isPublished !== undefined
        ? { isPublished: patch.isPublished }
        : {}),
    },
  });
}

export async function deactivateLevel(id: string) {
  return updateLevel(id, { isActive: false, isPublished: false });
}

export async function deleteOrArchiveLevel(id: string) {
  const existing = await prisma.learningLevel.findUnique({
    where: { id },
    include: {
      _count: {
        select: {
          children: true,
          groups: true,
          subscriptionPlans: true,
          schoolGrades: true,
          assignments: true,
        },
      },
    },
  });
  if (!existing) throw new AppError("Level not found", 404);

  const inUse =
    existing._count.children > 0 ||
    existing._count.groups > 0 ||
    existing._count.subscriptionPlans > 0 ||
    existing._count.schoolGrades > 0 ||
    existing._count.assignments > 0;

  if (inUse) {
    await deactivateLevel(id);
    return {
      archived: true as const,
      message:
        "Level is in use — deactivated and unpublished instead of deleted.",
      id,
    };
  }

  await prisma.learningLevel.delete({ where: { id } });
  return { deleted: true as const, id };
}

export async function listGradesAdmin(includeInactive = true) {
  return prisma.learningGrade.findMany({
    where: includeInactive ? undefined : { isActive: true },
    orderBy: [
      { gradeNumber: "asc" },
      { sortOrder: "asc" },
      { code: "asc" },
    ],
    include: {
      assignedLevel: {
        select: {
          id: true,
          code: true,
          label: true,
          startGrade: true,
          endGrade: true,
        },
      },
      _count: { select: { levels: true, assignments: true, programmes: true } },
    },
  });
}

export async function createGrade(input: {
  code: string;
  label: string;
  gradeNumber: number;
  assignedLevelId: string;
  description?: string;
  sortOrder?: number;
  isActive?: boolean;
  isPublished?: boolean;
  ageMin?: number;
  ageMax?: number;
}) {
  const code = assertCode(input.code);
  const label = input.label.trim();
  if (!label) throw new AppError("Grade name is required", 400);
  if (
    !Number.isInteger(input.gradeNumber) ||
    input.gradeNumber < 1 ||
    input.gradeNumber > 12
  ) {
    throw new AppError("Grade number must be 1–12", 400);
  }

  const level = await prisma.learningLevel.findUnique({
    where: { id: input.assignedLevelId },
  });
  if (!level) throw new AppError("Assigned level not found", 404);
  if (
    level.startGrade != null &&
    level.endGrade != null &&
    (input.gradeNumber < level.startGrade ||
      input.gradeNumber > level.endGrade)
  ) {
    throw new AppError(
      `Grade ${input.gradeNumber} is outside ${level.label} range (${level.startGrade}–${level.endGrade})`,
      400,
      { code: "GRADE_OUTSIDE_LEVEL" }
    );
  }

  const dupNum = await prisma.learningGrade.findFirst({
    where: { gradeNumber: input.gradeNumber },
  });
  if (dupNum) {
    throw new AppError(`Grade number ${input.gradeNumber} already exists`, 409, {
      code: "GRADE_DUPLICATE",
    });
  }
  const dupCode = await prisma.learningGrade.findUnique({ where: { code } });
  if (dupCode) {
    throw new AppError("Grade code already exists", 409, {
      code: "GRADE_DUPLICATE",
    });
  }

  const ageMin = input.ageMin ?? Math.max(3, input.gradeNumber + 2);
  const ageMax = input.ageMax ?? Math.min(18, input.gradeNumber + 5);

  return prisma.learningGrade.create({
    data: {
      code,
      label,
      gradeNumber: input.gradeNumber,
      assignedLevelId: input.assignedLevelId,
      ageMin,
      ageMax,
      description: input.description?.trim() || null,
      sortOrder: input.sortOrder ?? input.gradeNumber,
      isActive: input.isActive ?? true,
      isPublished: input.isPublished ?? false,
    },
  });
}

export async function updateGrade(
  id: string,
  patch: {
    label?: string;
    gradeNumber?: number;
    assignedLevelId?: string | null;
    description?: string | null;
    sortOrder?: number;
    isActive?: boolean;
    isPublished?: boolean;
  }
) {
  const existing = await prisma.learningGrade.findUnique({ where: { id } });
  if (!existing) throw new AppError("Grade not found", 404);

  const gradeNumber = patch.gradeNumber ?? existing.gradeNumber;
  const assignedLevelId =
    patch.assignedLevelId !== undefined
      ? patch.assignedLevelId
      : existing.assignedLevelId;

  if (gradeNumber != null) {
    if (gradeNumber < 1 || gradeNumber > 12) {
      throw new AppError("Grade number must be 1–12", 400);
    }
    const clash = await prisma.learningGrade.findFirst({
      where: { gradeNumber, id: { not: id } },
    });
    if (clash) {
      throw new AppError(`Grade number ${gradeNumber} already exists`, 409, {
        code: "GRADE_DUPLICATE",
      });
    }
  }

  if (assignedLevelId && gradeNumber != null) {
    const level = await prisma.learningLevel.findUnique({
      where: { id: assignedLevelId },
    });
    if (!level) throw new AppError("Assigned level not found", 404);
    if (
      level.startGrade != null &&
      level.endGrade != null &&
      (gradeNumber < level.startGrade || gradeNumber > level.endGrade)
    ) {
      throw new AppError(
        `Grade ${gradeNumber} is outside ${level.label} range`,
        400,
        { code: "GRADE_OUTSIDE_LEVEL" }
      );
    }
  }

  return prisma.learningGrade.update({
    where: { id },
    data: {
      ...(patch.label !== undefined ? { label: patch.label.trim() } : {}),
      ...(patch.gradeNumber !== undefined ? { gradeNumber } : {}),
      ...(patch.assignedLevelId !== undefined
        ? { assignedLevelId }
        : {}),
      ...(patch.description !== undefined
        ? { description: patch.description?.trim() || null }
        : {}),
      ...(patch.sortOrder !== undefined ? { sortOrder: patch.sortOrder } : {}),
      ...(patch.isActive !== undefined ? { isActive: patch.isActive } : {}),
      ...(patch.isPublished !== undefined
        ? { isPublished: patch.isPublished }
        : {}),
    },
  });
}

export async function deactivateGrade(id: string) {
  return updateGrade(id, { isActive: false, isPublished: false });
}

export async function deleteOrArchiveGrade(id: string) {
  const existing = await prisma.learningGrade.findUnique({
    where: { id },
    include: {
      _count: {
        select: { levels: true, assignments: true, programmes: true },
      },
    },
  });
  if (!existing) throw new AppError("Grade not found", 404);
  const inUse =
    existing._count.levels > 0 ||
    existing._count.assignments > 0 ||
    existing._count.programmes > 0;
  if (inUse) {
    await deactivateGrade(id);
    return {
      archived: true as const,
      message: "Grade is in use — deactivated instead of deleted.",
      id,
    };
  }
  await prisma.learningGrade.delete({ where: { id } });
  return { deleted: true as const, id };
}

/** Parent-facing: published + active levels with grade ranges. */
export async function listPublishedLevels() {
  return prisma.learningLevel.findMany({
    where: { isActive: true, isPublished: true },
    orderBy: [{ sortOrder: "asc" }, { code: "asc" }],
    select: {
      id: true,
      code: true,
      label: true,
      description: true,
      startGrade: true,
      endGrade: true,
      sortOrder: true,
    },
  });
}

/** Parent-facing: published grades for a level. */
export async function listPublishedGrades(levelId?: string) {
  return prisma.learningGrade.findMany({
    where: {
      isActive: true,
      isPublished: true,
      gradeNumber: { not: null },
      ...(levelId ? { assignedLevelId: levelId } : {}),
    },
    orderBy: { gradeNumber: "asc" },
    select: {
      id: true,
      code: true,
      label: true,
      description: true,
      gradeNumber: true,
      assignedLevelId: true,
      assignedLevel: {
        select: { id: true, code: true, label: true },
      },
    },
  });
}

/**
 * Ensure Level-1..3 exist.
 *
 * Grades G1–G12 are NEVER created unless `seedGrades: true` (tests / rare
 * explicit admin seed). Opening Levels or restarting the API must not
 * resurrect grades an admin deleted.
 */
export async function ensureAcademicDefaults(opts?: {
  force?: boolean;
  seedGrades?: boolean;
}) {
  const seedGrades = opts?.seedGrades === true;
  const defaults = [
    { code: "LEVEL_1", label: "Level-1", start: 1, end: 3, sort: 1 },
    { code: "LEVEL_2", label: "Level-2", start: 4, end: 6, sort: 2 },
    { code: "LEVEL_3", label: "Level-3", start: 7, end: 12, sort: 3 },
  ] as const;

  const levels: Record<string, string> = {};
  for (const d of defaults) {
    const existingLevel = await prisma.learningLevel.findUnique({
      where: { code: d.code },
    });
    if (existingLevel) {
      levels[d.code] = existingLevel.id;
      continue;
    }
    const row = await prisma.learningLevel.create({
      data: {
        code: d.code,
        label: d.label,
        startGrade: d.start,
        endGrade: d.end,
        ageMin: d.start + 2,
        ageMax: Math.min(18, d.end + 5),
        sortOrder: d.sort,
        kind: "GRADE_BAND",
        isActive: true,
        isPublished: true,
      },
    });
    levels[d.code] = row.id;
  }

  const gradeCount = await prisma.learningGrade.count();
  if (!seedGrades) {
    return {
      levels: Object.keys(levels),
      grades: gradeCount,
      seededGrades: 0,
      skippedGrades: true as const,
    };
  }

  let seededGrades = 0;
  for (let n = 1; n <= 12; n++) {
    const levelCode = n <= 3 ? "LEVEL_1" : n <= 6 ? "LEVEL_2" : "LEVEL_3";
    const code = `G${n}`;
    const existing = await prisma.learningGrade.findFirst({
      where: { OR: [{ gradeNumber: n }, { code }] },
    });
    if (existing) {
      const patch: {
        gradeNumber?: number;
        assignedLevelId?: string;
      } = {};
      if (existing.gradeNumber == null) patch.gradeNumber = n;
      if (!existing.assignedLevelId) patch.assignedLevelId = levels[levelCode];
      if (Object.keys(patch).length) {
        await prisma.learningGrade.update({
          where: { id: existing.id },
          data: patch,
        });
      }
      continue;
    }
    await prisma.learningGrade.create({
      data: {
        code,
        label: `Grade ${n}`,
        gradeNumber: n,
        assignedLevelId: levels[levelCode],
        ageMin: Math.max(3, n + 2),
        ageMax: Math.min(18, n + 5),
        sortOrder: n,
        isActive: true,
        isPublished: true,
      },
    });
    seededGrades += 1;
  }

  const grades = await prisma.learningGrade.count();
  return {
    levels: Object.keys(levels),
    grades,
    seededGrades,
    skippedGrades: false as const,
  };
}
