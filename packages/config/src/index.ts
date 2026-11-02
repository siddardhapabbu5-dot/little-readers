import { z } from "zod";

/** Shared env shape for NestJS API (Phase 1 foundation). */
export const apiEnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  API_PORT: z.coerce.number().default(4200),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().default("redis://localhost:6379"),
  JWT_SECRET: z.string().min(32),
  CORS_ORIGIN: z.string().default("http://localhost:3100"),
});

export type ApiEnv = z.infer<typeof apiEnvSchema>;

export const SUBSCRIPTION_PACKAGES = [
  {
    code: "STARTER",
    label: "Starter",
    studentCapacity: 100,
    annualPriceInr: 15000,
  },
  {
    code: "STANDARD",
    label: "Standard",
    studentCapacity: 300,
    annualPriceInr: 35000,
  },
  {
    code: "PREMIUM",
    label: "Premium",
    studentCapacity: 750,
    annualPriceInr: 75000,
  },
  {
    code: "ENTERPRISE",
    label: "Enterprise",
    studentCapacity: 1500,
    annualPriceInr: null as number | null,
  },
] as const;
