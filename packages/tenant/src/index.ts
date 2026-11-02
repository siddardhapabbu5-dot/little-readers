import type { PlatformRole } from "@little-readers/types";

/**
 * Request-scoped tenant context.
 * Populated by auth/tenant middleware in Phase 2.
 */
export interface TenantContext {
  actorId: string;
  role: PlatformRole;
  /** Null only for SUPER_ADMIN platform-wide operations. */
  schoolId: string | null;
}

export class TenantIsolationError extends Error {
  constructor(message = "Cross-tenant access is not allowed") {
    super(message);
    this.name = "TenantIsolationError";
  }
}

/** Assert a record belongs to the active school tenant. */
export function assertSameSchool(
  ctx: TenantContext,
  recordSchoolId: string | null | undefined
): void {
  if (ctx.role === "SUPER_ADMIN") return;
  if (!ctx.schoolId || !recordSchoolId || ctx.schoolId !== recordSchoolId) {
    throw new TenantIsolationError();
  }
}

export function requireSchoolId(ctx: TenantContext): string {
  if (ctx.role === "SUPER_ADMIN" && !ctx.schoolId) {
    throw new TenantIsolationError(
      "schoolId is required for this super-admin operation"
    );
  }
  if (!ctx.schoolId) {
    throw new TenantIsolationError("Missing school tenant context");
  }
  return ctx.schoolId;
}
