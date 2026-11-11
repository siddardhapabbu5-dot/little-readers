import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serverDir = path.resolve(__dirname, "..");
const UNREACHABLE = "postgresql://u:p@db.invalid:5432/nowhere";

function run(script: string, env: Record<string, string | undefined>, args: string[] = []) {
  return spawnSync(process.execPath, [`scripts/${script}`, ...args], {
    cwd: serverDir,
    env: { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, ...env },
    encoding: "utf8",
    timeout: 180_000,
  });
}

describe("T-INF-01 — restore drill safety", () => {
  it("refuses remote hosts, non-drill targets and the source database", () => {
    const remote = run("db-restore-drill.mjs", { DATABASE_URL: UNREACHABLE });
    expect(remote.status).toBe(1);
    expect(remote.stderr).toMatch(/host "db.invalid" is not local/);

    const local = "postgresql://u:p@localhost:5437/little_readers";
    const named = run("db-restore-drill.mjs", { DATABASE_URL: local, RESTORE_DRILL_DB: "little_readers" });
    expect(named.status).toBe(1);
    expect(named.stderr).toMatch(/must be a \*_restore_drill database/);

    const same = run("db-restore-drill.mjs", {
      DATABASE_URL: "postgresql://u:p@localhost:5437/x_restore_drill",
      RESTORE_DRILL_DB: "x_restore_drill",
    });
    expect(same.status).toBe(1);
    expect(same.stderr).toMatch(/must differ from the source/);
  });
});

/** Needs Postgres client tools (locally or in PG_DOCKER_CONTAINER); backs up the disposable test DB only. */
describe.skipIf(!process.env.PG_DOCKER_CONTAINER)("T-INF-01 — backup and restore drill on the test database", () => {
  it("backs up the test DB and restores it into a throwaway database with identical counts", () => {
    const url = process.env.DATABASE_URL ?? "";
    expect(new URL(url).pathname).toMatch(/_test$/);
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "lw-backup-"));
    const env = { DATABASE_URL: url, PG_DOCKER_CONTAINER: process.env.PG_DOCKER_CONTAINER, BACKUP_DIR: dir };
    try {
      const backup = run("db-backup.mjs", env);
      expect(backup.status, backup.stderr).toBe(0);
      const dumps = fs.readdirSync(dir).filter((f) => f.endsWith(".dump"));
      expect(dumps).toHaveLength(1);
      expect(fs.existsSync(path.join(dir, `${dumps[0]}.json`))).toBe(true);

      const drill = run("db-restore-drill.mjs", env);
      expect(drill.status, drill.stderr).toBe(0);
      expect(drill.stdout).toMatch(/PASS: every verification count matches/);
      expect(drill.stdout).toMatch(/into little_readers_test_restore_drill/);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }, 240_000);
});
