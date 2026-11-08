/** In-memory cache of the signed-in user's profile photo; cleared on logout. */
let cachedAvatar: string | null | undefined;
const listeners = new Set<(url: string | null) => void>();

export function getCachedAvatar() {
  return cachedAvatar;
}

export function publishAvatar(url: string | null) {
  cachedAvatar = url;
  listeners.forEach((fn) => fn(url));
}

export function subscribeAvatar(fn: (url: string | null) => void) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function clearAvatarCache() {
  cachedAvatar = undefined;
  listeners.forEach((fn) => fn(null));
}
