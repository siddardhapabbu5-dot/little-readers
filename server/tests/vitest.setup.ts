/**
 * Runs before test files import the app. Keeps OTP/SMS in safe local-test mode
 * without changing production defaults.
 */
import { afterAll, beforeAll } from "vitest";
import { resolveTestDatabaseUrl } from "./test-db.js";

// Must run before the app (and dotenv) load so every test file uses the disposable test database.
process.env.DATABASE_URL = resolveTestDatabaseUrl();
process.env.VITEST = "true";
process.env.OTP_DEV_MODE = "1";
process.env.SMS_PROVIDER = process.env.SMS_PROVIDER || "console";
process.env.PAYMENT_ENABLED = process.env.PAYMENT_ENABLED || "false";
// Suites create family rows at test time; grade-purchase.test.ts sets a past cutoff to cover the real rule.
process.env.LEGACY_FAMILY_CUTOFF = process.env.LEGACY_FAMILY_CUTOFF || "2100-01-01T00:00:00.000Z";

/**
 * Grade 1–4 word visibility is restored after every test file: programme activation hides
 * future-day words and must not leave local curriculum categories partly empty.
 * The prisma import stays dynamic so the env above is set before the app loads.
 */
const GRADE_LEVELS = ["LEVEL_1", "LEVEL_2", "LEVEL_3", "LEVEL_4"];
let gradeVisibility: { active: string[]; inactive: string[]; at: Date } | null = null;

beforeAll(async () => {
  if (!process.env.DATABASE_URL) return;
  const { prisma } = await import("../src/lib/prisma.js");
  const at = new Date();
  const words = await prisma.vocabularyWord.findMany({
    where: { category: { group: { level: { code: { in: GRADE_LEVELS } } } } },
    select: { id: true, isActive: true },
  });
  gradeVisibility = {
    active: words.filter((w) => w.isActive).map((w) => w.id),
    inactive: words.filter((w) => !w.isActive).map((w) => w.id),
    at,
  };
});

afterAll(async () => {
  if (!gradeVisibility) return;
  const { prisma } = await import("../src/lib/prisma.js");
  await prisma.vocabularyWord.updateMany({
    where: {
      isActive: true,
      createdAt: { gte: gradeVisibility.at },
      category: { group: { level: { code: { in: GRADE_LEVELS } } } },
    },
    data: { isActive: false },
  });
  await prisma.vocabularyWord.updateMany({
    where: { id: { in: gradeVisibility.active }, isActive: false },
    data: { isActive: true },
  });
  await prisma.vocabularyWord.updateMany({
    where: { id: { in: gradeVisibility.inactive }, isActive: true },
    data: { isActive: false },
  });
});
