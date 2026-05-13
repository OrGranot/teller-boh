"use client";
import { useState, useCallback, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import DatePicker from "@/components/DatePicker";
import ShiftTable, { ShiftRow } from "@/components/ShiftTable";

interface Props {
  profileId:     string;
  restaurantId:  string;
  memberName:    string | null;
  currentUserId: string;
  canEdit:       boolean;
  canApprove:    boolean;
  initialYear:   number;
  initialMonth:  number;
  initialShifts: ShiftRow[];
  firstShiftISO: string | null;
  lastShiftISO:  string | null;
}

interface MonthRange { from: string; to: string; }

// ── Helpers ───────────────────────────────────────────────────────────────────

function localISO(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function monthRange(year: number, month: number): MonthRange {
  return {
    from: localISO(new Date(year, month, 1)),
    to:   localISO(new Date(year, month + 1, 0)),
  };
}
function monthRangeFromISO(iso: string): MonthRange {
  const [y, m] = iso.split("-").map(Number);
  return monthRange(y, m - 1);
}
function fmtMonthYear(iso: string) {
  return new Date(iso + "T12:00:00").toLocaleDateString("en-GB", { month: "short", year: "numeric" });
}
function buildISO(dateStr: string, timeStr: string): string {
  const [hh, mm] = timeStr.split(":").map(Number);
  const d = new Date(`${dateStr}T00:00:00`);
  d.setHours(hh, mm, 0, 0);
  return d.toISOString();
}
function fmtDate(iso: string) {
  return new Date(iso + "T12:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

// ── Component ─────────────────────────────────────────────────────────────────

type Phase = "idle" | "date" | "time";

export default function MemberShiftsClient({
  profileId, restaurantId, currentUserId, canEdit, canApprove,
  initialYear, initialMonth, initialShifts, firstShiftISO, lastShiftISO,
}: Props) {
  const supabase = createClient();
  const router   = useRouter();

  const [shifts,  setShifts]  = useState<ShiftRow[]>(initialShifts);
  const [loading, setLoading] = useState(false);
  const [range,   setRange]   = useState<MonthRange>(monthRange(initialYear, initialMonth));
  const timeOutRef = useRef<HTMLInputElement>(null);

  // Add-shift state machine
  const [phase,      setPhase]      = useState<Phase>("idle");
  const [addDate,    setAddDate]    = useState("");
  const [addTimeIn,  setAddTimeIn]  = useState("09:00");
  const [addTimeOut, setAddTimeOut] = useState("17:00");
  const [addSaving,  setAddSaving]  = useState(false);
  const [addError,   setAddError]   = useState("");

  // Escape cancels at any phase
  useEffect(() => {
    if (phase === "idle") return;
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") cancel(); }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phase]);

  // ── Data loading ─────────────────────────────────────────────────────────

  const loadShifts = useCallback(async (r: MonthRange) => {
    setLoading(true);
    const { data } = await supabase
      .from("time_records")
      .select("id, profile_id, clocked_in_at, clocked_out_at, status, notes")
      .eq("profile_id", profileId)
      .gte("clocked_in_at", r.from + "T00:00:00")
      .lte("clocked_in_at", r.to   + "T23:59:59")
      .order("clocked_in_at", { ascending: false });
    setShifts((data as ShiftRow[]) || []);
    setLoading(false);
  }, [profileId]);

  // ── Navigation ───────────────────────────────────────────────────────────

  // Called by DatePicker's onMonthChange (user browses months in the calendar)
  function handleMonthChange(year: number, month: number) {
    const r = monthRange(year, month);
    setRange(r);
    loadShifts(r);
  }

  // Called when user clicks a date in idle mode (just navigate)
  function handleNavDate(date: string) {
    const r = monthRangeFromISO(date);
    setRange(r);
    loadShifts(r);
  }

  function jumpTo(iso: string) {
    const r = monthRangeFromISO(iso);
    setRange(r);
    loadShifts(r);
  }

  // ── Add-shift flow ───────────────────────────────────────────────────────

  function startAdd() {
    setAddDate("");
    setAddTimeIn("09:00");
    setAddTimeOut("17:00");
    setAddError("");
    setPhase("date");
  }

  function cancel() {
    setPhase("idle");
    setAddDate("");
    setAddError("");
  }

  // Phase 1 → 2: user picked a date in the calendar
  function handlePickDate(date: string) {
    setAddDate(date);
    // Navigate list to that month so user sees context
    const r = monthRangeFromISO(date);
    setRange(r);
    loadShifts(r);
    setPhase("time");
  }

  // Phase 2: save
  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setAddError("");

    let inISO  = buildISO(addDate, addTimeIn);
    let outISO = buildISO(addDate, addTimeOut);

    if (new Date(outISO) <= new Date(inISO)) {
      const d = new Date(outISO);
      d.setDate(d.getDate() + 1);
      outISO = d.toISOString();
    }

    setAddSaving(true);
    const res = await fetch("/api/shifts", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ profile_id: profileId, clocked_in_at: inISO, clocked_out_at: outISO }),
    });
    setAddSaving(false);

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setAddError(data.error || "Failed to save shift.");
      return;
    }

    cancel();
    window.dispatchEvent(new CustomEvent("easyboh:shift-changed", { detail: { profileId } }));
    loadShifts(range);
    router.refresh();
  }

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div>
      {/* ── Toolbar ──────────────────────────────────────────────────────── */}
      <div className="mb-4 flex items-center gap-3 flex-wrap min-h-[2.5rem]">

        {/* Jump to first — hide during time-picking to keep toolbar clean */}
        {phase !== "time" && (
          <div className="relative group/tip">
            <button
              type="button"
              disabled={!firstShiftISO}
              onClick={() => firstShiftISO && jumpTo(firstShiftISO)}
              className="text-gray-400 hover:text-gray-700 disabled:opacity-25 disabled:cursor-not-allowed transition-colors text-base leading-none select-none"
            >«</button>
            {firstShiftISO && (
              <div className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5
                opacity-0 group-hover/tip:opacity-100 transition-opacity duration-0
                bg-gray-800 text-white text-[11px] font-medium rounded-md px-2 py-1 whitespace-nowrap z-50">
                First shift: {fmtMonthYear(firstShiftISO)}
                <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-gray-800" />
              </div>
            )}
          </div>
        )}

        {/* ── Phase: idle — normal month navigation ── */}
        {phase === "idle" && (
          <DatePicker
            value={range.from}
            onChange={handleNavDate}
            onMonthChange={handleMonthChange}
          />
        )}

        {/* ── Phase: date — user picks the shift date ── */}
        {phase === "date" && (
          <DatePicker
            value={addDate}
            onChange={handlePickDate}
            onMonthChange={handleMonthChange}
            initialViewDate={range.from}
            autoOpen
            placeholder="Pick a date for the shift"
          />
        )}

        {/* ── Phase: time — user sets clock-in / clock-out ── */}
        {phase === "time" && (
          <form onSubmit={handleSave} className="flex flex-col gap-2 flex-1">
            <div className="flex items-end gap-3 flex-wrap">
              {/* Selected date — click to go back and change */}
              <div className="flex flex-col gap-1">
                <span className="text-[10px] font-semibold text-transparent uppercase tracking-wide select-none">Date</span>
                <button
                  type="button"
                  onClick={() => setPhase("date")}
                  title="Change date"
                  className="text-sm font-semibold text-gray-700 hover:text-indigo-600 transition-colors underline underline-offset-2 decoration-gray-300 py-2 leading-none"
                >
                  {fmtDate(addDate)}
                </button>
              </div>

              {/* Clock in */}
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">In</label>
                <input
                  type="time"
                  value={addTimeIn}
                  autoFocus
                  onChange={e => setAddTimeIn(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === "Enter") { e.preventDefault(); timeOutRef.current?.focus(); }
                  }}
                  required
                  className="font-mono text-sm border border-gray-200 rounded-xl px-3 py-2 outline-none focus:border-gray-800 focus:ring-1 focus:ring-gray-800 transition-colors bg-white tabular-nums"
                />
              </div>

              <span className="text-gray-300 self-end pb-2.5">→</span>

              {/* Clock out */}
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Out</label>
                <input
                  ref={timeOutRef}
                  type="time"
                  value={addTimeOut}
                  onChange={e => setAddTimeOut(e.target.value)}
                  required
                  className="font-mono text-sm border border-gray-200 rounded-xl px-3 py-2 outline-none focus:border-gray-800 focus:ring-1 focus:ring-gray-800 transition-colors bg-white tabular-nums"
                />
              </div>

              <div className="flex items-center gap-2 self-end">
                <button
                  type="submit"
                  disabled={addSaving}
                  className="text-xs font-semibold px-4 py-2 rounded-xl bg-gray-900 text-white hover:bg-gray-700 disabled:opacity-50 transition-colors"
                >
                  {addSaving ? "Saving…" : "Save shift"}
                </button>
                <button
                  type="button"
                  onClick={cancel}
                  className="text-xs font-semibold px-3 py-2 rounded-xl text-gray-500 hover:text-gray-800 hover:bg-gray-100 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>

            {addError && (
              <p className="text-xs text-red-500">{addError}</p>
            )}
          </form>
        )}

        {/* Jump to last */}
        {phase !== "time" && (
          <button
            type="button"
            disabled={!lastShiftISO}
            onClick={() => lastShiftISO && jumpTo(lastShiftISO)}
            title={lastShiftISO ? `Last shift: ${fmtMonthYear(lastShiftISO)}` : "No shifts"}
            className="text-gray-400 hover:text-gray-700 disabled:opacity-25 disabled:cursor-not-allowed transition-colors text-base leading-none select-none"
          >»</button>
        )}

        {/* Add / Cancel button */}
        {canEdit && phase !== "time" && (
          <button
            type="button"
            onClick={phase === "idle" ? startAdd : cancel}
            className={`ml-auto text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors ${
              phase !== "idle"
                ? "text-gray-500 bg-gray-100 hover:bg-gray-200"
                : "text-indigo-600 bg-indigo-50 hover:bg-indigo-100"
            }`}
          >
            {phase !== "idle" ? "✕ Cancel" : "+ Add shift"}
          </button>
        )}
      </div>

      {/* ── Shift table ──────────────────────────────────────────────────── */}
      <ShiftTable
        shifts={shifts}
        loading={loading}
        currentUserId={currentUserId}
        canEdit={canEdit}
        canApprove={canApprove}
        hideClockOut
        onRefresh={() => { loadShifts(range); router.refresh(); }}
      />
    </div>
  );
}
