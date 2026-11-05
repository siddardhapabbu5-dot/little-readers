import { createHash, randomBytes } from "node:crypto";
import { ConsentType, UserRole } from "@prisma/client";
import type {
  ForgotPasswordInput,
  LoginInput,
  RegisterInput,
  ResetPasswordInput,
} from "@little-readers/validation";
import { AppError } from "../lib/errors.js";
import { sendPasswordResetEmail } from "../lib/email.js";
import { signAccessToken } from "../lib/jwt.js";
import { hashPassword, verifyPassword } from "../lib/password.js";
import { prisma } from "../lib/prisma.js";
import { env } from "../config/env.js";

function hashResetToken(rawToken: string) {
  return createHash("sha256").update(rawToken).digest("hex");
}

function toAuthUser(user: {
  id: string;
  name: string;
  email: string;
  role: UserRole;
}) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
  };
}

export async function registerParent(
  input: RegisterInput,
  meta?: { ipAddress?: string; userAgent?: string }
) {
  const email = input.email.toLowerCase();
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    throw new AppError("An account with this email already exists", 409);
  }

  const passwordHash = await hashPassword(input.password);

  const user = await prisma.$transaction(async (tx) => {
    const created = await tx.user.create({
      data: {
        name: input.name,
        email,
        passwordHash,
        role: UserRole.PARENT,
      },
    });

    const consents: Array<{
      userId: string;
      consentType: ConsentType;
      version: string;
      ipAddress?: string;
      userAgent?: string;
    }> = [
      {
        userId: created.id,
        consentType: ConsentType.TERMS,
        version: "1.0",
        ipAddress: meta?.ipAddress,
        userAgent: meta?.userAgent,
      },
      {
        userId: created.id,
        consentType: ConsentType.PRIVACY,
        version: "1.0",
        ipAddress: meta?.ipAddress,
        userAgent: meta?.userAgent,
      },
      {
        userId: created.id,
        consentType: ConsentType.PARENTAL,
        version: "1.0",
        ipAddress: meta?.ipAddress,
        userAgent: meta?.userAgent,
      },
    ];

    await tx.parentalConsent.createMany({ data: consents });
    return created;
  });

  const accessToken = signAccessToken({
    sub: user.id,
    email: user.email,
    role: user.role,
  });

  return {
    user: toAuthUser(user),
    tokens: {
      accessToken,
      expiresIn: env.JWT_EXPIRES_IN,
    },
  };
}

export async function loginUser(input: LoginInput) {
  const email = input.email.trim().toLowerCase();
  const password = input.password.trim();
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !user.isActive) {
    throw new AppError("Invalid email or password", 401);
  }

  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) {
    throw new AppError("Invalid email or password", 401);
  }

  const accessToken = signAccessToken({
    sub: user.id,
    email: user.email,
    role: user.role,
  });

  return {
    user: toAuthUser(user),
    tokens: {
      accessToken,
      expiresIn: env.JWT_EXPIRES_IN,
    },
  };
}

export async function getCurrentUser(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      createdAt: true,
      children: {
        where: { isActive: true },
        select: {
          id: true,
          displayName: true,
          birthYear: true,
          level: { select: { code: true } },
        },
        orderBy: { createdAt: "asc" },
      },
    },
  });

  if (!user) {
    throw new AppError("User not found", 404);
  }

  return {
    ...user,
    children: user.children.map((child) => ({
      id: child.id,
      displayName: child.displayName,
      birthYear: child.birthYear,
      level: child.level?.code ?? "FOUNDATION",
    })),
  };
}

/**
 * Creates a reset token and delivers email. Fails if delivery cannot be confirmed.
 * Unknown emails: no token created; returns a neutral message without claiming delivery.
 */
export async function requestPasswordReset(input: ForgotPasswordInput) {
  const email = input.email.toLowerCase();
  const user = await prisma.user.findUnique({ where: { email } });

  if (!user || !user.isActive) {
    return {
      accepted: false as const,
      message:
        "If that email is registered, you would receive a reset link. No account matched this address.",
    };
  }

  const rawToken = randomBytes(32).toString("hex");
  const tokenHash = hashResetToken(rawToken);
  const expiresAt = new Date(
    Date.now() + env.PASSWORD_RESET_TOKEN_TTL_MINUTES * 60 * 1000
  );

  await prisma.passwordResetToken.create({
    data: { userId: user.id, tokenHash, expiresAt },
  });

  const base =
    input.client === "mobile" ? env.MOBILE_PUBLIC_URL : env.APP_PUBLIC_URL;
  const resetUrl = `${base.replace(/\/$/, "")}/reset-password?token=${rawToken}`;

  // Delivery must succeed — otherwise roll back token so we never claim success.
  try {
    const delivery = await sendPasswordResetEmail(user.email, resetUrl);
    return {
      accepted: true as const,
      message: "Password reset email sent. Check your inbox for the link.",
      deliveryChannel: delivery.channel,
      ...(env.NODE_ENV === "test" || process.env.VITEST
        ? { devResetToken: rawToken }
        : {}),
    };
  } catch (err) {
    await prisma.passwordResetToken.deleteMany({ where: { tokenHash } });
    throw err;
  }
}

export async function resetPasswordWithToken(input: ResetPasswordInput) {
  const tokenHash = hashResetToken(input.token.trim());
  const record = await prisma.passwordResetToken.findUnique({
    where: { tokenHash },
    include: { user: true },
  });

  if (!record || record.usedAt || record.expiresAt.getTime() < Date.now()) {
    throw new AppError("This reset link is invalid or has expired.", 400);
  }
  if (!record.user.isActive) {
    throw new AppError("This account cannot reset its password.", 403);
  }

  const passwordHash = await hashPassword(input.password);

  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: record.userId },
      data: { passwordHash },
    });
    await tx.passwordResetToken.update({
      where: { id: record.id },
      data: { usedAt: new Date() },
    });
    // Invalidate any other outstanding tokens for this user.
    await tx.passwordResetToken.updateMany({
      where: { userId: record.userId, usedAt: null, id: { not: record.id } },
      data: { usedAt: new Date() },
    });
  });

  return {
    message: "Password updated. You can log in with your new password.",
  };
}
