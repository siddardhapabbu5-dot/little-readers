import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";
import { assertDisposableTestDatabase, resolveTestDatabaseUrl } from "./test-db.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serverDir = path.resolve(__dirname, "..");
const prismaCli = path.resolve(serverDir, "../node_modules/prisma/build/index.js");
const tsxCli = path.resolve(serverDir, "../node_modules/tsx/dist/cli.mjs");

/** Rebuilds the disposable test database (empty schema → migrations → seed) once per run. TEST_DB_SKIP_RESET=1 reuses it. */
export default async function setup() {
  const url = resolveTestDatabaseUrl();
  process.env.DATABASE_URL = url;
  if (process.env.TEST_DB_SKIP_RESET === "1") return;

  assertDisposableTestDatabase(url);
  const prisma = new PrismaClient({ datasourceUrl: url });
  try {
    const [{ db }] = await prisma.$queryRaw<{ db: string }[]>`SELECT current_database() AS db`;
    assertDisposableTestDatabase(new URL(`/${db}`, url).toString());
    await prisma.$executeRawUnsafe("DROP SCHEMA IF EXISTS public CASCADE");
    await prisma.$executeRawUnsafe("CREATE SCHEMA public");
  } finally {
    await prisma.$disconnect();
  }

  const opts = { cwd: serverDir, env: { ...process.env, DATABASE_URL: url, NODE_ENV: "test", ALLOW_DEMO: "1" }, stdio: ["ignore", "ignore", "inherit"] as const };
  execFileSync(process.execPath, [prismaCli, "migrate", "deploy"], { ...opts, stdio: [...opts.stdio] });
  execFileSync(process.execPath, [tsxCli, "prisma/seed.ts"], { ...opts, stdio: [...opts.stdio] });
  execFileSync(process.execPath, [tsxCli, "tests/seed-test-baseline.ts"], { ...opts, stdio: [...opts.stdio] });
}
