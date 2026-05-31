/**
 * Returns the set of Berlin public holiday dates for a given year as ISO date strings (YYYY-MM-DD).
 * All German national holidays + Berlin-specific ones are included.
 * Women's Day (March 8) has been a Berlin public holiday since 2019.
 *
 * Note: all 10 Berlin holidays are returned regardless of the day of the week.
 * Entitlement per employee is calculated proportionally by the caller (days_per_week / 7),
 * since restaurant staff work any day of the week.
 */
export function getBerlinHolidays(year: number): Set<string> {
  const holidays: Date[] = [];

  const d = (month: number, day: number) => new Date(year, month - 1, day);

  // Fixed holidays
  holidays.push(d(1, 1));   // New Year's Day
  if (year >= 2019) {
    holidays.push(d(3, 8)); // International Women's Day (Berlin, since 2019)
  }
  holidays.push(d(5, 1));   // Labour Day
  holidays.push(d(10, 3));  // German Unity Day
  holidays.push(d(12, 25)); // Christmas Day
  holidays.push(d(12, 26)); // Boxing Day

  // Easter-based holidays (Gregorian algorithm)
  const easter = easterSunday(year);
  holidays.push(offsetDate(easter, -2));  // Good Friday
  holidays.push(offsetDate(easter, 1));   // Easter Monday
  holidays.push(offsetDate(easter, 39));  // Ascension Day
  holidays.push(offsetDate(easter, 50));  // Whit Monday

  const fmt = (date: Date) => {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  };
  return new Set(holidays.map(fmt));
}

/**
 * Returns all Berlin public holiday dates (YYYY-MM-DD) within [start, end] inclusive.
 * No day-of-week filtering — entitlement should be scaled by the caller.
 */
export function getBerlinHolidayDatesInRange(start: Date, end: Date): string[] {
  // Use UTC year so this works identically on server (UTC) and browser (Berlin)
  const startYear = start.getUTCFullYear();
  const endYear   = end.getUTCFullYear();
  const results: string[] = [];

  for (let y = startYear; y <= endYear; y++) {
    for (const iso of getBerlinHolidays(y)) {
      // UTC noon: timezone-neutral comparison against UTC-based start/end
      const date = new Date(iso + "T12:00:00Z");
      if (date >= start && date <= end) {
        results.push(iso);
      }
    }
  }
  return results;
}

/**
 * Returns the count of Berlin public holidays in range as a plain integer.
 * Use for display purposes.
 */
export function countBerlinHolidaysRaw(start: Date, end: Date): number {
  return getBerlinHolidayDatesInRange(start, end).length;
}

/**
 * Returns the set of Berlin public holiday dates (YYYY-MM-DD) in range.
 * Use this for exact shift-vs-holiday comparison.
 */
export function getBerlinHolidaySet(start: Date, end: Date): Set<string> {
  return new Set(getBerlinHolidayDatesInRange(start, end));
}

/**
 * Returns a Map of YYYY-MM-DD → holiday name for all Berlin public holidays
 * in the given year range. Used to show human-readable names in tooltips.
 */
export function getBerlinHolidayNameMap(startYear: number, endYear: number): Map<string, string> {
  const map = new Map<string, string>();
  for (let y = startYear; y <= endYear; y++) {
    const easter = easterSunday(y);
    const fmt = (d: Date) => {
      const mo = String(d.getMonth() + 1).padStart(2, "0");
      const da = String(d.getDate()).padStart(2, "0");
      return `${d.getFullYear()}-${mo}-${da}`;
    };
    const add = (d: Date, name: string) => map.set(fmt(d), name);
    add(new Date(y, 0, 1),   "New Year's Day");
    if (y >= 2019) add(new Date(y, 2, 8), "International Women's Day");
    add(offsetDate(easter, -2),  "Good Friday");
    add(offsetDate(easter, 1),   "Easter Monday");
    add(new Date(y, 4, 1),   "Labour Day");
    add(offsetDate(easter, 39),  "Ascension Day");
    add(offsetDate(easter, 50),  "Whit Monday");
    add(new Date(y, 9, 3),   "German Unity Day");
    add(new Date(y, 11, 25), "Christmas Day");
    add(new Date(y, 11, 26), "Boxing Day");
  }
  return map;
}

function offsetDate(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

/** Anonymous Gregorian algorithm for Easter Sunday */
function easterSunday(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day   = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
}
