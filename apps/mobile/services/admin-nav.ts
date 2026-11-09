import type { Router } from "expo-router";
import { apiRequest } from "./api";
import { saveActiveChild } from "./secure";

/** Prefer history back; if none (refresh / deep link), go to Admin dashboard. */
export function goAdminBack(router: Pick<Router, "back" | "canGoBack" | "replace">) {
  if (router.canGoBack()) {
    router.back();
    return;
  }
  router.replace("/admin");
}

/** Selects the admin's own Practice learner (created on first use) for games, Learn and TV. */
export async function selectAdminPracticeLearner() {
  const child = await apiRequest<{ id: string; displayName: string }>("/children/admin-practice", {
    method: "POST",
  });
  await saveActiveChild(child);
  return child;
}
