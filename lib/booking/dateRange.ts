export const pad2 = (value: number): string =>
  String(value).padStart(2, "0");

export const toLocalISODate = (date: Date): string =>
  `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;

export const fromLocalISODate = (value: string): Date => {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day, 12, 0, 0, 0);
};

export const addDays = (value: string, amount: number): string => {
  const date = fromLocalISODate(value);
  date.setDate(date.getDate() + amount);
  return toLocalISODate(date);
};

export const nightsBetween = (checkIn: string, checkOut: string): number => {
  if (!checkIn || !checkOut) return 0;
  const milliseconds =
    fromLocalISODate(checkOut).getTime() - fromLocalISODate(checkIn).getTime();
  return Math.max(0, Math.round(milliseconds / 86_400_000));
};

export const isValidStayRange = (checkIn: string, checkOut: string): boolean =>
  Boolean(checkIn && checkOut && nightsBetween(checkIn, checkOut) > 0);

export const formatStayDate = (value: string, locale?: string): string =>
  fromLocalISODate(value).toLocaleDateString(locale, {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });

export const buildPeriodMarks = (
  checkIn: string,
  checkOut: string,
  color: string,
): Record<string, unknown> => {
  if (!checkIn) return {};

  if (!checkOut) {
    return {
      [checkIn]: {
        startingDay: true,
        endingDay: true,
        color,
        textColor: "#fff",
      },
    };
  }

  const marks: Record<string, unknown> = {};
  let current = checkIn;

  while (current <= checkOut) {
    marks[current] = {
      startingDay: current === checkIn,
      endingDay: current === checkOut,
      color,
      textColor: "#fff",
    };
    current = addDays(current, 1);
  }

  return marks;
};

export const createRequestId = (): string =>
  `booking-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
