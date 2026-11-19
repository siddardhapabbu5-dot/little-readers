/**
 * Local-only Android AD fixture bootstrap.
 * Creates/upserts one PARENT + LEVEL_1 child + ACTIVE subscription on localhost:5437.
 * Aborts if DATABASE_URL is not local staging.
 * Writes credentials to a local gitignored secrets file — never prints the password.
 */
import path from "node:path";
import fs from "node:fs";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { config as loadEnv } from "dotenv";
import bcrypt from "bcryptjs";
import { PrismaClient, UserRole, ConsentType } from "@prisma/client";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
loadEnv({ path: path.resolve(__dirname, "../../.env") });
loadEnv();

const dbUrl = process.env.DATABASE_URL || "";
if (!/localhost:5437|127\.0\.0\.1:5437/.test(dbUrl)) {
  console.error("STOP: DATABASE_URL is not local :5437");
  process.exit(3);
}
if (/siwiapp|amazonaws|neon\.tech|supabase/i.test(dbUrl)) {
  console.error("STOP: DATABASE_URL looks production-like");
  process.exit(4);
}

const EMAIL = process.env.STAGING_ANDROID_EMAIL || "qa.android.ad@test.local";
const NAME = "QA Android AD Parent";
const CHILD_NAME = "AD Child G1";
const secretsDir = path.resolve(__dirname, "../../.secrets");
const secretsFile = path.join(secretsDir, "android-ad-staging-credentials.env");

function maskEmail(e: string) {
  return e.replace(/^(.{3}).+(@.+)$/, "$1***$2");
}

const prisma = new PrismaClient();

async function main() {
  const level = await prisma.learningLevel.findFirst({
    where: { code: "LEVEL_1" },
  });
  if (!level) {
    console.error("STOP: LEVEL_1 missing — run local db:seed first");
    process.exit(5);
  }

  const publishedCats = await prisma.learningCategory.count({
    where: { isPublished: true, group: { levelId: level.id } },
  });
  const activeWords = await prisma.vocabularyWord.count({
    where: {
      isActive: true,
      category: { isPublished: true, group: { levelId: level.id } },
    },
  });
  console.log(
    `CONTENT publishedL1Categories=${publishedCats} activeL1Words=${activeWords}`
  );
  if (publishedCats < 1 || activeWords < 1) {
    console.error("STOP: insufficient published Level-1 content on local DB");
    process.exit(6);
  }

  let password = process.env.STAGING_ANDROID_PASSWORD;
  if (!password) {
    password = `Ad$${crypto.randomBytes(12).toString("base64url")}9aA`;
  }
  const passwordHash = await bcrypt.hash(password, 12);

  const parent = await prisma.user.upsert({
    where: { email: EMAIL },
    update: {
      name: NAME,
      passwordHash,
      role: UserRole.PARENT,
      isActive: true,
    },
    create: {
      name: NAME,
      email: EMAIL,
      passwordHash,
      role: UserRole.PARENT,
      isActive: true,
    },
  });

  for (const consentType of [
    ConsentType.TERMS,
    ConsentType.PRIVACY,
    ConsentType.PARENTAL,
  ]) {
    const existing = await prisma.parentalConsent.findFirst({
      where: { userId: parent.id, consentType, version: "1.0" },
    });
    if (!existing) {
      await prisma.parentalConsent.create({
        data: { userId: parent.id, consentType, version: "1.0" },
      });
    }
  }

  const providerRef = "staging_android_ad_yearly";
  const startedAt = new Date();
  const expiresAt = new Date();
  expiresAt.setFullYear(expiresAt.getFullYear() + 1);
  const existingSub = await prisma.subscription.findFirst({
    where: { userId: parent.id, providerRef },
  });
  if (!existingSub) {
    await prisma.subscription.create({
      data: {
        userId: parent.id,
        plan: "YEARLY",
        status: "ACTIVE",
        startedAt,
        expiresAt,
        provider: "manual_seed",
        providerRef,
        includedSeats: 2,
        extraSeats: 0,
      },
    });
  } else {
    await prisma.subscription.update({
      where: { id: existingSub.id },
      data: {
        status: "ACTIVE",
        expiresAt,
        cancelledAt: null,
        includedSeats: 2,
        extraSeats: 0,
      },
    });
  }

  let child = await prisma.child.findFirst({
    where: { parentId: parent.id, displayName: CHILD_NAME },
  });
  if (!child) {
    child = await prisma.child.create({
      data: {
        parentId: parent.id,
        displayName: CHILD_NAME,
        birthYear: 2021,
        birthDate: "15/03/2021",
        levelId: level.id,
        isActive: true,
        hasLearningSeat: true,
      },
    });
  } else {
    child = await prisma.child.update({
      where: { id: child.id },
      data: {
        levelId: level.id,
        isActive: true,
        hasLearningSeat: true,
        birthYear: 2021,
        birthDate: "15/03/2021",
      },
    });
  }

  fs.mkdirSync(secretsDir, { recursive: true });
  const body = [
    `# Local staging only — DO NOT COMMIT`,
    `STAGING_ANDROID_EMAIL=${EMAIL}`,
    `STAGING_ANDROID_PASSWORD=${password}`,
    `STAGING_ANDROID_PARENT_ID=${parent.id}`,
    `STAGING_ANDROID_CHILD_ID=${child.id}`,
    `STAGING_ANDROID_API=http://192.168.1.20:4100/api`,
    `CREATED_AT=${new Date().toISOString()}`,
    ``,
  ].join("\n");
  fs.writeFileSync(secretsFile, body, { encoding: "utf8", mode: 0o600 });

  // Reset method note (no secrets)
  const resetNote = path.join(secretsDir, "android-ad-reset-README.txt");
  fs.writeFileSync(
    resetNote,
    [
      "Staging Android AD account reset (local DB only)",
      "1. Ensure API NODE_ENV=development and DATABASE_URL=localhost:5437",
      "2. Re-run: npx tsx server/scripts/_staging-android-ad-fixtures.ts",
      "   (rotates password hash and rewrites .secrets/android-ad-staging-credentials.env)",
      "3. Or set STAGING_ANDROID_PASSWORD before re-run to choose a password",
      "4. For lockout clear: wait TTL or flush Redis keys for this email on localhost:6379",
      "5. Never use this against production",
      "",
    ].join("\n"),
    "utf8"
  );

  console.log("FIXTURE_OK");
  console.log(`PARENT_EMAIL_MASKED=${maskEmail(EMAIL)}`);
  console.log(`PARENT_ID=${parent.id}`);
  console.log(`CHILD_ID=${child.id}`);
  console.log(`CHILD_NAME=${CHILD_NAME}`);
  console.log(`LEVEL=LEVEL_1`);
  console.log(`SECRETS_FILE=${secretsFile}`);
  console.log(`RESET_NOTE=${resetNote}`);
}

main()
  .catch((e) => {
    console.error("FIXTURE_FAILED", e instanceof Error ? e.message : e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
