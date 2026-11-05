import { env } from "../config/env.js";

export async function sendOtpSms(input: {
  mobileE164: string;
  otp: string;
}): Promise<{ provider: string; ok: boolean }> {
  const provider = env.SMS_PROVIDER;

  if (provider === "console" || env.OTP_DEV_MODE || env.NODE_ENV !== "production") {
    // Dev only — never log OTP in production without OTP_DEV_MODE.
    if (env.NODE_ENV !== "production" || env.OTP_DEV_MODE) {
      console.info(
        `[OTP_DEV] SMS to ${input.mobileE164}: code generated (check secure channel / console provider)`
      );
      if (env.OTP_DEV_MODE && env.NODE_ENV !== "production") {
        console.info(`[OTP_DEV] OTP for ${input.mobileE164}: ${input.otp}`);
      }
    }
    return { provider: "console", ok: true };
  }

  if (provider === "msg91") {
    if (!env.SMS_API_KEY) {
      throw new Error("SMS_API_KEY required for MSG91");
    }
    const url =
      env.SMS_HTTP_URL ||
      "https://control.msg91.com/api/v5/flow/";
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
        message: `Your Little Readers login code is ${input.otp}. Valid for ${Math.floor(env.OTP_EXPIRY_SECONDS / 60)} minutes.`,
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
