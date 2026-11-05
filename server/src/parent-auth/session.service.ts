import { createHash, randomBytes } from "node:crypto";
import type { User } from "@prisma/client";
import { env } from "../config/env.js";
import { AppError } from "../lib/errors.js";
import { signAccessToken } from "../lib/jwt.js";
import { prisma } from "../lib/prisma.js";
import { parseDurationMs } from "./duration.js";
import { notifySessionRevoked } from "./notify-session-revoked.js";
import { verifyParentOtpCode } from "./otp.service.js";

function hashRefreshToken(raw: string) {
  return createHash("sha256").update(raw).digest("hex");
}

function newRefreshToken() {
  return randomBytes(48).toString("base64url");
}

function toAuthUser(user: Pick<User, "id" | "name" | "email" | "role" | "mobileE164">) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    mobileE164: user.mobileE164 ?? null,
  };
}

export async function createParentSessionFromOtp(input: {
  mobile: string;
  countryCode?: string;
  otp: string;
  deviceId: string;
  deviceName?: string;
  platform: string;
  appVersion?: string;
}) {
  const deviceId = String(input.deviceId ?? "").trim();
  if (deviceId.length < 16) {
    throw new AppError("Valid device id required", 400, {
      code: "INVALID_DEVICE_ID",
    });
  }

  const { parent } = await verifyParentOtpCode({
    mobile: input.mobile,
    countryCode: input.countryCode,
    otp: input.otp,
  });

  return activateParentDeviceSession({
    parent,
    deviceId,
    deviceName: input.deviceName,
    platform: input.platform || "unknown",
    appVersion: input.appVersion,
  });
}

export async function activateParentDeviceSession(input: {
  parent: User;
  deviceId: string;
  deviceName?: string;
  platform: string;
  appVersion?: string;
}) {
  const refreshToken = newRefreshToken();
  const refreshTokenHash = hashRefreshToken(refreshToken);
  const expiresAt = new Date(
    Date.now() +
      parseDurationMs(env.REFRESH_TOKEN_EXPIRY, 30 * 24 * 60 * 60 * 1000)
  );

  let session: {
    created: {
      id: string;
      deviceId: string;
      platform: string;
      expiresAt: Date;
    };
    previous: Array<{ id: string; deviceId: string }>;
  };

  try {
    session = await prisma.$transaction(async (tx) => {
      const previous = await tx.parentDeviceSession.findMany({
        where: {
          parentId: input.parent.id,
          status: "ACTIVE",
        },
        select: { id: true, deviceId: true },
      });

      if (previous.length) {
        await tx.parentDeviceSession.updateMany({
          where: {
            parentId: input.parent.id,
            status: "ACTIVE",
          },
          data: {
            status: "REVOKED",
            revokedAt: new Date(),
            revokedReason: "REPLACED_BY_NEW_DEVICE",
          },
        });
      }

      const created = await tx.parentDeviceSession.create({
        data: {
          id: `pds_${randomBytes(12).toString("hex")}`,
          parentId: input.parent.id,
          deviceId: input.deviceId,
          deviceName: input.deviceName?.slice(0, 80) ?? null,
          platform: String(input.platform).slice(0, 40),
          appVersion: input.appVersion?.slice(0, 40) ?? null,
          refreshTokenHash,
          status: "ACTIVE",
          expiresAt,
          lastSeenAt: new Date(),
        },
      });

      return { created, previous };
    });
  } catch (err) {
    const code =
      err && typeof err === "object" && "code" in err
        ? String((err as { code: string }).code)
        : "";
    if (code === "P2002") {
      throw new AppError(
        "Another device just signed in. Please try again.",
        409,
        { code: "SESSION_CONFLICT" }
      );
    }
    throw err;
  }

  for (const prev of session.previous) {
    if (prev.deviceId !== input.deviceId) {
      void notifySessionRevoked({
        parentId: input.parent.id,
        revokedSessionId: prev.id,
        reason: "REPLACED_BY_NEW_DEVICE",
      });
    }
  }

  const accessToken = signAccessToken({
    sub: input.parent.id,
    email: input.parent.email,
    role: input.parent.role,
    sid: session.created.id,
  });

  return {
    user: toAuthUser(input.parent),
    session: {
      id: session.created.id,
      deviceId: session.created.deviceId,
      platform: session.created.platform,
      expiresAt: session.created.expiresAt,
    },
    tokens: {
      accessToken,
      refreshToken,
      expiresIn: env.ACCESS_TOKEN_EXPIRY,
      refreshExpiresIn: env.REFRESH_TOKEN_EXPIRY,
    },
  };
}

export async function refreshParentSession(input: {
  refreshToken: string;
  deviceId: string;
}) {
  const refreshToken = String(input.refreshToken ?? "").trim();
  const deviceId = String(input.deviceId ?? "").trim();
  if (!refreshToken || deviceId.length < 16) {
    throw new AppError("Invalid refresh request", 400, {
      code: "INVALID_REFRESH",
    });
  }

  const hash = hashRefreshToken(refreshToken);
  const existing = await prisma.parentDeviceSession.findFirst({
    where: { refreshTokenHash: hash },
    include: {
      parent: true,
    },
  });

  if (!existing || existing.deviceId !== deviceId) {
    throw new AppError("Session revoked or invalid. Please log in again.", 401, {
      code: "SESSION_REVOKED",
    });
  }
  if (existing.status !== "ACTIVE") {
    throw new AppError("Session revoked or invalid. Please log in again.", 401, {
      code: "SESSION_REVOKED",
    });
  }
  if (existing.expiresAt.getTime() < Date.now()) {
    await prisma.parentDeviceSession.update({
      where: { id: existing.id },
      data: {
        status: "EXPIRED",
        revokedAt: new Date(),
        revokedReason: "EXPIRED",
      },
    });
    throw new AppError("Session expired. Please log in again.", 401, {
      code: "SESSION_REVOKED",
    });
  }
  if (!existing.parent.isActive || existing.parent.role !== "PARENT") {
    throw new AppError("Account inactive", 403, { code: "PARENT_INACTIVE" });
  }

  const nextRefresh = newRefreshToken();
  const nextHash = hashRefreshToken(nextRefresh);
  const expiresAt = new Date(
    Date.now() +
      parseDurationMs(env.REFRESH_TOKEN_EXPIRY, 30 * 24 * 60 * 60 * 1000)
  );

  await prisma.parentDeviceSession.update({
    where: { id: existing.id },
    data: {
      refreshTokenHash: nextHash,
      expiresAt,
      lastSeenAt: new Date(),
    },
  });

  const accessToken = signAccessToken({
    sub: existing.parent.id,
    email: existing.parent.email,
    role: existing.parent.role,
    sid: existing.id,
  });

  return {
    user: toAuthUser(existing.parent),
    session: {
      id: existing.id,
      deviceId: existing.deviceId,
      platform: existing.platform,
      expiresAt,
    },
    tokens: {
      accessToken,
      refreshToken: nextRefresh,
      expiresIn: env.ACCESS_TOKEN_EXPIRY,
      refreshExpiresIn: env.REFRESH_TOKEN_EXPIRY,
    },
  };
}

export async function logoutParentSession(input: {
  parentId: string;
  sessionId?: string;
  deviceId?: string;
}) {
  const where = input.sessionId
    ? { id: input.sessionId, parentId: input.parentId, status: "ACTIVE" as const }
    : input.deviceId
      ? {
          parentId: input.parentId,
          deviceId: input.deviceId,
          status: "ACTIVE" as const,
        }
      : null;

  if (!where) {
    throw new AppError("sessionId or deviceId required", 400);
  }

  await prisma.parentDeviceSession.updateMany({
    where,
    data: {
      status: "REVOKED",
      revokedAt: new Date(),
      revokedReason: "USER_LOGOUT",
    },
  });

  return { ok: true };
}

export async function getParentSessionStatus(sessionId: string, parentId: string) {
  const session = await prisma.parentDeviceSession.findFirst({
    where: { id: sessionId, parentId },
  });
  if (!session) {
    throw new AppError("Session not found", 401, { code: "SESSION_REVOKED" });
  }
  if (session.status !== "ACTIVE" || session.expiresAt.getTime() < Date.now()) {
    throw new AppError(
      "You've been logged out because your account was opened on another device.",
      401,
      { code: "SESSION_REVOKED" }
    );
  }
  return {
    id: session.id,
    deviceId: session.deviceId,
    platform: session.platform,
    deviceName: session.deviceName,
    lastSeenAt: session.lastSeenAt,
    expiresAt: session.expiresAt,
    status: session.status,
  };
}

const LAST_SEEN_THROTTLE_MS = 3 * 60 * 1000;

export async function assertActiveParentSession(input: {
  parentId: string;
  sessionId: string;
}): Promise<void> {
  const session = await prisma.parentDeviceSession.findFirst({
    where: { id: input.sessionId, parentId: input.parentId },
  });

  if (
    !session ||
    session.status !== "ACTIVE" ||
    session.expiresAt.getTime() < Date.now()
  ) {
    throw new AppError(
      "You've been logged out because your account was opened on another device.",
      401,
      { code: "SESSION_REVOKED" }
    );
  }

  const age = Date.now() - session.lastSeenAt.getTime();
  if (age >= LAST_SEEN_THROTTLE_MS) {
    await prisma.parentDeviceSession.update({
      where: { id: session.id },
      data: { lastSeenAt: new Date() },
    });
  }
}

export async function listParentDeviceSessions(parentId: string) {
  return prisma.parentDeviceSession.findMany({
    where: { parentId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      deviceId: true,
      deviceName: true,
      platform: true,
      appVersion: true,
      status: true,
      createdAt: true,
      lastSeenAt: true,
      expiresAt: true,
      revokedAt: true,
      revokedReason: true,
    },
  });
}

export async function revokeParentDeviceSession(input: {
  parentId: string;
  sessionId: string;
  reason?: string;
}) {
  const session = await prisma.parentDeviceSession.findFirst({
    where: { id: input.sessionId, parentId: input.parentId },
  });
  if (!session) throw new AppError("Session not found", 404);

  if (session.status === "ACTIVE") {
    await prisma.parentDeviceSession.update({
      where: { id: session.id },
      data: {
        status: "REVOKED",
        revokedAt: new Date(),
        revokedReason: input.reason ?? "ADMIN_REVOKE",
      },
    });
    void notifySessionRevoked({
      parentId: input.parentId,
      revokedSessionId: session.id,
      reason: input.reason ?? "ADMIN_REVOKE",
    });
  }

  return { ok: true, id: session.id };
}

export async function revokeAllParentDeviceSessions(
  parentId: string,
  reason = "ADMIN_RESET"
) {
  const result = await prisma.parentDeviceSession.updateMany({
    where: { parentId, status: "ACTIVE" },
    data: {
      status: "REVOKED",
      revokedAt: new Date(),
      revokedReason: reason,
    },
  });
  return { ok: true, revoked: result.count };
}

/**
 * Admin-only mobile assignment. Parents cannot change mobileE164 via OTP to a
 * new unverified number — recovery for a forgotten number is support contact.
 */
export async function adminSetParentMobile(input: {
  parentId: string;
  mobile: string;
  countryCode?: string;
}) {
  const { normalizeMobileE164 } = await import("./mobile.js");
  const mobileE164 = normalizeMobileE164(input.mobile, input.countryCode);

  const parent = await prisma.user.findFirst({
    where: { id: input.parentId, role: "PARENT" },
  });
  if (!parent) throw new AppError("Parent not found", 404);

  const clash = await prisma.user.findFirst({
    where: {
      mobileE164,
      NOT: { id: parent.id },
    },
  });
  if (clash) {
    throw new AppError("This mobile number is already linked to another account", 409, {
      code: "MOBILE_IN_USE",
    });
  }

  const updated = await prisma.user.update({
    where: { id: parent.id },
    data: { mobileE164 },
    select: {
      id: true,
      name: true,
      email: true,
      mobileE164: true,
      role: true,
      isActive: true,
    },
  });

  return updated;
}
