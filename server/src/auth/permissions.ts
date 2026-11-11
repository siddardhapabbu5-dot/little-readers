import type { NextFunction, Response } from "express";
import type { UserRole } from "@prisma/client";
import { AppError } from "../lib/errors.js";
import type { AuthenticatedRequest } from "../middleware/auth.js";

/**
 * Server-side permission matrix. Routes check a permission, never a role list, so changing who may
 * do what happens here only. The mobile admin UI reads the same list from GET /auth/me.
 */
export const PERMISSIONS = {
  /** Create, edit, publish and import learning content. */
  "content.manage": ["ADMIN", "SUPER_ADMIN"],
  /** Bulk or structural deletes: clear all words, delete grades / levels / groups / topics. */
  "content.destroy": ["SUPER_ADMIN"],
  "users.manage": ["ADMIN", "SUPER_ADMIN"],
  "admins.manage": ["SUPER_ADMIN"],
  "payments.manage": ["ADMIN", "SUPER_ADMIN"],
  "schools.manage": ["ADMIN", "SUPER_ADMIN", "SCHOOL_ADMIN"],
  "classrooms.teach": ["TEACHER", "SCHOOL_ADMIN", "ADMIN", "SUPER_ADMIN"],
  "family.manage": ["PARENT", "ADMIN", "SUPER_ADMIN"],
} as const satisfies Record<string, readonly UserRole[]>;

export type Permission = keyof typeof PERMISSIONS;

export function hasPermission(role: UserRole | string | undefined, permission: Permission): boolean {
  return Boolean(role) && (PERMISSIONS[permission] as readonly string[]).includes(role as string);
}

export function permissionsForRole(role: UserRole | string): Permission[] {
  return (Object.keys(PERMISSIONS) as Permission[]).filter((p) => hasPermission(role, p));
}

export function requirePermission(permission: Permission) {
  return (req: AuthenticatedRequest, _res: Response, next: NextFunction) => {
    if (!req.user) return next(new AppError("Authentication required", 401));
    if (!hasPermission(req.user.role, permission)) {
      return next(new AppError("You don't have permission to do this.", 403, { code: "PERMISSION_DENIED", permission }));
    }
    return next();
  };
}
