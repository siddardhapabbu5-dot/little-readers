/**
 * Local/staging verification for Redis-backed login rate limiting.
 * Uses only REDIS_URL=redis://127.0.0.1:6379 (Docker). Never prints secrets.
 *
 * Run from repo root or server/:
 *   node server/scripts/staging-redis-multi-instance-verify.mjs
 */
import { createHash, randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const IORedis = require("ioredis");
const Redis = IORedis.Redis || IORedis.default || IORedis;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serverRoot = path.resolve(__dirname, "..");
const repoRoot = path.resolve(serverRoot, "..");

const STAGING_REDIS = "redis://127.0.0.1:6379";
const PORT_A = 4111;
const PORT_B = 4112;
const WINDOW_MS = 15 * 60 * 1000;
const PREFIX = "rl:pw:";

const results = [];
function record(name, ok, detail) {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

function hashEmail(email) {
  return createHash("sha256").update(email.trim().toLowerCase()).digest("hex").slice(0, 32);
}

function loginKey(routePath, ip, email) {
  return `${PREFIX}${routePath}:${ip}:${hashEmail(email)}`;
}

async function waitHealth(port, ms = 60_000) {
  const start = Date.now();
  while (Date.now() - start < ms) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/health`);
      if (res.ok) return true;
    } catch {
      /* retry */
    }
    await sleep(500);
  }
  return false;
}

function startApi(port) {
  const child = spawn(
    process.execPath,
    [path.join(repoRoot, "node_modules", "tsx", "dist", "cli.mjs"), "src/index.ts"],
    {
      cwd: serverRoot,
      env: {
        ...process.env,
        // Force local Docker Redis — never inherit a remote/prod URL for this script.
        REDIS_URL: STAGING_REDIS,
        PORT: String(port),
        NODE_ENV: "development",
        VITEST: "",
        // Keep limiter active (skip only when test/vitest).
      },
      stdio: ["ignore", "pipe", "pipe"],
    }
  );
  const logs = [];
  child.stdout.on("data", (b) => logs.push(b.toString()));
  child.stderr.on("data", (b) => logs.push(b.toString()));
  child._logs = logs;
  return child;
}

async function postLogin(port, email, password) {
  const res = await fetch(`http://127.0.0.1:${port}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Forwarded-For": "203.0.113.50" },
    body: JSON.stringify({ email, password }),
  });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, code: body.code, error: body.error };
}

async function main() {
  console.log("Staging Redis URL (forced): redis://127.0.0.1:6379");
  const redis = new Redis(STAGING_REDIS, { maxRetriesPerRequest: 1, lazyConnect: true });
  await redis.connect();
  const pong = await redis.ping();
  record("Redis connection", pong === "PONG", `ping=${pong}`);

  const stamp = Date.now();
  const emailShared = `rl_share_${stamp}@staging.local`;
  const emailLock = `rl_lock_${stamp}@staging.local`;
  const emailTtl = `rl_ttl_${stamp}@staging.local`;
  const password = `SecurePass${randomBytes(3).toString("hex")}1`;

  // --- Shared counter via two Redis clients (simulating two API stores) ---
  const redisA = new Redis(STAGING_REDIS, { lazyConnect: true });
  const redisB = new Redis(STAGING_REDIS, { lazyConnect: true });
  await redisA.connect();
  await redisB.connect();
  const shareKey = loginKey("/login", "203.0.113.50", emailShared);
  await redis.del(shareKey);
  const c1 = await redisA.incr(shareKey);
  if (c1 === 1) await redisA.pexpire(shareKey, WINDOW_MS);
  const c2 = await redisB.incr(shareKey);
  const seen = Number(await redis.get(shareKey));
  record(
    "Two-instance shared counter (Redis clients)",
    c1 === 1 && c2 === 2 && seen === 2,
    `A.incr=${c1} B.incr=${c2} get=${seen} keyHasRawEmail=${shareKey.includes("@")}`
  );
  record("Safe key (no raw email)", !shareKey.includes("@") && shareKey.startsWith(PREFIX), shareKey.slice(0, 48) + "…");

  // --- TTL ---
  const ttlKey = loginKey("/login", "203.0.113.50", emailTtl);
  await redis.del(ttlKey);
  await redis.incr(ttlKey);
  await redis.pexpire(ttlKey, 2000);
  const ttl1 = await redis.pttl(ttlKey);
  await sleep(2500);
  const ttl2 = await redis.pttl(ttlKey);
  const after = await redis.get(ttlKey);
  record(
    "Counter TTL expiry",
    ttl1 > 0 && ttl1 <= 2000 && (ttl2 < 0 || after == null),
    `pttl_before=${ttl1} pttl_after=${ttl2} value_after=${after}`
  );

  // --- Start two API instances ---
  const apiA = startApi(PORT_A);
  const apiB = startApi(PORT_B);
  const healthyA = await waitHealth(PORT_A);
  const healthyB = await waitHealth(PORT_B);
  record("API instance A health", healthyA, `port=${PORT_A}`);
  record("API instance B health", healthyB, `port=${PORT_B}`);
  if (!healthyA || !healthyB) {
    console.log("API A logs:\n", apiA._logs.join("").slice(-2000));
    console.log("API B logs:\n", apiB._logs.join("").slice(-2000));
    throw new Error("API instances failed to become healthy");
  }

  // Discover actual express path key by one probe login then scanning rl:pw:*
  await redis.flushdb();
  const probeEmail = `rl_probe_${stamp}@staging.local`;
  await postLogin(PORT_A, probeEmail, "WrongPass1");
  await sleep(300);
  const keys = await redis.keys("rl:pw:*");
  record("Limiter wrote Redis key after login attempt", keys.length >= 1, `keys=${keys.length}`);
  const activeKey = keys[0] ?? shareKey;

  // Instance A then B increments same counter
  await redis.set(activeKey, "5");
  await redis.pexpire(activeKey, WINDOW_MS);
  await postLogin(PORT_A, probeEmail, "WrongPass1");
  await postLogin(PORT_B, probeEmail, "WrongPass1");
  await sleep(200);
  const afterBoth = Number(await redis.get(activeKey));
  record(
    "Two API instances share HTTP rate-limit counter",
    afterBoth >= 7,
    `value_after_A_then_B=${afterBoth} (started at 5)`
  );

  // Trigger RATE_LIMITED: development max is 200 — seed to 200 so the next hit is blocked.
  await redis.set(activeKey, "200");
  await redis.pexpire(activeKey, WINDOW_MS);
  const limited = await postLogin(PORT_A, probeEmail, "WrongPass1");
  const limitedB = await postLogin(PORT_B, probeEmail, "WrongPass1");
  record(
    "RATE_LIMITED from shared counter",
    limited.status === 429 && limited.code === "RATE_LIMITED",
    `A status=${limited.status} code=${limited.code}`
  );
  record(
    "RATE_LIMITED visible on second instance",
    limitedB.status === 429 && limitedB.code === "RATE_LIMITED",
    `B status=${limitedB.status} code=${limitedB.code}`
  );

  // Account lockout distinct — create local test user via Prisma (avoid email-OTP register gate)
  await redis.del(activeKey);
  const createProc = spawn(
    process.execPath,
    [
      path.join(repoRoot, "node_modules", "tsx", "dist", "cli.mjs"),
      path.join(serverRoot, "scripts", "staging-create-test-user.mjs"),
    ],
    {
      cwd: serverRoot,
      env: {
        ...process.env,
        REDIS_URL: STAGING_REDIS,
        STAGING_EMAIL: emailLock,
        STAGING_PASSWORD: password,
        NODE_ENV: "development",
      },
      stdio: ["ignore", "pipe", "pipe"],
    }
  );
  let createOut = "";
  createProc.stdout.on("data", (b) => (createOut += b.toString()));
  createProc.stderr.on("data", (b) => (createOut += b.toString()));
  const createCode = await new Promise((resolve) => createProc.on("exit", resolve));
  const registered = createCode === 0 && createOut.includes("USER_OK");
  record("Test account create (local DB via Prisma)", registered, createCode === 0 ? "ok" : createOut.slice(-300));

  let lockStatus = null;
  let lockCode = null;
  if (registered) {
    for (let i = 0; i < 5; i++) {
      const r = await postLogin(PORT_A, emailLock, "WrongPass1");
      lockStatus = r.status;
      lockCode = r.code;
    }
    record(
      "ACCOUNT_LOCKED distinct from RATE_LIMITED",
      lockStatus === 429 && lockCode === "ACCOUNT_LOCKED",
      `status=${lockStatus} code=${lockCode}`
    );
    const still = await postLogin(PORT_B, emailLock, password);
    record(
      "Lockout enforced across instances",
      still.status === 429 && still.code === "ACCOUNT_LOCKED",
      `correct_password_while_locked status=${still.status} code=${still.code}`
    );
  } else {
    record("ACCOUNT_LOCKED distinct from RATE_LIMITED", false, "user create failed");
    record("Lockout enforced across instances", false, "skipped");
  }

  // Redis outage / fallback
  console.log("Stopping Redis container for outage test…");
  await new Promise((resolve, reject) => {
    const d = spawn("docker", ["stop", "siwi-staging-redis"], { stdio: "inherit" });
    d.on("exit", (c) => (c === 0 ? resolve() : reject(new Error("docker stop failed"))));
  });
  await sleep(1000);

  // Existing processes may latch to memory fallback — requests should still not be unlimited
  const duringOutage = [];
  for (let i = 0; i < 3; i++) {
    duringOutage.push(await postLogin(PORT_A, `outage_${stamp}_${i}@staging.local`, "WrongPass1"));
  }
  const outageOk = duringOutage.every((r) => r.status === 401 || r.status === 429 || r.status === 500);
  record(
    "API responds during Redis outage (bounded/fallback path)",
    outageOk && duringOutage.some((r) => r.status === 401 || r.status === 429),
    `statuses=${duringOutage.map((r) => r.status).join(",")}`
  );

  // Restart Redis
  console.log("Starting Redis container again…");
  await new Promise((resolve, reject) => {
    const d = spawn("docker", ["start", "siwi-staging-redis"], { stdio: "inherit" });
    d.on("exit", (c) => (c === 0 ? resolve() : reject(new Error("docker start failed"))));
  });
  await sleep(1500);
  const redis2 = new Redis(STAGING_REDIS, { lazyConnect: true, maxRetriesPerRequest: 1 });
  await redis2.connect();
  record("Redis restarted", (await redis2.ping()) === "PONG", "");

  // Wait past reconnect cooldown (3s) so APIs may probe Redis again — no process restart.
  console.log("Waiting 3.5s for Redis reconnect cooldown…");
  await sleep(3500);
  await redis2.flushdb();
  const reconnEmail = `reconn_${stamp}@staging.local`;
  await postLogin(PORT_A, reconnEmail, "WrongPass1");
  await postLogin(PORT_B, reconnEmail, "WrongPass1");
  await sleep(500);
  const keysAfter = await redis2.keys("rl:pw:*");
  let sharedAfter = 0;
  if (keysAfter[0]) sharedAfter = Number(await redis2.get(keysAfter[0]));
  record(
    "Auto-recover shared Redis counters without API restart",
    keysAfter.length >= 1 && sharedAfter >= 2,
    `keys=${keysAfter.length} value=${sharedAfter}`
  );

  // Second outage/recovery cycle — same API processes, still one logical client each
  console.log("Second Redis outage cycle…");
  await new Promise((resolve, reject) => {
    const d = spawn("docker", ["stop", "siwi-staging-redis"], { stdio: "inherit" });
    d.on("exit", (c) => (c === 0 ? resolve() : reject(new Error("docker stop failed"))));
  });
  await sleep(800);
  const mid = await postLogin(PORT_A, `cycle2_${stamp}@staging.local`, "WrongPass1");
  record("Second outage still bounded", mid.status === 401 || mid.status === 429, `status=${mid.status}`);
  await new Promise((resolve, reject) => {
    const d = spawn("docker", ["start", "siwi-staging-redis"], { stdio: "inherit" });
    d.on("exit", (c) => (c === 0 ? resolve() : reject(new Error("docker start failed"))));
  });
  await sleep(3500);
  const redis3 = new Redis(STAGING_REDIS, { lazyConnect: true, maxRetriesPerRequest: 1 });
  redis3.on("error", () => undefined);
  await redis3.connect();
  record("Redis ready after second restart", (await redis3.ping()) === "PONG", "");
  await redis3.flushdb();
  await postLogin(PORT_A, `cycle2b_${stamp}@staging.local`, "WrongPass1");
  await postLogin(PORT_B, `cycle2b_${stamp}@staging.local`, "WrongPass1");
  await sleep(500);
  const keysCycle = await redis3.keys("rl:pw:*");
  let cycleVal = 0;
  if (keysCycle[0]) cycleVal = Number(await redis3.get(keysCycle[0]));
  record(
    "Second recovery shares counters without new API processes",
    keysCycle.length >= 1 && cycleVal >= 2,
    `keys=${keysCycle.length} value=${cycleVal}`
  );

  // TTL still works after recovery
  const ttlKey2 = keysCycle[0];
  if (ttlKey2) {
    await redis3.pexpire(ttlKey2, 1500);
    const t1 = await redis3.pttl(ttlKey2);
    await sleep(1800);
    const t2 = await redis3.pttl(ttlKey2);
    record("TTL expiry after auto-recovery", t1 > 0 && t2 < 0, `pttl_before=${t1} pttl_after=${t2}`);
  } else {
    record("TTL expiry after auto-recovery", false, "no key");
  }
  try {
    await redis3.quit();
  } catch {
    /* ignore */
  }

  // Cleanup same API processes (never restarted)
  apiA.kill("SIGTERM");
  apiB.kill("SIGTERM");
  try {
    await redis.quit();
  } catch {
    /* ignore */
  }
  try {
    await redisA.quit();
  } catch {
    /* ignore */
  }
  try {
    await redisB.quit();
  } catch {
    /* ignore */
  }
  try {
    await redis2.quit();
  } catch {
    /* ignore */
  }

  const failed = results.filter((r) => !r.ok);
  console.log("\n==== SUMMARY ====");
  console.log(`Passed: ${results.filter((r) => r.ok).length}/${results.length}`);
  if (failed.length) {
    console.log("Failures:");
    for (const f of failed) console.log(` - ${f.name}: ${f.detail}`);
  }
  // Write machine-readable results for the markdown report
  const fs = await import("node:fs/promises");
  const out = path.join(repoRoot, "docs", "LOGIN_REDIS_STAGING_RESULTS.json");
  await fs.mkdir(path.dirname(out), { recursive: true });
  await fs.writeFile(
    out,
    JSON.stringify(
      {
        stagingRedis: STAGING_REDIS,
        ports: [PORT_A, PORT_B],
        windowMs: WINDOW_MS,
        results,
        at: new Date().toISOString(),
      },
      null,
      2
    )
  );
  console.log(`Wrote ${out}`);
  process.exit(failed.length ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
