import { AppError } from "./errors.js";
import { prisma } from "./prisma.js";

export const MAX_FAILED_ATTEMPTS = 5;
export const LOCKOUT_MINUTES = 15;

type Kind = "login" | "pin";

const FIELDS = {
  login: { code: "ACCOUNT_LOCKED", what: "sign-in" },
  pin: { code: "PIN_LOCKED", what: "PIN" },
} as const;

function lockedError(kind: Kind, until: Date) {
  const minutes = Math.max(1, Math.ceil((until.getTime() - Date.now()) / 60_000));
  return new AppError(
    `Too many incorrect ${FIELDS[kind].what} attempts. Try again in ${minutes} minute${minutes === 1 ? "" : "s"}.`,
    429,
    { code: FIELDS[kind].code, retryAfterSeconds: Math.ceil((until.getTime() - Date.now()) / 1000) }
  );
}

/** Throws 429 while the account is locked for this kind of secret. */
export function assertNotLocked(kind: Kind, lockedUntil: Date | null | undefined) {
  if (lockedUntil && lockedUntil.getTime() > Date.now()) throw lockedError(kind, lockedUntil);
}

/** Counts a wrong secret atomically; the attempt that reaches the limit locks the account. */
export async function recordFailedAttempt(kind: Kind, userId: string) {
  const updated = await prisma.user.update({
    where: { id: userId },
    data:
      kind === "login"
        ? { failedLoginCount: { increment: 1 } }
        : { parentPinFailedCount: { increment: 1 } },
    select: { failedLoginCount: true, parentPinFailedCount: true },
  });
  const count = kind === "login" ? updated.failedLoginCount : updated.parentPinFailedCount;
  if (count >= MAX_FAILED_ATTEMPTS) {
    const until = new Date(Date.now() + LOCKOUT_MINUTES * 60_000);
    await setLock(kind, userId, until);
    throw lockedError(kind, until);
  }
}

export async function clearFailedAttempts(kind: Kind, userId: string) {
  await setLock(kind, userId, null);
}

function setLock(kind: Kind, userId: string, until: Date | null) {
  return prisma.user.update({
    where: { id: userId },
    data:
      kind === "login"
        ? { failedLoginCount: 0, loginLockedUntil: until }
        : { parentPinFailedCount: 0, parentPinLockedUntil: until },
  });
}
