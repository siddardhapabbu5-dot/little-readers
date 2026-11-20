import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import { env } from "../config/env.js";
import { AppError } from "../lib/errors.js";
import { sendOtpEmail } from "../lib/email.js";
import { prisma } from "../lib/prisma.js";
import { createChild } from "../children/children.service.js";
import { issueStudentCredential } from "./student-auth.service.js";
import { ensureAdminDirectSponsorParent } from "./admin-direct-sponsor.js";

const PURPOSE = "ADMIN_SHARED_STUDENT_CREATE" as const;
/** Spec: OTP expires in 5 minutes for this workflow. */
const OTP_TTL_SEC = 300;
const VERIFICATION_TOKEN_TTL_MS = 15 * 60 * 1000;

function sharedMailbox() {
  return env.ADMIN_SHARED_STUDENT_OTP_EMAIL.trim().toLowerCase();
}

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

/**
 * Send OTP to the dedicated shared Admin mailbox.
 * Bound to the authenticated Admin via EmailOtp.userId.
 * Never uses the shared mailbox as a Student/Parent login email.
 */
export async function sendAdminSharedStudentCreateOtp(adminUserId: string) {
  const email = sharedMailbox();
  const where = { email, purpose: PURPOSE, userId: adminUserId };

  const hourAgo = new Date(Date.now() - 60 * 60 * 1000);
  const sendsLastHour = await prisma.emailOtp.count({
    where: { ...where, createdAt: { gte: hourAgo } },
  });
  if (sendsLastHour >= env.OTP_MAX_SENDS_PER_HOUR) {
    throw new AppError("Too many code requests. Please try again later.", 429, {
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
      where: {
        email,
        purpose: PURPOSE,
        userId: adminUserId,
        consumedAt: null,
        invalidatedAt: null,
      },
      data: { invalidatedAt: new Date() },
    });
    return tx.emailOtp.create({
      data: {
        email,
        purpose: PURPOSE,
        userId: adminUserId,
        otpHash: `${salt}$${hashOtp(otp, salt)}`,
        expiresAt: new Date(Date.now() + OTP_TTL_SEC * 1000),
      },
    });
  });

  try {
    await sendOtpEmail(email, otp, PURPOSE, Math.round(OTP_TTL_SEC / 60));
  } catch (err) {
    await prisma.emailOtp.delete({ where: { id: created.id } }).catch(() => undefined);
    throw err;
  }

  return {
    message: "Verification code sent to the Learn Wise Admin verification mailbox.",
    /** Masked destination for Admin UI confirmation — never returns the OTP. */
    destinationHint: maskEmail(email),
    expiresInSec: OTP_TTL_SEC,
    resendInSec: env.OTP_RESEND_SECONDS,
  };
}

function maskEmail(email: string) {
  const [local, domain] = email.split("@");
  if (!local || !domain) return "***";
  const keep = local.slice(0, Math.min(3, local.length));
  return `${keep}***@${domain}`;
}

/** Verify OTP for this Admin only; returns a single-use creation token. */
export async function verifyAdminSharedStudentCreateOtp(input: {
  adminUserId: string;
  otp: string;
}) {
  const email = sharedMailbox();
  const otp = String(input.otp ?? "").replace(/\D/g, "");
  if (otp.length !== 6) {
    throw new AppError("Enter the 6-digit code", 400, { code: "INVALID_OTP" });
  }

  const record = await prisma.emailOtp.findFirst({
    where: {
      email,
      purpose: PURPOSE,
      userId: input.adminUserId,
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
    where: {
      id: record.id,
      userId: input.adminUserId,
      verifiedAt: null,
      invalidatedAt: null,
      consumedAt: null,
    },
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

async function findValidAdminSharedVerification(input: {
  adminUserId: string;
  verificationToken: string;
}) {
  const email = sharedMailbox();
  const row = await prisma.emailOtp.findFirst({
    where: {
      email,
      purpose: PURPOSE,
      userId: input.adminUserId,
      verificationTokenHash: hashToken(input.verificationToken.trim()),
      verifiedAt: { not: null },
      consumedAt: null,
      invalidatedAt: null,
      tokenExpiresAt: { gt: new Date() },
    },
  });
  if (!row) {
    throw new AppError(
      "Verification expired or invalid. Request and verify a new code.",
      400,
      { code: "EMAIL_NOT_VERIFIED" }
    );
  }
  return row;
}

async function consumeAdminSharedVerification(otpId: string) {
  const consumed = await prisma.emailOtp.updateMany({
    where: { id: otpId, consumedAt: null, invalidatedAt: null },
    data: { consumedAt: new Date() },
  });
  if (consumed.count !== 1) {
    throw new AppError(
      "Verification already used. Request and verify a new code for the next student.",
      400,
      { code: "OTP_REUSED" }
    );
  }
}

/**
 * One verified OTP → exactly one Student create under the system Sponsor Parent.
 * No Parent picker; no learning seat / subscription grant.
 * Shared mailbox is never stored as student email. Not Admin Direct UI.
 */
export async function adminCreateChildWithSharedEmailOtp(input: {
  adminUserId: string;
  verificationToken: string;
  displayName: string;
  birthYear?: number;
  levelId?: string;
  level?: string;
  gradeId?: string;
  birthDate?: string;
  preferredStudentLoginId?: string | null;
}) {
  const gate = await findValidAdminSharedVerification({
    adminUserId: input.adminUserId,
    verificationToken: input.verificationToken,
  });

  // Grade 1 / LEVEL_1 only for this provisioning workflow.
  const levelCode = (input.level ?? "").toUpperCase();
  if (levelCode && levelCode !== "LEVEL_1") {
    throw new AppError("Only Grade 1 (LEVEL_1) can be provisioned with this flow.", 400, {
      code: "GRADE_LOCKED",
    });
  }
  if (input.levelId) {
    const level = await prisma.learningLevel.findFirst({
      where: { id: input.levelId },
      select: { code: true },
    });
    if (level && level.code !== "LEVEL_1") {
      throw new AppError("Only Grade 1 (LEVEL_1) can be provisioned with this flow.", 400, {
        code: "GRADE_LOCKED",
      });
    }
  }

  // Consume before create so a parallel request cannot reuse the same token.
  await consumeAdminSharedVerification(gate.id);

  try {
    const sponsor = await ensureAdminDirectSponsorParent();

    const child = await createChild(
      sponsor.id,
      {
        displayName: input.displayName,
        birthYear: input.birthYear,
        levelId: input.levelId,
        level: "LEVEL_1",
        gradeId: input.gradeId,
        birthDate: input.birthDate,
      },
      { skipSeatAssignment: true }
    );

    const credentials = await issueStudentCredential({
      childId: child.id,
      createdByUserId: input.adminUserId,
      mustChangePassword: true,
      preferredStudentLoginId: input.preferredStudentLoginId,
      accountCreationMethod: "ADMIN_SHARED_EMAIL_OTP",
      verificationReference: gate.id,
      registrationEmail: null,
      emailVerifiedAt: null,
    });

    return {
      child: {
        ...child,
        parentId: sponsor.id,
        hasLearningSeat: false,
        subscriptionStatus: "UNPAID" as const,
      },
      credentials,
      studentEmail: null as null,
      accountCreationMethod: "ADMIN_SHARED_EMAIL_OTP" as const,
      sponsorParent: {
        id: sponsor.id,
        kind: "SYSTEM_SPONSOR" as const,
      },
    };
  } catch (err) {
    // Creation failed after consume — do not resurrect the token (prevents unlimited reuse).
    throw err;
  }
}

export function getAdminSharedStudentOtpMailboxForTests() {
  return sharedMailbox();
}
