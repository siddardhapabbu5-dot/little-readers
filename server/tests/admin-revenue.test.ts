import { afterAll, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { prisma } from "../src/lib/prisma.js";
import { adminRevenueSummary } from "../src/payments/revenue.js";

const app = createApp();
const hasDb = Boolean(process.env.DATABASE_URL);
const stamp = Date.now();
const emailPrefix = `revenue_${stamp}`;

/** Wednesday 2030-11-13 10:00 IST — far from any other test data. */
const NOW = new Date("2030-11-13T04:30:00.000Z");
const ist = (iso: string) => new Date(`${iso}+05:30`);

describe.skipIf(!hasDb)("Admin revenue summary", () => {
  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email: { startsWith: emailPrefix } } });
  });

  it("totals every row per currency, in India days, and ignores abandoned checkouts", async () => {
    const before = await adminRevenueSummary(NOW);
    const user = await prisma.user.create({
      data: { email: `${emailPrefix}@test.local`, name: "Revenue", passwordHash: "x", role: "PARENT" },
    });
    const pay = (data: {
      amountCents: number;
      currency: string;
      status: "SUCCEEDED" | "PENDING" | "FAILED";
      at: Date;
    }) =>
      prisma.payment.create({
        data: {
          userId: user.id,
          amountCents: data.amountCents,
          currency: data.currency,
          status: data.status,
          provider: "razorpay",
          paidAt: data.status === "SUCCEEDED" ? data.at : null,
          createdAt: data.at,
        },
      });

    await pay({ amountCents: 14900, currency: "INR", status: "SUCCEEDED", at: ist("2030-11-10T23:59:00") }); // Sunday, IST
    await pay({ amountCents: 9900, currency: "INR", status: "SUCCEEDED", at: ist("2030-11-13T00:10:00") }); // today just after IST midnight
    await pay({ amountCents: 14900, currency: "PHP", status: "SUCCEEDED", at: ist("2030-11-12T12:00:00") });
    await pay({ amountCents: 24900, currency: "PHP", status: "FAILED", at: ist("2030-11-12T12:05:00") });
    await pay({ amountCents: 49900, currency: "INR", status: "PENDING", at: ist("2030-11-13T09:00:00") }); // recent
    await pay({ amountCents: 79900, currency: "INR", status: "PENDING", at: ist("2030-11-11T09:00:00") }); // abandoned

    const after = await adminRevenueSummary(NOW);
    const inr = after.currencies.INR;
    const php = after.currencies.PHP;

    expect(after.timezone).toBe("Asia/Kolkata");
    expect(inr.daily).toBe(9900);
    expect(inr.weekly).toBe(14900 + 9900);
    expect(inr.monthly).toBe(14900 + 9900);
    expect(inr.yearly).toBe(14900 + 9900);
    expect(inr.total - before.currencies.INR.total).toBe(14900 + 9900);
    expect(inr.points.map((p) => p.date)).toEqual([
      "2030-11-07", "2030-11-08", "2030-11-09", "2030-11-10", "2030-11-11", "2030-11-12", "2030-11-13",
    ]);
    expect(inr.points[3].amountMinor).toBe(14900);
    expect(inr.points[6].amountMinor).toBe(9900);
    expect(inr.pending).toBe(49900);
    expect(inr.pendingCount).toBe(1);
    expect(inr.stalePendingCount - before.currencies.INR.stalePendingCount).toBe(1);

    // ₱ never leaks into ₹; failed attempts are not revenue.
    expect(php.weekly).toBe(14900);
    expect(php.total - (before.currencies.PHP?.total ?? 0)).toBe(14900);
    expect(php.pending).toBe(0);
  });

  it("is admin-only", async () => {
    const res = await request(app).get("/api/payments/admin/revenue");
    expect(res.status).toBe(401);
  });
});
