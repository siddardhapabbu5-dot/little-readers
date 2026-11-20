/**
 * Profile photos are stored on User accounts (Parent/Admin).
 * Student JWTs are CHILD principals — GET/PUT /auth/me/avatar uses requireAuth
 * and returns 401, which the API client treats as session death (notifyUnauthorized).
 *
 * There is no student avatar API in the current backend. Students must show the
 * default/fallback avatar and never call User-only avatar routes.
 */
export function canUseUserAvatarApi(
  role: string | null | undefined
): boolean {
  if (!role) return false;
  return role !== "STUDENT";
}

/** Path used only when canUseUserAvatarApi(role) is true. */
export const USER_AVATAR_PATH = "/auth/me/avatar" as const;
