import type { Router } from "expo-router";
import type { MixMode } from "@little-readers/shared";

export type LearningActivity =
  | "LISTEN_SPELL"
  | "MATCHING"
  | "QUIZ"
  | "REVISION";

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
  }
) {
  const base = {
    categoryId: opts.categoryId,
    childId: opts.childId,
    title: opts.title ?? "Learn",
    ...(opts.mix ? { mix: opts.mix } : {}),
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
