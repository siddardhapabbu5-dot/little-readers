/**
 * In-memory Parent PIN unlock state. Never persisted, so a refresh or app
 * restart always re-locks. Only a successful server PIN verification unlocks.
 */
let unlockUntil = 0;
const listeners = new Set<() => void>();

function notify() {
  for (const fn of listeners) fn();
}

export function isParentGateUnlocked() {
  return unlockUntil > Date.now();
}

export function unlockParentGate(seconds: number) {
  unlockUntil = Date.now() + seconds * 1000;
  notify();
}

export function lockParentGate() {
  if (unlockUntil === 0) return;
  unlockUntil = 0;
  notify();
}

export function subscribeParentGate(fn: () => void) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

const PROTECTED_PREFIXES = [
  "/parent",
  "/parent-challenges",
  "/child",
  "/child-setup",
  "/subscription",
  "/agreements",
  "/receipt",
  "/payment-return",
  "/devices",
  "/tv-connect",
  "/privacy-request",
  "/change-password",
];

/** Screens that may be opened from parent tools without ending the unlock. */
const NEUTRAL_PREFIXES = ["/certificate", "/legal"];

function matches(pathname: string, prefixes: string[]) {
  return prefixes.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export function isParentProtectedPath(pathname: string) {
  return matches(pathname, PROTECTED_PREFIXES);
}

/** Leaving the parent area (Kids Zone, login, etc.) ends the unlock. */
export function shouldLockOnPath(pathname: string) {
  return !matches(pathname, PROTECTED_PREFIXES) && !matches(pathname, NEUTRAL_PREFIXES);
}
