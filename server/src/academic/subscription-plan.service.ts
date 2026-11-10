import { AppError } from "../lib/errors.js";
import { prisma } from "../lib/prisma.js";
import { env } from "../config/env.js";
import type { PriceRegion } from "../payments/region.js";

const ALLOWED_DURATIONS = new Set([1, 3, 6, 12]);
const CODE_RE = /^[A-Z0-9_]{1,40}$/;

function assertCode(code: string) {
  const normalized = code.trim().toUpperCase();
  if (!CODE_RE.test(normalized)) {
    throw new AppError(
      "Plan code must be 1–40 chars: A–Z, 0–9, underscore only",
      400
    );
  }
  return normalized;
}

function taxOn(amountPaise: number) {
  const bps = env.TAX_RATE_BPS ?? 0;
  return Math.round((amountPaise * bps) / 10000);
}

export function purposeForDuration(months: number) {
  if (months === 1) return "FAMILY_MONTHLY" as const;
  if (months === 3) return "FAMILY_3_MONTH" as const;
  if (months === 6) return "FAMILY_6_MONTH" as const;
  if (months === 12) return "FAMILY_YEARLY" as const;
  throw new AppError("Unsupported duration", 400);
}

export async function listPlansAdmin(includeInactive = true) {
  return prisma.subscriptionPlan.findMany({
    where: includeInactive ? undefined : { isActive: true },
    // Always shortest → longest duration (1 mo → 1 year)
    orderBy: [{ durationMonths: "asc" }, { sortOrder: "asc" }, { name: "asc" }],
    include: {
      level: { select: { id: true, code: true, label: true } },
    },
  });
}

export async function createPlan(input: {
  name: string;
  code: string;
  description?: string;
  durationMonths: number;
  amountPaise: number;
  amountPhpCentavos?: number | null;
  applicableLevel?: string;
  levelId?: string | null;
  includedSeats?: number;
  sortOrder?: number;
  isActive?: boolean;
  isPublished?: boolean;
}) {
  const code = assertCode(input.code);
  const name = input.name.trim();
  if (!name) throw new AppError("Plan name is required", 400);
  if (!ALLOWED_DURATIONS.has(input.durationMonths)) {
    throw new AppError("Duration must be 1, 3, 6, or 12 months", 400);
  }
  if (!Number.isInteger(input.amountPaise) || input.amountPaise <= 0) {
    throw new AppError("Amount must be greater than zero (paise)", 400);
  }

  const applicableLevel = (input.applicableLevel ?? "ALL").toUpperCase();
  if (
    !["ALL", "LEVEL_1", "LEVEL_2", "LEVEL_3"].includes(applicableLevel) &&
    !input.levelId
  ) {
    // allow custom level codes via levelId
  }

  if (input.levelId) {
    const level = await prisma.learningLevel.findUnique({
      where: { id: input.levelId },
    });
    if (!level) throw new AppError("Applicable level not found", 404);
  }

  const dup = await prisma.subscriptionPlan.findUnique({ where: { code } });
  if (dup) {
    throw new AppError("Plan code already exists", 409, {
      code: "PLAN_DUPLICATE",
    });
  }

  return prisma.subscriptionPlan.create({
    data: {
      name,
      code,
      description: input.description?.trim() || null,
      durationMonths: input.durationMonths,
      amountPaise: input.amountPaise,
      amountPhpCentavos: input.amountPhpCentavos ?? null,
      currency: env.PAYMENT_CURRENCY ?? "INR",
      applicableLevel,
      levelId: input.levelId ?? null,
      includedSeats: input.includedSeats ?? 2,
      sortOrder: input.sortOrder ?? input.durationMonths,
      isActive: input.isActive ?? true,
      // New plans are visible to parents immediately (admin can Unpublish).
      isPublished: input.isPublished ?? true,
    },
  });
}

export async function updatePlan(
  id: string,
  patch: {
    name?: string;
    description?: string | null;
    durationMonths?: number;
    amountPaise?: number;
    amountPhpCentavos?: number | null;
    applicableLevel?: string;
    levelId?: string | null;
    includedSeats?: number;
    sortOrder?: number;
    isActive?: boolean;
    isPublished?: boolean;
  }
) {
  const existing = await prisma.subscriptionPlan.findUnique({ where: { id } });
  if (!existing) throw new AppError("Plan not found", 404);

  if (
    patch.durationMonths !== undefined &&
    !ALLOWED_DURATIONS.has(patch.durationMonths)
  ) {
    throw new AppError("Duration must be 1, 3, 6, or 12 months", 400);
  }
  if (patch.amountPaise !== undefined && patch.amountPaise <= 0) {
    throw new AppError("Amount must be greater than zero (paise)", 400);
  }

  return prisma.subscriptionPlan.update({
    where: { id },
    data: {
      ...(patch.name !== undefined ? { name: patch.name.trim() } : {}),
      ...(patch.description !== undefined
        ? { description: patch.description?.trim() || null }
        : {}),
      ...(patch.durationMonths !== undefined
        ? { durationMonths: patch.durationMonths }
        : {}),
      ...(patch.amountPaise !== undefined
        ? { amountPaise: patch.amountPaise }
        : {}),
      ...(patch.amountPhpCentavos !== undefined
        ? { amountPhpCentavos: patch.amountPhpCentavos }
        : {}),
      ...(patch.applicableLevel !== undefined
        ? { applicableLevel: patch.applicableLevel.toUpperCase() }
        : {}),
      ...(patch.levelId !== undefined ? { levelId: patch.levelId } : {}),
      ...(patch.includedSeats !== undefined
        ? { includedSeats: patch.includedSeats }
        : {}),
      ...(patch.sortOrder !== undefined ? { sortOrder: patch.sortOrder } : {}),
      ...(patch.isActive !== undefined ? { isActive: patch.isActive } : {}),
      ...(patch.isPublished !== undefined
        ? { isPublished: patch.isPublished }
        : {}),
    },
  });
}

export async function deactivatePlan(id: string) {
  return updatePlan(id, { isActive: false, isPublished: false });
}

export async function deleteOrArchivePlan(id: string) {
  const existing = await prisma.subscriptionPlan.findUnique({ where: { id } });
  if (!existing) throw new AppError("Plan not found", 404);

  // Preserve history: never hard-delete if any payment referenced this plan code.
  const payments = await prisma.payment.count({
    where: { planCode: existing.code },
  });
  const subs = await prisma.subscription.count({
    where: { plan: existing.code },
  });
  if (payments > 0 || subs > 0) {
    await deactivatePlan(id);
    return {
      archived: true as const,
      message:
        "Plan has payment/subscription history — deactivated instead of deleted.",
      id,
    };
  }
  await prisma.subscriptionPlan.delete({ where: { id } });
  return { deleted: true as const, id };
}

/** PH parents pay the plan's PHP price as entered (no tax added); plans without one stay in INR. */
function regionalPrice(
  p: { amountPaise: number; currency: string; amountPhpCentavos: number | null },
  region: PriceRegion
) {
  if (region === "PH" && p.amountPhpCentavos && p.amountPhpCentavos > 0) {
    return {
      amountPaise: p.amountPhpCentavos,
      taxPaise: 0,
      totalPaise: p.amountPhpCentavos,
      currency: "PHP",
    };
  }
  const taxPaise = taxOn(p.amountPaise);
  return {
    amountPaise: p.amountPaise,
    taxPaise,
    totalPaise: p.amountPaise + taxPaise,
    currency: p.currency,
  };
}

export type PublicPlan = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  durationMonths: number;
  amountPaise: number;
  taxPaise: number;
  totalPaise: number;
  currency: string;
  applicableLevel: string;
  levelId: string | null;
  level: { id: string; code: string; label: string } | null;
  includedSeats: number;
  purpose: string;
};

export async function listPublishedPlans(
  levelId?: string,
  region: PriceRegion = "IN"
): Promise<PublicPlan[]> {
  const rows = await prisma.subscriptionPlan.findMany({
    where: {
      isActive: true,
      isPublished: true,
      ...(levelId
        ? {
            OR: [
              { applicableLevel: "ALL" },
              { levelId },
            ],
          }
        : {}),
    },
    orderBy: [{ durationMonths: "asc" }, { sortOrder: "asc" }],
    include: {
      level: { select: { id: true, code: true, label: true } },
    },
  });

  // If filtering by level, also match applicableLevel code of that level.
  let filtered = rows;
  if (levelId) {
    const level = await prisma.learningLevel.findUnique({
      where: { id: levelId },
    });
    filtered = rows.filter(
      (p) =>
        p.applicableLevel === "ALL" ||
        p.levelId === levelId ||
        (level && p.applicableLevel === level.code)
    );
  }

  return filtered.map((p) => {
    return {
      id: p.id,
      code: p.code,
      name: p.name,
      description: p.description,
      durationMonths: p.durationMonths,
      ...regionalPrice(p, region),
      applicableLevel: p.applicableLevel,
      levelId: p.levelId,
      level: p.level,
      includedSeats: p.includedSeats,
      purpose: purposeForDuration(p.durationMonths),
    };
  });
}

export async function getPublishedPlanById(planId: string, region: PriceRegion = "IN") {
  const p = await prisma.subscriptionPlan.findFirst({
    where: { id: planId, isActive: true, isPublished: true },
    include: { level: { select: { id: true, code: true, label: true } } },
  });
  if (!p) return null;
  return {
    id: p.id,
    code: p.code,
    name: p.name,
    description: p.description,
    durationMonths: p.durationMonths,
    ...regionalPrice(p, region),
    applicableLevel: p.applicableLevel,
    levelId: p.levelId,
    level: p.level,
    includedSeats: p.includedSeats,
    purpose: purposeForDuration(p.durationMonths),
  };
}
