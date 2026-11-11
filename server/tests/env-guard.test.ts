import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parseEnv } from "../src/config/env.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serverDir = path.resolve(__dirname, "..");
const tsxCli = path.resolve(serverDir, "../node_modules/tsx/dist/cli.mjs");

const STRONG_SECRET = "k9Qv2Lx7Rt4Wm8Zp1Hs6Nc3Bd5Fg0JyTa4Ue";
const base = { DATABASE_URL: "postgresql://u:p@localhost:5432/x_test", JWT_SECRET: STRONG_SECRET };

describe("environment boot guard (T-SEC-02)", () => {
  it("treats a missing NODE_ENV as production", () => {
    expect(parseEnv({ ...base }).NODE_ENV).toBe("production");
  });

  it("refuses to boot without required secrets", () => {
    expect(() => parseEnv({ NODE_ENV: "production", DATABASE_URL: base.DATABASE_URL })).toThrow(/JWT_SECRET/);
    expect(() => parseEnv({ NODE_ENV: "production", JWT_SECRET: STRONG_SECRET })).toThrow(/DATABASE_URL/);
  });

  it("refuses dev-only switches and placeholder secrets in production (including NODE_ENV unset)", () => {
    expect(() => parseEnv({ ...base, OTP_DEV_MODE: "1" })).toThrow(/OTP_DEV_MODE/);
    expect(() => parseEnv({ ...base, ALLOW_DEMO: "1" })).toThrow(/ALLOW_DEMO/);
    expect(() => parseEnv({ ...base, PASSWORD_RESET_LOG_ONLY: "true" })).toThrow(/PASSWORD_RESET_LOG_ONLY/);
    expect(() => parseEnv({ ...base, JWT_SECRET: "change_me_change_me_change_me_123" })).toThrow(/placeholder/);
  });

  it("still allows explicit dev flags in development and test", () => {
    for (const NODE_ENV of ["development", "test"]) {
      const e = parseEnv({ ...base, NODE_ENV, OTP_DEV_MODE: "1", ALLOW_DEMO: "1" });
      expect(e.OTP_DEV_MODE).toBe(true);
      expect(e.ALLOW_DEMO).toBe(true);
    }
  });

  it("a real process exits non-zero when production config is unsafe", () => {
    const res = spawnSync(
      process.execPath,
      [tsxCli, "-e", "import('./src/config/env.ts').then(() => console.log('BOOTED'))"],
      {
        cwd: serverDir,
        env: { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, NODE_ENV: "production", OTP_DEV_MODE: "1" },
        encoding: "utf8",
        timeout: 60_000,
      }
    );
    expect(res.status).not.toBe(0);
    expect(res.stdout).not.toContain("BOOTED");
    expect(res.stderr).toMatch(/Refusing to start|Invalid environment/);
  }, 90_000);
});
