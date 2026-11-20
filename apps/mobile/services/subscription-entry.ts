import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";
import { apiRequest } from "./api";
import { getActiveChild, getUser } from "./secure";

/**
 * Unique parent subscription path (keep):
 * Dashboard/Profile → Parent PIN → Child_setup_complete?
 *   incomplete → Grade → Learning Phone → /subscription?setup=1
 *   complete   → /subscription → agreements → payment verify → receipt
 */

const SETUP_DONE_PREFIX = "lr_child_setup_done:";

type ChildRow = {
  id: string;
  displayName?: string;
  levelId?: string | null;
};

type DeviceStatus = { registered?: boolean };
type ChildGradeAccess = { childId: string; entitled?: boolean };

async function readSetupFlag(childId: string): Promise<boolean> {
  const key = `${SETUP_DONE_PREFIX}${childId}`;
  try {
    if (Platform.OS === "web") {
      return globalThis.localStorage?.getItem(key) === "1";
    }
    return (await SecureStore.getItemAsync(key)) === "1";
  } catch {
    return false;
  }
}

/** Call when Learning Phone step finishes successfully. */
export async function markChildSetupComplete(childId: string): Promise<void> {
  const key = `${SETUP_DONE_PREFIX}${childId}`;
  try {
    if (Platform.OS === "web") {
      globalThis.localStorage?.setItem(key, "1");
      return;
    }
    await SecureStore.setItemAsync(key, "1");
  } catch {
    /* non-fatal — heuristics still apply */
  }
}

async function deviceRegistered(childId: string): Promise<boolean> {
  try {
    const s = await apiRequest<DeviceStatus>(`/devices/children/${childId}`);
    return Boolean(s.registered);
  } catch {
    return false;
  }
}

async function childEntitled(childId: string): Promise<boolean> {
  try {
    const rows = await apiRequest<ChildGradeAccess[]>("/subscriptions/children");
    return Boolean(rows.find((r) => r.childId === childId)?.entitled);
  } catch {
    return false;
  }
}

/**
 * After Parent PIN unlock, pick the next screen in the unique flow.
 * Staff admins go straight to subscription tools.
 */
export async function resolveSubscriptionEntryHref(): Promise<string> {
  const user = await getUser<{ role?: string }>();
  const role = user?.role ?? "";
  if (role === "ADMIN" || role === "SUPER_ADMIN" || role === "SCHOOL_ADMIN") {
    return "/subscription";
  }

  let kids: ChildRow[] = [];
  try {
    kids = await apiRequest<ChildRow[]>("/children");
  } catch {
    return "/subscription";
  }

  if (!kids.length) {
    return "/parent";
  }

  const active = await getActiveChild<{ id: string }>();
  const ordered =
    active?.id != null
      ? ([kids.find((k) => k.id === active.id), ...kids.filter((k) => k.id !== active.id)].filter(
          Boolean
        ) as ChildRow[])
      : kids;

  for (const child of ordered) {
    if (await readSetupFlag(child.id)) {
      return "/subscription";
    }

    if (!child.levelId) {
      return `/child-setup/${child.id}`;
    }

    if (await deviceRegistered(child.id)) {
      await markChildSetupComplete(child.id);
      return "/subscription";
    }

    if (await childEntitled(child.id)) {
      await markChildSetupComplete(child.id);
      return "/subscription";
    }

    // Grade saved but Learning Phone step not finished (and not yet entitled).
    return `/child-setup/${child.id}`;
  }

  return "/subscription";
}
