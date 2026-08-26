import { Business } from "./api";

type OpeningHours = {
  schedule?: Record<string, { enabled: boolean; periods: { open: string; close: string }[] }>;
};

/** Determine whether a business is currently open based on its opening_hours schedule. */
export function isBusinessOpen(business: Business): boolean {
  const openingHours = business.opening_hours as OpeningHours | undefined;
  if (!openingHours?.schedule) return false; // No registered hours -> treated as closed

  const now = new Date();
  const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const daySchedule = openingHours.schedule[days[now.getDay()]];

  if (!daySchedule || !daySchedule.enabled) return false;

  const currentMinutes = now.getHours() * 60 + now.getMinutes();
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
