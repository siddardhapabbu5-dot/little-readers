import { randomBytes } from "node:crypto";
import { env } from "../config/env.js";
import { AppError } from "../lib/errors.js";
import { hashPassword } from "../lib/password.js";
import { prisma } from "../lib/prisma.js";

/** Default internal identity — not a real mailbox; not the Admin OTP Gmail. */
export const DEFAULT_ADMIN_DIRECT_SPONSOR_EMAIL =
  "system.sponsor@internal.learnwise";

export const ADMIN_DIRECT_SPONSOR_NAME = "System Sponsor (Admin Direct)";

export const ACCOUNT_CREATION_ADMIN_DIRECT = "ADMIN_DIRECT_SYSTEM_SPONSOR";

export function adminDirectSponsorEmail(): string {
  return (
    env.ADMIN_DIRECT_STUDENT_SPONSOR_EMAIL?.trim().toLowerCase() ||
    DEFAULT_ADMIN_DIRECT_SPONSOR_EMAIL
  );
}

export function isAdminDirectSponsorEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return email.trim().toLowerCase() === adminDirectSponsorEmail();
}

export async function isAdminDirectSponsorUserId(
  userId: string | null | undefined
): Promise<boolean> {
  if (!userId) return false;
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true, role: true },
  });
  return Boolean(
    user &&
      user.role === "PARENT" &&
      isAdminDirectSponsorEmail(user.email)
  );
}

/**
 * Idempotent ensure of the single system-managed Sponsor Parent (role PARENT).
 * Never uses Admin/Super-Admin accounts. Safe under concurrent creates.
 */
export async function ensureAdminDirectSponsorParent(): Promise<{
  id: string;
  email: string;
  name: string;
}> {
  const email = adminDirectSponsorEmail();

  const existing = await prisma.user.findUnique({
    where: { email },
    select: { id: true, email: true, name: true, role: true, isActive: true },
  });

  if (existing) {
    if (existing.role !== "PARENT") {
      throw new AppError(
        "System Sponsor Parent email is reserved and must remain a PARENT account.",
        500,
        { code: "SYSTEM_SPONSOR_ROLE_INVALID" }
      );
    }
    if (!existing.isActive) {
      await prisma.user.update({
        where: { id: existing.id },
        data: { isActive: true },
      });
    }
    return { id: existing.id, email: existing.email, name: existing.name };
  }

  const passwordHash = await hashPassword(
    `Sys${randomBytes(32).toString("base64url")}Aa1!`
  );

  try {
    const created = await prisma.user.create({
      data: {
        name: ADMIN_DIRECT_SPONSOR_NAME,
        email,
        passwordHash,
        role: "PARENT",
        isActive: true,
        mobileE164: null,
      },
      select: { id: true, email: true, name: true },
    });
    return created;
  } catch (err) {
    // Unique race: another request created it first.
    const raced = await prisma.user.findUnique({
      where: { email },
      select: { id: true, email: true, name: true, role: true },
    });
    if (raced && raced.role === "PARENT") {
      return { id: raced.id, email: raced.email, name: raced.name };
    }
    throw err;
  }
}

export function assertNotAdminDirectSponsorMutation(email: string) {
  if (isAdminDirectSponsorEmail(email)) {
    throw new AppError(
      "The system Sponsor Parent account cannot be modified or deactivated.",
      403,
      { code: "SYSTEM_SPONSOR_PROTECTED" }
    );
  }
}
