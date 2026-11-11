import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
// @ts-expect-error plain .mjs helper without type declarations
import { destructiveGuardProblems } from "../scripts/lib/destructive-guard.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serverDir = path.resolve(__dirname, "..");
const LOCAL = "postgresql://u:p@localhost:5437/little_readers";
/** Unreachable host: even if the guard failed, the script could not touch a real database. */
const UNREACHABLE = "postgresql://u:p@db.invalid:5432/nowhere";

const GUARDED = [
  "clean-empty-seed-cats.mjs",
  "clean-test-lessons.mjs",
  "clear-sample-data-pass2.mjs",
  "clear-sample-data.mjs",
  "clear-vocabulary.ts",
  "hide-curriculum-from-kids.mjs",
  "keep-only-grade1.mjs",
  "prepare-client-fresh.mjs",
  "purge-auto-g-grades.mjs",
  "reimport-fruits-az.mjs",
  "replace-with-kids-starter.mjs",
  "restore-local-level1-vocab.ts",
  "wipe-grades-categories.mjs",
];

describe("destructive script guard (T-SEC-10)", () => {
  it("requires explicit confirmation, a non-production env and a local host", () => {
    expect(destructiveGuardProblems({ DATABASE_URL: LOCAL, NODE_ENV: "development" })).toEqual([
      "CONFIRM_DESTRUCTIVE=1 is not set",
    ]);
    expect(
      destructiveGuardProblems({ CONFIRM_DESTRUCTIVE: "1", DATABASE_URL: LOCAL, NODE_ENV: "production" })
    ).toEqual(["NODE_ENV is production"]);
    expect(
      destructiveGuardProblems({ CONFIRM_DESTRUCTIVE: "1", DATABASE_URL: UNREACHABLE, NODE_ENV: "development" })
    ).toEqual(['database host "db.invalid" is not a local development host']);
    expect(destructiveGuardProblems({ CONFIRM_DESTRUCTIVE: "1", DATABASE_URL: LOCAL, NODE_ENV: "development" })).toEqual([]);
  });

  it("every data-deleting script calls the guard", () => {
    for (const file of GUARDED) {
      const src = fs.readFileSync(path.join(serverDir, "scripts", file), "utf8");
      expect(src, file).toMatch(/assertDestructiveAllowed\(/);
    }
  });

  it("removed the npm aliases for destructive scripts", () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(serverDir, "package.json"), "utf8"));
    for (const alias of ["db:clear-sample", "db:hide-kids-content", "db:wipe-grades"]) {
      expect(pkg.scripts[alias], alias).toBeUndefined();
    }
  });

  it("a real wipe script exits before any database work when not confirmed", () => {
    const res = spawnSync(process.execPath, ["scripts/wipe-grades-categories.mjs"], {
      cwd: serverDir,
      env: { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, NODE_ENV: "development", DATABASE_URL: UNREACHABLE },
      encoding: "utf8",
      timeout: 60_000,
    });
    expect(res.status).toBe(1);
    expect(res.stderr).toMatch(/refused: CONFIRM_DESTRUCTIVE=1 is not set; database host "db.invalid"/);
  }, 90_000);
});
