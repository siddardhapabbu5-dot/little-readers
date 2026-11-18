import { createHash } from "node:crypto";
import { Redis } from "ioredis";
import { env } from "../config/env.js";

/** Minimum wait between reconnect/ping attempts while Redis is down (avoids storming). */
const RECONNECT_COOLDOWN_MS = 3_000;

let client: Redis | null = null;
/** When > Date.now(), callers should use bounded memory fallback without probing Redis. */
let unavailableUntil = 0;
/** Single in-flight connect/ping so concurrent login requests share one recovery attempt. */
let connectInFlight: Promise<Redis | null> | null = null;

/** Stable non-reversible id for rate-limit keys (never store raw emails). */
export function hashRateLimitIdentity(value: string): string {
  return createHash("sha256").update(value.trim().toLowerCase()).digest("hex").slice(0, 32);
}

export function isRedisConfigured(): boolean {
  return Boolean(env.REDIS_URL);
}

function markTemporarilyUnavailable(reason: string) {
  unavailableUntil = Date.now() + RECONNECT_COOLDOWN_MS;
  console.warn(
    `[rate-limit] Redis unavailable (${reason}); using bounded in-memory fallback for ~${RECONNECT_COOLDOWN_MS / 1000}s`
  );
}

function markAvailable() {
  unavailableUntil = 0;
}

/**
 * Shared Redis client for login rate limiting.
 * One client per process. Failures activate a short cooldown for memory fallback;
 * recovery is probed automatically after the cooldown — no API restart required.
 */
export function getRedisClient(): Redis | null {
  if (!env.REDIS_URL) return null;
  if (client) return client;

  try {
    client = new Redis(env.REDIS_URL, {
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
      lazyConnect: true,
      connectTimeout: 3_000,
      // Keep trying in the background with capped backoff; command path still fails fast.
      retryStrategy(times: number) {
        return Math.min(times * 500, 5_000);
      },
    });
    client.on("error", (err: Error) => {
      // Do not disconnect permanently — cooldown lets ensureRedisConnected retry later.
      if (unavailableUntil <= Date.now()) {
        markTemporarilyUnavailable(err instanceof Error ? err.message : "error");
      }
    });
    client.on("ready", () => {
      markAvailable();
    });
    client.on("end", () => {
      if (unavailableUntil <= Date.now()) {
        markTemporarilyUnavailable("connection ended");
      }
    });
    return client;
  } catch (err) {
    markTemporarilyUnavailable(err instanceof Error ? err.message : "init failed");
    client = null;
    return null;
  }
}

async function connectAndPing(redis: Redis): Promise<Redis> {
  const status = redis.status;
  if (status === "wait") {
    await redis.connect();
  } else if (status === "end" || status === "close") {
    // After a hard disconnect, open a new connection on the same client instance.
    await redis.connect();
  }
  await redis.ping();
  return redis;
}

/**
 * Returns a live Redis client, or null while Redis is down / in cooldown.
 * Concurrent callers share one connect attempt. Never opens unlimited login paths.
 */
export async function ensureRedisConnected(): Promise<Redis | null> {
  if (!env.REDIS_URL) return null;

  // Cooldown: skip Redis probes and keep bounded memory rate limiting active.
  if (Date.now() < unavailableUntil) {
    return null;
  }

  if (connectInFlight) {
    return connectInFlight;
  }

  connectInFlight = (async () => {
    try {
      const redis = getRedisClient();
      if (!redis) return null;
      await connectAndPing(redis);
      markAvailable();
      return redis;
    } catch (err) {
      markTemporarilyUnavailable(err instanceof Error ? err.message : "unreachable");
      return null;
    } finally {
      connectInFlight = null;
    }
  })();

  return connectInFlight;
}

/** Test helper — force immediate memory fallback without destroying the client. */
export function markRedisUnavailableForTests() {
  unavailableUntil = Date.now() + 60_000;
}

export function resetRedisStateForTests() {
  unavailableUntil = 0;
  connectInFlight = null;
  if (client) {
    void client.quit().catch(() => undefined);
  }
  client = null;
}

/** Test/ops helper — remaining cooldown ms (0 = may probe Redis). */
export function redisUnavailableCooldownMs(): number {
  return Math.max(0, unavailableUntil - Date.now());
}
