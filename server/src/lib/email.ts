import { env } from "../config/env.js";
import { AppError } from "./errors.js";

export type EmailDelivery = {
  delivered: true;
  channel: "resend" | "log" | "test";
};

/**
 * Deliver a password-reset email. Throws if delivery cannot be confirmed.
 * Never silently "succeeds" when nothing was sent.
 */
export async function sendPasswordResetEmail(
  to: string,
  resetUrl: string
): Promise<EmailDelivery> {
  // Vitest may leave NODE_ENV as development; VITEST is always set by the runner.
  if (env.NODE_ENV === "test" || process.env.VITEST) {
    return { delivered: true, channel: "test" };
  }

  if (env.PASSWORD_RESET_LOG_ONLY && env.NODE_ENV !== "production") {
    // Never log the raw reset token — redact query string.
    const safeUrl = resetUrl.replace(/([?&]token=)[^&]+/i, "$1[REDACTED]");
    console.info(`[password-reset] to=${to} url=${safeUrl}`);
    return { delivered: true, channel: "log" };
  }

  if (!env.RESEND_API_KEY) {
    throw new AppError(
      "Email delivery is not configured. Password reset emails cannot be sent.",
      503
    );
  }

  const from = env.RESEND_FROM_EMAIL ?? "Little Readers <noreply@littlereaders.app>";
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [to],
      subject: "Reset your Little Readers password",
      text: [
        "We received a request to reset your Little Readers password.",
        "",
        `Open this link to choose a new password (expires soon):`,
        resetUrl,
        "",
        "If you did not request this, you can ignore this email.",
      ].join("\n"),
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    console.error("[password-reset] Resend failed", response.status, body);
    throw new AppError("We could not send the reset email. Please try again later.", 502);
  }

  return { delivered: true, channel: "resend" };
}
