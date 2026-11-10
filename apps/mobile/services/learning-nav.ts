import type { Router } from "expo-router";
import type { MixMode } from "@little-readers/shared";

export type LearningActivity =
  | "LISTEN_SPELL"
  | "MATCHING"
  | "QUIZ"
  | "REVISION";

type LevelMeta = { code: string; sortOrder?: number; wordCount?: number };

/**
 * Learn, Games and Home must show the same level: the child's assigned level.
 * Falls back to the first level with content only when the child has none.
 */
export function resolveChildLevel(
  childLevel: string | null | undefined,
  levels: LevelMeta[]
): string {
  if (childLevel && levels.some((l) => l.code === childLevel)) return childLevel;
  const sorted = [...levels].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
  return sorted.find((l) => (l.wordCount ?? 0) > 0)?.code ?? sorted[0]?.code ?? childLevel ?? "";
}

/** Open a learning activity for a category (Listen/Spell stays on /play). */
export function openLearningActivity(
  router: Router,
  opts: {
    activity: LearningActivity;
    categoryId: string;
    childId: string;
    title?: string;
    startRound?: "LISTEN" | "SPELL";
    /** Mixed-category session (Daily Challenge, Revision World, Mixed Games). */
    mix?: MixMode;
    /** Picked by Surprise Game (earns Surprise points). */
    surprise?: boolean;
  }
) {
  const base = {
    categoryId: opts.categoryId,
    childId: opts.childId,
    title: opts.title ?? "Learn",
    ...(opts.mix ? { mix: opts.mix } : {}),
    ...(opts.surprise && !opts.mix ? { surprise: "1" } : {}),
  };

  if (opts.activity === "MATCHING") {
    router.push({ pathname: "/matching", params: base });
    return;
  }
  if (opts.activity === "QUIZ") {
    router.push({ pathname: "/quiz", params: base });
    return;
  }
  if (opts.activity === "REVISION") {
    router.push({ pathname: "/revision", params: base });
    return;
  }

  router.push({
    pathname: "/play",
    params: {
      ...base,
      ...(opts.startRound ? { startRound: opts.startRound } : {}),
    },
  });
}
