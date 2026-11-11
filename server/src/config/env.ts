import { config as loadEnv } from "dotenv";
import { z } from "zod";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
loadEnv({ path: path.resolve(__dirname, "../../../.env") });
loadEnv();

const envSchema = z.object({
  /** Missing NODE_ENV is treated as production so dev-only behaviour is never enabled by accident. */
  NODE_ENV: z.enum(["development", "test", "production"]).default("production"),
  PORT: z.coerce.number().default(4100),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  JWT_SECRET: z.string().min(32, "JWT_SECRET must be at least 32 characters"),
  /** Access token TTL (Parent OTP sessions use this; default shorter for mobile). */
  JWT_EXPIRES_IN: z.string().default("7d"),
  ACCESS_TOKEN_EXPIRY: z.string().default("15m"),
  REFRESH_TOKEN_EXPIRY: z.string().default("30d"),
  BCRYPT_ROUNDS: z.coerce.number().int().min(10).max(15).default(12),
  /** Parent OTP */
  OTP_EXPIRY_SECONDS: z.coerce.number().int().min(60).max(900).default(300),
  OTP_RESEND_SECONDS: z.coerce.number().int().min(30).max(300).default(60),
  OTP_MAX_ATTEMPTS: z.coerce.number().int().min(3).max(10).default(5),
  /** Max OTP sends per mobile per rolling hour (in addition to resend cooldown). */
  OTP_MAX_SENDS_PER_HOUR: z.coerce.number().int().min(3).max(30).default(5),
  /**
   * When true (non-production), OTP is logged to server console for local testing.
   * Never enable in production — OTP is never returned in API JSON in production.
   */
  OTP_DEV_MODE: z
    .string()
    .optional()
    .transform((v) => v === "true" || v === "1"),
  SMS_PROVIDER: z.enum(["console", "msg91", "http"]).default("console"),
  SMS_API_KEY: z.string().optional(),
  SMS_SENDER_ID: z.string().optional(),
  SMS_HTTP_URL: z.string().optional(),
  SMS_TEMPLATE_ID: z.string().optional(),
  DEFAULT_COUNTRY_CODE: z.string().default("+91"),
  CORS_ORIGIN: z
    .string()
    .default(
      "http://localhost:3100,http://127.0.0.1:3100,http://localhost:8081,http://127.0.0.1:8081"
    ),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().default(15 * 60 * 1000),
  RATE_LIMIT_MAX: z.coerce.number().default(100),
  /** Public web/app origin for reset links (e.g. http://localhost:3100). */
  APP_PUBLIC_URL: z.string().default("http://localhost:3100"),
  /** Mobile Expo web — single Metro port 8081 only. */
  MOBILE_PUBLIC_URL: z.string().default("http://localhost:8081"),
  PASSWORD_RESET_TOKEN_TTL_MINUTES: z.coerce.number().int().min(5).max(1440).default(60),
  /** Admin forgot-password tokens — short-lived (spec: 15 minutes). */
  ADMIN_PASSWORD_RESET_TOKEN_TTL_MINUTES: z.coerce
    .number()
    .int()
    .min(5)
    .max(60)
    .default(15),
  /** Shown to parents who forgot their registered mobile (OTP login). */
  SUPPORT_EMAIL: z.string().email().default("support@littlereaders.example"),
  /**
   * When true (non-production only), reset emails are logged instead of sent.
   * Production must use RESEND_API_KEY — never claim success without delivery.
   */
  PASSWORD_RESET_LOG_ONLY: z
    .string()
    .optional()
    .transform((v) => v === "true" || v === "1"),
  RESEND_API_KEY: z.string().optional(),
  RESEND_FROM_EMAIL: z.string().email().optional(),
  /** Email OTP delivery (Hostinger domain mailbox). */
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().positive().default(465),
  SMTP_SECURE: z
    .string()
    .optional()
    .transform((v) => v === undefined || v === "" ? undefined : v === "true" || v === "1"),
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
  SMTP_FROM_EMAIL: z.string().email().optional(),
  SMTP_FROM_NAME: z.string().default("LEARN WISE"),
  /** Razorpay (Batch 10) — sandbox keys in development; never commit live secrets. */
  RAZORPAY_KEY_ID: z.string().optional(),
  RAZORPAY_KEY_SECRET: z.string().optional(),
  RAZORPAY_WEBHOOK_SECRET: z.string().optional(),
  PAYMENT_CURRENCY: z.string().default("INR"),
  /**
   * When true and keys + plan amounts are set, checkout orders are allowed.
   * Prices must be configured explicitly — never invent amounts.
   */
  PAYMENT_ENABLED: z
    .string()
    .optional()
    .transform((v) => v === "true" || v === "1"),
  PLAN_FAMILY_MONTHLY_AMOUNT_PAISE: z.coerce.number().int().nonnegative().optional(),
  PLAN_FAMILY_YEARLY_AMOUNT_PAISE: z.coerce.number().int().nonnegative().optional(),
  PLAN_EXTRA_SEAT_AMOUNT_PAISE: z.coerce.number().int().nonnegative().optional(),
  /** Tax in basis points (1800 = 18%). Applied server-side to configured amounts. */
  TAX_RATE_BPS: z.coerce.number().int().min(0).max(10000).default(0),
  /** Opt-in for demo accounts (development/test only; rejected in production). */
  ALLOW_DEMO: z
    .string()
    .optional()
    .transform((v) => v === "1"),
});

const PLACEHOLDER_SECRET = /change[-_ ]?me|replace[-_ ]?me|example|placeholder|dev[-_]?secret|test[-_]?secret|^(.)\1+$/i;

export type Env = z.infer<typeof envSchema>;

/** Production must never run with dev-only switches or placeholder secrets. */
export function productionConfigErrors(e: Env): string[] {
  if (e.NODE_ENV !== "production") return [];
  const errors: string[] = [];
  if (PLACEHOLDER_SECRET.test(e.JWT_SECRET)) errors.push("JWT_SECRET looks like a placeholder");
  if (e.OTP_DEV_MODE) errors.push("OTP_DEV_MODE must be off in production");
  if (e.PASSWORD_RESET_LOG_ONLY) errors.push("PASSWORD_RESET_LOG_ONLY must be off in production");
  if (e.ALLOW_DEMO) errors.push("ALLOW_DEMO must not be set in production");
  return errors;
}

/** Parses and validates configuration; throws instead of falling back to defaults. */
export function parseEnv(source: NodeJS.ProcessEnv): Env {
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    const fields = Object.keys(parsed.error.flatten().fieldErrors).join(", ");
    throw new Error(`Invalid environment configuration: ${fields}`);
  }
  const errors = productionConfigErrors(parsed.data);
  if (errors.length) throw new Error(`Refusing to start: ${errors.join("; ")}`);
  return parsed.data;
}

function loadOrExit(): Env {
  try {
    return parseEnv(process.env);
  } catch (err) {
    console.error(err instanceof Error ? err.message : err);
    if (process.env.NODE_ENV === "test" || process.env.VITEST) throw err;
    process.exit(1);
  }
}

export const env = loadOrExit();
