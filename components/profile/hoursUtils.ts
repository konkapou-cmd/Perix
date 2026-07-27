export type OpeningPeriod = {
  open?: string;
  close?: string;
};

export type OpeningDay = {
  enabled?: boolean;
  open?: string;
  close?: string;
  periods?: OpeningPeriod[];
};

export type OpeningHours = Record<string, OpeningDay>;

export const GERMAN_DAYS: Record<string, string> = {
  monday: "Montag",
  tuesday: "Dienstag",
  wednesday: "Mittwoch",
  thursday: "Donnerstag",
  friday: "Freitag",
  saturday: "Samstag",
  sunday: "Sonntag",
};

export const DAY_KEYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

export function getTodayKey(): string {
  return DAY_KEYS[new Date().getDay()];
}

export function getTodayHours(openingHours: OpeningHours): OpeningPeriod[] {
  return getDayPeriods(openingHours[getTodayKey()]);
}

export function getDayPeriods(day?: OpeningDay): OpeningPeriod[] {
  if (!day) return [];
  if (day.enabled === false) return [];
  if (Array.isArray(day.periods) && day.periods.length > 0) {
    return day.periods.filter((p) => p.open && p.close);
  }
  if (day.open && day.close) {
    return [{ open: day.open, close: day.close }];
  }
  return [];
}

export function formatOpeningTime(time?: string): string {
  if (!time) return "";
  const [h, m] = time.split(":");
  if (h === undefined || m === undefined) return time;
  return `${h.padStart(2, "0")}:${m.padStart(2, "0")}`;
}

export function getTodayStatus(
  isOpen: boolean,
  todayPeriods: OpeningPeriod[]
): { label: string; detail?: string } {
  if (todayPeriods.length === 0) {
    return { label: "Heute geschlossen" };
  }
  if (isOpen) {
    const lastClose = todayPeriods[todayPeriods.length - 1].close;
    return { label: "Geöffnet", detail: `Schließt um ${formatOpeningTime(lastClose)}` };
  }
  return { label: "Geschlossen", detail: `Öffnet um ${formatOpeningTime(todayPeriods[0].open)}` };
}

export function getPeriodsSummary(periods: OpeningPeriod[]): string {
  if (periods.length === 0) return "Geschlossen";
  return periods
    .map((p) => `${formatOpeningTime(p.open)} – ${formatOpeningTime(p.close)}`)
    .join(" / ");
}
