/** Parse durations like `15m`, `7d`, `30d`, `3600s` into milliseconds. */
export function parseDurationMs(raw: string, fallbackMs: number): number {
  const m = /^(\d+)\s*([smhd])$/i.exec(String(raw ?? "").trim());
  if (!m) return fallbackMs;
  const n = Number(m[1]);
  const unit = m[2].toLowerCase();
  const mult =
    unit === "s" ? 1000 : unit === "m" ? 60_000 : unit === "h" ? 3_600_000 : 86_400_000;
  return n * mult;
}
