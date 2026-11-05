import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

const TOKEN_KEY = "lr_access_token";
const REFRESH_KEY = "lr_refresh_token";
const INSTALL_KEY = "lr_installation_id";
const USER_KEY = "lr_user_json";
const CHILD_KEY = "lr_active_child";
const SESSION_REVOKED_MSG_KEY = "lr_session_revoked_msg";
/** Bump when shipping a client “fresh app” so old demo sessions are cleared once. */
const FRESH_BUILD_KEY = "lr_fresh_build_marker";
export const CLIENT_FRESH_BUILD_MARKER = "client-v1";

const memory = new Map<string, string>();

async function getItem(key: string): Promise<string | null> {
  if (Platform.OS === "web") {
    try {
      return globalThis.localStorage?.getItem(key) ?? memory.get(key) ?? null;
    } catch {
      return memory.get(key) ?? null;
    }
  }
  return SecureStore.getItemAsync(key);
}

async function setItem(key: string, value: string): Promise<void> {
  if (Platform.OS === "web") {
    memory.set(key, value);
    try {
      globalThis.localStorage?.setItem(key, value);
    } catch {
      /* private mode */
    }
    return;
  }
  await SecureStore.setItemAsync(key, value);
}

async function deleteItem(key: string): Promise<void> {
  if (Platform.OS === "web") {
    memory.delete(key);
    try {
      globalThis.localStorage?.removeItem(key);
    } catch {
      /* private mode */
    }
    return;
  }
  await SecureStore.deleteItemAsync(key);
}

function randomId() {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let out = `lr_${Platform.OS}_`;
  for (let i = 0; i < 40; i += 1) {
    out += chars[Math.floor(Math.random() * chars.length)];
  }
  return out;
}

export async function getOrCreateInstallationId(): Promise<string> {
  const existing = await getItem(INSTALL_KEY);
  if (existing && existing.length >= 16) return existing;
  const created = randomId();
  await setItem(INSTALL_KEY, created);
  return created;
}

export async function saveToken(token: string) {
  await setItem(TOKEN_KEY, token);
}

export async function getToken() {
  return getItem(TOKEN_KEY);
}

export async function clearToken() {
  await deleteItem(TOKEN_KEY);
}

export async function saveRefreshToken(token: string) {
  await setItem(REFRESH_KEY, token);
}

export async function getRefreshToken() {
  return getItem(REFRESH_KEY);
}

export async function clearRefreshToken() {
  await deleteItem(REFRESH_KEY);
}

export async function saveSessionRevokedMessage(message: string) {
  await setItem(SESSION_REVOKED_MSG_KEY, message);
}

export async function consumeSessionRevokedMessage() {
  const msg = await getItem(SESSION_REVOKED_MSG_KEY);
  await deleteItem(SESSION_REVOKED_MSG_KEY);
  return msg;
}

export async function saveUser(user: unknown) {
  await setItem(USER_KEY, JSON.stringify(user));
}

export async function getUser<T>() {
  const raw = await getItem(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export async function clearUser() {
  await deleteItem(USER_KEY);
}

export async function saveActiveChild(child: unknown) {
  await setItem(CHILD_KEY, JSON.stringify(child));
}

export async function getActiveChild<T>() {
  const raw = await getItem(CHILD_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export async function clearActiveChild() {
  await deleteItem(CHILD_KEY);
}

export async function clearSession() {
  await clearToken();
  await clearRefreshToken();
  await clearUser();
  await clearActiveChild();
  // Intentionally keep INSTALL_KEY so reinstall-without-secure-wipe still binds,
  // and logout does not release device registration.
}

let freshStartPromise: Promise<boolean> | null = null;

/**
 * One-time wipe of login/session when delivering a fresh client build.
 * Keeps installation id (device lock). Safe to call on every cold start.
 */
export function ensureClientFreshStart() {
  if (!freshStartPromise) {
    freshStartPromise = (async () => {
      const marker = await getItem(FRESH_BUILD_KEY);
      if (marker === CLIENT_FRESH_BUILD_MARKER) return false;
      await clearSession();
      await setItem(FRESH_BUILD_KEY, CLIENT_FRESH_BUILD_MARKER);
      return true;
    })();
  }
  return freshStartPromise;
}
