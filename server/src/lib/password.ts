import bcrypt from "bcryptjs";
import { env } from "../config/env.js";

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, env.BCRYPT_ROUNDS);
}

export async function verifyPassword(
  password: string,
  passwordHash: string
): Promise<boolean> {
  return bcrypt.compare(password, passwordHash);
}

/**
 * Login password check with compatibility for historical trim asymmetry.
 *
 * Contract:
 * - Registration / reset / change hash the password as submitted (no silent trim).
 * - Login verifies the exact submitted password first.
 * - If that fails and the value has leading/trailing whitespace, also try the
 *   trimmed form so accidental edge spaces still work for normal accounts.
 * - Internal spaces are always preserved on the primary attempt.
 * - Never re-hashes or migrates stored credentials.
 */
export async function verifyLoginPassword(
  password: string,
  passwordHash: string
): Promise<boolean> {
  if (await verifyPassword(password, passwordHash)) return true;
  const trimmed = password.trim();
  if (trimmed !== password && trimmed.length > 0) {
    return verifyPassword(trimmed, passwordHash);
  }
  return false;
}
