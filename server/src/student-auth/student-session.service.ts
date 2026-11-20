import { createHash, randomBytes } from "node:crypto";
import { AppError } from "../lib/errors.js";
import { prisma } from "../lib/prisma.js";
import { env } from "../config/env.js";

function hashRefreshToken(raw: string) {
  return createHash("sha256").update(raw).digest("hex");
}

function parseDurationToMs(raw: string): number {
  const m = /^(\d+)([smhd])$/i.exec(raw.trim());
  if (!m) return 30 * 24 * 60 * 60 * 1000;
  const n = Number(m[1]);
  const u = m[2]!.toLowerCase();
  if (u === "s") return n * 1000;
  if (u === "m") return n * 60 * 1000;
  if (u === "h") return n * 60 * 60 * 1000;
  return n * 24 * 60 * 60 * 1000;
}

/**
 * Latest-login-wins: revoke any ACTIVE student session for this child,
 * bind StudentDevice to this installation, create new ACTIVE ChildStudentSession.
 * Parent Kids Mode / ParentDeviceSession are not touched.
 */
export async function activateStudentDeviceSession(input: {
  credentialId: string;
  childId: string;
  installationId: string;
  platform: string;
  deviceName?: string;
  appVersion?: string;
}) {
  if (!input.installationId || input.installationId.length < 16) {
    throw new AppError("Invalid installation identifier", 400);
  }

  const refreshRaw = randomBytes(32).toString("base64url");
  const refreshTokenHash = hashRefreshToken(refreshRaw);
  const expiresAt = new Date(Date.now() + parseDurationToMs(env.REFRESH_TOKEN_EXPIRY));

  const session = await prisma.$transaction(async (tx) => {
    // Lock credential row for concurrent login safety.
    await tx.$executeRaw`SELECT id FROM "ChildStudentCredential" WHERE id = ${input.credentialId} FOR UPDATE`;

    await tx.childStudentSession.updateMany({
      where: { childId: input.childId, status: "ACTIVE" },
      data: {
        status: "REVOKED",
        revokedAt: new Date(),
        revokedReason: "REPLACED_BY_NEW_DEVICE",
      },
    });

    const existingDevice = await tx.studentDevice.findUnique({
      where: { childId: input.childId },
    });
    const previousInstallationId = existingDevice?.installationId ?? null;

    if (existingDevice) {
      await tx.studentDevice.delete({ where: { id: existingDevice.id } });
    }

    await tx.studentDevice.create({
      data: {
        childId: input.childId,
        installationId: input.installationId,
        platform: input.platform.slice(0, 40),
        deviceLabel: input.deviceName?.slice(0, 80),
        appVersion: input.appVersion?.slice(0, 40),
        isActive: true,
      },
    });

    await tx.deviceTransferEvent.create({
      data: {
        childId: input.childId,
        approvedByUserId: input.credentialId,
        previousInstallationId,
        newInstallationId: input.installationId,
        action: previousInstallationId ? "TRANSFER" : "REGISTER",
        reason: previousInstallationId
          ? "Student latest-login-wins device takeover"
          : "Student first device registration",
      },
    });

    return tx.childStudentSession.create({
      data: {
        credentialId: input.credentialId,
        childId: input.childId,
        deviceInstallationId: input.installationId,
        deviceName: input.deviceName?.slice(0, 80),
        platform: input.platform.slice(0, 40),
        appVersion: input.appVersion?.slice(0, 40),
        refreshTokenHash,
        status: "ACTIVE",
        expiresAt,
      },
    });
  });

  return { session, refreshToken: refreshRaw };
}

export async function assertActiveStudentSession(input: {
  childId: string;
  sessionId: string;
  sessionVersion: number;
  credentialSessionVersion: number;
}) {
  if (input.sessionVersion !== input.credentialSessionVersion) {
    throw new AppError("Session expired. Please sign in again.", 401, {
      code: "SESSION_REVOKED",
    });
  }

  const session = await prisma.childStudentSession.findFirst({
    where: {
      id: input.sessionId,
      childId: input.childId,
      status: "ACTIVE",
      expiresAt: { gt: new Date() },
    },
  });
  if (!session) {
    throw new AppError("Session expired. Please sign in again.", 401, {
      code: "SESSION_REVOKED",
    });
  }

  await prisma.childStudentSession.update({
    where: { id: session.id },
    data: { lastSeenAt: new Date() },
  });

  return session;
}

export async function revokeAllStudentSessionsForChild(
  childId: string,
  reason: string
) {
  await prisma.$transaction([
    prisma.childStudentSession.updateMany({
      where: { childId, status: "ACTIVE" },
      data: {
        status: "REVOKED",
        revokedAt: new Date(),
        revokedReason: reason,
      },
    }),
    prisma.childStudentCredential.updateMany({
      where: { childId },
      data: { sessionVersion: { increment: 1 } },
    }),
  ]);
}

/** Learning-path device check for student JWT: must match ACTIVE session device. */
export async function assertStudentSessionDevice(
  childId: string,
  sessionId: string,
  installationId: string
) {
  const session = await prisma.childStudentSession.findFirst({
    where: {
      id: sessionId,
      childId,
      status: "ACTIVE",
      expiresAt: { gt: new Date() },
    },
  });
  if (!session) {
    throw new AppError("Session expired. Please sign in again.", 401, {
      code: "SESSION_REVOKED",
    });
  }
  if (session.deviceInstallationId !== installationId) {
    throw new AppError(
      "You've been signed out because this student account was opened on another device.",
      401,
      { code: "SESSION_REVOKED" }
    );
  }
}
