/**
 * Prepare a client-ready database: end trials, revoke free demo access.
 *
 * Keeps academic structure + vocabulary. Deactivates *.littlereaders.test demo
 * users and cancels TRIALING / manual_seed free subscriptions.
 *
 * Optional real admin (recommended for handoff):
 *   CLIENT_ADMIN_EMAIL=admin@client.com
 *   CLIENT_ADMIN_PASSWORD=StrongPass123
 *   CLIENT_ADMIN_NAME="Client Admin"
 *
 * Usage:
 *   npm run db:prepare-client --workspace=@little-readers/server
 */
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const now = new Date();

  const trials = await prisma.subscription.updateMany({
    where: { status: "TRIALING" },
    data: {
      status: "CANCELLED",
      cancelledAt: now,
      expiresAt: now,
      graceEndsAt: null,
    },
  });

  const demoSubs = await prisma.subscription.updateMany({
    where: {
      OR: [
        { provider: "manual_seed" },
        { providerRef: { startsWith: "seed_demo" } },
      ],
      status: { in: ["ACTIVE", "TRIALING", "GRACE", "PAST_DUE"] },
    },
    data: {
      status: "CANCELLED",
      cancelledAt: now,
      expiresAt: now,
      graceEndsAt: null,
    },
  });

  const demoUsers = await prisma.user.updateMany({
    where: {
      OR: [
        { email: { endsWith: "@littlereaders.test" } },
        { email: { endsWith: ".test" } },
      ],
    },
    data: { isActive: false },
  });

  const email = process.env.CLIENT_ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.CLIENT_ADMIN_PASSWORD?.trim();
  const name = process.env.CLIENT_ADMIN_NAME?.trim() || "Admin";
  let adminNote = "No CLIENT_ADMIN_* env — create an admin account before handoff.";

  if (email && password) {
    const passwordHash = await bcrypt.hash(password, 12);
    await prisma.user.upsert({
      where: { email },
      update: {
        name,
        passwordHash,
        role: "ADMIN",
        isActive: true,
      },
      create: {
        name,
        email,
        passwordHash,
        role: "ADMIN",
        isActive: true,
      },
    });
    adminNote = `Active admin ready: ${email}`;
  }

  console.log("Client fresh prep complete.");
  console.log(`  Cancelled TRIALING subscriptions: ${trials.count}`);
  console.log(`  Cancelled demo/manual_seed subscriptions: ${demoSubs.count}`);
  console.log(`  Deactivated demo/.test users: ${demoUsers.count}`);
  console.log(`  ${adminNote}`);
  console.log("  Vocabulary and academic structure were left in place.");
  console.log("");
  console.log("NOTE: Demo logins (parent@ / admin@littlereaders.test) are OFF after this.");
  console.log("For local testing again: npm run db:restore-demo --workspace=@little-readers/server");
  console.log("Or restart the API (auto-restores demos unless SEED_DEMO=0 / production).");
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
