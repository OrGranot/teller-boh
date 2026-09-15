/**
 * Shared hours-balance calculation.
 *
 * All date arithmetic uses explicit UTC ("T00:00:00Z" / "T23:59:59Z") so the
 * result is identical whether the function is called on the server (UTC) or in
 * the browser (Berlin, UTC+1 / UTC+2).  This is the single source of truth —
 * import it in both team/page.tsx and HoursBalanceClient.tsx instead of
 * maintaining two copies.
 */

import { getBerlinHolidaySet, countBerlinHolidaysRaw, getBerlinHolidayNameMap } from "@/lib/berlin-holidays";

export interface HoursAdjustment {
  id:              string;
  hours:           number;
  note:            string | null;
  adjustment_date: string; // YYYY-MM-DD
}

export interface BalanceParams {
  contractStart:       string;   // YYYY-MM-DD
  hoursPerWeek:        number;
  daysPerWeek:         number | null;
  vacationDaysPerYear: number | null;
  sickDays:            number;
  /** Inclusive upper bound, YYYY-MM-DD. Caller decides (today or user-chosen). */
  untilDate:           string;
  shifts:      { clocked_in_at: string; clocked_out_at: string | null; status?: string }[];
  adjustments: HoursAdjustment[];
}

export interface BalanceResult {
  balance:          number;
  workedHours:      number;
  expectedHours:    number;
  periodDays:       number;
  dailyHours:       number;
  vacationAccrued:  number | null;
  vacationCredit:   number;
  sickCredit:       number;
  /** Number of public holidays the employee actually worked — drives the credit */
  holidayCount:     number;
  /** Raw integer count of public holidays in the period — for display only */
  holidayCountRaw:  number;
  holidayCredit:    number;
  /** Sorted list of holidays the employee actually worked, for tooltip display */
  workedHolidayList: { date: string; name: string }[];
  paidOutHours:     number;
}

export function calcWorkedHours(
  shifts: { clocked_in_at: string; clocked_out_at: string | null }[]
): number {
  return shifts.reduce((sum, s) => {
    if (!s.clocked_out_at) return sum;
    const raw =
      (new Date(s.clocked_out_at).getTime() - new Date(s.clocked_in_at).getTime()) /
      3_600_000;
    return sum + (raw > 6 ? raw - 0.5 : raw); // ArbZG: deduct 30 min break if > 6 h
  }, 0);
}

export function calcHoursBalance(p: BalanceParams): BalanceResult {
  // Explicit UTC to avoid server/client timezone divergence
  const periodStart = new Date(p.contractStart + "T00:00:00Z");
  const periodEnd   = new Date(p.untilDate     + "T23:59:59Z");
  const periodDays  = Math.max(
    0,
    (periodEnd.getTime() - periodStart.getTime()) / 86_400_000
  );

  // Coerce to numbers — Postgres `numeric` columns can be returned as strings
  // by PostgREST, which would break arithmetic via string concatenation.
  const hoursPerWeek        = Number(p.hoursPerWeek);
  const daysPerWeek         = p.daysPerWeek != null ? Number(p.daysPerWeek) : null;
  const vacationDaysPerYear = p.vacationDaysPerYear != null ? Number(p.vacationDaysPerYear) : null;
  const sickDaysN           = Number(p.sickDays);

  const dailyHours = daysPerWeek
    ? hoursPerWeek / daysPerWeek
    : hoursPerWeek / 5;

  // Count every shift the caller passes in — the caller decides which shifts
  // belong to this period, including work before the contract started or after
  // it ended (still real work that must be credited to the balance).
  // Pending/unapproved shifts are excluded — they must be approved by a manager
  // before they affect the balance (prevents e.g. a forgotten clock-out from
  // inflating the balance by dozens of hours).
  const shiftsToCount = p.shifts.filter(
    s => s.status === undefined || s.status === "approved"
  );

  const workedHours   = calcWorkedHours(shiftsToCount);
  const expectedHours = (periodDays / 7) * hoursPerWeek;

  // Check which completed shifts actually fall on a Berlin public holiday.
  // Uses the Berlin local date of clock-in so overnight shifts are attributed
  // to the correct day. A Set ensures one holiday day counts once even if the
  // employee clocked multiple shifts that day.
  const holidaySet      = getBerlinHolidaySet(periodStart, periodEnd);
  const holidayCountRaw = countBerlinHolidaysRaw(periodStart, periodEnd);
  const berlinFmt       = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Berlin" });
  const workedHolidayDateSet = new Set(
    shiftsToCount
      .filter(s => !!s.clocked_out_at)
      .map(s => berlinFmt.format(new Date(s.clocked_in_at)))
      .filter(d => holidaySet.has(d))
  );
  // Each holiday actually worked earns one full compensatory day (Freizeitausgleich).
  const holidayCount = workedHolidayDateSet.size;

  // Build named list for tooltip display
  const nameMap = getBerlinHolidayNameMap(
    periodStart.getUTCFullYear(),
    periodEnd.getUTCFullYear()
  );
  const workedHolidayList = [...workedHolidayDateSet]
    .sort()
    .map(date => ({ date, name: nameMap.get(date) ?? date }));

  const vacationAccrued =
    vacationDaysPerYear != null
      ? (periodDays / 365) * vacationDaysPerYear
      : null;

  const vacationCredit = vacationAccrued != null ? vacationAccrued * dailyHours : 0;
  const sickCredit     = sickDaysN * dailyHours;
  const holidayCredit  = holidayCount * dailyHours;

  // Adjustments are pre-assigned to this period by the caller (same as shifts)
  const paidOutHours = p.adjustments.reduce((sum, a) => sum + Number(a.hours), 0);

  const balance =
    workedHours + vacationCredit + sickCredit + holidayCredit - expectedHours - paidOutHours;

  return {
    balance,
    workedHours,
    expectedHours,
    periodDays,
    dailyHours,
    vacationAccrued,
    vacationCredit,
    sickCredit,
    holidayCount,
    holidayCountRaw,
    holidayCredit,
    workedHolidayList,
    paidOutHours,
  };
}

// ── Multi-contract support ────────────────────────────────────────────────────

export interface ContractPeriod {
  id:                   string;
  valid_from:           string;        // YYYY-MM-DD
  valid_until:          string | null; // null = currently active
  hours_per_week:       number | null;
  days_per_week:        number | null;
  vacation_days_per_year: number | null;
  salary:               number | null;
  sick_days:            number;
}

export interface PeriodResult {
  contract:       ContractPeriod;
  effectiveFrom:  string;  // YYYY-MM-DD — may equal valid_from
  effectiveUntil: string;  // YYYY-MM-DD — capped by untilDate
  result:         BalanceResult;
}

export interface MultiBalanceResult {
  periods: PeriodResult[];
  total:   BalanceResult;
}

function addDays(iso: string, n: number): string {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

const ZERO_RESULT: BalanceResult = {
  balance: 0, workedHours: 0, expectedHours: 0, periodDays: 0,
  dailyHours: 0, vacationAccrued: 0, vacationCredit: 0,
  sickCredit: 0, holidayCount: 0, holidayCountRaw: 0, holidayCredit: 0,
  workedHolidayList: [], paidOutHours: 0,
};

/**
 * Calculate hours balance across multiple contract periods.
 *
 * Key properties:
 * - Each period uses its own hoursPerWeek / daysPerWeek / vacationDaysPerYear / sickDays
 * - Vacation and sick carryover between contracts is implicit: the total is the
 *   sum of per-period balances, so any surplus/deficit flows naturally into
 *   the grand total without resetting.
 * - Every shift counts, even outside a contract window: shifts before the first
 *   contract go to the first period, shifts after a contract ended (gap or after
 *   the last contract) go to the most recent period before them. They add worked
 *   hours without adding expected hours.
 * - Adjustments (overtime payouts) are attributed the same way.
 * - untilDate caps expected hours; closed periods are fully included.
 * - shiftsUntil caps which shifts/adjustments count (defaults to untilDate).
 *   Pass a later date (e.g. today) to include work after the employment ended.
 */
export function calcMultiContractBalance(
  contracts: ContractPeriod[],
  untilDate: string,
  shifts:      { clocked_in_at: string; clocked_out_at: string | null; status?: string }[],
  adjustments: HoursAdjustment[],
  shiftsUntil: string = untilDate
): MultiBalanceResult {
  // Only contracts with hours set can contribute to the balance
  const valid = contracts
    .filter(c => c.hours_per_week != null && Number(c.hours_per_week) > 0)
    .sort((a, b) => a.valid_from.localeCompare(b.valid_from)); // oldest first

  if (valid.length === 0) {
    return { periods: [], total: { ...ZERO_RESULT, vacationAccrued: null } };
  }

  // Periods that have started by untilDate; each ends at its valid_until or
  // untilDate, whichever is earlier
  const windows = valid
    .filter(c => c.valid_from <= untilDate)
    .map(contract => {
      const contractEnd = contract.valid_until ?? untilDate;
      return {
        contract,
        effectiveFrom:  contract.valid_from,
        effectiveUntil: contractEnd < untilDate ? contractEnd : untilDate,
        fromMs:         new Date(contract.valid_from + "T00:00:00Z").getTime(),
      };
    });

  if (windows.length === 0) {
    return { periods: [], total: { ...ZERO_RESULT, vacationAccrued: null } };
  }

  // Index of the most recent period that started on or before t (first period
  // for anything earlier). Work after a period ended stays with that period.
  const periodIndexFor = (t: number) => {
    let idx = 0;
    windows.forEach((w, i) => { if (w.fromMs <= t) idx = i; });
    return idx;
  };

  const shiftsCutoffMs = new Date(
    (shiftsUntil > untilDate ? shiftsUntil : untilDate) + "T23:59:59Z"
  ).getTime();
  const shiftsByPeriod      = windows.map(() => [] as typeof shifts);
  const adjustmentsByPeriod = windows.map(() => [] as HoursAdjustment[]);

  for (const s of shifts) {
    const t = new Date(s.clocked_in_at).getTime();
    if (t <= shiftsCutoffMs) shiftsByPeriod[periodIndexFor(t)].push(s);
  }
  for (const a of adjustments) {
    const t = new Date(a.adjustment_date + "T12:00:00Z").getTime();
    if (t <= shiftsCutoffMs) adjustmentsByPeriod[periodIndexFor(t)].push(a);
  }

  const periods: PeriodResult[] = windows.map((w, i) => ({
    contract:       w.contract,
    effectiveFrom:  w.effectiveFrom,
    effectiveUntil: w.effectiveUntil,
    result: calcHoursBalance({
      contractStart:       w.effectiveFrom,
      hoursPerWeek:        Number(w.contract.hours_per_week),
      daysPerWeek:         w.contract.days_per_week,
      vacationDaysPerYear: w.contract.vacation_days_per_year,
      sickDays:            w.contract.sick_days,
      untilDate:           w.effectiveUntil,
      shifts:              shiftsByPeriod[i],
      adjustments:         adjustmentsByPeriod[i],
    }),
  }));

  // Sum all periods — the vacation/sick carryover is implicit in the totals
  const allNullVacation = periods.every(p => p.result.vacationAccrued === null);

  const total = periods.reduce<BalanceResult>(
    (acc, { result: r }) => ({
      balance:       acc.balance       + r.balance,
      workedHours:   acc.workedHours   + r.workedHours,
      expectedHours: acc.expectedHours + r.expectedHours,
      periodDays:    acc.periodDays    + r.periodDays,
      dailyHours:    r.dailyHours,                        // latest contract's daily hours
      vacationAccrued:
        allNullVacation ? null : (acc.vacationAccrued ?? 0) + (r.vacationAccrued ?? 0),
      vacationCredit: acc.vacationCredit + r.vacationCredit,
      sickCredit:       acc.sickCredit      + r.sickCredit,
      holidayCount:     acc.holidayCount    + r.holidayCount,
      holidayCountRaw:  acc.holidayCountRaw + r.holidayCountRaw,
      holidayCredit:    acc.holidayCredit   + r.holidayCredit,
      workedHolidayList: [...acc.workedHolidayList, ...r.workedHolidayList]
        .sort((a, b) => a.date.localeCompare(b.date)),
      paidOutHours:   acc.paidOutHours  + r.paidOutHours,
    }),
    { ...ZERO_RESULT, vacationAccrued: allNullVacation ? null : 0 }
  );

  return { periods, total };
}

/** Subtract one day from a YYYY-MM-DD string (UTC-safe). */
export function isoMinusOneDay(iso: string): string {
  return addDays(iso, -1);
}
