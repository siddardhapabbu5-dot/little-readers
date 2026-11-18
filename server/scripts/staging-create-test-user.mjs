/** Local staging helper — creates one PARENT user. Never logs the password. */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadEnv } from "dotenv";
import bcrypt from "bcryptjs";
import { PrismaClient, UserRole } from "@prisma/client";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
loadEnv({ path: path.resolve(__dirname, "../../.env") });
loadEnv();

const email = process.env.STAGING_EMAIL;
const password = process.env.STAGING_PASSWORD;
if (!email || !password) {
  console.error("STAGING_EMAIL and STAGING_PASSWORD required");
  process.exit(1);
}
if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL missing after dotenv load");
  process.exit(1);
}

const prisma = new PrismaClient();
try {
  const passwordHash = await bcrypt.hash(password, 10);
  await prisma.user.deleteMany({ where: { email } });
  await prisma.user.create({
    data: {
      name: "Staging Lock",
      email,
      passwordHash,
      role: UserRole.PARENT,
      isActive: true,
    },
  });
  console.log("USER_OK");
} catch (err) {
  console.error("CREATE_FAILED", err instanceof Error ? err.message : err);
  process.exit(1);
} finally {
  await prisma.$disconnect();
}
