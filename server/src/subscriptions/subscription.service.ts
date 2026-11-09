import type { Prisma, Subscription, SubscriptionStatus } from "@prisma/client";
import { AppError } from "../lib/errors.js";
import { prisma } from "../lib/prisma.js";
import { recordSubscriptionAudit } from "./audit.js";

/** Paid / recovering access only — no free TRIALING for client builds. */
const ELIGIBLE: SubscriptionStatus[] = [
  "ACTIVE",
  "GRACE",
  "PAST_DUE", // grace-style access while payment recovers; policy can tighten later
];

const BASE_INCLUDED_SEATS = 2;

export function isSubscriptionRecordEligible(
  sub: Pick<
    Subscription,
    "status" | "expiresAt" | "graceEndsAt" | "cancelledAt"
  >,
  now = new Date()
): boolean {
  // Cancelled at period end: access continues until expiresAt.
  if (sub.status === "CANCELLED") {
    if (sub.expiresAt > now) return true;
    if (sub.graceEndsAt && sub.graceEndsAt > now) return true;
    return false;
  }
  if (!ELIGIBLE.includes(sub.status)) {
    if (sub.status === "GRACE" && sub.graceEndsAt && sub.graceEndsAt > now) {
      return true;
    }
    return false;
  }
  if (sub.expiresAt <= now) {
    if (sub.graceEndsAt && sub.graceEndsAt > now) return true;
    return false;
  }
  return true;
}

export function seatCapacity(
  sub: Pick<Subscription, "includedSeats" | "extraSeats"> | null | undefined
) {
  if (!sub) return BASE_INCLUDED_SEATS;
  return Math.max(0, (sub.includedSeats ?? BASE_INCLUDED_SEATS) + (sub.extraSeats ?? 0));
}

/**
 * The subscription row that currently decides a parent's access, across all providers
 * (google_play, razorpay, manual_admin): the eligible row that runs longest, else the newest row.
 */
export async function entitlementSubscription(
  userId: string,
  tx: Prisma.TransactionClient | typeof prisma = prisma
) {
  const rows = await tx.subscription.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: 25,
  });
  if (!rows.length) return null;
  const now = new Date();
  const eligible = rows.filter((r) => isSubscriptionRecordEligible(r, now));
  if (!eligible.length) return rows[0];
  return eligible.reduce((best, r) => (r.expiresAt > best.expiresAt ? r : best));
}

const latestSubscription = entitlementSubscription;

export async function getSeatSnapshot(parentId: string, tx: Prisma.TransactionClient | typeof prisma = prisma) {
  const subscription = await latestSubscription(parentId, tx);
  const eligible = subscription
    ? isSubscriptionRecordEligible(subscription)
    : false;
  // Expired / missing subscriptions grant zero claimable seats.
  const capacity = eligible ? seatCapacity(subscription) : 0;
  const [assigned, children] = await Promise.all([
    tx.child.count({
      where: { parentId, isActive: true, hasLearningSeat: true },
    }),
    tx.child.findMany({
      where: { parentId, isActive: true },
      select: {
        id: true,
        displayName: true,
        hasLearningSeat: true,
        createdAt: true,
      },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  return {
    subscription,
    eligible,
    included: subscription?.includedSeats ?? BASE_INCLUDED_SEATS,
    extra: subscription?.extraSeats ?? 0,
    /** Plan capacity when eligible; 0 when expired/missing. */
    capacity,
    /** Raw plan capacity ignoring eligibility (for Parent UI messaging). */
    planCapacity: seatCapacity(subscription),
    assigned,
    available: Math.max(0, capacity - assigned),
    children: children.map((c) => ({
      id: c.id,
      displayName: c.displayName,
      hasLearningSeat: c.hasLearningSeat,
    })),
  };
}

/**
 * Atomically claim a learning seat for a newly created (or existing) child when capacity allows.
 * Returns whether the seat was granted.
 */
export async function tryAssignLearningSeat(
  parentId: string,
  childId: string,
  tx: Prisma.TransactionClient
): Promise<boolean> {
  // Serialize all seat changes for this parent (works even when no subscription row).
  await tx.$executeRaw`SELECT id FROM "User" WHERE id = ${parentId} FOR UPDATE`;

  const subscription = await latestSubscription(parentId, tx);
  const capacity = seatCapacity(subscription);

  if (subscription) {
    await tx.$executeRaw`SELECT id FROM "Subscription" WHERE id = ${subscription.id} FOR UPDATE`;
  }

  const child = await tx.child.findFirst({
    where: { id: childId, parentId, isActive: true },
  });
  if (!child) throw new AppError("Child not found", 404);
  if (child.hasLearningSeat) return true;

  // No eligible subscription → no seats to claim.
  if (
    !subscription ||
    !isSubscriptionRecordEligible(subscription) ||
    capacity <= 0
  ) {
    return false;
  }

  const assigned = await tx.child.count({
    where: { parentId, isActive: true, hasLearningSeat: true },
  });
  if (assigned >= capacity) return false;

  await tx.child.update({
    where: { id: childId },
    data: { hasLearningSeat: true },
  });
  return true;
}

export async function assignLearningSeat(parentId: string, childId: string) {
  return prisma.$transaction(async (tx) => {
    const ok = await tryAssignLearningSeat(parentId, childId, tx);
    if (!ok) {
      const snap = await getSeatSnapshot(parentId, tx);
      throw new AppError(
        `No learning seats available (${snap.assigned}/${snap.capacity} used). Purchase an extra child seat or unassign another child.`,
        402,
        {
          code: "NO_SEAT_AVAILABLE",
          seats: {
            included: snap.included,
            extra: snap.extra,
            capacity: snap.capacity,
            assigned: snap.assigned,
            available: snap.available,
          },
        }
      );
    }
    return getSeatSnapshot(parentId, tx);
  });
}

export async function unassignLearningSeat(parentId: string, childId: string) {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT id FROM "User" WHERE id = ${parentId} FOR UPDATE`;
    const child = await tx.child.findFirst({
      where: { id: childId, parentId, isActive: true },
    });
    if (!child) throw new AppError("Child not found", 404);

    if (child.hasLearningSeat) {
      await tx.child.update({
        where: { id: childId },
        data: { hasLearningSeat: false },
      });
    }
    return getSeatSnapshot(parentId, tx);
  });
}

export async function assertChildHasLearningSeat(parentId: string, childId: string) {
  const child = await prisma.child.findFirst({
    where: { id: childId, parentId, isActive: true },
    select: { id: true, displayName: true, hasLearningSeat: true },
  });
  if (!child) throw new AppError("Child not found", 404);

  if (child.hasLearningSeat) return child;

  const snap = await getSeatSnapshot(parentId);
  throw new AppError(
    `${child.displayName} needs an active learning seat. Your plan includes ${snap.included} child seats` +
      (snap.extra ? ` plus ${snap.extra} add-on seat(s)` : "") +
      ` (${snap.assigned}/${snap.capacity} in use).`,
    402,
    {
      code: "SEAT_REQUIRED",
      childId: child.id,
      childName: child.displayName,
      seats: {
        included: snap.included,
        extra: snap.extra,
        capacity: snap.capacity,
        assigned: snap.assigned,
        available: snap.available,
      },
    }
  );
}

/** Mark ACTIVE/CANCELLED/GRACE rows EXPIRED when past expiresAt (and grace). Idempotent. */
export async function syncSubscriptionExpiry(userId: string) {
  const now = new Date();
  await prisma.subscription.updateMany({
    where: {
      userId,
      status: { in: ["ACTIVE", "CANCELLED", "GRACE", "PAST_DUE", "TRIALING"] },
      expiresAt: { lte: now },
      OR: [{ graceEndsAt: null }, { graceEndsAt: { lte: now } }],
    },
    data: { status: "EXPIRED" },
  });
  return latestSubscription(userId);
}

export function providerManagement(provider: string | null | undefined) {
  if (provider === "google_play") {
    return {
      provider: "google_play",
      label: "Google Play",
      canCancelHere: false,
      instructions:
        "Managed by Google Play. To cancel or change, open Google Play → Profile → Payments & subscriptions → Subscriptions.",
    };
  }
  if (provider === "razorpay") {
    return {
      provider: "razorpay",
      label: "Website (Razorpay)",
      canCancelHere: false,
      instructions:
        "Prepaid plan bought on the LEARN WISE website. It does not renew automatically, so there is nothing to cancel.",
    };
  }
  return {
    provider: provider ?? "none",
    label: provider === "manual_admin" ? "Granted by LEARN WISE" : "—",
    canCancelHere: false,
    instructions: "Contact LEARN WISE support for changes to this plan.",
  };
}

/**
 * Parent cancels renewal. Store-managed (Google Play) subscriptions must be cancelled in the store.
 */
export async function cancelParentSubscription(userId: string) {
  const subscription = await latestSubscription(userId);
  if (!subscription) {
    throw new AppError("No subscription to cancel", 404);
  }
  if (subscription.provider === "google_play") {
    throw new AppError(
      "This subscription is managed by Google Play. Cancel it in Google Play → Payments & subscriptions.",
      409,
      { code: "MANAGED_BY_GOOGLE_PLAY" }
    );
  }
  if (subscription.status === "EXPIRED") {
    throw new AppError("Subscription already expired", 400);
  }
  if (subscription.status === "CANCELLED" && subscription.cancelledAt) {
    return {
      id: subscription.id,
      status: subscription.status,
      cancelledAt: subscription.cancelledAt,
      expiresAt: subscription.expiresAt,
      message: "Subscription was already cancelled. Access continues until expiry.",
    };
  }
  const updated = await prisma.subscription.update({
    where: { id: subscription.id },
    data: {
      status: "CANCELLED",
      cancelledAt: new Date(),
    },
  });
  return {
    id: updated.id,
    status: updated.status,
    cancelledAt: updated.cancelledAt,
    expiresAt: updated.expiresAt,
    message:
      "Subscription cancelled. Learning access continues until the current period ends.",
  };
}

export async function getParentSubscription(userId: string) {
  const current = await syncSubscriptionExpiry(userId);

  const subscription = current
    ? await prisma.subscription.findUnique({
        where: { id: current.id },
        include: {
          payments: {
            orderBy: { createdAt: "desc" },
            take: 5,
          },
        },
      })
    : null;

  const seats = await getSeatSnapshot(userId);

  if (!subscription) {
    return {
      subscription: null,
      eligible: false,
      reason: "No subscription found",
      seats: {
        included: seats.included,
        extra: seats.extra,
        capacity: seats.capacity,
        planCapacity: seats.planCapacity,
        assigned: seats.assigned,
        available: seats.available,
        children: seats.children,
      },
    };
  }

  const eligible = isSubscriptionRecordEligible(subscription);
  return {
    subscription: {
      id: subscription.id,
      plan: subscription.plan,
      status: subscription.status,
      startedAt: subscription.startedAt,
      expiresAt: subscription.expiresAt,
      cancelledAt: subscription.cancelledAt,
      graceEndsAt: subscription.graceEndsAt,
      provider: subscription.provider,
      productId: subscription.productId,
      autoRenewing: subscription.autoRenewing,
      verificationStatus: subscription.verificationStatus,
      renewsAt:
        subscription.autoRenewing && subscription.status === "ACTIVE"
          ? subscription.expiresAt
          : null,
      management: providerManagement(subscription.provider),
      includedSeats: subscription.includedSeats,
      extraSeats: subscription.extraSeats,
      payments: subscription.payments,
    },
    eligible,
    reason: eligible
      ? null
      : `Subscription status ${subscription.status} is not eligible for learning access`,
    seats: {
      included: seats.included,
      extra: seats.extra,
      capacity: seats.capacity,
      planCapacity: seats.planCapacity,
      assigned: seats.assigned,
      available: seats.available,
      children: seats.children,
    },
  };
}

/** Admins play with their own Admin Practice learner without a paid plan. */
export async function isStaffLearnerAccount(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true, isActive: true },
  });
  return Boolean(user?.isActive && (user.role === "ADMIN" || user.role === "SUPER_ADMIN"));
}

export async function assertParentSubscriptionEligible(parentId: string) {
  const result = await getParentSubscription(parentId);
  if (!result.eligible && !(await isStaffLearnerAccount(parentId))) {
    throw new AppError(
      result.reason ??
        "An active subscription is required to access learning activities",
      402,
      { code: "SUBSCRIPTION_REQUIRED" }
    );
  }
  return result;
}

/**
 * Admin / ledger grant of extra seats. Requires a SUCCEEDED Payment row in the same call
 * when amountCents > 0; zero-amount admin grants are allowed with provider "manual_admin".
 */
export async function grantExtraSeats(input: {
  parentUserId: string;
  seats: number;
  amountCents?: number;
  provider?: string;
  providerRef?: string;
  grantedByUserId: string;
}) {
  const n = Math.floor(input.seats);
  if (!Number.isFinite(n) || n < 1 || n > 20) {
    throw new AppError("seats must be between 1 and 20", 400);
  }

  return prisma.$transaction(async (tx) => {
    const subscription = await latestSubscription(input.parentUserId, tx);
    if (!subscription) {
      throw new AppError("Parent has no subscription to attach seats to", 404);
    }

    await tx.$executeRaw`SELECT id FROM "Subscription" WHERE id = ${subscription.id} FOR UPDATE`;

    const amountCents = input.amountCents ?? 0;
    const provider = input.provider ?? "manual_admin";
    const payment = await tx.payment.create({
      data: {
        userId: input.parentUserId,
        subscriptionId: subscription.id,
        amountCents,
        status: "SUCCEEDED",
        provider,
        purpose: "MANUAL_ADMIN",
        seatsPurchased: n,
        planCode: "MANUAL_ADMIN_GRANT",
        providerRef:
          input.providerRef ??
          `seat_grant_${input.grantedByUserId}_${Date.now()}_${n}`,
        paidAt: new Date(),
      },
    });

    const updated = await tx.subscription.update({
      where: { id: subscription.id },
      data: { extraSeats: { increment: n } },
    });

    return {
      subscription: {
        id: updated.id,
        includedSeats: updated.includedSeats,
        extraSeats: updated.extraSeats,
        capacity: seatCapacity(updated),
      },
      payment: { id: payment.id, amountCents: payment.amountCents, status: payment.status },
      seatsAdded: n,
    };
  });
}

/**
 * Admin grant of a free family subscription (no payment provider). Creates or extends the
 * parent's latest subscription and seats any unseated children up to capacity.
 */
export async function grantManualSubscription(input: {
  parentEmail: string;
  months: number;
  grantedByUserId: string;
}) {
  const months = Math.floor(input.months);
  if (!Number.isFinite(months) || months < 1 || months > 24) {
    throw new AppError("months must be between 1 and 24", 400);
  }
  const email = input.parentEmail.trim().toLowerCase();
  const parent = await prisma.user.findFirst({
    where: { email: { equals: email, mode: "insensitive" } },
    select: { id: true, role: true, email: true, name: true },
  });
  if (!parent) throw new AppError("No account found with that email", 404);
  if (parent.role !== "PARENT") {
    throw new AppError("Subscriptions can only be granted to parent accounts", 400);
  }

  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT id FROM "User" WHERE id = ${parent.id} FOR UPDATE`;
    const now = new Date();
    // Manual grants live on their own manual_admin row so gateway-paid rows are never relabelled.
    const current = await latestSubscription(parent.id, tx);
    const existing = await tx.subscription.findFirst({
      where: { userId: parent.id, provider: "manual_admin" },
      orderBy: { createdAt: "desc" },
    });
    const base =
      current && isSubscriptionRecordEligible(current, now) && current.expiresAt > now
        ? current.expiresAt
        : now;
    const expiresAt = new Date(base);
    expiresAt.setMonth(expiresAt.getMonth() + months);
    const plan = months >= 12 ? "YEARLY" : months === 1 ? "MONTHLY" : `${months}_MONTH`;
    const providerRef = `manual_sub_${input.grantedByUserId}_${Date.now()}`;

    const subscription = existing
      ? await tx.subscription.update({
          where: { id: existing.id },
          data: {
            plan,
            status: "ACTIVE",
            expiresAt,
            graceEndsAt: null,
            cancelledAt: null,
            providerRef,
            verificationStatus: "MANUAL",
            verifiedAt: now,
          },
        })
      : await tx.subscription.create({
          data: {
            userId: parent.id,
            plan,
            status: "ACTIVE",
            startedAt: now,
            expiresAt,
            provider: "manual_admin",
            providerRef,
            includedSeats: current?.includedSeats ?? BASE_INCLUDED_SEATS,
            extraSeats: current?.extraSeats ?? 0,
            verificationStatus: "MANUAL",
            verifiedAt: now,
          },
        });

    await recordSubscriptionAudit(
      {
        userId: parent.id,
        subscriptionId: subscription.id,
        provider: "manual_admin",
        source: "admin",
        eventType: "MANUAL_GRANT",
        fromStatus: existing?.status ?? null,
        toStatus: subscription.status,
        details: {
          months,
          grantedByUserId: input.grantedByUserId,
          expiresAt: expiresAt.toISOString(),
        },
      },
      tx
    );

    await tx.payment.create({
      data: {
        userId: parent.id,
        subscriptionId: subscription.id,
        amountCents: 0,
        status: "SUCCEEDED",
        provider: "manual_admin",
        purpose: "MANUAL_ADMIN",
        planCode: `MANUAL_ADMIN_SUBSCRIPTION_${months}M`,
        providerRef: `${providerRef}_payment`,
        paidAt: now,
      },
    });

    const waiting = await tx.child.findMany({
      where: { parentId: parent.id, isActive: true, hasLearningSeat: false },
      orderBy: { createdAt: "asc" },
      select: { id: true },
    });
    let seated = 0;
    for (const child of waiting) {
      if (await tryAssignLearningSeat(parent.id, child.id, tx)) seated += 1;
    }

    return {
      parent: { id: parent.id, email: parent.email, name: parent.name },
      subscription: {
        id: subscription.id,
        plan: subscription.plan,
        status: subscription.status,
        expiresAt: subscription.expiresAt,
        capacity: seatCapacity(subscription),
      },
      childrenSeated: seated,
    };
  });
}

/** Subscription fields safe to show to Admin (never the store purchase token). */
const ADMIN_SUBSCRIPTION_SELECT = {
  id: true,
  userId: true,
  plan: true,
  status: true,
  startedAt: true,
  expiresAt: true,
  cancelledAt: true,
  graceEndsAt: true,
  provider: true,
  providerRef: true,
  productId: true,
  autoRenewing: true,
  countryCode: true,
  verificationStatus: true,
  verifiedAt: true,
  acknowledgedAt: true,
  includedSeats: true,
  extraSeats: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.SubscriptionSelect;

export async function listSubscriptionsForAdmin(take = 50, query?: string) {
  const q = query?.trim();
  const userIds = q
    ? (
        await prisma.user.findMany({
          where: {
            OR: [
              { email: { contains: q, mode: "insensitive" } },
              { name: { contains: q, mode: "insensitive" } },
              { subscriptions: { some: { providerRef: { contains: q } } } },
              { payments: { some: { providerRef: { contains: q } } } },
              { payments: { some: { razorpayPaymentId: { contains: q } } } },
              { payments: { some: { razorpayOrderId: { contains: q } } } },
            ],
          },
          select: { id: true },
          take: 100,
        })
      ).map((u) => u.id)
    : null;

  const rows = await prisma.subscription.findMany({
    where: userIds ? { userId: { in: userIds } } : undefined,
    orderBy: { updatedAt: "desc" },
    take: Math.min(take * 3, 500),
    select: {
      ...ADMIN_SUBSCRIPTION_SELECT,
      user: { select: { id: true, name: true, email: true, role: true } },
    },
  });

  const seen = new Set<string>();
  const out = [];
  for (const row of rows) {
    if (seen.has(row.userId) || out.length >= Math.min(take, 200)) continue;
    seen.add(row.userId);
    const current = await entitlementSubscription(row.userId);
    const shown = current?.id === row.id ? row : rows.find((r) => r.id === current?.id) ?? row;
    const seats = await getSeatSnapshot(row.userId);
    out.push({
      ...shown,
      seats,
      eligible: current ? isSubscriptionRecordEligible(current) : false,
      management: providerManagement(shown.provider),
    });
  }
  return out;
}

/** Full, safe history for one parent: every subscription row, payment and audit event. */
export async function getAdminSubscriptionHistory(parentUserId: string) {
  const user = await prisma.user.findUnique({
    where: { id: parentUserId },
    select: { id: true, name: true, email: true, role: true },
  });
  if (!user) throw new AppError("Parent not found", 404);
  const [subscriptions, payments, events, current] = await Promise.all([
    prisma.subscription.findMany({
      where: { userId: parentUserId },
      orderBy: { createdAt: "desc" },
      select: ADMIN_SUBSCRIPTION_SELECT,
    }),
    prisma.payment.findMany({
      where: { userId: parentUserId },
      orderBy: { createdAt: "desc" },
      take: 100,
      select: {
        id: true,
        subscriptionId: true,
        amountCents: true,
        currency: true,
        status: true,
        provider: true,
        providerRef: true,
        purpose: true,
        planCode: true,
        seatsPurchased: true,
        razorpayOrderId: true,
        razorpayPaymentId: true,
        receiptNumber: true,
        paidAt: true,
        createdAt: true,
      },
    }),
    prisma.subscriptionAuditEvent.findMany({
      where: { userId: parentUserId },
      orderBy: { createdAt: "desc" },
      take: 200,
    }),
    entitlementSubscription(parentUserId),
  ]);
  return {
    user,
    currentSubscriptionId: current?.id ?? null,
    eligible: current ? isSubscriptionRecordEligible(current) : false,
    subscriptions: subscriptions.map((s) => ({
      ...s,
      gatewayPaid: s.provider === "google_play" || s.provider === "razorpay",
    })),
    payments,
    events: events.map((e) => ({
      ...e,
      details: e.detailsJson ? (JSON.parse(e.detailsJson) as unknown) : null,
      detailsJson: undefined,
    })),
  };
}

/**
 * Safely reduce extra seats. Capacity must remain >= currently assigned seats.
 * Does not invent payment refunds — admin ledger only.
 */
export async function revokeExtraSeats(input: {
  parentUserId: string;
  seats: number;
  grantedByUserId: string;
}) {
  const n = Math.floor(input.seats);
  if (!Number.isFinite(n) || n < 1 || n > 20) {
    throw new AppError("seats must be between 1 and 20", 400);
  }

  return prisma.$transaction(async (tx) => {
    const subscription = await latestSubscription(input.parentUserId, tx);
    if (!subscription) {
      throw new AppError("Parent has no subscription", 404);
    }
    await tx.$executeRaw`SELECT id FROM "Subscription" WHERE id = ${subscription.id} FOR UPDATE`;

    const assigned = await tx.child.count({
      where: {
        parentId: input.parentUserId,
        isActive: true,
        hasLearningSeat: true,
      },
    });
    const included = subscription.includedSeats ?? BASE_INCLUDED_SEATS;
    const currentExtra = subscription.extraSeats ?? 0;
    if (n > currentExtra) {
      throw new AppError(
        `Cannot revoke ${n} seat(s); only ${currentExtra} add-on seat(s) exist`,
        400
      );
    }
    const nextExtra = currentExtra - n;
    const nextCapacity = included + nextExtra;
    if (nextCapacity < assigned) {
      throw new AppError(
        `Cannot revoke: ${assigned} children currently hold seats; capacity would drop to ${nextCapacity}. Unassign children first.`,
        409,
        {
          code: "SEATS_IN_USE",
          assigned,
          nextCapacity,
          included,
          extra: currentExtra,
        }
      );
    }

    const updated = await tx.subscription.update({
      where: { id: subscription.id },
      data: { extraSeats: nextExtra },
    });

    await tx.payment.create({
      data: {
        userId: input.parentUserId,
        subscriptionId: subscription.id,
        amountCents: 0,
        status: "SUCCEEDED",
        provider: "manual_admin_revoke",
        purpose: "MANUAL_ADMIN",
        seatsPurchased: 0,
        planCode: "MANUAL_ADMIN_REVOKE",
        providerRef: `seat_revoke_${input.grantedByUserId}_${Date.now()}_${n}`,
        paidAt: new Date(),
      },
    });

    return {
      subscription: {
        id: updated.id,
        includedSeats: updated.includedSeats,
        extraSeats: updated.extraSeats,
        capacity: seatCapacity(updated),
      },
      seatsRevoked: n,
      assigned,
    };
  });
}
