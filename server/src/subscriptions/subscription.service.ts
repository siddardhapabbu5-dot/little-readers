import type { Prisma, Subscription, SubscriptionStatus } from "@prisma/client";
import { AppError } from "../lib/errors.js";
import { prisma } from "../lib/prisma.js";

/** Paid / recovering access only — no free TRIALING for client builds. */
const ELIGIBLE: SubscriptionStatus[] = [
  "ACTIVE",
  "GRACE",
  "PAST_DUE", // grace-style access while payment recovers; policy can tighten later
];

const BASE_INCLUDED_SEATS = 2;

export function isSubscriptionRecordEligible(
  sub: Pick<Subscription, "status" | "expiresAt" | "graceEndsAt">,
  now = new Date()
): boolean {
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

async function latestSubscription(userId: string, tx: Prisma.TransactionClient | typeof prisma = prisma) {
  return tx.subscription.findFirst({
    where: { userId },
    orderBy: { createdAt: "desc" },
  });
}

export async function getSeatSnapshot(parentId: string, tx: Prisma.TransactionClient | typeof prisma = prisma) {
  const subscription = await latestSubscription(parentId, tx);
  const capacity = seatCapacity(subscription);
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
    included: subscription?.includedSeats ?? BASE_INCLUDED_SEATS,
    extra: subscription?.extraSeats ?? 0,
    capacity,
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

  // No active subscription → no seats to claim.
  if (!subscription || capacity <= 0) return false;

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

export async function getParentSubscription(userId: string) {
  const subscription = await prisma.subscription.findFirst({
    where: { userId },
    orderBy: { createdAt: "desc" },
    include: {
      payments: {
        orderBy: { createdAt: "desc" },
        take: 5,
      },
    },
  });

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
      assigned: seats.assigned,
      available: seats.available,
      children: seats.children,
    },
  };
}

export async function assertParentSubscriptionEligible(parentId: string) {
  const result = await getParentSubscription(parentId);
  if (!result.eligible) {
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

export async function listSubscriptionsForAdmin(take = 50) {
  const rows = await prisma.subscription.findMany({
    orderBy: { createdAt: "desc" },
    take: Math.min(take, 200),
    include: {
      user: { select: { id: true, name: true, email: true, role: true } },
    },
  });

  // Deduplicate to newest sub per parent, attach live seat snapshot
  const seen = new Set<string>();
  const out: Array<
    (typeof rows)[number] & {
      seats: Awaited<ReturnType<typeof getSeatSnapshot>>;
      eligible: boolean;
    }
  > = [];
  for (const row of rows) {
    if (seen.has(row.userId)) continue;
    seen.add(row.userId);
    const seats = await getSeatSnapshot(row.userId);
    out.push({
      ...row,
      seats,
      eligible: isSubscriptionRecordEligible(row),
    });
  }
  return out;
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
