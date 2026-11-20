import type { NextFunction, Response } from "express";
import { AppError } from "../lib/errors.js";
import { verifyStudentAccessToken } from "../lib/jwt.js";
import { prisma } from "../lib/prisma.js";
import { assertActiveStudentSession } from "../student-auth/student-session.service.js";
import type { AuthenticatedRequest } from "./auth.js";

export interface StudentAuthenticatedRequest extends AuthenticatedRequest {
  student?: {
    childId: string;
    parentId: string;
    credentialId: string;
    studentLoginId: string;
    displayName: string;
    sessionId: string;
  };
}

export async function requireStudentAuth(
  req: StudentAuthenticatedRequest,
  _res: Response,
  next: NextFunction
) {
  try {
    const header = req.headers.authorization;
    if (!header?.startsWith("Bearer ")) {
      throw new AppError("Authentication required", 401);
    }
    const token = header.slice("Bearer ".length).trim();
    const payload = verifyStudentAccessToken(token);

    const credential = await prisma.childStudentCredential.findUnique({
      where: { id: payload.credentialId },
      include: {
        child: {
          select: { id: true, parentId: true, displayName: true, isActive: true },
        },
      },
    });

    if (
      !credential ||
      !credential.isActive ||
      !credential.child.isActive ||
      credential.childId !== payload.childId
    ) {
      throw new AppError("Invalid or inactive student account", 401);
    }

    await assertActiveStudentSession({
      childId: credential.childId,
      sessionId: payload.sid,
      sessionVersion: payload.sv,
      credentialSessionVersion: credential.sessionVersion,
    });

    req.student = {
      childId: credential.childId,
      parentId: credential.child.parentId,
      credentialId: credential.id,
      studentLoginId: credential.studentLoginId,
      displayName: credential.child.displayName,
      sessionId: payload.sid,
    };

    next();
  } catch (error) {
    if (error instanceof AppError) return next(error);
    return next(new AppError("Invalid or expired token", 401));
  }
}

/** Allow either parent/admin JWT or student JWT; normalizes parentId/childId helpers. */
export async function requireParentOrStudent(
  req: StudentAuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    return next(new AppError("Authentication required", 401));
  }
  const token = header.slice("Bearer ".length).trim();
  try {
    const jwt = await import("jsonwebtoken");
    const { env } = await import("../config/env.js");
    const { isStudentJwtPayload } = await import("../lib/jwt.js");
    const decoded = jwt.default.verify(token, env.JWT_SECRET);
    if (isStudentJwtPayload(decoded)) {
      return requireStudentAuth(req, res, next);
    }
  } catch {
    // fall through to user auth
  }
  const { requireAuth } = await import("./auth.js");
  return requireAuth(req, res, next);
}
