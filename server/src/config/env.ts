import { config as loadEnv } from "dotenv";
import { z } from "zod";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
loadEnv({ path: path.resolve(__dirname, "../../../.env") });
loadEnv();

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().default(4100),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  JWT_SECRET: z.string().min(32, "JWT_SECRET must be at least 32 characters"),
  JWT_EXPIRES_IN: z.string().default("7d"),
  BCRYPT_ROUNDS: z.coerce.number().int().min(10).max(15).default(12),
  CORS_ORIGIN: z.string().default("http://localhost:3100"),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().default(15 * 60 * 1000),
  RATE_LIMIT_MAX: z.coerce.number().default(100),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("Invalid environment configuration:", parsed.error.flatten().fieldErrors);
  if (process.env.NODE_ENV !== "test") {
    process.exit(1);
  }
}

export const env =
  parsed.success
    ? parsed.data
    : {
        NODE_ENV: "test" as const,
        PORT: 4000,
        DATABASE_URL: process.env.DATABASE_URL ?? "postgresql://invalid",
        JWT_SECRET: "test_secret_at_least_thirty_two_chars_long",
        JWT_EXPIRES_IN: "1h",
        BCRYPT_ROUNDS: 10,
        CORS_ORIGIN: "http://localhost:3000",
        RATE_LIMIT_WINDOW_MS: 15 * 60 * 1000,
        RATE_LIMIT_MAX: 1000,
      };
