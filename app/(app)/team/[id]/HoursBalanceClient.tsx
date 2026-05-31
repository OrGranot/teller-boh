"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  calcMultiContractBalance,
  type ContractPeriod,
  type HoursAdjustment,
  type PeriodResult,
} from "@/lib/hours-balance";
import DatePicker from "@/components/DatePicker";

interface Props {
  profileId:     string;
  canEdit:       boolean;
  contracts:     ContractPeriod[];
  employmentEnd: string | null;  // restaurant_members.contract_end (deactivation date)
  serverToday:   string;         // YYYY-MM-DD, UTC
  allShifts:     { clocked_in_at: string; clocked_out_at: string | null; status: string }[];
  adjustments:   HoursAdjustment[];
}

function fmt(n: number, decimals = 1) {
  return n.toFixed(decimals);
}

function fmtDate(iso: string) {
  return new Date(iso + "T12:00:00Z").toLocaleDateString("en-GB");
}

function sign(n: number) { return n >= 0 ? "+" : ""; }

export default function HoursBalanceClient({
  profileId,
  canEdit,
  contracts,
  employmentEnd,
  serverToday,
  allShifts: initialShifts,
  adjustments: initialAdjustments,
}: Props) {
  const router   = useRouter();
  const supabase = createClient();

  // Always re-fetch so this stays in sync with the shifts panel and team list
  const [allShifts,   setAllShifts]   = useState(initialShifts);
  const [adjustments, setAdjustments] = useState<HoursAdjustment[]>(initialAdjustments);
  const [dataReady,   setDataReady]   = useState(false);

  useEffect(() => {
    async function fetchAll() {
      const [shiftsRes, adjRes] = await Promise.all([
        supabase
          .from("time_records")
          .select("clocked_in_at, clocked_out_at, status")
          .eq("profile_id", profileId)
          .order("clocked_in_at", { ascending: false }),
        supabase
          .from("hours_adjustments")
          .select("id, hours, note, adjustment_date")
          .eq("profile_id", profileId)
          .order("adjustment_date", { ascending: false }),
      ]);
      if (shiftsRes.data) setAllShifts(shiftsRes.data);
      if (adjRes.data)    setAdjustments(adjRes.data as HoursAdjustment[]);
      setDataReady(true);
    }
    async function refetchShifts() {
      const { data } = await supabase
        .from("time_records")
        .select("clocked_in_at, clocked_out_at, status")
        .eq("profile_id", profileId)
        .order("clocked_in_at", { ascending: false });
      if (data) setAllShifts(data);
    }
    function onShiftChanged(e: Event) {
      const detail = (e as CustomEvent<{ profileId: string }>).detail;
      if (detail.profileId === profileId) void refetchShifts();
    }
    void fetchAll();
    window.addEventListener("easyboh:shift-changed", onShiftChanged);
    return () => window.removeEventListener("easyboh:shift-changed", onShiftChanged);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profileId]);

  const defaultUntil = employmentEnd ?? serverToday;
  const [untilDate,   setUntilDate]  = useState(defaultUntil);
  const [openPeriods, setOpenPeriods] = useState<Set<string>>(new Set()); // accordion by contract id

  useEffect(() => { setUntilDate(employmentEnd ?? serverToday); }, [employmentEnd, serverToday]);

  // Overtime payout form
  const [showAddForm,   setShowAddForm]   = useState(false);
  const [adjHours,      setAdjHours]      = useState("");
  const [adjNote,       setAdjNote]       = useState("");
  const [adjDate,       setAdjDate]       = useState(serverToday);
  const [adjSubmitting, setAdjSubmitting] = useState(false);
  const [adjError,      setAdjError]      = useState("");

  // ── No contracts ──────────────────────────────────────────────────────────
  if (contracts.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
        <h2 className="text-sm font-semibold text-gray-700 mb-1">Hours balance</h2>
        <p className="text-xs text-gray-400">
          Add a contract in Contract history to see the balance.
        </p>
      </div>
    );
  }

  // ── Loading skeleton ──────────────────────────────────────────────────────
  if (!dataReady) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6 animate-pulse">
        <h2 className="text-sm font-semibold text-gray-700 mb-4">Hours balance</h2>
        <div className="h-8 w-28 bg-gray-100 rounded mb-5" />
        <div className="grid grid-cols-2 gap-x-8 gap-y-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i}>
              <div className="h-2.5 w-20 bg-gray-100 rounded mb-2" />
              <div className="h-4 w-24 bg-gray-100 rounded" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  // ── Calculate ─────────────────────────────────────────────────────────────
  const { periods, total } = calcMultiContractBalance(
    contracts, untilDate, allShifts, adjustments
  );

  // Shifts / clock-out diagnostics (for the whole active window)
  const firstFrom  = [...contracts].sort((a, b) => a.valid_from.localeCompare(b.valid_from))[0]?.valid_from;
  const periodStart = firstFrom ? new Date(firstFrom + "T00:00:00Z") : null;
  const periodEnd   = new Date(untilDate + "T23:59:59Z");
  const shiftsInPeriod = allShifts.filter(s => {
    const t = new Date(s.clocked_in_at).getTime();
    return (!periodStart || t >= periodStart.getTime()) && t <= periodEnd.getTime();
  });
  const missingClockOut = shiftsInPeriod.filter(s => !s.clocked_out_at).length;

  // ── Payout handlers ───────────────────────────────────────────────────────
  async function submitAdjustment(e: React.FormEvent) {
    e.preventDefault();
    const hours = parseFloat(adjHours);
    if (!hours || hours <= 0) { setAdjError("Enter a positive number of hours."); return; }
    setAdjSubmitting(true);
    setAdjError("");
    const res = await fetch(`/api/members/${profileId}/adjustments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ hours, note: adjNote, adjustment_date: adjDate }),
    });
    if (res.ok) {
      const newAdj = await res.json();
      setAdjustments(prev => [newAdj, ...prev]);
      setAdjHours(""); setAdjNote(""); setAdjDate(serverToday);
      setShowAddForm(false);
      router.refresh();
    } else {
      const data = await res.json().catch(() => ({}));
      setAdjError(data.error || "Failed to save.");
    }
    setAdjSubmitting(false);
  }

  async function deleteAdjustment(adjId: string) {
    const res = await fetch(`/api/members/${profileId}/adjustments/${adjId}`, { method: "DELETE" });
    if (res.ok) {
      setAdjustments(prev => prev.filter(a => a.id !== adjId));
      router.refresh();
    }
  }

  function togglePeriod(contractId: string) {
    setOpenPeriods(prev => {
      const next = new Set(prev);
      if (next.has(contractId)) next.delete(contractId); else next.add(contractId);
      return next;
    });
  }

  // ── Render ────────────────────────────────────────────────────────────────
  const balColor = total.balance >= 0 ? "text-green-600" : "text-red-500";
  const isDeactivated = !!employmentEnd && employmentEnd <= serverToday;

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <h2 className="text-sm font-semibold text-gray-700">Hours balance</h2>
        <div className="flex items-center gap-2">
          <label className="text-xs text-gray-400">Until</label>
          {isDeactivated ? (
            <span className="text-xs font-medium text-gray-700 tabular-nums">
              {untilDate.split("-").reverse().join("/")}
            </span>
          ) : (
            <DatePicker value={untilDate} onChange={setUntilDate} maxDate={serverToday} />
          )}
        </div>
      </div>

      {/* Grand total */}
      <div className="mb-5">
        <div className="flex items-baseline gap-2 mb-1">
          <span className={`text-3xl font-bold tabular-nums ${balColor}`}>
            {sign(total.balance)}{fmt(total.balance)}h
          </span>
          <span className="text-xs text-gray-400">total balance</span>
        </div>
        {periods.length > 1 && (
          <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-gray-500 tabular-nums">
            <span>Worked: {fmt(total.workedHours)}h</span>
            <span>Expected: {fmt(total.expectedHours)}h</span>
            {total.vacationAccrued != null && (
              <span>Vacation: {fmt(total.vacationAccrued, 1)}d ({fmt(total.vacationCredit)}h)</span>
            )}
            <span>Sick: {fmt(total.sickCredit)}h</span>
            {total.holidayCount > 0 && (
              <span>Holidays worked: {total.holidayCount}d → +{fmt(total.holidayCredit)}h</span>
            )}
            {total.paidOutHours > 0 && <span>Paid out: −{fmt(total.paidOutHours)}h</span>}
          </div>
        )}
      </div>

      {/* Per-period accordion (newest first) */}
      <div className="flex flex-col gap-2 mb-5">
        {[...periods].reverse().map((period, displayIdx) => {
          const contractN = periods.length - displayIdx; // "Contract N" label
          const { result: r, contract, effectiveFrom, effectiveUntil } = period;
          const isOpen = openPeriods.has(contract.id);
          const bColor = r.balance >= 0 ? "text-green-600" : "text-red-500";
          const periodDailyHours = contract.days_per_week
            ? Number(contract.hours_per_week) / Number(contract.days_per_week)
            : Number(contract.hours_per_week) / 5;

          return (
            <div key={contract.id} className="rounded-xl border border-gray-100 bg-gray-50/40">
              <button
                type="button"
                onClick={() => togglePeriod(contract.id)}
                className="w-full flex items-center justify-between px-4 py-2.5 text-left"
              >
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-semibold text-gray-600">Contract {contractN}</span>
                  <span className="text-xs text-gray-400">
                    {fmtDate(effectiveFrom)} – {effectiveUntil === untilDate && !contract.valid_until
                      ? "today"
                      : fmtDate(effectiveUntil)}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`text-xs font-semibold tabular-nums ${bColor}`}>
                    {sign(r.balance)}{fmt(r.balance)}h
                  </span>
                  <span className="text-gray-400 text-xs">{isOpen ? "▲" : "▼"}</span>
                </div>
              </button>

              {isOpen && (
                <div className="px-4 pb-3 pt-1 border-t border-gray-100">
                  <div className="grid grid-cols-2 gap-x-8 gap-y-3 text-sm">
                    <div>
                      <p className="text-xs text-gray-400">Expected</p>
                      <p className="font-medium tabular-nums">{fmt(r.expectedHours)} hrs</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-400">
                        Worked <span className="text-[10px]">(break deducted)</span>
                      </p>
                      <p className="font-medium tabular-nums">{fmt(r.workedHours)} hrs</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-400">Vacation accrued</p>
                      {r.vacationAccrued != null ? (
                        <p className="font-medium tabular-nums">
                          {fmt(r.vacationAccrued)} days
                          <span className="text-xs text-gray-400 font-normal ml-1">
                            (= {fmt(r.vacationCredit)} hrs)
                          </span>
                        </p>
                      ) : (
                        <p className="text-xs text-gray-400">—</p>
                      )}
                    </div>
                    <div>
                      <p className="text-xs text-gray-400">Sick days</p>
                      <p className="font-medium tabular-nums">
                        {contract.sick_days} {contract.sick_days === 1 ? "day" : "days"}
                        <span className="text-xs text-gray-400 font-normal ml-1">
                          (= {fmt(r.sickCredit)} hrs)
                        </span>
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-400">Public holidays</p>
                      <p className="font-medium tabular-nums">
                        {r.holidayCountRaw > 0
                          ? `${r.holidayCountRaw} in period${r.holidayCount > 0 ? `, ${r.holidayCount} worked` : ""}`
                          : "—"}
                        {r.holidayCount > 0 && (
                          <span className="text-xs text-gray-400 font-normal ml-1">
                            → +{fmt(r.holidayCredit)} hrs
                          </span>
                        )}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-400">Daily hours</p>
                      <p className="font-medium tabular-nums">{fmt(periodDailyHours)} hrs/day</p>
                    </div>
                    {r.paidOutHours > 0 && (
                      <div>
                        <p className="text-xs text-gray-400">Paid out</p>
                        <p className="font-medium tabular-nums text-red-500">−{fmt(r.paidOutHours)} hrs</p>
                      </div>
                    )}
                  </div>
                  {contract.days_per_week == null && (
                    <p className="text-[11px] text-amber-600 bg-amber-50 rounded-lg px-3 py-2 mt-3">
                      Days/week not set — defaulting to 5 for daily hours.
                    </p>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* ── Overtime payouts ────────────────────────────────────────────────── */}
      <div className="border-t border-gray-100 pt-4">
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
            Overtime payouts
          </p>
          {canEdit && !showAddForm && (
            <button
              onClick={() => setShowAddForm(true)}
              className="text-xs text-indigo-600 font-semibold hover:underline underline-offset-2"
            >
              + Record payout
            </button>
          )}
        </div>

        {showAddForm && canEdit && (
          <form
            onSubmit={submitAdjustment}
            className="bg-gray-50 rounded-xl p-4 mb-3 flex flex-col gap-3"
          >
            <div className="flex gap-3 flex-wrap">
              <div className="flex flex-col gap-1">
                <label className="text-[11px] text-gray-400">Hours paid out</label>
                <input
                  type="number" min="0.5" step="0.5" placeholder="e.g. 8"
                  value={adjHours}
                  onChange={e => setAdjHours(e.target.value)}
                  required
                  className="w-28 text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-300 tabular-nums"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[11px] text-gray-400">Date</label>
                <DatePicker value={adjDate} onChange={setAdjDate} maxDate={serverToday} />
              </div>
              <div className="flex flex-col gap-1 flex-1 min-w-[140px]">
                <label className="text-[11px] text-gray-400">Note (optional)</label>
                <input
                  type="text" placeholder="e.g. Dec overtime payout"
                  value={adjNote}
                  onChange={e => setAdjNote(e.target.value)}
                  className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-300"
                />
              </div>
            </div>
            {adjError && <p className="text-xs text-red-500">{adjError}</p>}
            <div className="flex gap-2">
              <button
                type="submit" disabled={adjSubmitting}
                className="text-xs bg-gray-900 text-white font-semibold px-4 py-1.5 rounded-lg hover:bg-gray-700 disabled:opacity-50 transition-colors"
              >
                {adjSubmitting ? "Saving…" : "Save payout"}
              </button>
              <button
                type="button"
                onClick={() => { setShowAddForm(false); setAdjError(""); }}
                className="text-xs text-gray-400 hover:text-gray-600 font-semibold px-3 py-1.5"
              >
                Cancel
              </button>
            </div>
          </form>
        )}

        {adjustments.length === 0 && !showAddForm ? (
          <p className="text-xs text-gray-400">No payouts recorded yet.</p>
        ) : (
          <div className="flex flex-col gap-1.5">
            {adjustments.map(a => (
              <div
                key={a.id}
                className="flex items-center justify-between text-sm bg-gray-50 rounded-lg px-3 py-2"
              >
                <div className="flex items-center gap-3">
                  <span className="font-semibold tabular-nums text-red-500">
                    −{Number(a.hours).toFixed(1)}h
                  </span>
                  <span className="text-xs text-gray-400 tabular-nums">
                    {a.adjustment_date.split("-").reverse().join("/")}
                  </span>
                  {a.note && <span className="text-xs text-gray-500">{a.note}</span>}
                </div>
                {canEdit && (
                  <button
                    onClick={() => deleteAdjustment(a.id)}
                    className="text-[11px] text-gray-300 hover:text-red-400 font-semibold transition-colors ml-2"
                    title="Remove payout"
                  >
                    ✕
                  </button>
                )}
              </div>
            ))}
            {total.paidOutHours > 0 && (
              <p className="text-xs text-gray-400 mt-1 tabular-nums">
                Total paid out in this period: {fmt(total.paidOutHours)}h
              </p>
            )}
          </div>
        )}
      </div>

      {/* ── Diagnostics ─────────────────────────────────────────────────────── */}
      <div className="mt-4 flex flex-col gap-2">
        {missingClockOut > 0 && (
          <p className="text-[11px] text-red-600 bg-red-50 rounded-lg px-3 py-2">
            ⚠️ <strong>{missingClockOut} shift{missingClockOut !== 1 ? "s" : ""}</strong> in
            this period {missingClockOut !== 1 ? "have" : "has"} no clock-out and{" "}
            <strong>are not counted</strong> in worked hours.
          </p>
        )}
      </div>
    </div>
  );
}
