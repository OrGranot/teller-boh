/**
 * Shared hours-balance calculation.
 *
 * All date arithmetic uses explicit UTC ("T00:00:00Z" / "T23:59:59Z") so the
 * result is identical whether the function is called on the server (UTC) or in
 * the browser (Berlin, UTC+1 / UTC+2).  This is the single source of truth —
 * import it in both team/page.tsx and HoursBalanceClient.tsx instead of
 * maintaining two copies.
 */

import { getBerlinHolidaySet, countBerlinHolidaysRaw } from "@/lib/berlin-holidays";

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
  shifts:      { clocked_in_at: string; clocked_out_at: string | null }[];
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
  /** Weighted holiday entitlement (raw count × daysPerWeek/7) — used in the balance formula */
  holidayCount:     number;
  /** Raw integer count of public holidays in the period — for display only */
  holidayCountRaw:  number;
  holidayCredit:    number;
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

  // Count ALL shifts up to untilDate — shifts before contract start are still
  // real work (overtime/compensation) and must be credited to the balance.
  // Only cut off at periodEnd so future shifts aren't counted yet.
  const shiftsToCount = p.shifts.filter(
    s => new Date(s.clocked_in_at).getTime() <= periodEnd.getTime()
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
  const workedHolidayDates = new Set(
    shiftsToCount
      .filter(s => !!s.clocked_out_at)
      .map(s => berlinFmt.format(new Date(s.clocked_in_at)))
      .filter(d => holidaySet.has(d))
  );
  // Each holiday actually worked earns one full compensatory day (Freizeitausgleich).
  const holidayCount = workedHolidayDates.size;

  const vacationAccrued =
    vacationDaysPerYear != null
      ? (periodDays / 365) * vacationDaysPerYear
      : null;

  const vacationCredit = vacationAccrued != null ? vacationAccrued * dailyHours : 0;
  const sickCredit     = sickDaysN * dailyHours;
  const holidayCredit  = holidayCount * dailyHours;

  // Adjustments within the period only (payout date must fall within [periodStart, periodEnd])
  const paidOutHours = p.adjustments
    .filter(a => {
      const t = new Date(a.adjustment_date + "T12:00:00Z").getTime();
      return t >= periodStart.getTime() && t <= periodEnd.getTime();
    })
    .reduce((sum, a) => sum + Number(a.hours), 0);

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
  sickCredit: 0, holidayCount: 0, holidayCountRaw: 0, holidayCredit: 0, paidOutHours: 0,
};

/**
 * Calculate hours balance across multiple contract periods.
 *
 * Key properties:
 * - Each period uses its own hoursPerWeek / daysPerWeek / vacationDaysPerYear / sickDays
 * - Vacation and sick carryover between contracts is implicit: the total is the
 *   sum of per-period balances, so any surplus/deficit flows naturally into
 *   the grand total without resetting.
 * - Shifts before the first contract's valid_from are attributed to the first
 *   period (pre-employment work still counts toward the balance).
 * - Adjustments (overtime payouts) are attributed to the period they fall in.
 * - untilDate caps the calculation globally; closed periods are fully included.
 */
export function calcMultiContractBalance(
  contracts: ContractPeriod[],
  untilDate: string,
  shifts:      { clocked_in_at: string; clocked_out_at: string | null }[],
  adjustments: HoursAdjustment[]
): MultiBalanceResult {
  // Only contracts with hours set can contribute to the balance
  const valid = contracts
    .filter(c => c.hours_per_week != null && Number(c.hours_per_week) > 0)
    .sort((a, b) => a.valid_from.localeCompare(b.valid_from)); // oldest first

  if (valid.length === 0) {
    return { periods: [], total: { ...ZERO_RESULT, vacationAccrued: null } };
  }

  const periods: PeriodResult[] = [];

  for (let i = 0; i < valid.length; i++) {
    const contract = valid[i];
    const effectiveFrom = contract.valid_from;

    // This period ends at its valid_until, or at untilDate (whichever is earlier)
    const contractEnd    = contract.valid_until ?? untilDate;
    const effectiveUntil = contractEnd < untilDate ? contractEnd : untilDate;

    // Skip contracts that haven't started yet relative to untilDate
    if (effectiveFrom > untilDate) continue;

    const untilMs = new Date(effectiveUntil + "T23:59:59Z").getTime();
    const fromMs  = new Date(effectiveFrom  + "T00:00:00Z").getTime();

    // Shifts: first contract gets all pre-start shifts too; subsequent contracts
    // are strictly within their window.
    const periodShifts =
      i === 0
        ? shifts.filter(s => new Date(s.clocked_in_at).getTime() <= untilMs)
        : shifts.filter(s => {
            const t = new Date(s.clocked_in_at).getTime();
            return t >= fromMs && t <= untilMs;
          });

    // Adjustments: same logic — first period absorbs pre-contract payouts
    const periodAdjustments =
      i === 0
        ? adjustments.filter(a =>
            new Date(a.adjustment_date + "T12:00:00Z").getTime() <= untilMs
          )
        : adjustments.filter(a => {
            const t = new Date(a.adjustment_date + "T12:00:00Z").getTime();
            return t >= fromMs && t <= untilMs;
          });

    const result = calcHoursBalance({
      contractStart:       effectiveFrom,
      hoursPerWeek:        Number(contract.hours_per_week),
      daysPerWeek:         contract.days_per_week,
      vacationDaysPerYear: contract.vacation_days_per_year,
      sickDays:            contract.sick_days,
      untilDate:           effectiveUntil,
      shifts:              periodShifts,
      adjustments:         periodAdjustments,
    });

    periods.push({ contract, effectiveFrom, effectiveUntil, result });
  }

  if (periods.length === 0) {
    return { periods: [], total: { ...ZERO_RESULT, vacationAccrued: null } };
  }

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
      sickCredit:      acc.sickCredit     + r.sickCredit,
      holidayCount:    acc.holidayCount   + r.holidayCount,
      holidayCountRaw: acc.holidayCountRaw + r.holidayCountRaw,
      holidayCredit:   acc.holidayCredit  + r.holidayCredit,
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
