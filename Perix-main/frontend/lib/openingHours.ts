import { Business } from "./api";

type OpeningHours = {
  timezone?: string;
  schedule?: Record<string, { enabled: boolean; periods: { open: string; close: string }[] }>;
};

export type FlatDayHours = {
  enabled: boolean;
  periods: { open: string; close: string }[];
};

/**
 * Normalize any opening_hours shape (wrapped {timezone, schedule}, flat day map,
 * capitalized or lowercase keys) into a flat lowercase schedule.
 */
export function unpackOpeningHoursSchedule(openingHours: any): Record<string, FlatDayHours> {
  const schedule: Record<string, FlatDayHours> = {};
  const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
  const lowercaseDays = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];
  const src =
    openingHours?.schedule && typeof openingHours.schedule === "object"
      ? openingHours.schedule
      : openingHours || {};

  days.forEach((d, i) => {
    const cap = src[d];
    const low = src[lowercaseDays[i]];
    const capPeriods = Array.isArray(cap?.periods) ? cap.periods.length : 0;
    const lowPeriods = Array.isArray(low?.periods) ? low.periods.length : 0;
    const best = capPeriods >= lowPeriods ? cap : low;
    const enabled = !!(cap?.enabled || low?.enabled);
    const periods = best && Array.isArray(best.periods) ? best.periods : [];
    schedule[lowercaseDays[i]] = { enabled, periods };
  });
  return schedule;
}

function currentTimeInZone(timezone?: string): { dayIndex: number; minutes: number } {
  const now = new Date();
  if (timezone) {
    try {
      const weekday = new Intl.DateTimeFormat("en-US", { timeZone: timezone, weekday: "short" }).format(now);
      const hours = new Intl.DateTimeFormat("en-US", { timeZone: timezone, hour: "2-digit", hour12: false }).format(now);
      const minutes = new Intl.DateTimeFormat("en-US", { timeZone: timezone, minute: "2-digit" }).format(now);
      const dayMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
      const dayIndex = dayMap[weekday] ?? now.getDay();
      const h = parseInt(hours, 10) % 24;
      const m = parseInt(minutes, 10);
      if (!Number.isNaN(h) && !Number.isNaN(m)) {
        return { dayIndex, minutes: h * 60 + m };
      }
    } catch {
      // fall through to device time
    }
  }
  return { dayIndex: now.getDay(), minutes: now.getHours() * 60 + now.getMinutes() };
}

/** Determine whether a business is currently open based on its opening_hours schedule. */
export function isBusinessOpen(business: Business): boolean {
  const openingHours = business.opening_hours as any;
  if (!openingHours) return false; // No registered hours -> treated as closed
  const schedule = unpackOpeningHoursSchedule(openingHours);
  if (!schedule) return false;
  return isOpenNowForSchedule(schedule, (openingHours as any)?.timezone);
}

function parseMinutes(value: string | undefined, fallback: number): number {
  const parts = String(value || "").split(":").map(Number);
  const h = Number.isFinite(parts[0]) ? parts[0] % 24 : Math.floor(fallback / 60);
  const m = Number.isFinite(parts[1]) ? parts[1] : fallback % 60;
  return h * 60 + m;
}

/** Now (minutes) within an open..close period. Handles overnight periods
 *  (close <= open means the period crosses midnight) and 24h (open==close). */
function withinPeriod(now: number, open: number, close: number): boolean {
  if (open === close) return true; // 24h
  if (open < close) return now >= open && now < close;
  return now >= open || now < close; // crosses midnight
}

/** Only the midnight-crossing part of yesterday's periods can cover now. */
function withinPrevDaySpillover(now: number, open: number, close: number): boolean {
  if (open === close) return true;
  if (open < close) return false;
  return now < close;
}

/**
 * Whether the schedule is open right now, honoring the business timezone
 * and overnight periods (e.g. a bar open 20:00-02:00 must show as open
 * at 23:00 AND at 01:00).
 */
export function isOpenNowForSchedule(
  schedule: Record<string, { enabled: boolean; periods: { open: string; close: string }[] }>,
  timezone?: string
): boolean {
  if (!schedule) return false;
  const { dayIndex, minutes } = currentTimeInZone(timezone);
  const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const dayName = days[dayIndex];
  const prevDayName = days[(dayIndex + 6) % 7];

  const candidates = [
    schedule[dayName],
    schedule[dayName.toLowerCase()],
  ].filter((s): s is NonNullable<typeof s> => !!s);
  const prevCandidates = [
    schedule[prevDayName],
    schedule[prevDayName.toLowerCase()],
  ].filter((s): s is NonNullable<typeof s> => !!s);

  for (const daySchedule of candidates) {
    if (!daySchedule.enabled) continue;
    const periods = Array.isArray(daySchedule.periods) ? daySchedule.periods : [];
    for (const period of periods) {
      const open = parseMinutes(period.open, 9 * 60);
      const close = parseMinutes(period.close, 18 * 60);
      if (withinPeriod(minutes, open, close)) return true;
    }
  }
  for (const daySchedule of prevCandidates) {
    if (!daySchedule.enabled) continue;
    const periods = Array.isArray(daySchedule.periods) ? daySchedule.periods : [];
    for (const period of periods) {
      const open = parseMinutes(period.open, 9 * 60);
      const close = parseMinutes(period.close, 18 * 60);
      if (withinPrevDaySpillover(minutes, open, close)) return true;
    }
  }
  return false;
}
