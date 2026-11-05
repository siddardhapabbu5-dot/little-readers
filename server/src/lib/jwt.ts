import jwt from "jsonwebtoken";
import type { UserRole } from "@prisma/client";
import { env } from "../config/env.js";

export interface JwtPayload {
  sub: string;
  email: string;
  role: UserRole;
  /** Parent device session id — required for PARENT single-device enforcement. */
  sid?: string;
  /** Issued-at (seconds) — used to revoke JWTs after Admin password reset. */
  iat?: number;
}

export function signAccessToken(
  payload: JwtPayload,
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
