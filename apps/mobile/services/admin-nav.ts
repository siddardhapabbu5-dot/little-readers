import type { Router } from "expo-router";

/** Prefer history back; if none (refresh / deep link), go to Admin dashboard. */
export function goAdminBack(router: Pick<Router, "back" | "canGoBack" | "replace">) {
  if (router.canGoBack()) {
    router.back();
    return;
  }
  router.replace("/admin");
}
