/**
 * Staging-only Batch D1 overlay: text-free 3D pilot art by word ID.
 * Does NOT write to the database or delete legacy flashcard PNGs.
 *
 * Disable with EXPO_PUBLIC_PILOT_3D_BATCH_D1=0
 */
import pilotMap from "../data/pilot-batch-d1.json";

type PilotMap = {
  enabledByDefault?: boolean;
  batch?: string;
  byWordId: Record<string, string>;
};

const map = pilotMap as PilotMap;

function apiOrigin(): string {
  const api =
    process.env.EXPO_PUBLIC_API_URL?.replace(/\/$/, "") ??
    "http://127.0.0.1:4100/api";
  return api.replace(/\/api$/i, "");
}

export function isPilot3dBatchD1Enabled(): boolean {
  const flag = process.env.EXPO_PUBLIC_PILOT_3D_BATCH_D1;
  if (flag === "0" || flag === "false") return false;
  if (flag === "1" || flag === "true") return true;
  return map.enabledByDefault !== false;
}

export function hasPilot3dImage(wordId?: string | null): boolean {
  if (!isPilot3dBatchD1Enabled() || !wordId) return false;
  return Boolean(map.byWordId[wordId]);
}

/** Absolute http(s) URL for a pilot asset, or null if none. */
export function getPilot3dImageUrl(wordId?: string | null): string | null {
  if (!hasPilot3dImage(wordId)) return null;
  const rel = map.byWordId[wordId!];
  if (!rel) return null;
  if (/^https?:\/\//i.test(rel)) return rel;
  return `${apiOrigin()}${rel.startsWith("/") ? rel : `/${rel}`}`;
}

/**
 * Prefer pilot 3D art when present; otherwise keep the legacy imageUrl.
 * Legacy DB values are never modified.
 */
export function resolveVocabImageUrl(
  wordId?: string | null,
  legacyImageUrl?: string | null
): string | null {
  const pilot = getPilot3dImageUrl(wordId);
  if (pilot) return pilot;
  const legacy = legacyImageUrl?.trim() || null;
  if (legacy && /^https?:\/\//i.test(legacy)) return legacy;
  return null;
}
