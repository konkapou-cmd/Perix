import { Business } from "./api";

type OpeningHours = {
  timezone?: string;
  schedule?: Record<string, { enabled: boolean; periods: { open: string; close: string }[] }>;
};

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
  const daySchedule =
    openingHours.schedule[dayName] ||
    openingHours.schedule[dayName.toLowerCase()];

  if (!daySchedule || !daySchedule.enabled) return false;

  for (const period of daySchedule.periods) {
    const [openHour, openMin] = period.open.split(":").map(Number);
    const [closeHour, closeMin] = period.close.split(":").map(Number);
    const openMinutes = openHour * 60 + openMin;
    const closeMinutes = closeHour * 60 + closeMin;
    if (currentMinutes >= openMinutes && currentMinutes <= closeMinutes) {
      return true;
    }
  }
  return false;
}
