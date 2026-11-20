type UnauthorizedHandler = () => void;

let unauthorizedHandler: UnauthorizedHandler | null = null;

export function setUnauthorizedHandler(handler: UnauthorizedHandler | null) {
  unauthorizedHandler = handler;
}

export function notifyUnauthorized() {
  unauthorizedHandler?.();
}

/**
 * Stale in-flight 401s must not wipe a newer session (e.g. Admin → logout → Student login).
 * Only clear when the failing bearer is still the active token.
 */
export function shouldClearSessionForUnauthorized(
  requestAuth: string | undefined,
  currentToken: string | null | undefined
): boolean {
  if (!requestAuth) return false;
  if (!currentToken) return false;
  return currentToken === requestAuth;
}
