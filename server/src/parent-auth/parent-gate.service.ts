import { consumeEmailVerification } from "../auth/email-otp.service.js";
import { AppError } from "../lib/errors.js";
import { assertNotLocked, clearFailedAttempts, recordFailedAttempt } from "../lib/lockout.js";
import { prisma } from "../lib/prisma.js";
import { hashPassword, verifyPassword } from "../lib/password.js";

const PIN_RE = /^\d{4,6}$/;

function assertPinFormat(pin: string) {
  if (!PIN_RE.test(pin)) {
    throw new AppError("PIN must be 4–6 digits", 400, { code: "INVALID_PIN" });
  }
}

export async function getParentGateStatus(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { parentPinHash: true, role: true, parentPinLockedUntil: true },
  });
  if (!user) throw new AppError("User not found", 404);
  const locked = Boolean(user.parentPinLockedUntil && user.parentPinLockedUntil.getTime() > Date.now());
  return {
    pinSet: Boolean(user.parentPinHash),
    required: user.role === "PARENT" || !user.parentPinHash,
    lockedUntil: locked ? user.parentPinLockedUntil : null,
  };
}

export async function setParentPin(userId: string, pin: string) {
  assertPinFormat(pin);
  const existing = await prisma.user.findUnique({
    where: { id: userId },
    select: { parentPinHash: true },
  });
  if (!existing) throw new AppError("User not found", 404);
  // Creating a PIN is first-time only; otherwise anyone holding the device could replace it.
  if (existing.parentPinHash) {
    throw new AppError("A Parent PIN is already set. Enter your existing PIN.", 409, {
      code: "PIN_ALREADY_SET",
    });
  }
  const parentPinHash = await hashPassword(pin);
  await prisma.user.update({
    where: { id: userId },
    data: { parentPinHash, parentPinUpdatedAt: new Date() },
  });
  return { pinSet: true };
}

export async function verifyParentPin(userId: string, pin: string) {
  assertPinFormat(pin);
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { parentPinHash: true, parentPinFailedCount: true, parentPinLockedUntil: true },
  });
  if (!user?.parentPinHash) {
    throw new AppError("Create a parent PIN first", 400, {
      code: "PIN_NOT_SET",
    });
  }
  assertNotLocked("pin", user.parentPinLockedUntil);
  const ok = await verifyPassword(pin, user.parentPinHash);
  if (!ok) {
    await recordFailedAttempt("pin", userId);
    throw new AppError("Incorrect PIN", 401, { code: "PIN_INVALID" });
  }
  if (user.parentPinFailedCount > 0 || user.parentPinLockedUntil) {
    await clearFailedAttempts("pin", userId);
  }
  return {
    verified: true,
    /** Client may unlock adult tools for this many seconds. */
    unlockSeconds: 600,
  };
}

/**
 * Forgot PIN: an emailed RESET_PIN code (or the account password) proves the adult,
 * then a new PIN replaces the old one and clears any PIN lock.
 */
export async function resetParentPin(
  userId: string,
  proof: { verificationToken?: string; password?: string },
  pin: string
) {
  assertPinFormat(pin);
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true, passwordHash: true, isActive: true, loginLockedUntil: true },
  });
  if (!user || !user.isActive) throw new AppError("User not found", 404);
  if (!proof.verificationToken) {
    assertNotLocked("login", user.loginLockedUntil);
    if (!proof.password || !(await verifyPassword(proof.password, user.passwordHash))) {
      await recordFailedAttempt("login", userId);
      throw new AppError("Account password is incorrect.", 401, { code: "PASSWORD_INVALID" });
    }
  }
  const parentPinHash = await hashPassword(pin);
  await prisma.$transaction(async (tx) => {
    if (proof.verificationToken) {
      await consumeEmailVerification(tx, {
        email: user.email,
        purpose: "RESET_PIN",
        verificationToken: proof.verificationToken,
      });
    }
    await tx.user.update({
      where: { id: userId },
      data: { parentPinHash, parentPinUpdatedAt: new Date(), parentPinFailedCount: 0, parentPinLockedUntil: null },
    });
  });
  return { pinSet: true };
}
