/** Local-only: attach LEVEL_1 grade subscription to staging Android AD child. */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadEnv } from "dotenv";
import { PrismaClient } from "@prisma/client";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
loadEnv({ path: path.resolve(__dirname, "../../.env") });
loadEnv();

const dbUrl = process.env.DATABASE_URL || "";
if (!/localhost:5437|127\.0\.0\.1:5437/.test(dbUrl)) {
  console.error("STOP: DATABASE_URL is not local :5437");
  process.exit(3);
}

const PARENT_ID = process.env.STAGING_ANDROID_PARENT_ID || "cmwmuh1n50000htekezk4kkua";
const CHILD_ID = process.env.STAGING_ANDROID_CHILD_ID || "cmwmuh1pa000ahtek4kpxzm3u";

const prisma = new PrismaClient();
const level = await prisma.learningLevel.findFirstOrThrow({ where: { code: "LEVEL_1" } });
const sub = await prisma.subscription.findFirst({
  where: { userId: PARENT_ID, providerRef: "staging_android_ad_yearly" },
});
if (!sub) {
  console.error("NO_SUB");
  process.exit(1);
}
const updated = await prisma.subscription.update({
  where: { id: sub.id },
  data: {
    status: "ACTIVE",
    childId: CHILD_ID,
    levelId: level.id,
    expiresAt: new Date(Date.now() + 365 * 24 * 3600 * 1000),
    cancelledAt: null,
  },
});
console.log(
  JSON.stringify({
    ok: true,
    id: updated.id,
    childId: updated.childId,
    levelId: updated.levelId,
    status: updated.status,
  })
);
await prisma.$disconnect();
