import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import type { EmailOtpPurpose, Prisma } from "@prisma/client";
import { env } from "../config/env.js";
import { AppError } from "../lib/errors.js";
import { sendOtpEmail } from "../lib/email.js";
import { prisma } from "../lib/prisma.js";

const VERIFICATION_TOKEN_TTL_MS = 15 * 60 * 1000;

const GENERIC_RESET_MESSAGE =
  "If an account exists for this email, a verification code has been sent.";

function hashOtp(otp: string, salt: string) {
  return createHmac("sha256", env.JWT_SECRET).update(`${salt}:${otp}`).digest("hex");
}

function hashToken(raw: string) {
  return createHash("sha256").update(raw).digest("hex");
}

function sameHex(a: string, b: string) {
  const x = Buffer.from(a, "hex");
  const y = Buffer.from(b, "hex");
  return x.length === y.length && timingSafeEqual(x, y);
}

export function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export async function sendEmailOtp(input: { email: string; purpose: EmailOtpPurpose }) {
  const email = normalizeEmail(input.email);
  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, isActive: true },
  });

  if (input.purpose === "REGISTER" && user) {
    throw new AppError("An account with this email already exists", 409, {
      code: "EMAIL_IN_USE",
    });
  }

  const response = {
    message:
      input.purpose === "REGISTER"
        ? "Verification code sent. Check your email."
        : GENERIC_RESET_MESSAGE,
    expiresInSec: env.OTP_EXPIRY_SECONDS,
    resendInSec: env.OTP_RESEND_SECONDS,
  };

  // Unknown or inactive account on reset: same response, nothing sent.
  if (input.purpose !== "REGISTER" && (!user || !user.isActive)) {
    return response;
  }

  const where = { email, purpose: input.purpose };
  const hourAgo = new Date(Date.now() - 60 * 60 * 1000);
  const sendsLastHour = await prisma.emailOtp.count({
    where: { ...where, createdAt: { gte: hourAgo } },
  });
  if (sendsLastHour >= env.OTP_MAX_SENDS_PER_HOUR) {
    throw new AppError("Too many code requests for this email. Please try again later.", 429, {
      code: "OTP_HOURLY_LIMIT",
      retryAfterSec: 3600,
    });
  }

  const latest = await prisma.emailOtp.findFirst({
    where,
    orderBy: { createdAt: "desc" },
  });
  if (latest) {
    const elapsed = (Date.now() - latest.createdAt.getTime()) / 1000;
    if (elapsed < env.OTP_RESEND_SECONDS) {
      const wait = Math.ceil(env.OTP_RESEND_SECONDS - elapsed);
      throw new AppError(`Please wait ${wait}s before requesting another code.`, 429, {
        code: "OTP_RESEND_COOLDOWN",
        retryAfterSec: wait,
      });
    }
  }

  const otp = String(randomInt(0, 1_000_000)).padStart(6, "0");
  const salt = randomBytes(16).toString("hex");

  const created = await prisma.$transaction(async (tx) => {
    await tx.emailOtp.updateMany({
      where: { ...where, consumedAt: null, invalidatedAt: null },
      data: { invalidatedAt: new Date() },
    });
    return tx.emailOtp.create({
      data: {
        email,
        purpose: input.purpose,
        userId: user?.id ?? null,
        otpHash: `${salt}$${hashOtp(otp, salt)}`,
        expiresAt: new Date(Date.now() + env.OTP_EXPIRY_SECONDS * 1000),
      },
    });
  });

  try {
    await sendOtpEmail(email, otp, input.purpose, Math.round(env.OTP_EXPIRY_SECONDS / 60));
  } catch (err) {
    // Undelivered codes must not count toward cooldown or stay valid.
    await prisma.emailOtp.delete({ where: { id: created.id } }).catch(() => undefined);
    throw err;
  }

  return response;
}

/** Checks the code and returns a single-use verification token (valid 15 minutes). */
export async function verifyEmailOtp(input: {
  email: string;
  purpose: EmailOtpPurpose;
  otp: string;
}) {
  const email = normalizeEmail(input.email);
  const otp = String(input.otp ?? "").replace(/\D/g, "");
  if (otp.length !== 6) {
    throw new AppError("Enter the 6-digit code", 400, { code: "INVALID_OTP" });
  }

  const record = await prisma.emailOtp.findFirst({
    where: {
      email,
      purpose: input.purpose,
      verifiedAt: null,
      consumedAt: null,
      invalidatedAt: null,
    },
    orderBy: { createdAt: "desc" },
  });
  if (!record) {
    throw new AppError("Code expired or not found. Request a new code.", 400, {
      code: "OTP_NOT_FOUND",
    });
  }
  if (record.expiresAt.getTime() < Date.now()) {
    await prisma.emailOtp.update({
      where: { id: record.id },
      data: { invalidatedAt: new Date() },
    });
    throw new AppError("Code expired. Request a new code.", 400, { code: "OTP_EXPIRED" });
  }
  if (record.attempts >= env.OTP_MAX_ATTEMPTS) {
    await prisma.emailOtp.update({
      where: { id: record.id },
      data: { invalidatedAt: new Date() },
    });
    throw new AppError("Too many incorrect attempts. Request a new code.", 400, {
      code: "OTP_MAX_ATTEMPTS",
    });
  }

  const [salt, hash] = record.otpHash.split("$");
  if (!salt || !hash || !sameHex(hashOtp(otp, salt), hash)) {
    const updated = await prisma.emailOtp.update({
      where: { id: record.id },
      data: { attempts: { increment: 1 } },
    });
    if (updated.attempts >= env.OTP_MAX_ATTEMPTS) {
      await prisma.emailOtp.update({
        where: { id: record.id },
        data: { invalidatedAt: new Date() },
      });
      throw new AppError("Too many incorrect attempts. Request a new code.", 400, {
        code: "OTP_MAX_ATTEMPTS",
      });
    }
    throw new AppError("Incorrect code. Please try again.", 401, { code: "OTP_INVALID" });
  }

  const verificationToken = randomBytes(32).toString("hex");
  const marked = await prisma.emailOtp.updateMany({
    where: { id: record.id, verifiedAt: null, invalidatedAt: null, consumedAt: null },
    data: {
      verifiedAt: new Date(),
      verificationTokenHash: hashToken(verificationToken),
      tokenExpiresAt: new Date(Date.now() + VERIFICATION_TOKEN_TTL_MS),
    },
  });
  if (marked.count !== 1) {
    throw new AppError("Code already used. Request a new code.", 400, { code: "OTP_REUSED" });
  }

  return {
    verified: true,
    verificationToken,
    expiresInSec: VERIFICATION_TOKEN_TTL_MS / 1000,
  };
}

/** Consumes a verification token inside the caller's transaction. Throws if invalid. */
export async function consumeEmailVerification(
  tx: Prisma.TransactionClient,
  input: { email: string; purpose: EmailOtpPurpose; verificationToken: string }
) {
  const email = normalizeEmail(input.email);
  const consumed = await tx.emailOtp.updateMany({
    where: {
      email,
      purpose: input.purpose,
      verificationTokenHash: hashToken(input.verificationToken.trim()),
      verifiedAt: { not: null },
      consumedAt: null,
      invalidatedAt: null,
      tokenExpiresAt: { gt: new Date() },
    },
    data: { consumedAt: new Date() },
  });
  if (consumed.count !== 1) {
    throw new AppError(
      "Email verification expired or invalid. Please verify your email again.",
      400,
      { code: "EMAIL_NOT_VERIFIED" }
    );
  }
}
