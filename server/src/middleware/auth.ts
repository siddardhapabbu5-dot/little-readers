import type { NextFunction, Request, Response } from "express";
import type { UserRole } from "@prisma/client";
import { AppError } from "../lib/errors.js";
import { verifyAccessToken } from "../lib/jwt.js";
import { prisma } from "../lib/prisma.js";
import { assertActiveParentSession } from "../parent-auth/session.service.js";

export interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    email: string;
    role: UserRole;
    name: string;
  };
  /** Present when PARENT access JWT includes sid (OTP device session). */
  parentSessionId?: string;
}

export async function requireAuth(
  req: AuthenticatedRequest,
  _res: Response,
  next: NextFunction
) {
  try {
    const header = req.headers.authorization;
    if (!header?.startsWith("Bearer ")) {
      throw new AppError("Authentication required", 401);
    }

    const token = header.slice("Bearer ".length).trim();
    const payload = verifyAccessToken(token);

    const user = await prisma.user.findUnique({
      where: { id: payload.sub },
      select: {
        id: true,
        email: true,
        role: true,
        name: true,
        isActive: true,
        passwordChangedAt: true,
      },
    });

    if (!user || !user.isActive) {
      throw new AppError("Invalid or inactive account", 401);
    }

    // Admin password reset revokes prior JWTs by bumping passwordChangedAt.
    if (
      user.passwordChangedAt &&
      typeof payload.iat === "number" &&
      payload.iat * 1000 < user.passwordChangedAt.getTime()
    ) {
      throw new AppError("Session expired. Please sign in again.", 401, {
        code: "SESSION_REVOKED",
      });
    }

    req.user = {
      id: user.id,
      email: user.email,
      role: user.role,
      name: user.name,
    };

    // Parent OTP sessions: JWT must match an ACTIVE ParentDeviceSession.
    // Admin / Super Admin skip. Legacy email PARENT tokens without sid skip
    // (web parent email login remains valid until they switch to OTP).
    if (user.role === "PARENT" && payload.sid) {
      await assertActiveParentSession({
        parentId: user.id,
        sessionId: payload.sid,
      });
      req.parentSessionId = payload.sid;
    }

    next();
  } catch (error) {
    if (error instanceof AppError) return next(error);
    return next(new AppError("Invalid or expired token", 401));
  }
}

export function requireRoles(...roles: UserRole[]) {
  return (req: AuthenticatedRequest, _res: Response, next: NextFunction) => {
    if (!req.user) {
      return next(new AppError("Authentication required", 401));
    }
    if (!roles.includes(req.user.role)) {
      return next(new AppError("Insufficient permissions", 403));
    }
    return next();
  };
}
