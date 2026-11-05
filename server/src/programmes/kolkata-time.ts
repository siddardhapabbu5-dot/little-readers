/** Asia/Kolkata helpers without external timezone deps (IST = UTC+5:30, no DST). */

const IST_OFFSET_MS = (5 * 60 + 30) * 60 * 1000;

export function toKolkataParts(now = new Date()) {
  const shifted = new Date(now.getTime() + IST_OFFSET_MS);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth(),
    day: shifted.getUTCDate(),
    hour: shifted.getUTCHours(),
    minute: shifted.getUTCMinutes(),
    second: shifted.getUTCSeconds(),
  };
}

/** UTC midnight Date representing the Kolkata calendar date of `now`. */
export function kolkataCalendarDateUtc(now = new Date()): Date {
  const p = toKolkataParts(now);
  return new Date(Date.UTC(p.year, p.month, p.day));
}

export function formatKolkataDate(d: Date): string {
  const p = toKolkataParts(d);
  const mm = String(p.month + 1).padStart(2, "0");
  const dd = String(p.day).padStart(2, "0");
  return `${p.year}-${mm}-${dd}`;
}

/** True when Kolkata local clock is at/after publishHour:publishMinute. */
export function isPastPublishTime(
  publishHour: number,
  publishMinute: number,
  now = new Date()
): boolean {
  const p = toKolkataParts(now);
  if (p.hour > publishHour) return true;
  if (p.hour < publishHour) return false;
  return p.minute >= publishMinute;
}

export function startOfUtcDay(d: Date) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}
