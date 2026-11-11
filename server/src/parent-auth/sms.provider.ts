import { env } from "../config/env.js";

function logDevOtp(mobileE164: string, otp: string, note: string) {
  if (env.NODE_ENV !== "development" && env.NODE_ENV !== "test") return;
  console.info(`[OTP_DEV] ${note} → ${mobileE164}`);
  if (env.OTP_DEV_MODE) {
    console.info(`[OTP_DEV] OTP for ${mobileE164}: ${otp}`);
  }
}

/**
 * Send OTP SMS via configured provider.
 * Never bypass OTP. Production with msg91/http requires credentials (no silent console success).
 */
export async function sendOtpSms(input: {
  mobileE164: string;
  otp: string;
}): Promise<{ provider: string; ok: boolean }> {
  const provider = env.SMS_PROVIDER;
  const isProd = env.NODE_ENV === "production";

  if (provider === "console") {
    if (isProd) {
      console.error(
        "[SMS] PRODUCTION SMS_PROVIDER=console — OTPs will not reach parents. Set SMS_PROVIDER=msg91|http with credentials."
      );
    }
    logDevOtp(input.mobileE164, input.otp, "console provider");
    return { provider: "console", ok: true };
  }

  if (provider === "msg91") {
    if (!env.SMS_API_KEY || !env.SMS_TEMPLATE_ID || !env.SMS_SENDER_ID) {
      if (!isProd) {
        console.warn(
          "[SMS] MSG91 credentials missing — non-prod console fallback (OTP still required)"
        );
        logDevOtp(input.mobileE164, input.otp, "msg91 fallback");
        return { provider: "console-fallback", ok: true };
      }
      throw new Error(
        "SMS_API_KEY, SMS_TEMPLATE_ID and SMS_SENDER_ID are required for MSG91"
      );
    }
    const url = env.SMS_HTTP_URL || "https://control.msg91.com/api/v5/flow/";
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        authkey: env.SMS_API_KEY,
      },
      body: JSON.stringify({
        template_id: env.SMS_TEMPLATE_ID,
        sender: env.SMS_SENDER_ID,
        short_url: "0",
        recipients: [
          {
            mobiles: input.mobileE164.replace("+", ""),
            otp: input.otp,
          },
        ],
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.error("[SMS] MSG91 failed", res.status, body.slice(0, 200));
      throw new Error("Failed to send OTP SMS");
    }
    return { provider: "msg91", ok: true };
  }

  if (provider === "http") {
    if (!env.SMS_HTTP_URL || !env.SMS_API_KEY) {
      if (!isProd) {
        console.warn(
          "[SMS] HTTP credentials missing — non-prod console fallback (OTP still required)"
        );
        logDevOtp(input.mobileE164, input.otp, "http fallback");
        return { provider: "console-fallback", ok: true };
      }
      throw new Error("SMS_HTTP_URL and SMS_API_KEY required for http provider");
    }
    const res = await fetch(env.SMS_HTTP_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${env.SMS_API_KEY}`,
      },
      body: JSON.stringify({
        to: input.mobileE164,
        sender: env.SMS_SENDER_ID,
        message: `Your LEARN WISE login code is ${input.otp}. Valid for ${Math.floor(env.OTP_EXPIRY_SECONDS / 60)} minutes.`,
      }),
    });
    if (!res.ok) {
      console.error("[SMS] HTTP provider failed", res.status);
      throw new Error("Failed to send OTP SMS");
    }
    return { provider: "http", ok: true };
  }

  throw new Error(`Unknown SMS_PROVIDER: ${provider}`);
}
