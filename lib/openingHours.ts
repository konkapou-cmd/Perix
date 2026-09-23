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
  const openingHours = business.opening_hours as OpeningHours | undefined;
  if (!openingHours?.schedule) return false; // No registered hours -> treated as closed

  const { dayIndex, minutes: currentMinutes } = currentTimeInZone(openingHours.timezone);
  const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const dayName = days[dayIndex];
  const candidates = [
    openingHours.schedule[dayName],
    openingHours.schedule[dayName.toLowerCase()],
  ].filter((s): s is NonNullable<typeof s> => !!s);

  if (candidates.length === 0) return false;

  for (const daySchedule of candidates) {
    if (!daySchedule.enabled) continue;
    const periods = Array.isArray(daySchedule.periods) ? daySchedule.periods : [];
    for (const period of periods) {
      const [openHour, openMin] = String(period.open || "09:00").split(":").map(Number);
      const [closeHour, closeMin] = String(period.close || "18:00").split(":").map(Number);
      const openMinutes = (openHour || 0) * 60 + (openMin || 0);
      const closeMinutes = (closeHour || 0) * 60 + (closeMin || 0);
      if (currentMinutes >= openMinutes && currentMinutes <= closeMinutes) {
        return true;
      }
    }
  }
  return false;
}
