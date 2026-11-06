/**
 * Runs before test files import the app. Keeps OTP/SMS in safe local-test mode
 * without changing production defaults.
 */
process.env.VITEST = "true";
process.env.OTP_DEV_MODE = "1";
process.env.SMS_PROVIDER = process.env.SMS_PROVIDER || "console";
process.env.PAYMENT_ENABLED = process.env.PAYMENT_ENABLED || "false";
