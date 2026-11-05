import bcrypt from "bcryptjs";
import { prisma } from "./prisma.js";

/**
 * Keep local demo Parent / Admin / Super Admin logins working.
 * Runs on API boot in non-production unless ENSURE_DEMO_LOGINS=0 or SEED_DEMO=0.
 *
 * Credentials (fixed):
 *   parent@littlereaders.test / ParentDemo1
 *   admin@littlereaders.test  / AdminDemo1
 *   superadmin@littlereaders.test / SuperDemo1
 */
export const DEMO_LOGINS = [
  {
    email: "parent@littlereaders.test",
    password: "ParentDemo1",
    name: "Demo Parent",
    role: "PARENT" as const,
  },
  {
    email: "admin@littlereaders.test",
    password: "AdminDemo1",
    name: "Demo Admin",
    role: "ADMIN" as const,
  },
  {
    email: "superadmin@littlereaders.test",
    password: "SuperDemo1",
    name: "Demo Super Admin",
    role: "SUPER_ADMIN" as const,
  },
] as const;

export function shouldEnsureDemoLogins() {
  if (process.env.ENSURE_DEMO_LOGINS === "0") return false;
  if (process.env.SEED_DEMO === "0") return false;
  if (process.env.NODE_ENV === "production") return false;
  if (process.env.VITEST === "true") return false;
  return true;
}

export async function ensureDemoLogins() {
  if (!shouldEnsureDemoLogins()) {
    return { skipped: true as const, accounts: [] as string[] };
  }

  const accounts: string[] = [];
  for (const demo of DEMO_LOGINS) {
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
    accounts.push(`${demo.email} / ${demo.password}`);
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
        OR: [
          { providerRef: "seed_demo_parent_yearly" },
          { providerRef: { startsWith: "seed_demo_parent_yearly" } },
        ],
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
    }
  }

  return { skipped: false as const, accounts };
}
