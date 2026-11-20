import { randomBytes } from "node:crypto";
import { AppError } from "../lib/errors.js";
import { hashPassword, verifyLoginPassword } from "../lib/password.js";
import { prisma } from "../lib/prisma.js";
import { env } from "../config/env.js";
import {
  consumeEmailVerification,
  normalizeEmail,
  sendEmailOtp,
} from "../auth/email-otp.service.js";
import { createChild } from "../children/children.service.js";
import { signStudentAccessToken } from "../lib/jwt.js";
import {
  allocatePreferredStudentLoginId,
  normalizeStudentLoginId,
  resolveStudentLoginId,
  suggestStudentLoginIdAlternatives,
  validatePreferredStudentLoginId,
} from "./student-id.js";
import {
  activateStudentDeviceSession,
  revokeAllStudentSessionsForChild,
} from "./student-session.service.js";

const MAX_FAILED = 5;
const LOCKOUT_MINUTES = 15;

function tempPassword(): string {
  // Meets passwordSchema: letter + number, length >= 8
  return `Tmp${randomBytes(6).toString("base64url")}9a`;
}

function lockedError(until: Date) {
  const minutes = Math.max(1, Math.ceil((until.getTime() - Date.now()) / 60_000));
  return new AppError(
    `Your student account is temporarily locked after multiple unsuccessful login attempts. Please try again after about ${minutes} minute${minutes === 1 ? "" : "s"}.`,
    429,
    {
      code: "ACCOUNT_LOCKED",
      retryAfterSeconds: Math.ceil((until.getTime() - Date.now()) / 1000),
    }
  );
}

async function recordStudentLoginFailure(credentialId: string) {
  const updated = await prisma.childStudentCredential.update({
    where: { id: credentialId },
    data: { failedLoginCount: { increment: 1 } },
    select: { failedLoginCount: true },
  });
  if (updated.failedLoginCount >= MAX_FAILED) {
    const until = new Date(Date.now() + LOCKOUT_MINUTES * 60_000);
    await prisma.childStudentCredential.update({
      where: { id: credentialId },
      data: { lockedUntil: until, failedLoginCount: 0 },
    });
    throw lockedError(until);
  }
}

export async function issueStudentCredential(input: {
  childId: string;
  createdByUserId?: string;
  password?: string;
  mustChangePassword?: boolean;
  preferredStudentLoginId?: string | null;
  emailVerifiedAt?: Date | null;
  registrationEmail?: string | null;
  accountCreationMethod?: string | null;
  verificationReference?: string | null;
}) {
  const child = await prisma.child.findFirst({
    where: { id: input.childId, isActive: true },
    select: { id: true, parentId: true, displayName: true, studentCredential: true },
  });
  if (!child) throw new AppError("Child not found", 404);
  if (child.studentCredential) {
    throw new AppError("This child already has a Student ID", 409, {
      code: "STUDENT_CREDENTIAL_EXISTS",
    });
  }

  const plainPassword = input.password ?? tempPassword();
  const studentLoginId = await resolveStudentLoginId(input.preferredStudentLoginId);
  const passwordHash = await hashPassword(plainPassword);

  let credential;
  try {
    credential = await prisma.childStudentCredential.create({
      data: {
        childId: child.id,
        studentLoginId,
        passwordHash,
        mustChangePassword: input.mustChangePassword ?? !input.password,
        emailVerifiedAt: input.emailVerifiedAt ?? null,
        registrationEmail: input.registrationEmail
          ? normalizeEmail(input.registrationEmail)
          : null,
        createdByUserId: input.createdByUserId ?? null,
        accountCreationMethod: input.accountCreationMethod ?? null,
        verificationReference: input.verificationReference ?? null,
        passwordChangedAt: input.password ? new Date() : null,
      },
    });
  } catch (err) {
    const code = (err as { code?: string })?.code;
    if (code === "P2002") {
      const suggestions = await suggestStudentLoginIdAlternatives(studentLoginId, 3);
      throw new AppError(
        suggestions.length
          ? `That Student ID is already in use. Try ${suggestions.join(", ")}.`
          : "That Student ID is already in use.",
        409,
        { code: "STUDENT_ID_TAKEN", suggestions }
      );
    }
    throw err;
  }

  return {
    credentialId: credential.id,
    childId: child.id,
    parentId: child.parentId,
    studentLoginId: credential.studentLoginId,
    temporaryPassword: input.password ? undefined : plainPassword,
    mustChangePassword: credential.mustChangePassword,
  };
}

export async function resetStudentPassword(input: {
  childId: string;
  newPassword?: string;
  mustChangePassword?: boolean;
}) {
  const credential = await prisma.childStudentCredential.findUnique({
    where: { childId: input.childId },
  });
  if (!credential || !credential.isActive) {
    throw new AppError("Student credentials not found", 404);
  }

  const plainPassword = input.newPassword ?? tempPassword();
  const passwordHash = await hashPassword(plainPassword);
  const passwordChangedAt = new Date();

  await prisma.$transaction([
    prisma.childStudentCredential.update({
      where: { id: credential.id },
      data: {
        passwordHash,
        passwordChangedAt,
        mustChangePassword: input.mustChangePassword ?? !input.newPassword,
        failedLoginCount: 0,
        lockedUntil: null,
        sessionVersion: { increment: 1 },
      },
    }),
    prisma.childStudentSession.updateMany({
      where: { childId: input.childId, status: "ACTIVE" },
      data: {
        status: "REVOKED",
        revokedAt: new Date(),
        revokedReason: "PASSWORD_RESET",
      },
    }),
  ]);

  return {
    studentLoginId: credential.studentLoginId,
    temporaryPassword: input.newPassword ? undefined : plainPassword,
    mustChangePassword: input.mustChangePassword ?? !input.newPassword,
  };
}

export async function loginStudent(input: {
  studentLoginId: string;
  password: string;
  installationId: string;
  platform: string;
  deviceName?: string;
  appVersion?: string;
}) {
  const studentLoginId = normalizeStudentLoginId(input.studentLoginId);
  const credential = await prisma.childStudentCredential.findUnique({
    where: { studentLoginId },
    include: {
      child: {
        select: {
          id: true,
          parentId: true,
          displayName: true,
          levelId: true,
          gradeId: true,
          isActive: true,
          hasLearningSeat: true,
        },
      },
    },
  });

  if (!credential) {
    throw new AppError("That Student ID was not found.", 401, {
      code: "STUDENT_ID_UNKNOWN",
    });
  }
  if (!credential.isActive || !credential.child.isActive) {
    throw new AppError("This student account is inactive. Contact Learn Wise support.", 403, {
      code: "ACCOUNT_INACTIVE",
    });
  }
  if (credential.lockedUntil && credential.lockedUntil.getTime() > Date.now()) {
    throw lockedError(credential.lockedUntil);
  }

  const ok = await verifyLoginPassword(input.password, credential.passwordHash);
  if (!ok) {
    await recordStudentLoginFailure(credential.id);
    throw new AppError("That password is incorrect.", 401, {
      code: "STUDENT_PASSWORD_INVALID",
    });
  }

  await prisma.childStudentCredential.update({
    where: { id: credential.id },
    data: { failedLoginCount: 0, lockedUntil: null, lastLoginAt: new Date() },
  });

  const { session, refreshToken } = await activateStudentDeviceSession({
    credentialId: credential.id,
    childId: credential.childId,
    installationId: input.installationId,
    platform: input.platform,
    deviceName: input.deviceName,
    appVersion: input.appVersion,
  });

  const fresh = await prisma.childStudentCredential.findUniqueOrThrow({
    where: { id: credential.id },
    select: { sessionVersion: true, mustChangePassword: true },
  });

  const accessToken = signStudentAccessToken({
    childId: credential.childId,
    parentId: credential.child.parentId,
    credentialId: credential.id,
    studentLoginId: credential.studentLoginId,
    sid: session.id,
    sv: fresh.sessionVersion,
  });

  return {
    tokens: {
      accessToken,
      refreshToken,
      expiresIn: env.ACCESS_TOKEN_EXPIRY,
    },
    student: {
      childId: credential.child.id,
      parentId: credential.child.parentId,
      displayName: credential.child.displayName,
      studentLoginId: credential.studentLoginId,
      levelId: credential.child.levelId,
      gradeId: credential.child.gradeId,
      mustChangePassword: fresh.mustChangePassword,
      hasLearningSeat: credential.child.hasLearningSeat,
    },
  };
}

export async function changeStudentPassword(input: {
  childId: string;
  currentPassword: string;
  newPassword: string;
}) {
  const credential = await prisma.childStudentCredential.findUnique({
    where: { childId: input.childId },
  });
  if (!credential || !credential.isActive) {
    throw new AppError("Student credentials not found", 404);
  }
  const ok = await verifyLoginPassword(input.currentPassword, credential.passwordHash);
  if (!ok) throw new AppError("Current password is incorrect", 401);

  const passwordHash = await hashPassword(input.newPassword);
  await prisma.$transaction([
    prisma.childStudentCredential.update({
      where: { id: credential.id },
      data: {
        passwordHash,
        passwordChangedAt: new Date(),
        mustChangePassword: false,
        sessionVersion: { increment: 1 },
      },
    }),
    prisma.childStudentSession.updateMany({
      where: { childId: input.childId, status: "ACTIVE" },
      data: {
        status: "REVOKED",
        revokedAt: new Date(),
        revokedReason: "PASSWORD_CHANGED",
      },
    }),
  ]);
}

/** Option A: email OTP send (purpose STUDENT_SELF_REGISTER). */
export async function sendStudentSelfRegisterOtp(email: string) {
  const normalized = normalizeEmail(email);
  const existing = await prisma.user.findUnique({
    where: { email: normalized },
    select: { id: true, role: true, isActive: true },
  });
  if (existing && (!existing.isActive || existing.role !== "PARENT")) {
    throw new AppError(
      "This email cannot be used for student self-registration.",
      409,
      { code: "EMAIL_NOT_ELIGIBLE" }
    );
  }
  return sendEmailOtp({ email: normalized, purpose: "STUDENT_SELF_REGISTER" });
}

export async function selfRegisterStudent(input: {
  emailVerificationToken: string;
  displayName: string;
  birthYear?: number;
  birthDate?: string;
  levelId?: string;
  level?: string;
  gradeId?: string;
  password: string;
  installationId: string;
  platform: string;
  deviceName?: string;
  appVersion?: string;
  acceptTerms: true;
  acceptPrivacy: true;
  parentalConsent: true;
}) {
  // Token is bound to email via EmailOtp row; resolve email from the verified token hash.
  const tokenHash = (await import("node:crypto")).createHash("sha256")
    .update(input.emailVerificationToken.trim())
    .digest("hex");
  const otpRow = await prisma.emailOtp.findFirst({
    where: {
      purpose: "STUDENT_SELF_REGISTER",
      verificationTokenHash: tokenHash,
      verifiedAt: { not: null },
      consumedAt: null,
      invalidatedAt: null,
      tokenExpiresAt: { gt: new Date() },
    },
  });
  if (!otpRow) {
    throw new AppError(
      "Email verification expired or invalid. Please verify your email again.",
      400,
      { code: "EMAIL_NOT_VERIFIED" }
    );
  }
  const email = normalizeEmail(otpRow.email);

  await prisma.$transaction(async (tx) => {
    await consumeEmailVerification(tx, {
      email,
      purpose: "STUDENT_SELF_REGISTER",
      verificationToken: input.emailVerificationToken,
    });
  });

  const existingUser = await prisma.user.findUnique({ where: { email } });
  if (existingUser && existingUser.role !== "PARENT") {
    throw new AppError("This email cannot be used for student self-registration.", 409);
  }

  let parentId = existingUser?.id;
  if (!parentId) {
    const passwordHash = await hashPassword(`${randomBytes(24).toString("base64url")}Aa1`);
    const created = await prisma.user.create({
      data: {
        name: input.displayName.slice(0, 80) || "Student Sponsor",
        email,
        passwordHash,
        role: "PARENT",
        isActive: true,
      },
    });
    parentId = created.id;
  }

  const prior = await prisma.childStudentCredential.findFirst({
    where: {
      registrationEmail: email,
      child: { parentId, isActive: true },
    },
  });
  if (prior) {
    throw new AppError(
      "A student profile already exists for this email. Please log in with your Student ID.",
      409,
      {
        code: "STUDENT_ALREADY_REGISTERED",
        studentLoginId: prior.studentLoginId,
      }
    );
  }

  const child = await createChild(parentId, {
    displayName: input.displayName,
    birthYear: input.birthYear,
    birthDate: input.birthDate,
    levelId: input.levelId,
    level: input.level as
      | "LEVEL_1"
      | "LEVEL_2"
      | "LEVEL_3"
      | "LEVEL_4"
      | "FOUNDATION"
      | "ELEMENTARY"
      | "ADVANCED"
      | undefined,
    gradeId: input.gradeId,
  });

  const issued = await issueStudentCredential({
    childId: child.id,
    password: input.password,
    mustChangePassword: false,
    emailVerifiedAt: new Date(),
    registrationEmail: email,
  });

  return loginStudent({
    studentLoginId: issued.studentLoginId,
    password: input.password,
    installationId: input.installationId,
    platform: input.platform,
    deviceName: input.deviceName,
    appVersion: input.appVersion,
  });
}

export async function adminCreateChildForParent(input: {
  parentId: string;
  displayName: string;
  birthYear: number;
  levelId?: string;
  level?: string;
  gradeId?: string;
  birthDate?: string;
  issueCredential?: boolean;
  preferredStudentLoginId?: string | null;
  createdByUserId: string;
}) {
  const parent = await prisma.user.findFirst({
    where: { id: input.parentId, role: "PARENT", isActive: true },
    select: { id: true },
  });
  if (!parent) throw new AppError("Sponsor parent not found", 404);

  const child = await createChild(parent.id, {
    displayName: input.displayName,
    birthYear: input.birthYear,
    levelId: input.levelId,
    level: input.level as
      | "LEVEL_1"
      | "LEVEL_2"
      | "LEVEL_3"
      | "LEVEL_4"
      | "FOUNDATION"
      | "ELEMENTARY"
      | "ADVANCED"
      | undefined,
    gradeId: input.gradeId,
    birthDate: input.birthDate,
  });

  let credentials: Awaited<ReturnType<typeof issueStudentCredential>> | null = null;
  if (input.issueCredential !== false) {
    credentials = await issueStudentCredential({
      childId: child.id,
      createdByUserId: input.createdByUserId,
      mustChangePassword: true,
      preferredStudentLoginId: input.preferredStudentLoginId,
    });
  }

  return { child, credentials };
}

/**
 * Admin Direct: create Child under the internal system Sponsor Parent (no parent picker).
 * Leaves subscription unpaid (no seat / no grade grant).
 */
export async function adminCreateDirectStudent(input: {
  displayName: string;
  birthYear?: number;
  levelId?: string;
  level?: string;
  gradeId?: string;
  birthDate?: string;
  preferredStudentLoginId?: string | null;
  createdByUserId: string;
}) {
  const {
    ACCOUNT_CREATION_ADMIN_DIRECT,
    ensureAdminDirectSponsorParent,
  } = await import("./admin-direct-sponsor.js");

  const sponsor = await ensureAdminDirectSponsorParent();

  const child = await createChild(
    sponsor.id,
    {
      displayName: input.displayName,
      birthYear: input.birthYear,
      levelId: input.levelId,
      level: input.level as
        | "LEVEL_1"
        | "LEVEL_2"
        | "LEVEL_3"
        | "LEVEL_4"
        | "FOUNDATION"
        | "ELEMENTARY"
        | "ADVANCED"
        | undefined,
      gradeId: input.gradeId,
      birthDate: input.birthDate,
    },
    { skipSeatAssignment: true }
  );

  const credentials = await issueStudentCredential({
    childId: child.id,
    createdByUserId: input.createdByUserId,
    mustChangePassword: true,
    preferredStudentLoginId: input.preferredStudentLoginId,
    accountCreationMethod: ACCOUNT_CREATION_ADMIN_DIRECT,
  });

  return {
    child: {
      ...child,
      parentId: sponsor.id,
      hasLearningSeat: false,
      subscriptionStatus: "UNPAID" as const,
    },
    credentials,
    sponsorParent: {
      id: sponsor.id,
      kind: "SYSTEM_ADMIN_DIRECT" as const,
    },
  };
}

/** Admin lookup by current Student ID (for post-create rename management). */
export async function adminLookupStudentByLoginId(rawStudentLoginId: string) {
  const studentLoginId = normalizeStudentLoginId(rawStudentLoginId);
  if (studentLoginId.length < 3) {
    throw new AppError("Enter a valid Student ID", 400, { code: "STUDENT_ID_INVALID" });
  }
  const credential = await prisma.childStudentCredential.findUnique({
    where: { studentLoginId },
    select: {
      childId: true,
      studentLoginId: true,
      mustChangePassword: true,
      isActive: true,
      child: {
        select: {
          displayName: true,
          level: true,
          levelId: true,
          isActive: true,
          hasLearningSeat: true,
        },
      },
    },
  });
  if (!credential || !credential.isActive || !credential.child.isActive) {
    throw new AppError("Student not found", 404, { code: "STUDENT_NOT_FOUND" });
  }
  return {
    childId: credential.childId,
    studentLoginId: credential.studentLoginId,
    displayName: credential.child.displayName,
    level: credential.child.level,
    levelId: credential.child.levelId,
    hasLearningSeat: credential.child.hasLearningSeat,
    mustChangePassword: credential.mustChangePassword,
  };
}

/**
 * Admin-only: change an existing Student ID. Revokes active sessions so devices re-login.
 * Does not reset password, progress, ownership, or subscription/seat status.
 */
export async function renameStudentLoginId(input: {
  childId: string;
  newStudentLoginId: string;
  adminUserId: string;
}) {
  const credential = await prisma.childStudentCredential.findUnique({
    where: { childId: input.childId },
  });
  if (!credential || !credential.isActive) {
    throw new AppError("Student credentials not found", 404);
  }

  const studentLoginId = await allocatePreferredStudentLoginId(
    input.newStudentLoginId,
    input.childId
  );

  if (studentLoginId === credential.studentLoginId) {
    return {
      childId: input.childId,
      studentLoginId,
      previousStudentLoginId: credential.studentLoginId,
    };
  }

  try {
    await prisma.$transaction([
      prisma.childStudentCredential.update({
        where: { id: credential.id },
        data: {
          studentLoginId,
          sessionVersion: { increment: 1 },
        },
      }),
      prisma.childStudentSession.updateMany({
        where: { childId: input.childId, status: "ACTIVE" },
        data: {
          status: "REVOKED",
          revokedAt: new Date(),
          revokedReason: "STUDENT_ID_RENAMED",
        },
      }),
    ]);
  } catch (err) {
    const code = (err as { code?: string })?.code;
    if (code === "P2002") {
      const suggestions = await suggestStudentLoginIdAlternatives(studentLoginId, 3);
      throw new AppError(
        suggestions.length
          ? `That Student ID is already in use. Try ${suggestions.join(", ")}.`
          : "That Student ID is already in use.",
        409,
        { code: "STUDENT_ID_TAKEN", suggestions }
      );
    }
    throw err;
  }

  return {
    childId: input.childId,
    studentLoginId,
    previousStudentLoginId: credential.studentLoginId,
  };
}

export { revokeAllStudentSessionsForChild, validatePreferredStudentLoginId };
