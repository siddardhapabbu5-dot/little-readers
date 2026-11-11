/**
 * Read-only backup of the database in DATABASE_URL (custom pg_dump format) plus a manifest of
 * verification counts. Usage: npm run db:backup   (PG_DOCKER_CONTAINER=little-readers-db locally)
 */
import fs from "node:fs";
import path from "node:path";
import { backupDir, databaseFromEnv, runPgTool, verifyCounts } from "./lib/pg-tools.mjs";

const db = databaseFromEnv();
const dir = backupDir();
fs.mkdirSync(dir, { recursive: true });

const stamp = new Date().toISOString().replace(/[-:]/g, "").replace("T", "-").slice(0, 15);
const file = path.join(dir, `${db.database}-${stamp}.dump`);

try {
  const counts = await verifyCounts(db);
  await runPgTool("pg_dump", db, ["-Fc", "--no-owner", "--no-privileges"], { stdoutFile: file });
  const size = fs.statSync(file).size;
  if (size === 0) throw new Error("pg_dump produced an empty file");
  // A readable table of contents proves the archive is complete and parseable.
  const toc = await runPgTool("pg_restore", db, ["--list"], { stdinFile: file, offline: true });
  const entries = toc.split("\n").filter((l) => /^\d+;/.test(l)).length;
  const manifest = { database: db.database, file: path.basename(file), bytes: size, tocEntries: entries, counts, createdAt: new Date().toISOString() };
  fs.writeFileSync(`${file}.json`, JSON.stringify(manifest, null, 2));
  console.log(`[db-backup] OK ${path.basename(file)} (${size} bytes, ${entries} archive entries)`);
  console.log(`[db-backup] counts ${JSON.stringify(counts)}`);
} catch (error) {
  fs.rmSync(file, { force: true });
  console.error(`[db-backup] FAILED: ${error.message}`);
  process.exit(1);
}
