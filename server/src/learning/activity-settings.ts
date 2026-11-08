import {
  ACTIVITY_CATALOG,
  isActivityCode,
  type ActivityCode,
} from "@little-readers/shared";
import { AppError } from "../lib/errors.js";
import { prisma } from "../lib/prisma.js";

export async function listActivitySettings() {
  const rows = await prisma.activitySetting.findMany();
  const byCode = new Map(rows.map((r) => [r.code, r]));
  return ACTIVITY_CATALOG.map((a) => ({
    ...a,
    enabled: byCode.get(a.code)?.enabled ?? true,
    updatedAt: byCode.get(a.code)?.updatedAt ?? null,
  }));
}

export async function setActivityEnabled(code: string, enabled: boolean, adminId: string) {
  if (!isActivityCode(code)) throw new AppError("Unknown activity", 400);
  await prisma.activitySetting.upsert({
    where: { code },
    create: { code, enabled, updatedById: adminId },
    update: { enabled, updatedById: adminId },
  });
  return listActivitySettings();
}

async function enabledSet() {
  const list = await listActivitySettings();
  return new Set(list.filter((a) => a.enabled).map((a) => a.code as ActivityCode));
}

/** Reject starting a session whose activity the admin has switched off. */
export async function assertActivityModeEnabled(
  mode: "LISTEN_SPELL" | "MATCHING" | "QUIZ" | "REVISION"
) {
  if (mode === "REVISION") return;
  const on = await enabledSet();
  const allowed =
    mode === "LISTEN_SPELL"
      ? on.has("LISTEN") || on.has("SPELL")
      : mode === "MATCHING"
        ? on.has("MATCH_IT")
        : on.has("QUIZ_TIME");
  if (!allowed) {
    throw new AppError("This activity is switched off right now. Please pick another one.", 403);
  }
}
