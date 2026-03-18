type HolidayDateLike =
  | string
  | {
      date?: string | null;
      reason?: string;
    }
  | null
  | undefined;

const normalizeDate = (date: Date): Date => {
  const normalized = new Date(date);
  normalized.setHours(0, 0, 0, 0);
  return normalized;
};

export const parseSchoolDate = (dateStr?: string | null): Date | null => {
  if (!dateStr) return null;
  const trimmed = String(dateStr).trim();
  if (!trimmed) return null;

  if (trimmed.includes("-")) {
    const parts = trimmed.split("-").map(Number);
    if (parts.length === 3 && parts.every((part) => Number.isFinite(part))) {
      const [year, month, day] = parts;
      const parsed = new Date(year, month - 1, day);
      return Number.isNaN(parsed.getTime()) ? null : normalizeDate(parsed);
    }
  }

  if (trimmed.includes("/")) {
    const parts = trimmed.split("/").map(Number);
    if (parts.length === 3 && parts.every((part) => Number.isFinite(part))) {
      const [month, day, year] = parts;
      const parsed = new Date(year, month - 1, day);
      return Number.isNaN(parsed.getTime()) ? null : normalizeDate(parsed);
    }
  }

  const fallback = new Date(trimmed);
  return Number.isNaN(fallback.getTime()) ? null : normalizeDate(fallback);
};

export const formatSchoolDateKey = (date: Date): string => {
  const normalized = normalizeDate(date);
  return `${normalized.getFullYear()}-${String(
    normalized.getMonth() + 1,
  ).padStart(2, "0")}-${String(normalized.getDate()).padStart(2, "0")}`;
};

export const collectHolidayDateKeys = (
  holidayDates: HolidayDateLike[] = [],
): Set<string> => {
  const keys = new Set<string>();

  holidayDates.forEach((entry) => {
    const raw = typeof entry === "string" ? entry : entry?.date;
    const parsed = parseSchoolDate(raw);
    if (parsed) {
      keys.add(formatSchoolDateKey(parsed));
    }
  });

  return keys;
};

const isWithinVacationWindow = (
  date: Date,
  vacationDate?: string | null,
  nextTermBegins?: string | null,
): boolean => {
  const vacationStart = parseSchoolDate(vacationDate);
  if (!vacationStart) return false;

  const nextTermStart = parseSchoolDate(nextTermBegins);
  if (!nextTermStart) {
    return date >= vacationStart;
  }

  return date >= vacationStart && date < nextTermStart;
};

export const getExpectedSchoolDayKeys = (params: {
  reopenDate?: string | null;
  endDate?: string | Date | null;
  holidayDates?: HolidayDateLike[];
  vacationDate?: string | null;
  nextTermBegins?: string | null;
  fallbackStartDate?: string | Date | null;
}): string[] => {
  const parsedEnd =
    params.endDate instanceof Date
      ? normalizeDate(params.endDate)
      : parseSchoolDate(params.endDate);
  if (!parsedEnd) return [];

  const parsedStart = params.reopenDate
    ? parseSchoolDate(params.reopenDate)
    : params.fallbackStartDate instanceof Date
      ? normalizeDate(params.fallbackStartDate)
      : parseSchoolDate(params.fallbackStartDate);
  if (!parsedStart || parsedStart > parsedEnd) return [];

  const holidayKeys = collectHolidayDateKeys(params.holidayDates);
  const expectedDays: string[] = [];
  const cursor = new Date(parsedStart);

  while (cursor <= parsedEnd) {
    const dayOfWeek = cursor.getDay();
    const dateKey = formatSchoolDateKey(cursor);
    const isWeekday = dayOfWeek !== 0 && dayOfWeek !== 6;

    if (
      isWeekday &&
      !holidayKeys.has(dateKey) &&
      !isWithinVacationWindow(
        cursor,
        params.vacationDate,
        params.nextTermBegins,
      )
    ) {
      expectedDays.push(dateKey);
    }

    cursor.setDate(cursor.getDate() + 1);
  }

  return expectedDays;
};
