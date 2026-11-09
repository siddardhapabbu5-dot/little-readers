import { AppError } from "../lib/errors.js";
import { prisma } from "../lib/prisma.js";

type Actor = { id: string; role: string };

/**
 * Soft-deactivate / reactivate platform users without deleting learning history.
 * - SUPER_ADMIN may manage ADMIN / PARENT / TEACHER / SCHOOL_ADMIN (not other SUPER_ADMIN).
 * - ADMIN may manage PARENT / TEACHER only (not ADMIN / SUPER_ADMIN).
 */
export async function listPlatformUsers(
  actor: Actor,
  filters?: { q?: string; role?: string; isActive?: boolean }
) {
  if (actor.role !== "ADMIN" && actor.role !== "SUPER_ADMIN") {
    throw new AppError("Insufficient permissions", 403);
  }

  const allowedRoles: readonly string[] =
    actor.role === "SUPER_ADMIN"
      ? (["PARENT", "TEACHER", "SCHOOL_ADMIN", "ADMIN"] as const)
      : (["PARENT", "TEACHER"] as const);

  const roleFilter = filters?.role
    ? allowedRoles.includes(filters.role)
      ? [filters.role]
      : []
    : [...allowedRoles];

  if (!roleFilter.length) {
    throw new AppError("Role not permitted", 403);
  }

  const q = filters?.q?.trim();
  return prisma.user.findMany({
    where: {
      role: { in: roleFilter as ("PARENT" | "TEACHER" | "SCHOOL_ADMIN" | "ADMIN")[] },
      ...(filters?.isActive !== undefined ? { isActive: filters.isActive } : {}),
      ...(q
        ? {
            OR: [
              { email: { contains: q, mode: "insensitive" } },
              { name: { contains: q, mode: "insensitive" } },
              { mobileE164: { contains: q } },
            ],
          }
        : {}),
    },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      isActive: true,
      mobileE164: true,
      createdAt: true,
      _count: { select: { children: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
}

export async function setUserActiveStatus(
  actor: Actor,
  userId: string,
  isActive: boolean
) {
  if (actor.role !== "ADMIN" && actor.role !== "SUPER_ADMIN") {
    throw new AppError("Insufficient permissions", 403);
  }
  if (userId === actor.id) {
    throw new AppError("You cannot change your own account status here", 400);
  }

  const target = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, role: true, isActive: true, email: true, name: true },
  });
  if (!target) throw new AppError("User not found", 404);

  if (target.role === "SUPER_ADMIN") {
    throw new AppError("Cannot change Super Admin status via this API", 403);
  }
  if (actor.role === "ADMIN" && (target.role === "ADMIN" || target.role === "SCHOOL_ADMIN")) {
    throw new AppError("Only Super Admin can manage admin accounts", 403);
  }
  if (
    actor.role === "ADMIN" &&
    target.role !== "PARENT" &&
    target.role !== "TEACHER"
  ) {
    throw new AppError("Insufficient permissions for this role", 403);
  }

  const updated = await prisma.user.update({
    where: { id: userId },
    data: { isActive },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      isActive: true,
    },
  });

  // Soft-deactivate does not delete children or learning history.
  return {
    user: updated,
    note: isActive
      ? "Account reactivated. Learning history was preserved."
      : "Account deactivated. Student learning history was preserved.",
  };
}

export async function createAdminUser(
  actor: Actor,
  input: { name: string; email: string; password: string; role: "ADMIN" | "SCHOOL_ADMIN" }
) {
  if (actor.role !== "SUPER_ADMIN") {
    throw new AppError("Only Super Admin can create admin accounts", 403);
  }
  const { default: bcrypt } = await import("bcryptjs");
  const existing = await prisma.user.findFirst({
    where: { email: input.email.trim().toLowerCase() },
  });
  if (existing) throw new AppError("Email already registered", 409);

  const passwordHash = await bcrypt.hash(input.password, 10);
  return prisma.user.create({
    data: {
      name: input.name.trim(),
      email: input.email.trim().toLowerCase(),
      passwordHash,
      role: input.role,
      isActive: true,
    },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      isActive: true,
      createdAt: true,
    },
  });
}
