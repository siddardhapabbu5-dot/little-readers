import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

function rootEnv() {
  const envFile = path.resolve(__dirname, "../../../.env");
  return fs.existsSync(envFile) ? parse(fs.readFileSync(envFile)) : {};
}

function localDatabaseProblems(env) {
  const problems = [];
  if ((env.NODE_ENV ?? rootEnv().NODE_ENV) === "production") problems.push("NODE_ENV is production");
  const raw = env.DATABASE_URL ?? rootEnv().DATABASE_URL;
  if (!raw) {
    problems.push("DATABASE_URL is not set");
  } else {
    let host = "";
    try {
      host = new URL(raw).hostname;
    } catch {
      problems.push("DATABASE_URL is not a valid URL");
    }
    if (host && !LOCAL_HOSTS.has(host)) problems.push(`database host "${host}" is not a local development host`);
  }
  return problems;
}

/** Returns the reasons a destructive script must not run (empty when allowed). Never includes secret values. */
export function destructiveGuardProblems(env = process.env) {
  const problems = localDatabaseProblems(env);
  if (env.CONFIRM_DESTRUCTIVE !== "1") problems.unshift("CONFIRM_DESTRUCTIVE=1 is not set");
  return problems;
}

/** Exits before any database work unless the run is explicitly confirmed against a local, non-production database. */
export function assertDestructiveAllowed(scriptName) {
  const problems = destructiveGuardProblems();
  if (problems.length === 0) return;
  console.error(`[${scriptName}] refused: ${problems.join("; ")}.`);
  console.error("This script deletes or hides data. Back up first, then run with CONFIRM_DESTRUCTIVE=1 against a local database.");
  process.exit(1);
}

/** Demo accounts have published passwords: only on a local, non-production database with ALLOW_DEMO=1. */
export function assertDemoAllowed(scriptName, env = process.env) {
  const problems = localDatabaseProblems(env);
  if ((env.ALLOW_DEMO ?? rootEnv().ALLOW_DEMO) !== "1") problems.unshift("ALLOW_DEMO=1 is not set");
  if (problems.length === 0) return;
  console.error(`[${scriptName}] refused: ${problems.join("; ")}.`);
  process.exit(1);
}
