import { createHash, randomBytes } from "node:crypto";
import { ConsentType, UserRole } from "@prisma/client";
import type {
  ForgotPasswordInput,
  LoginInput,
  RegisterInput,
  ResetPasswordInput,
  ResetPasswordWithOtpInput,
} from "@little-readers/validation";
import { adminPasswordSchema, passwordSchema } from "@little-readers/validation";
import { AppError } from "../lib/errors.js";
import { sendPasswordResetEmail } from "../lib/email.js";
import { passwordVersion, signAccessToken } from "../lib/jwt.js";
import { hashPassword, verifyPassword } from "../lib/password.js";
import { assertNotLocked, clearFailedAttempts, recordFailedAttempt } from "../lib/lockout.js";
import { prisma } from "../lib/prisma.js";
import { env } from "../config/env.js";
import { activateParentDeviceSession } from "../parent-auth/session.service.js";
import { consumeEmailVerification } from "./email-otp.service.js";

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

  let mobileE164: string | undefined;
  if (input.mobile) {
    const { normalizeMobileE164 } = await import("../parent-auth/mobile.js");
    mobileE164 = normalizeMobileE164(input.mobile, input.countryCode);
    const mobileTaken = await prisma.user.findUnique({ where: { mobileE164 } });
    if (mobileTaken) {
      throw new AppError(
        "This mobile number is already linked to another account",
        409
      );
    }
  }

  if (!input.acceptTerms || !input.acceptPrivacy || !input.parentalConsent) {
    throw new AppError(
      "Terms, Privacy Policy, and parental consent must be explicitly accepted",
      400,
      { code: "CONSENT_REQUIRED" }
    );
  }

  const { getPublishedPrivacyPolicy } = await import(
    "../privacy/privacy.service.js"
  );
  const publishedPolicy = await getPublishedPrivacyPolicy();
  const isVitest = process.env.VITEST === "true";
  if (!publishedPolicy) {
    // Production/staging must publish a real policy. Vitest may register without one.
    if (!isVitest) {
      throw new AppError(
        "Registration is unavailable until an administrator publishes the Privacy Policy.",
        503,
        { code: "PRIVACY_POLICY_UNPUBLISHED" }
      );
    }
  } else if (
    input.privacyPolicyVersion &&
    input.privacyPolicyVersion !== publishedPolicy.version
  ) {
    throw new AppError(
      "Please review the latest published Privacy Policy and try again.",
      409,
      { code: "PRIVACY_POLICY_VERSION_MISMATCH" }
    );
  }

  // Vitest suites register freely unless they pass a token or disable the bypass.
  const requireEmailVerification = !isVitest || Boolean(input.emailVerificationToken);
  if (requireEmailVerification && !input.emailVerificationToken) {
    throw new AppError("Verify your email address before creating the account.", 400, {
      code: "EMAIL_NOT_VERIFIED",
    });
  }

  const consentVersion = publishedPolicy?.version ?? "vitest";
  const passwordHash = await hashPassword(input.password);

  const user = await prisma.$transaction(async (tx) => {
    if (requireEmailVerification) {
      await consumeEmailVerification(tx, {
        email,
        purpose: "REGISTER",
        verificationToken: input.emailVerificationToken!,
      });
    }
    const created = await tx.user.create({
      data: {
        name: input.name,
        email,
        passwordHash,
        role: UserRole.PARENT,
        ...(mobileE164 ? { mobileE164 } : {}),
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
        version: consentVersion,
        ipAddress: meta?.ipAddress,
        userAgent: meta?.userAgent,
      },
      {
        userId: created.id,
        consentType: ConsentType.PRIVACY,
        version: consentVersion,
        ipAddress: meta?.ipAddress,
        userAgent: meta?.userAgent,
      },
      {
        userId: created.id,
        consentType: ConsentType.PARENTAL,
        version: consentVersion,
        ipAddress: meta?.ipAddress,
        userAgent: meta?.userAgent,
      },
    ];

    await tx.parentalConsent.createMany({ data: consents });
    return created;
  });

  if (input.deviceId) {
    return activateParentDeviceSession({
      parent: user,
      deviceId: input.deviceId,
      deviceName: input.deviceName,
      platform: input.platform ?? "unknown",
    });
  }

  const accessToken = signAccessToken({
    sub: user.id,
    email: user.email,
    role: user.role,
    pwv: passwordVersion(user),
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
  assertNotLocked("login", user.loginLockedUntil);

  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) {
    await recordFailedAttempt("login", user.id);
    throw new AppError("Invalid email or password", 401);
  }
  if (user.failedLoginCount > 0 || user.loginLockedUntil) {
    await clearFailedAttempts("login", user.id);
  }

  // Mobile parents keep the one-device rule (previous device session is revoked).
  if (user.role === UserRole.PARENT && input.deviceId) {
    return activateParentDeviceSession({
      parent: user,
      deviceId: input.deviceId,
      deviceName: input.deviceName,
      platform: input.platform ?? "unknown",
      appVersion: input.appVersion,
    });
  }

  const accessToken = signAccessToken({
    sub: user.id,
    email: user.email,
    role: user.role,
    pwv: passwordVersion(user),
  });

  return {
    user: toAuthUser(user),
    tokens: {
      accessToken,
      expiresIn: env.JWT_EXPIRES_IN,
    },
  };
}

const AVATAR_RE = /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/]+=*$/;
const AVATAR_MAX_CHARS = 400_000;

export async function getMyAvatar(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { avatarUrl: true },
  });
  if (!user) throw new AppError("User not found", 404);
  return { avatarUrl: user.avatarUrl };
}

export async function setMyAvatar(userId: string, image: unknown) {
  if (image === null) {
    await prisma.user.update({ where: { id: userId }, data: { avatarUrl: null } });
    return { avatarUrl: null };
  }
  if (typeof image !== "string" || !AVATAR_RE.test(image)) {
    throw new AppError("Photo must be a JPEG, PNG or WebP image", 400, { code: "AVATAR_INVALID" });
  }
  if (image.length > AVATAR_MAX_CHARS) {
    throw new AppError("Photo is too large. Please choose a smaller photo.", 413, {
      code: "AVATAR_TOO_LARGE",
    });
  }
  await prisma.user.update({ where: { id: userId }, data: { avatarUrl: image } });
  return { avatarUrl: image };
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

type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

/**
 * A new password signs the account out everywhere: JWTs issued before this instant fail
 * `requireAuth`, parent device sessions (and their refresh tokens) are revoked, and TV links drop.
 */
export async function setPasswordAndRevokeSessions(
  tx: Tx,
  userId: string,
  passwordHash: string,
  reason: string
) {
  const passwordChangedAt = new Date();
  await tx.user.update({
    where: { id: userId },
    data: { passwordHash, passwordChangedAt, failedLoginCount: 0, loginLockedUntil: null },
  });
  await tx.parentDeviceSession.updateMany({
    where: { parentId: userId, status: "ACTIVE" },
    data: { status: "REVOKED", revokedAt: new Date(), revokedReason: reason },
  });
  await tx.passwordResetToken.updateMany({
    where: { userId, usedAt: null },
    data: { usedAt: new Date() },
  });
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
    await setPasswordAndRevokeSessions(tx, record.userId, passwordHash, "PASSWORD_RESET");
  });

  return {
    message: "Password updated. You can log in with your new password.",
  };
}

const ADMIN_PASSWORD_ROLES = new Set<UserRole>([
  UserRole.ADMIN,
  UserRole.SUPER_ADMIN,
  UserRole.SCHOOL_ADMIN,
]);

/** Signed-in password change. Signs the account out everywhere, including this session. */
export async function changePassword(
  userId: string,
  input: { currentPassword: string; newPassword: string; confirmPassword: string }
) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || !user.isActive) {
    throw new AppError("Invalid or inactive account", 401);
  }
  if (!(await verifyPassword(input.currentPassword, user.passwordHash))) {
    throw new AppError("Current password is incorrect.", 400, {
      code: "CURRENT_PASSWORD_INVALID",
    });
  }
  if (input.newPassword !== input.confirmPassword) {
    throw new AppError("Passwords do not match.", 400, { code: "PASSWORD_MISMATCH" });
  }
  if (input.newPassword === input.currentPassword) {
    throw new AppError("Choose a new password that is different from the current one.", 400, {
      code: "PASSWORD_UNCHANGED",
    });
  }
  const rule = ADMIN_PASSWORD_ROLES.has(user.role) ? adminPasswordSchema : passwordSchema;
  const checked = rule.safeParse(input.newPassword);
  if (!checked.success) {
    throw new AppError(checked.error.issues[0]?.message ?? "Password is too weak.", 400, {
      code: "WEAK_PASSWORD",
    });
  }

  const passwordHash = await hashPassword(input.newPassword);
  await prisma.$transaction(async (tx) => {
    await setPasswordAndRevokeSessions(tx, user.id, passwordHash, "PASSWORD_CHANGED");
  });

  return { message: "Password changed. Please sign in again with your new password." };
}

/** Forgot-password via email OTP: requires a verified RESET_PASSWORD token. */
export async function resetPasswordWithEmailOtp(input: ResetPasswordWithOtpInput) {
  const email = input.email.trim().toLowerCase();
  const passwordHash = await hashPassword(input.password);

  await prisma.$transaction(async (tx) => {
    await consumeEmailVerification(tx, {
      email,
      purpose: "RESET_PASSWORD",
      verificationToken: input.verificationToken,
    });
    const user = await tx.user.findUnique({ where: { email } });
    if (!user || !user.isActive) {
      throw new AppError("This account cannot reset its password.", 403);
    }
    await setPasswordAndRevokeSessions(tx, user.id, passwordHash, "PASSWORD_RESET");
  });

  return {
    message: "Password updated. You can log in with your new password.",
  };
}
