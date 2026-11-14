/**
 * Production: publish Learn Wise Grade 2–4 subscription plans + product levels.
 * Does not change Grade 1 plans. Does not touch vocabulary.
 *
 *   ALLOW_PRODUCTION=1 CONFIRM_PRODUCTION=1 node scripts/publish-subscription-plans-g2-4-production.mjs
 */
import { PrismaClient } from "@prisma/client";

const allow = process.env.ALLOW_PRODUCTION === "1" && process.env.CONFIRM_PRODUCTION === "1";
const url = process.env.DATABASE_URL || "";
const looksLocal = /localhost|127\.0\.0\.1|:5437/.test(url);

if (!allow && !looksLocal) {
  console.error("Refusing: set ALLOW_PRODUCTION=1 CONFIRM_PRODUCTION=1 for non-local DB.");
  process.exit(1);
}

const prisma = new PrismaClient();
const TARGET = ["LEVEL_2", "LEVEL_3", "LEVEL_4"];

const levels = await prisma.learningLevel.updateMany({
  where: { code: { in: TARGET } },
  data: { isActive: true, isPublished: true },
});

const plans = await prisma.subscriptionPlan.updateMany({
  where: {
    isActive: true,
    OR: [
      { applicableLevel: { in: TARGET } },
      { level: { code: { in: TARGET } } },
      { code: { startsWith: "LEVEL_2_" } },
      { code: { startsWith: "LEVEL_3_" } },
      { code: { startsWith: "LEVEL_4_" } },
    ],
  },
  data: { isPublished: true },
});

const published = await prisma.subscriptionPlan.findMany({
  where: {
    isActive: true,
    isPublished: true,
    OR: [
      { applicableLevel: { in: [...TARGET, "LEVEL_1"] } },
      { level: { code: { in: [...TARGET, "LEVEL_1"] } } },
      { code: { startsWith: "LEVEL_" } },
    ],
  },
  select: { code: true, applicableLevel: true, level: { select: { code: true } } },
  orderBy: [{ applicableLevel: "asc" }, { code: "asc" }],
});

console.log(
  JSON.stringify(
    {
      levelsUpdated: levels.count,
      plansPublished: plans.count,
      livePlans: published.map((p) => ({
        code: p.code,
        app: p.applicableLevel,
        level: p.level?.code ?? null,
      })),
    },
    null,
    2
  )
);

await prisma.$disconnect();
