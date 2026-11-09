import { PrismaClient } from "@prisma/client";

function createClient() {
  return new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
    // Google Play purchase tokens must never reach an API response; select them explicitly when needed.
    omit: { subscription: { providerToken: true } },
  });
}

const globalForPrisma = globalThis as unknown as { prisma?: ReturnType<typeof createClient> };

export const prisma = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
