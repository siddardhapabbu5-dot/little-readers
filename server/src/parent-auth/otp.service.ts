import { createHash, randomInt, randomBytes } from "node:crypto";
import { env } from "../config/env.js";
import { AppError } from "../lib/errors.js";
import { prisma } from "../lib/prisma.js";
import { normalizeMobileE164 } from "./mobile.js";
import { sendOtpSms } from "./sms.provider.js";

function hashOtp(otp: string, salt: string) {
  return createHash("sha256").update(`${salt}:${otp}`).digest("hex");
}

function generateOtp(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

export async function sendParentOtp(input: {
  mobile: string;
  countryCode?: string;
}) {
  const mobileE164 = normalizeMobileE164(
    input.mobile,
    input.countryCode ?? env.DEFAULT_COUNTRY_CODE
  );

  const parent = await prisma.user.findFirst({
    where: {
      mobileE164,
      role: "PARENT",
      isActive: true,
    },
    select: { id: true, name: true, email: true, mobileE164: true },
  });

  if (!parent) {
    // Do not reveal whether the number exists.
    throw new AppError(
      "If this number is registered, an OTP will be sent shortly.",
      404,
      { code: "MOBILE_NOT_REGISTERED" }
    );
  }

  const hourAgo = new Date(Date.now() - 60 * 60 * 1000);
  const sendsLastHour = await prisma.parentOtpVerification.count({
    where: { mobileE164, createdAt: { gte: hourAgo } },
  });
  if (sendsLastHour >= env.OTP_MAX_SENDS_PER_HOUR) {
    throw new AppError(
      "Too many OTP requests for this number. Please try again later.",
      429,
      {
        code: "OTP_HOURLY_LIMIT",
        retryAfterSec: 3600,
      }
    );
  }

  const latest = await prisma.parentOtpVerification.findFirst({
    where: { mobileE164, invalidatedAt: null, consumedAt: null },
    orderBy: { createdAt: "desc" },
  });
  if (latest) {
    const elapsed = (Date.now() - latest.createdAt.getTime()) / 1000;
    if (elapsed < env.OTP_RESEND_SECONDS) {
      throw new AppError(
        `Please wait ${Math.ceil(env.OTP_RESEND_SECONDS - elapsed)}s before requesting another OTP.`,
        429,
        {
          code: "OTP_RESEND_COOLDOWN",
          retryAfterSec: Math.ceil(env.OTP_RESEND_SECONDS - elapsed),
        }
      );
    }
  }

  await prisma.parentOtpVerification.updateMany({
    where: {
      mobileE164,
      consumedAt: null,
      invalidatedAt: null,
    },
    data: { invalidatedAt: new Date() },
  });

  const otp = generateOtp();
  const salt = randomBytes(16).toString("hex");
  const otpHash = `${salt}$${hashOtp(otp, salt)}`;
  const expiresAt = new Date(Date.now() + env.OTP_EXPIRY_SECONDS * 1000);

  await prisma.parentOtpVerification.create({
    data: {
      id: `otp_${randomBytes(12).toString("hex")}`,
      parentId: parent.id,
      mobileE164,
      otpHash,
      expiresAt,
    },
  });

  try {
    await sendOtpSms({ mobileE164, otp });
  } catch (err) {
    console.error("[OTP] SMS send failed", err);
    throw new AppError("Could not send OTP. Please try again.", 502, {
      code: "SMS_FAILED",
    });
  }

  const payload: Record<string, unknown> = {
    mobileE164,
    expiresInSec: env.OTP_EXPIRY_SECONDS,
    resendInSec: env.OTP_RESEND_SECONDS,
    message: "OTP sent if the number is registered.",
  };
  // Never expose OTP in production responses.
  if (env.OTP_DEV_MODE && env.NODE_ENV !== "production") {
    payload.devOtp = otp;
  }
  return payload;
}

export async function verifyParentOtpCode(input: {
  mobile: string;
  countryCode?: string;
  otp: string;
}) {
  const mobileE164 = normalizeMobileE164(
    input.mobile,
    input.countryCode ?? env.DEFAULT_COUNTRY_CODE
  );
  const otp = String(input.otp ?? "").replace(/\D/g, "");
  if (otp.length !== 6) {
    throw new AppError("Enter the 6-digit OTP", 400, { code: "INVALID_OTP" });
  }

  const record = await prisma.parentOtpVerification.findFirst({
    where: {
      mobileE164,
      consumedAt: null,
      invalidatedAt: null,
    },
    orderBy: { createdAt: "desc" },
  });

  if (!record) {
    throw new AppError("OTP expired or not found. Request a new code.", 400, {
      code: "OTP_NOT_FOUND",
    });
  }
  if (record.expiresAt.getTime() < Date.now()) {
    await prisma.parentOtpVerification.update({
      where: { id: record.id },
      data: { invalidatedAt: new Date() },
    });
    throw new AppError("OTP expired. Request a new code.", 400, {
      code: "OTP_EXPIRED",
    });
  }
  if (record.attempts >= env.OTP_MAX_ATTEMPTS) {
    await prisma.parentOtpVerification.update({
      where: { id: record.id },
      data: { invalidatedAt: new Date() },
    });
    throw new AppError("Too many incorrect attempts. Request a new OTP.", 400, {
      code: "OTP_MAX_ATTEMPTS",
    });
  }

  const [salt, hash] = record.otpHash.split("$");
  const ok = salt && hash && hashOtp(otp, salt) === hash;

  if (!ok) {
    await prisma.parentOtpVerification.update({
      where: { id: record.id },
      data: { attempts: { increment: 1 } },
    });
    throw new AppError("Incorrect OTP. Please try again.", 401, {
      code: "OTP_INVALID",
    });
  }

  const parent = await prisma.user.findFirst({
    where: {
      id: record.parentId ?? undefined,
      mobileE164,
      role: "PARENT",
      isActive: true,
    },
  });
  if (!parent) {
    throw new AppError("Parent account not found or inactive.", 403, {
      code: "PARENT_INACTIVE",
    });
  }

  const consumed = await prisma.parentOtpVerification.updateMany({
    where: {
      id: record.id,
      consumedAt: null,
      invalidatedAt: null,
    },
    data: {
      verifiedAt: new Date(),
      consumedAt: new Date(),
    },
  });
  if (consumed.count !== 1) {
    throw new AppError("OTP already used. Request a new code.", 400, {
      code: "OTP_REUSED",
    });
  }

  return { parent, otpId: record.id, mobileE164 };
}
