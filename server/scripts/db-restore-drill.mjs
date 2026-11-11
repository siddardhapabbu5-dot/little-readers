/**
 * Restore drill: restores a backup into a throwaway local database named *_restore_drill, then
 * checks the restored counts against the backup manifest. Never writes to the source database.
 * Usage: npm run db:restore-drill [-- path/to/file.dump] [--keep]
 */
import fs from "node:fs";
import path from "node:path";
import { LOCAL_HOSTS, backupDir, databaseFromEnv, runPgTool, verifyCounts } from "./lib/pg-tools.mjs";

const args = process.argv.slice(2);
const keep = args.includes("--keep");
const db = databaseFromEnv();

function fail(message) {
  console.error(`[db-restore-drill] FAILED: ${message}`);
  process.exit(1);
}

function newestDump() {
  const dir = backupDir();
  if (!fs.existsSync(dir)) return null;
  const dumps = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".dump"))
    .map((f) => path.join(dir, f))
    .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
  return dumps[0] ?? null;
}

const drillDb = process.env.RESTORE_DRILL_DB ?? `${db.database}_restore_drill`;
if (!/^[a-z0-9_]+_restore_drill$/.test(drillDb)) fail(`target "${drillDb}" must be a *_restore_drill database`);
if (drillDb === db.database) fail("target must differ from the source database");
if (!LOCAL_HOSTS.has(db.host)) fail(`database host "${db.host}" is not local; drills run on a local server only`);
if ((process.env.NODE_ENV ?? "") === "production") fail("NODE_ENV is production");

const file = args.find((a) => !a.startsWith("--")) ?? newestDump();
if (!file || !fs.existsSync(file)) fail("no backup file found; run npm run db:backup first");
const manifestFile = `${file}.json`;
if (!fs.existsSync(manifestFile)) fail(`manifest ${path.basename(manifestFile)} is missing`);
const manifest = JSON.parse(fs.readFileSync(manifestFile, "utf8"));

const admin = (sql) => runPgTool("psql", db, ["-At", "-v", "ON_ERROR_STOP=1", "-c", sql], { database: "postgres" });

try {
  await admin(`DROP DATABASE IF EXISTS "${drillDb}" WITH (FORCE)`);
  await admin(`CREATE DATABASE "${drillDb}"`);
  await runPgTool("pg_restore", db, ["--no-owner", "--no-privileges", "--exit-on-error"], {
    stdinFile: file,
    database: drillDb,
  });
  const restored = await verifyCounts(db, drillDb);
  const mismatches = Object.entries(manifest.counts).filter(([k, v]) => String(restored[k]) !== String(v));
  console.log(`[db-restore-drill] restored ${path.basename(file)} into ${drillDb}`);
  console.log(`[db-restore-drill] expected ${JSON.stringify(manifest.counts)}`);
  console.log(`[db-restore-drill] restored ${JSON.stringify(restored)}`);
  if (mismatches.length) fail(`count mismatch: ${mismatches.map(([k]) => k).join(", ")}`);
  console.log("[db-restore-drill] PASS: every verification count matches the backup manifest");
} catch (error) {
  fail(error.message);
} finally {
  if (!keep) await admin(`DROP DATABASE IF EXISTS "${drillDb}" WITH (FORCE)`).catch(() => {});
}
