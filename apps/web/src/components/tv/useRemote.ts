"use client";

import { useEffect, useRef, type RefObject } from "react";

type Dir = "up" | "down" | "left" | "right";

const KEY_DIRS: Record<string, Dir> = {
  ArrowUp: "up",
  ArrowDown: "down",
  ArrowLeft: "left",
  ArrowRight: "right",
  Up: "up",
  Down: "down",
  Left: "left",
  Right: "right",
};
/** Android DPAD keycodes (19–22) and classic arrow keycodes. */
const KEYCODE_DIRS: Record<number, Dir> = {
  19: "up",
  20: "down",
  21: "left",
  22: "right",
  38: "up",
  40: "down",
  37: "left",
  39: "right",
};
const BACK_KEYS = new Set(["Escape", "GoBack", "BrowserBack", "Back", "Backspace"]);
/** Android BACK, Escape, Backspace, Samsung/LG back. */
const BACK_KEYCODES = new Set([4, 27, 8, 10009, 461]);
/** Android DPAD_CENTER / ENTER; some TV browsers report these without key "Enter". */
const SELECT_KEYCODES = new Set([23, 66]);

function focusables(root: HTMLElement) {
  return Array.from(root.querySelectorAll<HTMLElement>("[data-tv]")).filter(
    (el) => !el.hasAttribute("disabled") && el.getClientRects().length > 0
  );
}

/** Focus the element marked data-tv-autofocus, else the first remote target. */
export function focusFirst(root: HTMLElement | null) {
  if (!root) return;
  const items = focusables(root);
  const preferred = items.find((el) => el.dataset.tvAutofocus !== undefined) ?? items[0];
  preferred?.focus();
}

function move(root: HTMLElement, dir: Dir) {
  const items = focusables(root);
  const current = document.activeElement as HTMLElement | null;
  if (!current || !items.includes(current)) {
    focusFirst(root);
    return;
  }
  const a = current.getBoundingClientRect();
  const ax = a.left + a.width / 2;
  const ay = a.top + a.height / 2;
  let best: HTMLElement | null = null;
  let bestScore = Number.POSITIVE_INFINITY;
  for (const el of items) {
    if (el === current) continue;
    const b = el.getBoundingClientRect();
    const dx = b.left + b.width / 2 - ax;
    const dy = b.top + b.height / 2 - ay;
    const primary = dir === "left" ? -dx : dir === "right" ? dx : dir === "up" ? -dy : dy;
    if (primary <= 1) continue;
    const secondary = dir === "left" || dir === "right" ? Math.abs(dy) : Math.abs(dx);
    const score = primary + secondary * 2.5;
    if (score < bestScore) {
      bestScore = score;
      best = el;
    }
  }
  if (best) {
    best.focus();
    best.scrollIntoView({ block: "nearest", inline: "nearest" });
  }
}

/**
 * TV remote support: D-pad moves focus between [data-tv] elements, OK/Enter presses the
 * focused button, Back/Escape calls onBack. onBack returns false when there is nowhere
 * left to go, so the browser's own back can leave the page.
 */
export function useRemote(rootRef: RefObject<HTMLElement | null>, onBack: () => boolean) {
  const backRef = useRef(onBack);
  backRef.current = onBack;

  useEffect(() => {
    let lastBack = 0;
    const back = () => {
      const now = Date.now();
      if (now - lastBack < 400) return true;
      lastBack = now;
      return backRef.current();
    };

    function onKey(e: KeyboardEvent) {
      const root = rootRef.current;
      if (!root) return;
      const dir = KEY_DIRS[e.key] ?? KEYCODE_DIRS[e.keyCode];
      if (dir) {
        e.preventDefault();
        move(root, dir);
        return;
      }
      if (e.key === "Enter" || SELECT_KEYCODES.has(e.keyCode)) {
        const el = document.activeElement as HTMLElement | null;
        if (el?.dataset.tv !== undefined) {
          e.preventDefault();
          if (!e.repeat) el.click();
        }
        return;
      }
      if (BACK_KEYS.has(e.key) || BACK_KEYCODES.has(e.keyCode)) {
        e.preventDefault();
        back();
      }
    }

    function onPop() {
      if (back()) window.history.pushState({ lwTv: true }, "");
      else window.history.back();
    }

    function onPointer(e: MouseEvent) {
      const target = (e.target as HTMLElement | null)?.closest<HTMLElement>("[data-tv]");
      if (target && !target.hasAttribute("disabled") && document.activeElement !== target) {
        target.focus({ preventScroll: true });
      }
    }

    window.history.pushState({ lwTv: true }, "");
    window.addEventListener("keydown", onKey);
    window.addEventListener("popstate", onPop);
    window.addEventListener("mouseover", onPointer);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("popstate", onPop);
      window.removeEventListener("mouseover", onPointer);
    };
  }, [rootRef]);
}
