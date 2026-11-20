import type { NextFunction, Response } from "express";
import jwt from "jsonwebtoken";
import { env } from "../config/env.js";
import { AppError } from "../lib/errors.js";
import { isStudentJwtPayload } from "../lib/jwt.js";
import { requireAuth, type AuthenticatedRequest } from "./auth.js";
import {
  requireStudentAuth,
  type StudentAuthenticatedRequest,
} from "./student-auth.js";

/**
 * Accepts Parent/Admin user JWT or Architecture B student JWT.
 * Does not mix principals: either req.user or req.student is set.
 */
export async function requireUserOrStudentAuth(
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
    const decoded = jwt.verify(token, env.JWT_SECRET);
    if (isStudentJwtPayload(decoded)) {
      return requireStudentAuth(req, res, next);
    }
  } catch {
    // fall through — requireAuth will produce the error
  }
  return requireAuth(req as AuthenticatedRequest, res, next);
}
