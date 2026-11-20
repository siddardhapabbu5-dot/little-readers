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

/** Architecture B student principal — not a UserRole. */
export interface StudentJwtPayload {
  principal: "CHILD";
  sub: string; // childId
  childId: string;
  parentId: string;
  credentialId: string;
  studentLoginId: string;
  /** ChildStudentSession id */
  sid: string;
  /** Credential sessionVersion */
  sv: number;
  iat?: number;
}

export function signStudentAccessToken(
  payload: Omit<StudentJwtPayload, "principal" | "sub">,
  expiresIn?: string
): string {
  const body: StudentJwtPayload = {
    principal: "CHILD",
    sub: payload.childId,
    ...payload,
  };
  return jwt.sign(body, env.JWT_SECRET, {
    expiresIn: (expiresIn ?? env.ACCESS_TOKEN_EXPIRY) as jwt.SignOptions["expiresIn"],
  });
}

export function verifyStudentAccessToken(token: string): StudentJwtPayload {
  const decoded = jwt.verify(token, env.JWT_SECRET);
  if (typeof decoded === "string" || (decoded as StudentJwtPayload).principal !== "CHILD") {
    throw new Error("Invalid student token");
  }
  return decoded as StudentJwtPayload;
}

export function isStudentJwtPayload(payload: unknown): payload is StudentJwtPayload {
  return Boolean(
    payload &&
      typeof payload === "object" &&
      (payload as StudentJwtPayload).principal === "CHILD" &&
      typeof (payload as StudentJwtPayload).childId === "string"
  );
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
  if ((decoded as StudentJwtPayload).principal === "CHILD") {
    throw new Error("Student token is not a user access token");
  }
  return decoded as JwtPayload;
}
