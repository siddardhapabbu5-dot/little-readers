import { createHash, randomBytes } from "node:crypto";
import type {
  AdminForgotPasswordInput,
  AdminResetPasswordInput,
} from "@little-readers/validation";
import { env } from "../config/env.js";
import { AppError } from "../lib/errors.js";
import { sendPasswordResetEmail } from "../lib/email.js";
import { hashPassword } from "../lib/password.js";
import { prisma } from "../lib/prisma.js";

const GENERIC_FORGOT_MESSAGE =
  "If an admin account exists for this email, a reset link has been sent.";

function hashResetToken(rawToken: string) {
  return createHash("sha256").update(rawToken).digest("hex");
}

/**
 * Admin forgot-password. Always returns the same public message (no enumeration).
 * Only ADMIN / SUPER_ADMIN accounts receive tokens.
 */
export async function requestAdminPasswordReset(
  input: AdminForgotPasswordInput
) {
  const email = input.email.toLowerCase().trim();
  const generic = {
    message: GENERIC_FORGOT_MESSAGE,
  };

  const admin = await prisma.user.findFirst({
    where: {
      email,
      isActive: true,
      role: { in: ["ADMIN", "SUPER_ADMIN"] },
    },
  });

  if (!admin) {
    // Same shape as success — never reveal whether the email exists.
    return generic;
  }

  const rawToken = randomBytes(32).toString("hex");
  const tokenHash = hashResetToken(rawToken);
  const expiresAt = new Date(
    Date.now() + env.ADMIN_PASSWORD_RESET_TOKEN_TTL_MINUTES * 60 * 1000
  );

  // Invalidate outstanding unused admin reset tokens for this account.
  await prisma.adminPasswordResetToken.updateMany({
    where: { adminId: admin.id, usedAt: null },
    data: { usedAt: new Date() },
  });

  await prisma.adminPasswordResetToken.create({
    data: {
      adminId: admin.id,
      tokenHash,
      expiresAt,
    },
  });

  const base =
    input.client === "mobile" ? env.MOBILE_PUBLIC_URL : env.APP_PUBLIC_URL;
  const path =
    input.client === "mobile"
      ? "/admin-reset-password"
      : "/admin/reset-password";
  const resetUrl = `${base.replace(/\/$/, "")}${path}?token=${rawToken}`;

  try {
    await sendPasswordResetEmail(admin.email, resetUrl);
  } catch (err) {
    await prisma.adminPasswordResetToken.deleteMany({ where: { tokenHash } });
    throw err;
  }

  // Never log rawToken. Expose only in Vitest for automated tests.
  return {
    message: GENERIC_FORGOT_MESSAGE,
    ...(env.NODE_ENV === "test" || process.env.VITEST
      ? { devResetToken: rawToken }
      : {}),
  };
}

export async function resetAdminPasswordWithToken(
  input: AdminResetPasswordInput
) {
  const tokenHash = hashResetToken(input.token.trim());
  const record = await prisma.adminPasswordResetToken.findUnique({
    where: { tokenHash },
    include: { admin: true },
  });

  if (!record || record.usedAt || record.expiresAt.getTime() < Date.now()) {
    throw new AppError("This reset link is invalid or has expired.", 400, {
      code: "ADMIN_RESET_INVALID",
    });
  }

  const admin = record.admin;
  if (
    !admin.isActive ||
    (admin.role !== "ADMIN" && admin.role !== "SUPER_ADMIN")
  ) {
    throw new AppError("This account cannot reset its password.", 403, {
      code: "ADMIN_RESET_FORBIDDEN",
    });
  }

  const passwordHash = await hashPassword(input.password);
  const passwordChangedAt = new Date();

  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: admin.id },
      data: { passwordHash, passwordChangedAt },
    });
    await tx.adminPasswordResetToken.update({
      where: { id: record.id },
      data: { usedAt: new Date() },
    });
    await tx.adminPasswordResetToken.updateMany({
      where: { adminId: admin.id, usedAt: null, id: { not: record.id } },
      data: { usedAt: new Date() },
    });
  });

  return {
    message:
      "Password updated. Sign in with your new password. Previous admin sessions have been signed out.",
  };
}
