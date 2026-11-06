import { AppError } from "../lib/errors.js";
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
    select: { parentPinHash: true, role: true },
  });
  if (!user) throw new AppError("User not found", 404);
  return {
    pinSet: Boolean(user.parentPinHash),
    required: user.role === "PARENT" || !user.parentPinHash,
  };
}

export async function setParentPin(userId: string, pin: string) {
  assertPinFormat(pin);
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
    select: { parentPinHash: true },
  });
  if (!user?.parentPinHash) {
    throw new AppError("Create a parent PIN first", 400, {
      code: "PIN_NOT_SET",
    });
  }
  const ok = await verifyPassword(pin, user.parentPinHash);
  if (!ok) {
    throw new AppError("Incorrect PIN", 401, { code: "PIN_INVALID" });
  }
  return {
    verified: true,
    /** Client may unlock adult tools for this many seconds. */
    unlockSeconds: 600,
  };
}
