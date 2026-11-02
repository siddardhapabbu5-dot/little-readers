const CHILD_KEY = "lr_active_child";

export interface ActiveChild {
  id: string;
  displayName: string;
  birthYear: number;
  level: string;
}

export function saveActiveChild(child: ActiveChild) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(CHILD_KEY, JSON.stringify(child));
}

export function getActiveChild(): ActiveChild | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(CHILD_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as ActiveChild;
  } catch {
    return null;
  }
}

export function clearActiveChild() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(CHILD_KEY);
}
