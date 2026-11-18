import rateLimit, {
  type Options,
  type RateLimitRequestHandler,
  type Store,
  type ClientRateLimitInfo,
  type IncrementResponse,
} from "express-rate-limit";
import type { Request } from "express";
import { env } from "../config/env.js";
import { ensureRedisConnected, hashRateLimitIdentity } from "./redis.js";

const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = env.NODE_ENV === "production" ? 20 : 200;

/**
 * Redis-backed hit counter with atomic INCR + PEXPIRE.
 * Falls back is handled by the factory (MemoryStore) when Redis is unavailable —
 * never disables limiting.
 */
class RedisHitStore implements Store {
  prefix: string;
  windowMs = WINDOW_MS;
  #warned = false;

  constructor(prefix: string) {
    this.prefix = prefix;
  }

  init(options: Options): void {
    this.windowMs = options.windowMs;
  }

  async increment(key: string): Promise<IncrementResponse> {
    const redis = await ensureRedisConnected();
    if (!redis) {
      if (!this.#warned) {
        this.#warned = true;
        console.warn(
          "[rate-limit] Redis unavailable for password attempts; bounded MemoryStore is active."
        );
      }
      throw new Error("REDIS_UNAVAILABLE");
    }
    // Recovery succeeded — allow a future outage warning again.
    this.#warned = false;

    const redisKey = `${this.prefix}${key}`;
    const totalHits = await redis.incr(redisKey);
    if (totalHits === 1) {
      await redis.pexpire(redisKey, this.windowMs);
    }
    const ttl = await redis.pttl(redisKey);
    const resetTime =
      ttl > 0 ? new Date(Date.now() + ttl) : new Date(Date.now() + this.windowMs);
    return { totalHits, resetTime };
  }

  async decrement(key: string): Promise<void> {
    const redis = await ensureRedisConnected();
    if (!redis) return;
    const redisKey = `${this.prefix}${key}`;
    const value = await redis.decr(redisKey);
    if (value <= 0) await redis.del(redisKey);
  }

  async resetKey(key: string): Promise<void> {
    const redis = await ensureRedisConnected();
    if (!redis) return;
    await redis.del(`${this.prefix}${key}`);
  }

  async get(key: string): Promise<ClientRateLimitInfo | undefined> {
    const redis = await ensureRedisConnected();
    if (!redis) return undefined;
    const redisKey = `${this.prefix}${key}`;
    const [raw, ttl] = await Promise.all([redis.get(redisKey), redis.pttl(redisKey)]);
    if (raw == null) return undefined;
    const totalHits = Number(raw);
    if (!Number.isFinite(totalHits)) return undefined;
    return {
      totalHits,
      resetTime: ttl > 0 ? new Date(Date.now() + ttl) : undefined,
    };
  }
}

/**
 * Key: path + client IP + hashed email.
 * Email is hashed so Redis never stores raw addresses.
 * Combining IP + account identity avoids a single shared-IP counter locking
 * unrelated users, while still bounding floods from one IP against one email.
 */
export function passwordAttemptKey(req: Request): string {
  const email = String((req.body as { email?: string })?.email ?? "")
    .trim()
    .toLowerCase();
  const emailPart = email ? hashRateLimitIdentity(email) : "none";
  const ip = req.ip || "unknown";
  return `${req.path}:${ip}:${emailPart}`;
}

function buildLimiter(store?: Store): RateLimitRequestHandler {
  return rateLimit({
    windowMs: WINDOW_MS,
    max: MAX_ATTEMPTS,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: passwordAttemptKey,
    message: {
      error: "Too many login attempts. Please wait before trying again.",
      code: "RATE_LIMITED",
    },
    skip: () => process.env.VITEST === "true" || process.env.NODE_ENV === "test",
    ...(store ? { store } : {}),
  });
}

let cached: RateLimitRequestHandler | null = null;
let usingRedis = false;

/**
 * Password-attempt rate limiter for login / forgot / reset.
 * Prefers Redis when REDIS_URL is configured and reachable; otherwise uses
 * express-rate-limit's bounded MemoryStore. Never allows unlimited attempts.
 */
export function passwordAttemptRateLimit(): RateLimitRequestHandler {
  if (cached) return cached;

  if (env.REDIS_URL) {
    const redisStore = new RedisHitStore("rl:pw:");
    // Wrapper: if Redis store throws REDIS_UNAVAILABLE on first use path,
    // express-rate-limit may error the request. Prefer constructing with
    // MemoryStore when Redis is not configured; when configured, try Redis
    // and fall back by swapping cache on failure via a dual-store proxy.
    cached = buildLimiter({
      init(options: Options) {
        redisStore.init(options);
        memoryFallback.init?.(options);
      },
      async increment(key: string) {
        try {
          const result = await redisStore.increment(key);
          usingRedis = true;
          return result;
        } catch {
          usingRedis = false;
          return memoryFallback.increment(key);
        }
      },
      async decrement(key: string) {
        if (usingRedis) {
          try {
            await redisStore.decrement(key);
            return;
          } catch {
            usingRedis = false;
          }
        }
        await memoryFallback.decrement(key);
      },
      async resetKey(key: string) {
        try {
          await redisStore.resetKey(key);
        } catch {
          /* ignore */
        }
        await memoryFallback.resetKey(key);
      },
    });
  } else {
    cached = buildLimiter();
  }

  return cached;
}

/** Local MemoryStore used as the safe bounded fallback. */
const memoryFallback: Store = (() => {
  const hits = new Map<string, { count: number; resetTime: Date }>();
  let windowMs = WINDOW_MS;
  return {
    init(options: Options) {
      windowMs = options.windowMs;
    },
    async increment(key: string): Promise<IncrementResponse> {
      const now = Date.now();
      const existing = hits.get(key);
      if (!existing || existing.resetTime.getTime() <= now) {
        const resetTime = new Date(now + windowMs);
        hits.set(key, { count: 1, resetTime });
        return { totalHits: 1, resetTime };
      }
      existing.count += 1;
      return { totalHits: existing.count, resetTime: existing.resetTime };
    },
    async decrement(key: string) {
      const existing = hits.get(key);
      if (!existing) return;
      existing.count = Math.max(0, existing.count - 1);
    },
    async resetKey(key: string) {
      hits.delete(key);
    },
  };
})();

/** Test helpers */
export function resetPasswordRateLimitForTests() {
  cached = null;
  usingRedis = false;
}

export function passwordRateLimitUsingRedis(): boolean {
  return usingRedis;
}

export { WINDOW_MS as PASSWORD_RATE_LIMIT_WINDOW_MS, MAX_ATTEMPTS as PASSWORD_RATE_LIMIT_MAX };
