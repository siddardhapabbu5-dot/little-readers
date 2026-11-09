import type { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma.js";

export type AuditInput = {
  userId?: string | null;
  subscriptionId?: string | null;
  paymentId?: string | null;
  provider: string;
  source: string;
  eventType: string;
  providerEventId?: string | null;
  fromStatus?: string | null;
  toStatus?: string | null;
  /** Must never contain tokens, card data or secrets. */
  details?: Record<string, unknown>;
};

type Db = Prisma.TransactionClient | typeof prisma;

/** Append an audit row; a repeated providerEventId is silently ignored. */
export async function recordSubscriptionAudit(input: AuditInput, db: Db = prisma) {
  await db.subscriptionAuditEvent.createMany({
    data: [
      {
        userId: input.userId ?? null,
        subscriptionId: input.subscriptionId ?? null,
        paymentId: input.paymentId ?? null,
        provider: input.provider,
        source: input.source,
        eventType: input.eventType,
        providerEventId: input.providerEventId ?? null,
        fromStatus: input.fromStatus ?? null,
        toStatus: input.toStatus ?? null,
        detailsJson: input.details ? JSON.stringify(input.details) : null,
      },
    ],
    skipDuplicates: true,
  });
}

export async function auditEventExists(providerEventId: string, db: Db = prisma) {
  const row = await db.subscriptionAuditEvent.findUnique({
    where: { providerEventId },
    select: { id: true },
  });
  return Boolean(row);
}
