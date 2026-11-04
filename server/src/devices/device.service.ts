import { AppError } from "../lib/errors.js";
import { prisma } from "../lib/prisma.js";
import { assertParentSubscriptionEligible } from "../subscriptions/subscription.service.js";

const DEVICE_BLOCK_MESSAGE =
  "This student account is already registered on another device. Please contact your parent or administrator to transfer access to this phone.";

async function getOwnedChild(parentOrAdminId: string, childId: string, role: string) {
  if (role === "ADMIN" || role === "SUPER_ADMIN") {
    const child = await prisma.child.findFirst({
      where: { id: childId, isActive: true },
    });
    if (!child) throw new AppError("Child not found", 404);
    return child;
  }

  const child = await prisma.child.findFirst({
    where: { id: childId, parentId: parentOrAdminId, isActive: true },
  });
  if (!child) throw new AppError("Child not found", 404);
  return child;
}

export async function getChildDeviceStatus(childId: string) {
  const device = await prisma.studentDevice.findUnique({ where: { childId } });
  if (!device || !device.isActive || device.revokedAt) {
    return { registered: false, device: null };
  }
  return {
    registered: true,
    device: {
      id: device.id,
      platform: device.platform,
      deviceLabel: device.deviceLabel,
      registeredAt: device.registeredAt,
      lastSeenAt: device.lastSeenAt,
      installationIdSuffix: device.installationId.slice(-8),
    },
  };
}

/**
 * Register or re-affirm a mobile installation for a student (child).
 * Atomic: only one active device per child.
 */
export async function registerOrVerifyStudentDevice(input: {
  userId: string;
  role: string;
  childId: string;
  installationId: string;
  platform: string;
  deviceLabel?: string;
  appVersion?: string;
}) {
  if (!input.installationId || input.installationId.length < 16) {
    throw new AppError("Invalid installation identifier", 400);
  }

  const child = await getOwnedChild(input.userId, input.childId, input.role);

  // Subscription is on the parent account
  await assertParentSubscriptionEligible(child.parentId);

  return prisma.$transaction(async (tx) => {
    const existing = await tx.studentDevice.findUnique({
      where: { childId: child.id },
    });

    if (!existing || !existing.isActive || existing.revokedAt) {
      if (existing) {
        await tx.studentDevice.delete({ where: { id: existing.id } });
      }
      const created = await tx.studentDevice.create({
        data: {
          childId: child.id,
          installationId: input.installationId,
          platform: input.platform.slice(0, 40),
          deviceLabel: input.deviceLabel?.slice(0, 80),
          appVersion: input.appVersion?.slice(0, 40),
          isActive: true,
        },
      });
      await tx.deviceTransferEvent.create({
        data: {
          childId: child.id,
          approvedByUserId: input.userId,
          previousInstallationId: existing?.installationId,
          newInstallationId: input.installationId,
          action: "REGISTER",
          reason: "First device registration",
        },
      });
      return {
        allowed: true as const,
        registered: true as const,
        deviceId: created.id,
        message: "Device registered for this student",
      };
    }

    if (existing.installationId !== input.installationId) {
      throw new AppError(DEVICE_BLOCK_MESSAGE, 403, {
        code: "DEVICE_ALREADY_REGISTERED",
      });
    }

    await tx.studentDevice.update({
      where: { id: existing.id },
      data: {
        lastSeenAt: new Date(),
        platform: input.platform.slice(0, 40),
        deviceLabel: input.deviceLabel?.slice(0, 80) ?? existing.deviceLabel,
        appVersion: input.appVersion?.slice(0, 40) ?? existing.appVersion,
      },
    });

    return {
      allowed: true as const,
      registered: true as const,
      deviceId: existing.id,
      message: "Device verified",
    };
  });
}

/** Enforce mobile device binding for protected learning. */
export async function assertStudentDeviceAllowed(
  childId: string,
  installationId: string
) {
  const device = await prisma.studentDevice.findUnique({ where: { childId } });
  if (!device || !device.isActive || device.revokedAt) {
    throw new AppError(
      "This student has no registered mobile device. Open Kids Mode once to register this phone.",
      403,
      { code: "DEVICE_NOT_REGISTERED" }
    );
  }
  if (device.installationId !== installationId) {
    throw new AppError(DEVICE_BLOCK_MESSAGE, 403, {
      code: "DEVICE_ALREADY_REGISTERED",
    });
  }
  await prisma.studentDevice.update({
    where: { id: device.id },
    data: { lastSeenAt: new Date() },
  });
}

export async function transferStudentDevice(input: {
  userId: string;
  role: string;
  childId: string;
  reason?: string;
  newInstallationId?: string;
  platform?: string;
  deviceLabel?: string;
  appVersion?: string;
}) {
  const child = await getOwnedChild(input.userId, input.childId, input.role);

  return prisma.$transaction(async (tx) => {
    const existing = await tx.studentDevice.findUnique({
      where: { childId: child.id },
    });
    const previousInstallationId = existing?.installationId ?? null;

    if (existing) {
      await tx.studentDevice.update({
        where: { id: existing.id },
        data: {
          isActive: false,
          revokedAt: new Date(),
        },
      });
      await tx.studentDevice.delete({ where: { id: existing.id } });
    }

    let newDeviceId: string | null = null;
    if (input.newInstallationId) {
      if (input.newInstallationId.length < 16) {
        throw new AppError("Invalid new installation identifier", 400);
      }
      const created = await tx.studentDevice.create({
        data: {
          childId: child.id,
          installationId: input.newInstallationId,
          platform: (input.platform ?? "unknown").slice(0, 40),
          deviceLabel: input.deviceLabel?.slice(0, 80),
          appVersion: input.appVersion?.slice(0, 40),
          isActive: true,
        },
      });
      newDeviceId = created.id;
    }

    await tx.deviceTransferEvent.create({
      data: {
        childId: child.id,
        approvedByUserId: input.userId,
        previousInstallationId,
        newInstallationId: input.newInstallationId ?? null,
        reason: input.reason?.slice(0, 300) ?? "Authorized device transfer",
        action: input.newInstallationId ? "TRANSFER" : "REVOKE",
      },
    });

    return {
      revoked: Boolean(previousInstallationId),
      registeredNew: Boolean(newDeviceId),
      previousInstallationIdSuffix: previousInstallationId?.slice(-8) ?? null,
      message: input.newInstallationId
        ? "Previous device revoked. New device registered."
        : "Device registration cleared. The next eligible phone can register.",
    };
  });
}

export async function listDeviceTransfers(childId: string, userId: string, role: string) {
  await getOwnedChild(userId, childId, role);
  return prisma.deviceTransferEvent.findMany({
    where: { childId },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
}

export { DEVICE_BLOCK_MESSAGE };
