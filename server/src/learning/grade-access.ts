import type { Prisma } from "@prisma/client";
import { AppError } from "../lib/errors.js";
import { prisma } from "../lib/prisma.js";
import {
  assertChildHasLearningSeat,
  entitlementSubscription,
  isStaffLearnerAccount,
  isSubscriptionRecordEligible,
} from "../subscriptions/subscription.service.js";

/** Learn Wise product grades (not school grades G1–G12). */
export const PRODUCT_GRADE_LEVEL_CODES = ["LEVEL_1", "LEVEL_2", "LEVEL_3", "LEVEL_4"] as const;

/**
 * Children created before grade selection existed may have no level (or an unpublished one).
 * They have always learned Grade 1 content, so that stays their effective grade.
 */
export const LEGACY_DEFAULT_LEVEL_CODE = "LEVEL_1";

export function productGradeNumber(levelCode: string | null | undefined): number | null {
  const m = /^LEVEL_([1-4])$/.exec(levelCode ?? "");
  return m ? Number(m[1]) : null;
}

/** "Grade 2 – Ages 4–6" for product grades; the level label otherwise. */
export function productGradeLabel(level: { code: string; label: string; ageMin: number; ageMax: number }) {
  const n = productGradeNumber(level.code);
  return n ? `Grade ${n} – Ages ${level.ageMin}–${level.ageMax}` : level.label;
}

/** Grade 1 keeps its original codes so existing achievements are untouched. */
export function categoryAchievementCode(levelCode: string | null | undefined, categoryCode: string) {
  return !levelCode || levelCode === LEGACY_DEFAULT_LEVEL_CODE
    ? `cat_${categoryCode}`
    : `cat_${levelCode}_${categoryCode}`;
}

export function certificateAchievementCode(levelCode: string | null | undefined, categoryCode: string) {
  return !levelCode || levelCode === LEGACY_DEFAULT_LEVEL_CODE
    ? `cert_${categoryCode}`
    : `cert_${levelCode}_${categoryCode}`;
}

const LEVEL_SELECT = {
  id: true,
  code: true,
  label: true,
  ageMin: true,
  ageMax: true,
  isActive: true,
  isPublished: true,
} satisfies Prisma.LearningLevelSelect;

export type EffectiveLevel = Prisma.LearningLevelGetPayload<{ select: typeof LEVEL_SELECT }>;

/** The grade whose content this child learns: the selected level when live, else the legacy default. */
export async function effectiveLevelForChild(childId: string): Promise<EffectiveLevel> {
  const child = await prisma.child.findUnique({
    where: { id: childId },
    select: { level: { select: LEVEL_SELECT } },
  });
  if (!child) throw new AppError("Child not found", 404);
  if (child.level && child.level.isActive && child.level.isPublished) return child.level;
  const fallback = await prisma.learningLevel.findUnique({
    where: { code: LEGACY_DEFAULT_LEVEL_CODE },
    select: LEVEL_SELECT,
  });
  if (!fallback) throw new AppError("No learning grade is available", 409);
  return fallback;
}

/** Eligible grade-wise subscription for exactly this child and grade (newest expiry wins). */
export async function childGradeSubscription(childId: string, levelId: string, now = new Date()) {
  const rows = await prisma.subscription.findMany({
    where: { childId, levelId },
    orderBy: { expiresAt: "desc" },
    take: 10,
  });
  return rows.find((r) => isSubscriptionRecordEligible(r, now)) ?? null;
}

/** Grade-wise checkout release. Family rows created on or after this date never unlock learning. */
const DEFAULT_LEGACY_FAMILY_CUTOFF = "2026-11-12T00:00:00.000Z";

/** Read on each call so operators (and tests) can set LEGACY_FAMILY_CUTOFF without a code change. */
export function legacyFamilyCutoff(): Date {
  const raw = process.env.LEGACY_FAMILY_CUTOFF?.trim();
  const parsed = raw ? new Date(raw) : null;
  return parsed && !Number.isNaN(parsed.getTime()) ? parsed : new Date(DEFAULT_LEGACY_FAMILY_CUTOFF);
}

export function isGrandfatheredFamilyRow(row: { childId: string | null; createdAt: Date }) {
  return row.childId === null && row.createdAt < legacyFamilyCutoff();
}

export type ChildGradeAccess = {
  level: EffectiveLevel;
  gradeLabel: string;
  entitled: boolean;
  /** GRADE = grade-wise subscription; LEGACY_FAMILY = grandfathered family plan + seat; STAFF = admin learner. */
  via: "GRADE" | "LEGACY_FAMILY" | "STAFF" | null;
  expiresAt: Date | null;
  reason: string | null;
};

export async function getChildGradeAccess(parentId: string, childId: string): Promise<ChildGradeAccess> {
  const child = await prisma.child.findFirst({
    where: { id: childId, parentId, isActive: true },
    select: { id: true, hasLearningSeat: true },
  });
  if (!child) throw new AppError("Child not found", 404);
  const level = await effectiveLevelForChild(childId);
  const gradeLabel = productGradeLabel(level);

  if (await isStaffLearnerAccount(parentId)) {
    return { level, gradeLabel, entitled: true, via: "STAFF", expiresAt: null, reason: null };
  }

  const grade = await childGradeSubscription(childId, level.id);
  if (grade) {
    return { level, gradeLabel, entitled: true, via: "GRADE", expiresAt: grade.expiresAt, reason: null };
  }

  const family = await entitlementSubscription(parentId);
  const familyEligible = Boolean(
    family && isSubscriptionRecordEligible(family) && isGrandfatheredFamilyRow(family)
  );
  if (familyEligible && child.hasLearningSeat) {
    return {
      level,
      gradeLabel,
      entitled: true,
      via: "LEGACY_FAMILY",
      expiresAt: family!.expiresAt,
      reason: null,
    };
  }

  return {
    level,
    gradeLabel,
    entitled: false,
    via: null,
    expiresAt: null,
    reason: familyEligible
      ? "This child needs a learning seat. Ask a parent to assign one."
      : `A ${gradeLabel.split(" – ")[0]} subscription is needed for this child. Ask a parent to subscribe.`,
  };
}

export async function assertChildGradeAccess(parentId: string, childId: string) {
  const access = await getChildGradeAccess(parentId, childId);
  if (!access.entitled) {
    const family = await entitlementSubscription(parentId);
    if (family && isSubscriptionRecordEligible(family) && isGrandfatheredFamilyRow(family)) {
      await assertChildHasLearningSeat(parentId, childId);
    }
    throw new AppError(access.reason ?? "A subscription is needed for this grade", 402, {
      code: "SUBSCRIPTION_REQUIRED",
      scope: "GRADE",
      childId,
      levelCode: access.level.code,
      gradeLabel: access.gradeLabel,
    });
  }
  return access;
}

export function assertSameGrade(contentLevelId: string | null | undefined, level: EffectiveLevel) {
  if (contentLevelId !== level.id) {
    throw new AppError(`This content is not part of ${productGradeLabel(level)}`, 403, {
      code: "GRADE_CONTENT_FORBIDDEN",
      levelCode: level.code,
    });
  }
}
