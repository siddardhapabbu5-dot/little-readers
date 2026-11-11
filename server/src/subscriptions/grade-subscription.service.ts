import { AppError } from "../lib/errors.js";
import { prisma } from "../lib/prisma.js";
import { recordSubscriptionAudit } from "./audit.js";
import { isSubscriptionRecordEligible } from "./subscription.service.js";
import {
  effectiveLevelForChild,
  getChildGradeAccess,
  productGradeLabel,
  productGradeNumber,
} from "../learning/grade-access.js";

/**
 * Admin-granted grade-wise entitlement for one child in one Learn Wise grade (₹0, no gateway).
 * Stacks on an eligible entitlement for the same child + grade.
 */
export async function grantChildGradeSubscription(input: {
  childId: string;
  levelId: string;
  months: number;
  grantedByUserId: string;
}) {
  const months = Math.floor(input.months);
  if (!Number.isFinite(months) || ![1, 3, 6, 12].includes(months)) {
    throw new AppError("months must be 1, 3, 6 or 12", 400);
  }
  const [child, level] = await Promise.all([
    prisma.child.findFirst({
      where: { id: input.childId, isActive: true },
      select: { id: true, parentId: true, displayName: true },
    }),
    prisma.learningLevel.findUnique({
      where: { id: input.levelId },
      select: { id: true, code: true, label: true, ageMin: true, ageMax: true },
    }),
  ]);
  if (!child) throw new AppError("Child not found", 404);
  if (!level || !productGradeNumber(level.code)) {
    throw new AppError("levelId must be a Learn Wise grade (Grade 1–4)", 400);
  }

  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT id FROM "Child" WHERE id = ${child.id} FOR UPDATE`;
    const now = new Date();
    const current = (
      await tx.subscription.findMany({
        where: { childId: child.id, levelId: level.id },
        orderBy: { expiresAt: "desc" },
        take: 10,
      })
    ).find((r) => isSubscriptionRecordEligible(r, now));
    const base = current && current.expiresAt > now ? current.expiresAt : now;
    const expiresAt = new Date(base);
    expiresAt.setMonth(expiresAt.getMonth() + months);
    const plan = `GRADE_${productGradeNumber(level.code)}_${months}M`;
    const providerRef = `grade_grant_${child.id}_${level.code}_${Date.now()}`;

    const subscription = await tx.subscription.create({
      data: {
        userId: child.parentId,
        childId: child.id,
        levelId: level.id,
        plan,
        status: "ACTIVE",
        startedAt: now,
        expiresAt,
        provider: "manual_admin",
        providerRef,
        includedSeats: 1,
        extraSeats: 0,
        verificationStatus: "MANUAL",
        verifiedAt: now,
      },
    });

    await recordSubscriptionAudit(
      {
        userId: child.parentId,
        subscriptionId: subscription.id,
        provider: "manual_admin",
        source: "admin",
        eventType: "GRADE_GRANT",
        fromStatus: null,
        toStatus: subscription.status,
        details: {
          childId: child.id,
          levelCode: level.code,
          months,
          grantedByUserId: input.grantedByUserId,
          expiresAt: expiresAt.toISOString(),
        },
      },
      tx
    );

    await tx.payment.create({
      data: {
        userId: child.parentId,
        subscriptionId: subscription.id,
        amountCents: 0,
        status: "SUCCEEDED",
        provider: "manual_admin",
        purpose: "MANUAL_ADMIN",
        planCode: `MANUAL_${plan}`,
        providerRef: `${providerRef}_payment`,
        paidAt: now,
      },
    });

    return {
      subscription: {
        id: subscription.id,
        childId: child.id,
        childName: child.displayName,
        levelCode: level.code,
        gradeLabel: productGradeLabel(level),
        plan,
        status: subscription.status,
        expiresAt: subscription.expiresAt,
      },
    };
  });
}

/** Admin: end a grade-wise entitlement now (testing expiry / support). */
export async function expireChildGradeSubscription(subscriptionId: string, adminUserId: string) {
  const sub = await prisma.subscription.findUnique({ where: { id: subscriptionId } });
  if (!sub || !sub.childId) throw new AppError("Grade subscription not found", 404);
  const now = new Date();
  const updated = await prisma.subscription.update({
    where: { id: sub.id },
    data: { status: "EXPIRED", expiresAt: now, graceEndsAt: null },
  });
  await recordSubscriptionAudit({
    userId: sub.userId,
    subscriptionId: sub.id,
    provider: sub.provider,
    source: "admin",
    eventType: "GRADE_EXPIRE",
    fromStatus: sub.status,
    toStatus: "EXPIRED",
    details: { adminUserId },
  });
  return { id: updated.id, status: updated.status, expiresAt: updated.expiresAt };
}

const GRADE_SUB_SELECT = {
  id: true,
  plan: true,
  status: true,
  provider: true,
  startedAt: true,
  expiresAt: true,
  cancelledAt: true,
  graceEndsAt: true,
  level: { select: { id: true, code: true, label: true, ageMin: true, ageMax: true } },
} as const;

/** Each active child with its Learn Wise grade, current access and grade-wise subscriptions. */
export async function listChildGradeAccess(parentId: string) {
  const children = await prisma.child.findMany({
    where: { parentId, isActive: true },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      displayName: true,
      gradeSubscriptions: { orderBy: { expiresAt: "desc" }, take: 10, select: GRADE_SUB_SELECT },
    },
  });
  const now = new Date();
  return Promise.all(
    children.map(async (c) => {
      const access = await getChildGradeAccess(parentId, c.id);
      return {
        childId: c.id,
        displayName: c.displayName,
        level: {
          id: access.level.id,
          code: access.level.code,
          ageMin: access.level.ageMin,
          ageMax: access.level.ageMax,
        },
        gradeLabel: access.gradeLabel,
        entitled: access.entitled,
        via: access.via,
        expiresAt: access.expiresAt,
        reason: access.reason,
        gradeSubscriptions: c.gradeSubscriptions.map((s) => ({
          id: s.id,
          plan: s.plan,
          status: s.status,
          provider: s.provider,
          startedAt: s.startedAt,
          expiresAt: s.expiresAt,
          eligible: isSubscriptionRecordEligible(s, now),
          levelCode: s.level?.code ?? null,
          gradeLabel: s.level ? productGradeLabel(s.level) : null,
        })),
      };
    })
  );
}

/** Admin lookup: a parent's children with grade access, by parent email. */
export async function listChildGradeAccessByParentEmail(email: string) {
  const parent = await prisma.user.findFirst({
    where: { email: { equals: email.trim(), mode: "insensitive" }, role: "PARENT" },
    select: { id: true, name: true, email: true },
  });
  if (!parent) throw new AppError("Parent not found", 404);
  return { parent, children: await listChildGradeAccess(parent.id) };
}

/** Admin view of one child's grade access (any parent). */
export async function getChildGradeAccessForAdmin(childId: string) {
  const child = await prisma.child.findUnique({ where: { id: childId }, select: { parentId: true } });
  if (!child) throw new AppError("Child not found", 404);
  const rows = await listChildGradeAccess(child.parentId);
  const row = rows.find((r) => r.childId === childId);
  if (!row) throw new AppError("Child not found", 404);
  return row;
}

export { effectiveLevelForChild };
