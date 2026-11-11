import { prisma } from "../lib/prisma.js";

/** Business days are counted in India time (UTC+05:30). */
export const REVENUE_TIMEZONE = "Asia/Kolkata";
const IST_OFFSET_MS = 330 * 60 * 1000;
const DAY_MS = 86_400_000;
/** Checkouts still PENDING after this long were abandoned, not money on the way. */
export const PENDING_WINDOW_MS = DAY_MS;

export type CurrencyRevenue = {
  daily: number;
  weekly: number;
  monthly: number;
  yearly: number;
  total: number;
  succeededCount: number;
  pending: number;
  pendingCount: number;
  stalePendingCount: number;
  points: Array<{ date: string; amountMinor: number }>;
};

function emptyRevenue(dayStarts: number[]): CurrencyRevenue {
  return {
    daily: 0,
    weekly: 0,
    monthly: 0,
    yearly: 0,
    total: 0,
    succeededCount: 0,
    pending: 0,
    pendingCount: 0,
    stalePendingCount: 0,
    points: dayStarts.map((start) => ({
      date: new Date(start + IST_OFFSET_MS).toISOString().slice(0, 10),
      amountMinor: 0,
    })),
  };
}

/** Aggregates every payment row (no paging), per currency, so ₹ and ₱ never mix. */
export async function adminRevenueSummary(now = new Date()) {
  const ist = new Date(now.getTime() + IST_OFFSET_MS);
  const y = ist.getUTCFullYear();
  const m = ist.getUTCMonth();
  const d = ist.getUTCDate();
  const todayStart = Date.UTC(y, m, d) - IST_OFFSET_MS;
  const weekStart = todayStart - 6 * DAY_MS;
  const monthStart = Date.UTC(y, m, 1) - IST_OFFSET_MS;
  const yearStart = Date.UTC(y, 0, 1) - IST_OFFSET_MS;
  const dayStarts = Array.from({ length: 7 }, (_, i) => weekStart + i * DAY_MS);
  const pendingSince = now.getTime() - PENDING_WINDOW_MS;

  const rows = await prisma.payment.findMany({
    where: { status: { in: ["SUCCEEDED", "PENDING"] }, amountCents: { gt: 0 } },
    select: { status: true, currency: true, amountCents: true, paidAt: true, createdAt: true },
  });

  const byCurrency: Record<string, CurrencyRevenue> = {};
  for (const row of rows) {
    const currency = (row.currency || "INR").toUpperCase();
    const r = (byCurrency[currency] ??= emptyRevenue(dayStarts));
    if (row.status === "PENDING") {
      if (row.createdAt.getTime() >= pendingSince) {
        r.pending += row.amountCents;
        r.pendingCount += 1;
      } else {
        r.stalePendingCount += 1;
      }
      continue;
    }
    const t = (row.paidAt ?? row.createdAt).getTime();
    r.total += row.amountCents;
    r.succeededCount += 1;
    if (t > now.getTime()) continue;
    if (t >= yearStart) r.yearly += row.amountCents;
    if (t >= monthStart) r.monthly += row.amountCents;
    if (t >= weekStart) {
      r.weekly += row.amountCents;
      const i = Math.floor((t - weekStart) / DAY_MS);
      if (i >= 0 && i < 7) r.points[i].amountMinor += row.amountCents;
    }
    if (t >= todayStart) r.daily += row.amountCents;
  }

  if (!byCurrency.INR) byCurrency.INR = emptyRevenue(dayStarts);
  return { timezone: REVENUE_TIMEZONE, generatedAt: now.toISOString(), currencies: byCurrency };
}
