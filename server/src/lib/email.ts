import nodemailer, { type Transporter } from "nodemailer";
import { env } from "../config/env.js";
import { AppError } from "./errors.js";

export type EmailDelivery = {
  delivered: true;
  channel: "resend" | "log" | "test" | "smtp";
};

export type OtpEmailPurpose = "REGISTER" | "RESET_PASSWORD" | "RESET_PIN";

/** Vitest-only outbox so tests can read codes without exposing them in API responses. */
const testOutbox: Array<{ to: string; purpose: OtpEmailPurpose; otp: string }> = [];

export function takeTestOtpEmail(to: string, purpose: OtpEmailPurpose) {
  for (let i = testOutbox.length - 1; i >= 0; i--) {
    const m = testOutbox[i]!;
    if (m.to === to && m.purpose === purpose) {
      testOutbox.splice(i, 1);
      return m.otp;
    }
  }
  return null;
}

let transporter: Transporter | null = null;

function smtpTransport() {
  if (!env.SMTP_HOST || !env.SMTP_USER || !env.SMTP_PASSWORD || !env.SMTP_FROM_EMAIL) {
    throw new AppError(
      "Email delivery is not configured. Verification codes cannot be sent.",
      503,
      { code: "EMAIL_NOT_CONFIGURED" }
    );
  }
  transporter ??= nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_SECURE ?? env.SMTP_PORT === 465,
    auth: { user: env.SMTP_USER, pass: env.SMTP_PASSWORD },
  });
  return transporter;
}

const OTP_TEMPLATES: Record<OtpEmailPurpose, { subject: string; intro: string }> = {
  REGISTER: {
    subject: "LEARN WISE - Email Verification Code",
    intro: "Use this code to verify your email address and create your LEARN WISE account.",
  },
  RESET_PASSWORD: {
    subject: "LEARN WISE - Password Reset Verification Code",
    intro: "Use this code to reset your LEARN WISE password.",
  },
  RESET_PIN: {
    subject: "LEARN WISE - Parent PIN Reset Code",
    intro: "Use this code to set a new Parent PIN in the LEARN WISE app.",
  },
};

export async function sendOtpEmail(
  to: string,
  otp: string,
  purpose: OtpEmailPurpose,
  expiresInMinutes: number
): Promise<EmailDelivery> {
  if (env.NODE_ENV === "test" || process.env.VITEST) {
    testOutbox.push({ to, purpose, otp });
    return { delivered: true, channel: "test" };
  }

  const { subject, intro } = OTP_TEMPLATES[purpose];
  const notice =
    "Never share this code with anyone. LEARN WISE staff will never ask for it. If you did not request this code, you can safely ignore this email.";
  const text = [
    "Hello,",
    "",
    intro,
    "",
    `Your verification code: ${otp}`,
    "",
    `This code expires in ${expiresInMinutes} minutes and can be used only once.`,
    "",
    notice,
    "",
    "— LEARN WISE",
  ].join("\n");
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;max-width:480px;margin:0 auto;color:#2d2a4a">
  <h2 style="color:#3D2E8A;margin:0 0 12px">LEARN WISE</h2>
  <p>Hello,</p>
  <p>${intro}</p>
  <p style="font-size:30px;font-weight:bold;letter-spacing:8px;background:#F3E8FF;border-radius:10px;padding:14px;text-align:center;color:#3D2E8A">${otp}</p>
  <p>This code expires in <strong>${expiresInMinutes} minutes</strong> and can be used only once.</p>
  <p style="font-size:13px;color:#6b6790">${notice}</p>
  <p style="font-size:13px;color:#6b6790">— LEARN WISE</p>
</div>`;

  try {
    await smtpTransport().sendMail({
      from: { name: env.SMTP_FROM_NAME, address: env.SMTP_FROM_EMAIL! },
      to,
      subject,
      text,
      html,
    });
  } catch (err) {
    if (err instanceof AppError) throw err;
    const e = err as { code?: string; responseCode?: number };
    console.error("[email-otp] SMTP send failed", e.code ?? "", e.responseCode ?? "");
    throw new AppError("We could not send the verification email. Please try again later.", 502, {
      code: "EMAIL_SEND_FAILED",
    });
  }
  return { delivered: true, channel: "smtp" };
}

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

  const from = env.RESEND_FROM_EMAIL ?? "LEARN WISE <noreply@littlereaders.app>";
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [to],
      subject: "Reset your LEARN WISE password",
      text: [
        "We received a request to reset your LEARN WISE password.",
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
