"use client";
import React, { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  calcMultiContractBalance,
  type ContractPeriod,
  type HoursAdjustment,
} from "@/lib/hours-balance";
import DatePicker from "@/components/DatePicker";

// ── Helpers ───────────────────────────────────────────────────────────────────

function isoMinusOneDay(iso: string): string {
  const d = new Date(iso + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}
function fmt(n: number, dec = 1) { return n.toFixed(dec); }
function fmtDate(iso: string)    { return new Date(iso + "T12:00:00Z").toLocaleDateString("en-GB"); }
function sign(n: number)         { return n >= 0 ? "+" : ""; }

// ── Field types ───────────────────────────────────────────────────────────────

type NumericField = "hours_per_week" | "days_per_week" | "vacation_days_per_year" | "salary" | "sick_days";

const FIELD_LABELS: Record<NumericField | "valid_from", string> = {
  valid_from:             "Contract start",
  hours_per_week:         "Hours / week",
  days_per_week:          "Days / week",
  vacation_days_per_year: "Vacation days / year",
  salary:                 "Salary (€)",
  sick_days:              "Sick days",
};

const NUMERIC_FIELDS: NumericField[] = [
  "hours_per_week", "days_per_week", "vacation_days_per_year", "salary", "sick_days",
];

// ── NumericFieldInput ─────────────────────────────────────────────────────────
// Always a real <input> — Tab lands directly into edit mode, blur auto-saves.

interface NumericFieldInputProps {
  contractId: string;
  field:      NumericField;
  value:      number | null;
  canEdit:    boolean;
  hint?:      string | null;
  compact?:   boolean;
  onSave:     (contractId: string, field: NumericField, value: number | null) => Promise<void>;
}

function NumericFieldInput({ contractId, field, value, canEdit, hint, compact, onSave }: NumericFieldInputProps) {
  const [local,  setLocal]  = useState(value != null ? String(value) : "");
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState<string | null>(null);
  const inFlight = useRef(false);

  useEffect(() => { setLocal(value != null ? String(value) : ""); }, [value]);

  async function commit(raw: string) {
    if (inFlight.current) return;
    const trimmed = raw.trim();
    const next    = trimmed === "" ? null : parseFloat(trimmed);
    if (next === value) return;
    if (next !== null && (isNaN(next) || next < 0)) {
      setError("Must be ≥ 0"); setLocal(value != null ? String(value) : ""); return;
    }
    inFlight.current = true; setSaving(true); setError(null);
    try { await onSave(contractId, field, next); }
    catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Save failed");
      setLocal(value != null ? String(value) : "");
    } finally { setSaving(false); inFlight.current = false; }
  }

  return (
    <div className="flex flex-col gap-0.5">
      <div className="flex items-center gap-1.5">
        <input
          type="number" min={0} step="any"
          value={local} placeholder="—"
          disabled={!canEdit} tabIndex={canEdit ? 0 : -1}
          onChange={e => { setLocal(e.target.value); setError(null); }}
          onBlur={e  => void commit(e.target.value)}
          onKeyDown={e => {
            if (e.key === "Enter")  { e.preventDefault(); e.currentTarget.blur(); }
            if (e.key === "Escape") { e.preventDefault(); setLocal(value != null ? String(value) : ""); setError(null); e.currentTarget.blur(); }
          }}
          className={`
            w-20 tabular-nums bg-transparent
            border-0 border-b-2 p-0 pb-0.5 transition-colors
            placeholder:text-gray-300 disabled:cursor-default focus:outline-none
            [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none
            ${compact ? "text-xs font-semibold text-gray-700" : "text-sm font-medium text-gray-700"}
            ${error ? "border-red-400" : "border-transparent focus:border-indigo-400"}
          `}
        />
        {saving && <span className="text-[10px] text-gray-400 animate-pulse">↑</span>}
      </div>
      {error && <span className="text-[11px] text-red-500">{error}</span>}
      {hint && !error && <span className="text-[11px] text-gray-400">{hint}</span>}
    </div>
  );
}

// ── DateFieldInput ────────────────────────────────────────────────────────────
// Button that opens DatePicker on focus/click; Escape closes without saving.

interface DateFieldInputProps {
  contractId:    string;
  value:         string;
  canEdit:       boolean;
  compact?:      boolean;
  firstShiftISO?: string | null;
  onSave:        (contractId: string, value: string) => Promise<void>;
}

function DateFieldInput({ contractId, value, canEdit, compact, firstShiftISO, onSave }: DateFieldInputProps) {
  const [open,   setOpen]   = useState(false);
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState<string | null>(null);

  async function handleChange(date: string) {
    setOpen(false);
    if (date === value) return;
    setSaving(true); setError(null);
    try { await onSave(contractId, date); }
    catch (e: unknown) { setError(e instanceof Error ? e.message : "Save failed"); }
    finally { setSaving(false); }
  }

  return (
    <div className="flex flex-col gap-0.5">
      {open && canEdit ? (
        <div onKeyDown={e => { if (e.key === "Escape") { e.stopPropagation(); setOpen(false); } }}>
          <DatePicker value={value} autoOpen initialViewDate={firstShiftISO ?? undefined} onChange={handleChange} />
        </div>
      ) : (
        <button
          type="button" disabled={!canEdit} tabIndex={canEdit ? 0 : -1}
          onClick={() => canEdit && setOpen(true)}
          onFocus={() => canEdit && setOpen(true)}
          className={`
            text-left bg-transparent border-0 border-b-2 border-transparent
            p-0 pb-0.5 transition-colors disabled:cursor-default focus:outline-none focus:border-indigo-400
            ${compact ? "text-xs font-semibold" : "text-sm font-medium"}
            ${canEdit ? "cursor-pointer text-gray-700 hover:text-indigo-600" : "text-gray-700"}
          `}
        >
          {saving ? <span className="text-[10px] text-gray-400 animate-pulse">saving…</span> : (value ? fmtDate(value) : "—")}
        </button>
      )}
      {error && <span className="text-[11px] text-red-500">{error}</span>}
    </div>
  );
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  profileId:        string;
  canEdit:          boolean;
  initialContracts: ContractPeriod[];
  firstShiftISO:    string | null;
  employmentEnd:    string | null;
  serverToday:      string;
  allShifts:        { clocked_in_at: string; clocked_out_at: string | null; status: string }[];
  adjustments:      HoursAdjustment[];
}

const EMPTY_NEW_FORM = {
  valid_from: "", hours_per_week: "", days_per_week: "",
  vacation_days_per_year: "", salary: "", sick_days: "0",
};

// ── Main component ────────────────────────────────────────────────────────────

export default function ContractBalanceClient({
  profileId, canEdit, initialContracts, firstShiftISO,
  employmentEnd, serverToday, allShifts: initialShifts, adjustments: initialAdjustments,
}: Props) {
  const supabase = createClient();
  const router   = useRouter();

  // ── Contracts ──────────────────────────────────────────────────────────────
  const [contracts, setContracts] = useState<ContractPeriod[]>(initialContracts);

  // ── Shifts & adjustments ───────────────────────────────────────────────────
  const [allShifts,   setAllShifts]   = useState(initialShifts);
  const [adjustments, setAdjustments] = useState<HoursAdjustment[]>(initialAdjustments);
  const [dataReady,   setDataReady]   = useState(false);

  useEffect(() => {
    async function load() {
      const [sRes, aRes] = await Promise.all([
        supabase.from("time_records").select("clocked_in_at, clocked_out_at, status").eq("profile_id", profileId).order("clocked_in_at", { ascending: false }),
        supabase.from("hours_adjustments").select("id, hours, note, adjustment_date").eq("profile_id", profileId).order("adjustment_date", { ascending: false }),
      ]);
      if (sRes.data) setAllShifts(sRes.data);
      if (aRes.data) setAdjustments(aRes.data as HoursAdjustment[]);
      setDataReady(true);
    }
    async function refetchShifts() {
      const { data } = await supabase.from("time_records").select("clocked_in_at, clocked_out_at, status").eq("profile_id", profileId).order("clocked_in_at", { ascending: false });
      if (data) setAllShifts(data);
    }
    function onShiftChanged(e: Event) {
      const d = (e as CustomEvent<{ profileId: string }>).detail;
      if (d.profileId === profileId) void refetchShifts();
    }
    void load();
    window.addEventListener("easyboh:shift-changed", onShiftChanged);
    return () => window.removeEventListener("easyboh:shift-changed", onShiftChanged);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profileId]);

  // ── Balance calculation ────────────────────────────────────────────────────
  const isDeactivated = !!employmentEnd && employmentEnd <= serverToday;
  const [untilDate, setUntilDate] = useState(employmentEnd ?? serverToday);
  useEffect(() => { setUntilDate(employmentEnd ?? serverToday); }, [employmentEnd, serverToday]);

  const { periods, total } = dataReady && contracts.length > 0
    ? calcMultiContractBalance(contracts, untilDate, allShifts, adjustments)
    : { periods: [], total: { balance: 0, workedHours: 0, expectedHours: 0, vacationAccrued: null as number | null, vacationCredit: 0, sickCredit: 0, holidayCount: 0, holidayCredit: 0, paidOutHours: 0, periodDays: 0, dailyHours: 0 } };

  // Map contract id → period result for quick lookup
  const periodById = Object.fromEntries(periods.map(p => [p.contract.id, p]));

  // ── Accordion ──────────────────────────────────────────────────────────────
  const [openIds, setOpenIds] = useState<Set<string>>(() => new Set());
  function toggleOpen(id: string) {
    setOpenIds(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }

  // ── Derived display ────────────────────────────────────────────────────────
  const displayContracts = [...contracts].sort((a, b) => b.valid_from.localeCompare(a.valid_from));
  const sortedAsc        = [...contracts].sort((a, b) => a.valid_from.localeCompare(b.valid_from));
  const firstId          = sortedAsc[0]?.id ?? null;

  // ── Save handlers ──────────────────────────────────────────────────────────
  const saveNumericField = useCallback(async (contractId: string, field: NumericField, value: number | null) => {
    const res = await fetch(`/api/members/${profileId}/contracts/${contractId}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [field]: value }),
    });
    if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error || "Save failed"); }
    setContracts(prev => prev.map(c => c.id === contractId ? { ...c, [field]: value } : c));
  }, [profileId]);

  const saveDateField = useCallback(async (contractId: string, newFrom: string) => {
    const res = await fetch(`/api/members/${profileId}/contracts/${contractId}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ valid_from: newFrom }),
    });
    if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error || "Save failed"); }
    setContracts(prev => {
      const sorted = [...prev].sort((a, b) => a.valid_from.localeCompare(b.valid_from));
      const idx    = sorted.findIndex(c => c.id === contractId);
      const prevC  = idx > 0 ? sorted[idx - 1] : null;
      return prev.map(c => {
        if (c.id === contractId) return { ...c, valid_from: newFrom };
        if (prevC && c.id === prevC.id) return { ...c, valid_until: isoMinusOneDay(newFrom) };
        return c;
      });
    });
  }, [profileId]);

  // ── Contract end date (latest contract only — warning, not deactivation) ──
  const saveContractEndDate = useCallback(async (contractId: string, valid_until: string | null) => {
    const res = await fetch(`/api/members/${profileId}/contracts/${contractId}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ valid_until }),
    });
    if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error || "Save failed"); }
    setContracts(prev => prev.map(c => c.id === contractId ? { ...c, valid_until } : c));
  }, [profileId]);

  // ── Deactivation (from warning banner) ─────────────────────────────────────
  const [deactivating,     setDeactivating]     = useState(false);
  const [deactivateDate,   setDeactivateDate]   = useState(serverToday);
  const [deactivateError,  setDeactivateError]  = useState("");
  const [savingDeactivate, setSavingDeactivate] = useState(false);

  async function handleDeactivate() {
    setSavingDeactivate(true); setDeactivateError("");
    const res = await fetch(`/api/members/${profileId}/contract`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contract_end: deactivateDate }),
    });
    if (res.ok) { setDeactivating(false); router.refresh(); }
    else { const d = await res.json().catch(() => ({})); setDeactivateError(d.error || "Failed"); }
    setSavingDeactivate(false);
  }

  // ── Add new contract ───────────────────────────────────────────────────────
  const [addingNew, setAddingNew] = useState(false);
  const [newForm,   setNewForm]   = useState({ ...EMPTY_NEW_FORM });
  const [newError,  setNewError]  = useState<string | null>(null);
  const [savingNew, setSavingNew] = useState(false);

  async function submitNewContract(e: React.FormEvent) {
    e.preventDefault();
    if (!newForm.valid_from) { setNewError("Start date is required"); return; }
    setSavingNew(true); setNewError(null);
    const body = {
      valid_from:             newForm.valid_from,
      hours_per_week:         newForm.hours_per_week         ? parseFloat(newForm.hours_per_week)      : null,
      days_per_week:          newForm.days_per_week          ? parseInt(newForm.days_per_week)          : null,
      vacation_days_per_year: newForm.vacation_days_per_year ? parseInt(newForm.vacation_days_per_year) : null,
      salary:                 newForm.salary                 ? parseFloat(newForm.salary)               : null,
      sick_days:              parseInt(newForm.sick_days) || 0,
    };
    const res = await fetch(`/api/members/${profileId}/contracts`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setNewError(d.error || "Failed to save"); setSavingNew(false); return;
    }
    const listRes = await fetch(`/api/members/${profileId}/contracts`);
    if (listRes.ok) {
      const fresh: ContractPeriod[] = await listRes.json();
      setContracts(fresh);
      const newC = fresh.find(c => c.valid_from === body.valid_from);
      if (newC) setOpenIds(prev => new Set([...prev, newC.id]));
    }
    setSavingNew(false); setAddingNew(false); setNewForm({ ...EMPTY_NEW_FORM });
  }

  // ── Delete ─────────────────────────────────────────────────────────────────
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deleting,        setDeleting]        = useState(false);
  const [deleteError,     setDeleteError]     = useState<string | null>(null);

  async function deleteContract(contractId: string) {
    setDeleting(true); setDeleteError(null);
    const res = await fetch(`/api/members/${profileId}/contracts/${contractId}`, { method: "DELETE" });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setDeleteError(d.error || "Delete failed"); setDeleting(false); return;
    }
    setContracts(prev => {
      const sorted    = [...prev].sort((a, b) => a.valid_from.localeCompare(b.valid_from));
      const idx       = sorted.findIndex(c => c.id === contractId);
      const prevC     = idx > 0 ? sorted[idx - 1] : null;
      const nextC     = idx < sorted.length - 1 ? sorted[idx + 1] : null;
      const remaining = sorted.filter(c => c.id !== contractId);
      if (!prevC) return remaining;
      const newUntil  = nextC ? isoMinusOneDay(nextC.valid_from) : null;
      return remaining.map(c => c.id === prevC.id ? { ...c, valid_until: newUntil } : c);
    });
    setConfirmDeleteId(null); setDeleting(false);
  }

  // ── Overtime payouts ───────────────────────────────────────────────────────
  const [showPayoutForm,  setShowPayoutForm]  = useState(false);
  const [adjHours,        setAdjHours]        = useState("");
  const [adjNote,         setAdjNote]         = useState("");
  const [adjDate,         setAdjDate]         = useState(serverToday);
  const [adjSubmitting,   setAdjSubmitting]   = useState(false);
  const [adjError,        setAdjError]        = useState("");

  async function submitAdjustment(e: React.FormEvent) {
    e.preventDefault();
    const hours = parseFloat(adjHours);
    if (!hours || hours <= 0) { setAdjError("Enter a positive number of hours."); return; }
    setAdjSubmitting(true); setAdjError("");
    const res = await fetch(`/api/members/${profileId}/adjustments`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ hours, note: adjNote, adjustment_date: adjDate }),
    });
    if (res.ok) {
      const newAdj = await res.json();
      setAdjustments(prev => [newAdj, ...prev]);
      setAdjHours(""); setAdjNote(""); setAdjDate(serverToday); setShowPayoutForm(false);
    } else {
      const d = await res.json().catch(() => ({}));
      setAdjError(d.error || "Failed to save.");
    }
    setAdjSubmitting(false);
  }

  async function deleteAdjustment(adjId: string) {
    const res = await fetch(`/api/members/${profileId}/adjustments/${adjId}`, { method: "DELETE" });
    if (res.ok) setAdjustments(prev => prev.filter(a => a.id !== adjId));
  }

  // ── Diagnostics ────────────────────────────────────────────────────────────
  const firstFrom     = sortedAsc[0]?.valid_from;
  const periodStart   = firstFrom ? new Date(firstFrom + "T00:00:00Z") : null;
  const periodEnd     = new Date(untilDate + "T23:59:59Z");
  const shiftsInPeriod = allShifts.filter(s => {
    const t = new Date(s.clocked_in_at).getTime();
    return (!periodStart || t >= periodStart.getTime()) && t <= periodEnd.getTime();
  });
  const missingClockOut = shiftsInPeriod.filter(s => !s.clocked_out_at).length;

  // ── Render ─────────────────────────────────────────────────────────────────
  const hasContracts = contracts.length > 0;
  const balColor     = total.balance >= 0 ? "text-green-600" : "text-red-500";

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-3 sm:p-4 mb-6">

      {/* ── Top bar ─────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between mb-3 gap-3 flex-wrap">
        <h2 className="text-sm font-semibold text-gray-700">Contracts</h2>
        {canEdit && !addingNew && (
          <button
            type="button"
            onClick={() => {
              const latest = displayContracts[0];
              setNewForm({
                valid_from:             "",
                hours_per_week:         latest?.hours_per_week         != null ? String(latest.hours_per_week)         : "",
                days_per_week:          latest?.days_per_week          != null ? String(latest.days_per_week)          : "",
                vacation_days_per_year: latest?.vacation_days_per_year != null ? String(latest.vacation_days_per_year) : "",
                salary:                 latest?.salary                 != null ? String(latest.salary)                 : "",
                sick_days: "0",
              });
              setAddingNew(true);
            }}
            className="text-xs text-indigo-600 font-semibold hover:underline underline-offset-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300 rounded"
          >
            + New contract
          </button>
        )}
      </div>

      {/* ── Grand total ─────────────────────────────────────────────────────── */}
      {hasContracts && (
        <div className="mb-2">
          {/*
            Top row: balance (left) + "Calculate until" (right).
            Always rendered — "Calculate until" never shifts because it's
            present from the first paint, not added after data loads.
          */}
          {/* Balance + Until — flex-wrap so they stack on tiny screens */}
          <div className="flex items-start justify-between gap-2 flex-wrap mb-1">
            {/* Balance number */}
            {dataReady ? (
              <div className="flex items-baseline gap-2">
                <span className={`text-3xl font-bold tabular-nums ${balColor}`}>
                  {sign(total.balance)}{fmt(total.balance)}h
                </span>
                <span className="text-xs text-gray-400">total balance</span>
              </div>
            ) : (
              <div className="h-9 w-28 bg-gray-100 rounded animate-pulse" />
            )}
            {/* Until — always rendered to prevent CLS */}
            <div className="flex items-center gap-1.5 pt-1">
              <span className="text-xs text-gray-400 whitespace-nowrap">Until:</span>
              {isDeactivated ? (
                <span className="text-xs font-medium text-gray-600 tabular-nums whitespace-nowrap">
                  {untilDate.split("-").reverse().join("/")}
                </span>
              ) : (
                <DatePicker value={untilDate} onChange={setUntilDate} align="right" />
              )}
            </div>
          </div>
          {/* Stats row — wraps freely */}
          {dataReady && periods.length > 0 && (
            <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-gray-500 tabular-nums min-w-0">
              <span className="whitespace-nowrap">Worked: {fmt(total.workedHours)}h</span>
              <span className="whitespace-nowrap">Expected: {fmt(total.expectedHours)}h</span>
              {total.vacationAccrued != null && (
                <span className="whitespace-nowrap">Vac: {fmt(total.vacationAccrued, 1)}d</span>
              )}
              <span className="whitespace-nowrap">Sick: {fmt(total.sickCredit)}h</span>
              <span className="whitespace-nowrap">Holidays: {total.holidayCountRaw}d → +{fmt(total.holidayCredit)}h</span>
              {total.paidOutHours > 0 && <span className="whitespace-nowrap">Paid: −{fmt(total.paidOutHours)}h</span>}
            </div>
          )}
          {!dataReady && (
            <div className="h-3 w-48 bg-gray-100 rounded animate-pulse mt-2" />
          )}
        </div>
      )}

      {/* ── No contracts ────────────────────────────────────────────────────── */}
      {!hasContracts && !addingNew && (
        <p className="text-xs text-gray-400 mb-4">
          No contracts yet.{canEdit ? " Add one to start tracking the hours balance." : ""}
        </p>
      )}

      {/* ── Contract expiry warning ──────────────────────────────────────────── */}
      {(() => {
        const latest = sortedAsc[sortedAsc.length - 1];
        if (!latest?.valid_until || isDeactivated) return null;
        const daysLeft = Math.ceil(
          (new Date(latest.valid_until + "T12:00:00Z").getTime() - new Date(serverToday + "T12:00:00Z").getTime())
          / 86_400_000
        );
        const expired = daysLeft < 0;
        const soon    = daysLeft >= 0 && daysLeft <= 30;
        if (!expired && !soon) return null;

        return (
          <div className={`mb-4 rounded-xl border px-4 py-3 ${expired ? "bg-red-50 border-red-200" : "bg-amber-50 border-amber-200"}`}>
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div>
                <p className={`text-sm font-semibold ${expired ? "text-red-700" : "text-amber-800"}`}>
                  {expired
                    ? `Contract expired ${Math.abs(daysLeft)} day${Math.abs(daysLeft) !== 1 ? "s" : ""} ago (${fmtDate(latest.valid_until)})`
                    : daysLeft === 0
                    ? `Contract expires today (${fmtDate(latest.valid_until)})`
                    : `Contract expires in ${daysLeft} day${daysLeft !== 1 ? "s" : ""} (${fmtDate(latest.valid_until)})`}
                </p>
                <p className={`text-xs mt-0.5 ${expired ? "text-red-600" : "text-amber-600"}`}>
                  Extend the contract or deactivate this employee.
                </p>
              </div>
              {canEdit && (
                <div className="flex items-center gap-2 flex-wrap">
                  {!deactivating ? (
                    <>
                      <button
                        type="button"
                        onClick={() => {
                          const l = displayContracts[0];
                          setNewForm({
                            valid_from: "", sick_days: "0",
                            hours_per_week:         l?.hours_per_week         != null ? String(l.hours_per_week)         : "",
                            days_per_week:          l?.days_per_week          != null ? String(l.days_per_week)          : "",
                            vacation_days_per_year: l?.vacation_days_per_year != null ? String(l.vacation_days_per_year) : "",
                            salary:                 l?.salary                 != null ? String(l.salary)                 : "",
                          });
                          setAddingNew(true);
                        }}
                        className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-white border border-gray-200 text-gray-700 hover:border-gray-400 transition-colors"
                      >
                        Extend contract
                      </button>
                      <button
                        type="button"
                        onClick={() => { setDeactivateDate(latest.valid_until!); setDeactivating(true); }}
                        className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-red-500 text-white hover:bg-red-600 transition-colors"
                      >
                        Deactivate
                      </button>
                    </>
                  ) : (
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs text-gray-600">Deactivate on:</span>
                      <DatePicker value={deactivateDate} onChange={setDeactivateDate} />
                      <button
                        type="button"
                        onClick={handleDeactivate}
                        disabled={savingDeactivate}
                        className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-red-500 text-white hover:bg-red-600 disabled:opacity-50 transition-colors"
                      >
                        {savingDeactivate ? "…" : "Confirm"}
                      </button>
                      <button type="button" onClick={() => { setDeactivating(false); setDeactivateError(""); }}
                        className="text-xs text-gray-400 hover:text-gray-600">✕</button>
                    </div>
                  )}
                  {deactivateError && <p className="text-xs text-red-600 w-full">{deactivateError}</p>}
                </div>
              )}
            </div>
          </div>
        );
      })()}

      {/* ── Add new contract form ────────────────────────────────────────────── */}
      {addingNew && (
        <form onSubmit={submitNewContract} className="rounded-xl border border-indigo-200 bg-indigo-50/40 p-3 mb-2">
          <p className="text-xs font-semibold text-indigo-700 mb-2">New contract</p>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-2">
            <div>
              <p className="text-xs text-gray-400 mb-0.5">Starts on <span className="text-red-500">*</span></p>
              <DatePicker value={newForm.valid_from} onChange={d => setNewForm(p => ({ ...p, valid_from: d }))} />
            </div>
            {NUMERIC_FIELDS.map(f => (
              <div key={f}>
                <p className="text-xs text-gray-400 mb-0.5">{FIELD_LABELS[f]}</p>
                <input
                  type="number" min={0} value={newForm[f]} placeholder="—"
                  onChange={e => setNewForm(p => ({ ...p, [f]: e.target.value }))}
                  className="w-28 text-sm border border-gray-200 rounded-lg px-2 py-0.5 focus:outline-none focus:ring-2 focus:ring-indigo-300"
                />
              </div>
            ))}
          </div>
          {newError && <p className="text-xs text-red-500 mt-1.5">{newError}</p>}
          <div className="flex gap-2 mt-2">
            <button type="submit" disabled={savingNew}
              className="text-xs bg-gray-900 text-white font-semibold px-4 py-1.5 rounded-lg hover:bg-gray-700 disabled:opacity-50 transition-colors">
              {savingNew ? "Saving…" : "Save contract"}
            </button>
            <button type="button" onClick={() => { setAddingNew(false); setNewError(null); }}
              className="text-xs text-gray-400 hover:text-gray-600 font-semibold px-3 py-1.5">
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* ── Contract accordions ──────────────────────────────────────────────── */}
      <div className="flex flex-col gap-1.5">
        {displayContracts.map(contract => {
          // The "latest" contract is the one at the end of the sorted-asc list
          const isLatestContract = contract.id === sortedAsc[sortedAsc.length - 1]?.id;
          const isFirst   = contract.id === firstId;
          const isOpen    = openIds.has(contract.id);
          const period    = periodById[contract.id];
          const legalMin  = contract.days_per_week != null ? Number(contract.days_per_week) * 4 : null;

          // Date range label — ends change when user edits valid_until live
          const fromLabel  = fmtDate(contract.valid_from);
          const untilLabel = contract.valid_until ? fmtDate(contract.valid_until) : "ongoing";
          const rangeLabel = `${fromLabel} – ${untilLabel}`;

          // Per-period balance color
          const pColor = period
            ? period.result.balance >= 0 ? "text-green-600" : "text-red-500"
            : "text-gray-400";

          return (
            <div key={contract.id} className={`rounded-xl border transition-colors ${isLatestContract ? "border-indigo-200 bg-indigo-50/20" : "border-gray-100 bg-gray-50/40"}`}>

              {/* Header */}
              <button
                type="button"
                onClick={() => toggleOpen(contract.id)}
                aria-expanded={isOpen}
                className="w-full flex items-center justify-between gap-2 px-4 py-2.5 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300 focus-visible:rounded-xl"
              >
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <span className="text-sm font-semibold text-gray-700 truncate">{rangeLabel}</span>
                  {isLatestContract && (
                    <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-indigo-100 text-indigo-600 shrink-0">
                      {contract.valid_until ? "expiring" : "current"}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {dataReady && period && (
                    <span className={`text-xs font-semibold tabular-nums whitespace-nowrap ${pColor}`}>
                      {sign(period.result.balance)}{fmt(period.result.balance)}h
                    </span>
                  )}
                  {!dataReady && contract.hours_per_week && (
                    <span className="w-10 h-3 bg-gray-100 rounded animate-pulse inline-block" />
                  )}
                  <span className="text-gray-400 text-xs" aria-hidden>{isOpen ? "▲" : "▼"}</span>
                </div>
              </button>

              {/* Body */}
              {isOpen && (
                <div className="px-4 pb-2">

                  {/* Side-by-side on lg+: both panels are same-style cards */}
                  <div className="flex flex-col lg:flex-row lg:items-start gap-3 lg:gap-12">

                    {/* ── Left: CONTRACT DETAILS ────────────────────────────── */}
                    <div className="lg:w-64 lg:shrink-0 lg:bg-gray-50 lg:rounded-xl lg:px-4 lg:py-3">
                      <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-2">Contract details</p>
                      {/* 2-col grid: labels auto-width, values all start at the same x */}
                      <div className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1.5 items-baseline">
                        <span className="text-xs text-gray-400 whitespace-nowrap">{FIELD_LABELS.valid_from}</span>
                        <DateFieldInput contractId={contract.id} value={contract.valid_from} canEdit={canEdit} compact firstShiftISO={firstShiftISO} onSave={saveDateField} />

                        <span className="text-xs text-gray-400 whitespace-nowrap">Contract end</span>
                        {isLatestContract && canEdit ? (
                          <div className="flex items-center gap-1.5">
                            <DateFieldInput
                              contractId={contract.id}
                              value={contract.valid_until ?? ""}
                              canEdit={canEdit}
                              compact
                              onSave={(id, date) => saveContractEndDate(id, date || null)}
                            />
                            {contract.valid_until && (
                              <button
                                type="button"
                                onClick={() => saveContractEndDate(contract.id, null)}
                                title="Set as ongoing"
                                className="text-xs text-gray-300 hover:text-gray-500 transition-colors leading-none"
                              >
                                ✕
                              </button>
                            )}
                          </div>
                        ) : (
                          <span className="text-xs font-semibold text-gray-700 pb-0.5">
                            {contract.valid_until ? fmtDate(contract.valid_until) : <span className="text-gray-400 italic">ongoing</span>}
                          </span>
                        )}

                        {NUMERIC_FIELDS.map(field => {
                          const val     = contract[field] as number | null;
                          const isVac   = field === "vacation_days_per_year" && legalMin !== null;
                          const atMin   = isVac && val === legalMin;
                          const label   = isVac
                            ? `${FIELD_LABELS[field]}${atMin ? ` (min)` : ` (min: ${legalMin}d)`}`
                            : FIELD_LABELS[field];
                          return (
                            <React.Fragment key={field}>
                              <span className="text-xs text-gray-400 whitespace-nowrap">{label}</span>
                              <NumericFieldInput contractId={contract.id} field={field} value={val} canEdit={canEdit} compact hint={null} onSave={saveNumericField} />
                            </React.Fragment>
                          );
                        })}
                      </div>
                      {isFirst && (
                        <p className="text-[11px] text-gray-400 mt-2">↑ Employment start date.</p>
                      )}
                      {dataReady && !period && contract.hours_per_week == null && (
                        <p className="text-[11px] text-gray-400 mt-2">Set hours / week to see balance.</p>
                      )}
                    </div>

                    {/* ── Right: BALANCE THIS PERIOD ───────────────────────── */}
                    {dataReady && period && (
                      <div className="border-t border-gray-100 lg:border-t-0 lg:w-56 lg:shrink-0 lg:bg-gray-50 lg:rounded-xl lg:px-4 lg:py-3">
                        <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-2">Balance this period</p>
                        <div className="grid grid-cols-[auto_auto] gap-x-5 gap-y-1.5 w-fit">
                          {[
                            { label: "Expected",        value: `${fmt(period.result.expectedHours)} hrs` },
                            { label: "Worked",          value: `${fmt(period.result.workedHours)} hrs` },
                            ...(period.result.vacationAccrued != null
                              ? [{ label: "Vacation accrued", value: `${fmt(period.result.vacationAccrued)} days` }]
                              : []),
                            { label: "Sick days",       value: `${contract.sick_days} ${contract.sick_days === 1 ? "day" : "days"}` },
                            { label: "Public holidays", value: `${period.result.holidayCountRaw} days → +${fmt(period.result.holidayCredit)} hrs` },
                            { label: "Daily hours",     value: `${fmt(contract.days_per_week ? Number(contract.hours_per_week) / Number(contract.days_per_week) : Number(contract.hours_per_week) / 5)} hrs/day` },
                            ...(period.result.paidOutHours > 0
                              ? [{ label: "Paid out", value: `−${fmt(period.result.paidOutHours)} hrs`, red: true }]
                              : []),
                          ].map(({ label, value, red }) => (
                            <React.Fragment key={label}>
                              <span className="text-xs text-gray-400 whitespace-nowrap">{label}</span>
                              <span className={`text-xs font-semibold tabular-nums whitespace-nowrap ${red ? "text-red-500" : "text-gray-700"}`}>{value}</span>
                            </React.Fragment>
                          ))}
                        </div>
                        {contract.days_per_week == null && (
                          <p className="text-[11px] text-amber-600 mt-2">Days/week not set — defaulting to 5.</p>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Delete */}
                  {canEdit && displayContracts.length > 1 && (
                    <div className="mt-2 pt-2 border-t border-gray-100">
                      {deleteError && confirmDeleteId === contract.id && (
                        <p className="text-xs text-red-500 mb-2">{deleteError}</p>
                      )}
                      {confirmDeleteId === contract.id ? (
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-gray-500">Delete this contract?</span>
                          <button type="button" onClick={() => deleteContract(contract.id)} disabled={deleting}
                            className="text-xs font-semibold text-red-500 hover:text-red-700 disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-300 rounded">
                            {deleting ? "Deleting…" : "Yes, delete"}
                          </button>
                          <button type="button" onClick={() => { setConfirmDeleteId(null); setDeleteError(null); }}
                            className="text-xs text-gray-400 hover:text-gray-600 rounded">
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button type="button" onClick={() => setConfirmDeleteId(contract.id)}
                          className="text-xs text-gray-400 hover:text-red-500 font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-red-200 rounded">
                          Delete contract
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* ── Diagnostics ──────────────────────────────────────────────────────── */}
      {dataReady && missingClockOut > 0 && (
        <p className="text-[11px] text-red-600 bg-red-50 rounded-lg px-3 py-2 mt-3">
          ⚠️ <strong>{missingClockOut} shift{missingClockOut !== 1 ? "s" : ""}</strong> in this period {missingClockOut !== 1 ? "have" : "has"} no clock-out and <strong>are not counted</strong> in worked hours.
        </p>
      )}

      {/* ── Overtime payouts ─────────────────────────────────────────────────── */}
      {hasContracts && (
        <div className="border-t border-gray-100 mt-3 pt-3">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Overtime payouts</p>
            {canEdit && !showPayoutForm && (
              <button onClick={() => setShowPayoutForm(true)}
                className="text-xs text-indigo-600 font-semibold hover:underline underline-offset-2">
                + Record payout
              </button>
            )}
          </div>

          {showPayoutForm && canEdit && (
            <form onSubmit={submitAdjustment} className="bg-gray-50 rounded-xl p-4 mb-3 flex flex-col gap-3">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="flex flex-col gap-1">
                  <label className="text-[11px] text-gray-400">Hours paid out</label>
                  <input type="number" min="0.5" step="0.5" placeholder="e.g. 8" value={adjHours}
                    onChange={e => setAdjHours(e.target.value)} required
                    className="w-full text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-300 tabular-nums" />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[11px] text-gray-400">Date</label>
                  <DatePicker value={adjDate} onChange={setAdjDate} maxDate={serverToday} />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[11px] text-gray-400">Note (optional)</label>
                  <input type="text" placeholder="e.g. Dec overtime" value={adjNote}
                    onChange={e => setAdjNote(e.target.value)}
                    className="w-full text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-300" />
                </div>
              </div>
              {adjError && <p className="text-xs text-red-500">{adjError}</p>}
              <div className="flex gap-2">
                <button type="submit" disabled={adjSubmitting}
                  className="text-xs bg-gray-900 text-white font-semibold px-4 py-1.5 rounded-lg hover:bg-gray-700 disabled:opacity-50 transition-colors">
                  {adjSubmitting ? "Saving…" : "Save payout"}
                </button>
                <button type="button" onClick={() => { setShowPayoutForm(false); setAdjError(""); }}
                  className="text-xs text-gray-400 hover:text-gray-600 font-semibold px-3 py-1.5">
                  Cancel
                </button>
              </div>
            </form>
          )}

          {adjustments.length === 0 && !showPayoutForm ? (
            <p className="text-xs text-gray-400">No payouts recorded yet.</p>
          ) : (
            <div className="flex flex-col gap-1.5">
              {adjustments.map(a => (
                <div key={a.id} className="flex items-center justify-between text-sm bg-gray-50 rounded-lg px-3 py-2">
                  <div className="flex items-center gap-3">
                    <span className="font-semibold tabular-nums text-red-500">−{Number(a.hours).toFixed(1)}h</span>
                    <span className="text-xs text-gray-400 tabular-nums">{a.adjustment_date.split("-").reverse().join("/")}</span>
                    {a.note && <span className="text-xs text-gray-500">{a.note}</span>}
                  </div>
                  {canEdit && (
                    <button onClick={() => deleteAdjustment(a.id)}
                      className="text-[11px] text-gray-300 hover:text-red-400 font-semibold transition-colors ml-2" title="Remove payout">
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
      )}
    </div>
  );
}
