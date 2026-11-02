import { ConsentType, UserRole } from "@prisma/client";
import type { LoginInput, RegisterInput } from "@little-readers/validation";
import { AppError } from "../lib/errors.js";
import { signAccessToken } from "../lib/jwt.js";
import { hashPassword, verifyPassword } from "../lib/password.js";
import { prisma } from "../lib/prisma.js";
import { env } from "../config/env.js";

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
  const email = input.email.toLowerCase();
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !user.isActive) {
    throw new AppError("Invalid email or password", 401);
  }

  const valid = await verifyPassword(input.password, user.passwordHash);
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
