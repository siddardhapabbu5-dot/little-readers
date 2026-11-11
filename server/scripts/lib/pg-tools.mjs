import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(__dirname, "../../..");
export const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

export function rootEnv() {
  const envFile = path.join(REPO_ROOT, ".env");
  return fs.existsSync(envFile) ? parse(fs.readFileSync(envFile)) : {};
}

/** Connection parts from DATABASE_URL (process env first, then the root .env). Never logged. */
export function databaseFromEnv(env = process.env) {
  const raw = env.DATABASE_URL ?? rootEnv().DATABASE_URL;
  if (!raw) throw new Error("DATABASE_URL is not set");
  const url = new URL(raw);
  return {
    host: url.hostname,
    port: url.port || "5432",
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: url.pathname.replace(/^\//, ""),
  };
}

/**
 * Runs a Postgres client tool. With PG_DOCKER_CONTAINER set the tool runs inside that container
 * (talking to the server on PG_DOCKER_PORT, default 5432); otherwise the local binary is used.
 * The password is passed through PGPASSWORD only.
 */
export function runPgTool(tool, db, args, { stdoutFile, stdinFile, database, offline = false } = {}) {
  const container = process.env.PG_DOCKER_CONTAINER ?? rootEnv().PG_DOCKER_CONTAINER;
  const target = database ?? db.database;
  const conn = container
    ? ["-h", "localhost", "-p", process.env.PG_DOCKER_PORT ?? "5432", "-U", db.user]
    : ["-h", db.host, "-p", db.port, "-U", db.user];
  // offline: tools such as `pg_restore --list` that only read the archive and touch no database.
  const full = offline ? args : [...conn, "-d", target, ...args];
  const [cmd, cmdArgs] = container
    ? ["docker", ["exec", "-i", "-e", "PGPASSWORD", container, tool, ...full]]
    : [tool, full];

  return new Promise((resolve, reject) => {
    const child = spawn(cmd, cmdArgs, {
      env: { ...process.env, PGPASSWORD: db.password },
      stdio: [stdinFile ? "pipe" : "ignore", stdoutFile ? "pipe" : "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    if (stdoutFile) child.stdout.pipe(fs.createWriteStream(stdoutFile));
    else child.stdout.on("data", (d) => (stdout += d));
    child.stderr.on("data", (d) => (stderr += d));
    if (stdinFile) fs.createReadStream(stdinFile).pipe(child.stdin);
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve(stdout);
      else reject(new Error(`${tool} exited ${code}: ${stderr.trim().split("\n").slice(-3).join(" | ")}`));
    });
  });
}

/** Row counts that a backup must reproduce exactly, including the protected Grade 1 content. */
export const VERIFY_COUNTS_SQL = `SELECT json_build_object(
  'users', (SELECT count(*) FROM "User"),
  'children', (SELECT count(*) FROM "Child"),
  'plans', (SELECT count(*) FROM "SubscriptionPlan"),
  'payments', (SELECT count(*) FROM "Payment"),
  'subscriptions', (SELECT count(*) FROM "Subscription"),
  'words', (SELECT count(*) FROM "VocabularyWord"),
  'categories', (SELECT count(*) FROM "LearningCategory"),
  'g1_live_words', (SELECT count(*) FROM "VocabularyWord" w JOIN "LearningCategory" c ON c.id = w."categoryId" JOIN "LearningGroup" g ON g.id = c."groupId" JOIN "LearningLevel" l ON l.id = g."levelId" WHERE l.code = 'LEVEL_1' AND w."isActive" AND c."isPublished"),
  'g1_published_topics', (SELECT count(*) FROM "LearningCategory" c JOIN "LearningGroup" g ON g.id = c."groupId" JOIN "LearningLevel" l ON l.id = g."levelId" WHERE l.code = 'LEVEL_1' AND c."isPublished"),
  'migrations', (SELECT count(*) FROM "_prisma_migrations")
)`;

export async function verifyCounts(db, database) {
  const out = await runPgTool("psql", db, ["-At", "-v", "ON_ERROR_STOP=1", "-c", VERIFY_COUNTS_SQL], { database });
  return JSON.parse(out.trim());
}

export function backupDir() {
  return path.resolve(process.env.BACKUP_DIR ?? rootEnv().BACKUP_DIR ?? path.join(REPO_ROOT, "backups"));
}
