import { useCallback, useState } from "react";
import { useFocusEffect, type Router } from "expo-router";
import {
  ACTIVITY_CATALOG,
  type ActivityCode,
  type ActivityDefinition,
  type MixMode,
} from "@little-readers/shared";
import { apiRequest } from "./api";
import { openLearningActivity } from "./learning-nav";

export type ActivityState = ActivityDefinition & { enabled: boolean };

const allOn = (): ActivityState[] => ACTIVITY_CATALOG.map((a) => ({ ...a, enabled: true }));

/** Admin ON/OFF state for the five activities, refreshed whenever the screen gains focus. */
export function useActivities() {
  const [activities, setActivities] = useState<ActivityState[]>(allOn);
  const reload = useCallback(async () => {
    try {
      setActivities(await apiRequest<ActivityState[]>("/learning/activities"));
    } catch {
      setActivities(allOn());
    }
  }, []);
  useFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload])
  );
  return { activities, setActivities, reload };
}

export function isOn(activities: ActivityState[], code: ActivityCode) {
  return activities.find((a) => a.code === code)?.enabled ?? true;
}

/** Start an activity; Surprise picks a random enabled game. Returns false if nothing can start. */
export function startActivity(
  router: Router,
  activities: ActivityState[],
  code: ActivityCode,
  opts: { categoryId: string; childId: string; title?: string; mix?: MixMode }
) {
  let def = activities.find((a) => a.code === code);
  const surprise = def?.code === "SURPRISE";
  if (surprise) {
    const games = activities.filter((a) => a.kind === "game" && a.mode && a.enabled);
    def = games[Math.floor(Math.random() * games.length)];
  }
  if (!def?.mode) return false;
  openLearningActivity(router, {
    activity: def.mode,
    startRound: def.startRound,
    surprise,
    ...opts,
  });
  return true;
}
