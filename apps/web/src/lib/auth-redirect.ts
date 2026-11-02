import type { AuthUser } from "@little-readers/types";

/** Role-based post-login destinations. Honours optional `next` when safe. */
export function resolvePostLoginPath(
  user: Pick<AuthUser, "role">,
  nextPath?: string | null
): string {
  if (nextPath && nextPath.startsWith("/") && !nextPath.startsWith("//")) {
    return nextPath;
  }

  switch (user.role) {
    case "SUPER_ADMIN":
      return "/super-admin";
    case "ADMIN":
      return "/admin";
    case "SCHOOL_ADMIN":
      return "/school";
    case "TEACHER":
      return "/teacher";
    case "STUDENT":
      return "/kids";
    case "PARENT":
    default:
      return "/parent";
  }
}
