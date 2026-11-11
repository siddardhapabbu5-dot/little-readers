/**
 * Force-restore local demo Parent / Admin / Super Admin logins.
 * Same behavior as API boot ensure (ALLOW_DEMO=1, local non-production database only).
 *
 *   npm run db:restore-demo --workspace=@little-readers/server
 */
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";
import { assertDemoAllowed } from "./lib/destructive-guard.mjs";

assertDemoAllowed("restore-demo-logins");

const prisma = new PrismaClient();

const DEMOS = [
  {
    email: "parent@littlereaders.test",
    password: "ParentDemo1",
    name: "Demo Parent",
    role: "PARENT",
  },
  {
    email: "admin@littlereaders.test",
    password: "AdminDemo1",
    name: "Demo Admin",
    role: "ADMIN",
  },
  {
    email: "superadmin@littlereaders.test",
    password: "SuperDemo1",
    name: "Demo Super Admin",
    role: "SUPER_ADMIN",
  },
];

async function main() {
  for (const demo of DEMOS) {
    const passwordHash = await bcrypt.hash(demo.password, 12);
    await prisma.user.upsert({
      where: { email: demo.email },
      update: {
        name: demo.name,
        passwordHash,
        role: demo.role,
        isActive: true,
      },
      create: {
        name: demo.name,
        email: demo.email,
        passwordHash,
        role: demo.role,
        isActive: true,
      },
    });
    console.log(`OK  ${demo.email} / ${demo.password}`);
  }

  const parent = await prisma.user.findUnique({
    where: { email: "parent@littlereaders.test" },
  });
  if (parent) {
    const expiresAt = new Date();
    expiresAt.setFullYear(expiresAt.getFullYear() + 1);
    const sub = await prisma.subscription.findFirst({
      where: {
        userId: parent.id,
        providerRef: { startsWith: "seed_demo_parent_yearly" },
      },
      orderBy: { createdAt: "desc" },
    });
    if (sub) {
      await prisma.subscription.update({
        where: { id: sub.id },
        data: {
          status: "ACTIVE",
          expiresAt,
          cancelledAt: null,
          graceEndsAt: null,
          includedSeats: Math.max(sub.includedSeats, 2),
        },
      });
      console.log("OK  parent subscription ACTIVE");
    } else {
      await prisma.subscription.create({
        data: {
          userId: parent.id,
          plan: "YEARLY",
          status: "ACTIVE",
          startedAt: new Date(),
          expiresAt,
          provider: "manual_seed",
          providerRef: "seed_demo_parent_yearly",
          includedSeats: 2,
          extraSeats: 0,
        },
      });
      console.log("OK  parent subscription created");
    }
  }

  console.log("Demo logins restored permanently for this database.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
