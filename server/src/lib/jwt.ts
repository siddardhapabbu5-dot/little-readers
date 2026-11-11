import jwt from "jsonwebtoken";
import type { UserRole } from "@prisma/client";
import { env } from "../config/env.js";

export interface JwtPayload {
  sub: string;
  email: string;
  role: UserRole;
  /** Parent device session id — required for PARENT single-device enforcement. */
  sid?: string;
  /** Password version (passwordChangedAt in ms, 0 if never changed); any mismatch revokes the token. */
  pwv?: number;
  /** Issued-at (seconds) — fallback revocation check for tokens issued before `pwv` existed. */
  iat?: number;
}

export function passwordVersion(user: { passwordChangedAt: Date | null }): number {
  return user.passwordChangedAt?.getTime() ?? 0;
}

export function signAccessToken(
  payload: JwtPayload & { pwv: number },
  expiresIn?: string
): string {
  return jwt.sign(payload, env.JWT_SECRET, {
    expiresIn: (expiresIn ??
      (payload.sid ? env.ACCESS_TOKEN_EXPIRY : env.JWT_EXPIRES_IN)) as jwt.SignOptions["expiresIn"],
  });
}

export function verifyAccessToken(token: string): JwtPayload {
  const decoded = jwt.verify(token, env.JWT_SECRET);
  if (typeof decoded === "string") {
    throw new Error("Invalid token payload");
  }
  return decoded as JwtPayload;
}
