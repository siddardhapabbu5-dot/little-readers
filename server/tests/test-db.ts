import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

/**
 * Tests must never touch the development or production database.
 * TEST_DATABASE_URL wins; otherwise the root .env DATABASE_URL is reused with `_test` appended to the database name.
 */
export function resolveTestDatabaseUrl(): string {
  let raw = process.env.TEST_DATABASE_URL;
  if (!raw) {
    const envFile = path.resolve(__dirname, "../../.env");
    const base = fs.existsSync(envFile) ? parse(fs.readFileSync(envFile)).DATABASE_URL : undefined;
    if (!base) throw new Error("Test DB guard: set TEST_DATABASE_URL or DATABASE_URL in the root .env");
    const url = new URL(base);
    const name = url.pathname.replace(/^\//, "");
    url.pathname = `/${name.endsWith("_test") ? name : `${name}_test`}`;
    raw = url.toString();
  }
  assertDisposableTestDatabase(raw);
  return raw;
}

export function assertDisposableTestDatabase(raw: string) {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("Test DB guard: database URL is not parseable");
  }
  const name = url.pathname.replace(/^\//, "");
  if (!LOCAL_HOSTS.has(url.hostname)) {
    throw new Error(`Test DB guard: refusing non-local database host "${url.hostname}"`);
  }
  if (!name.endsWith("_test")) {
    throw new Error(`Test DB guard: refusing database "${name}" (name must end with _test)`);
  }
}
