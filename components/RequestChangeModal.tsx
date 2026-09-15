"use client";
import { useState, useEffect } from "react";
import DatePicker from "@/components/DatePicker";

interface Props {
  restaurantId: string;
  /** Existing shift to request a change for — null for a brand-new shift request */
  shift?: { id: string; clocked_in_at: string; clocked_out_at: string | null } | null;
  onSaved: () => void;
  onClose: () => void;
}

function todayLocal() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function toDateStr(iso: string) {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function toTimeStr(iso: string) {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function buildISO(dateStr: string, timeStr: string): string {
  const [hh, mm] = timeStr.split(":").map(Number);
  const d = new Date(`${dateStr}T00:00:00`);
  d.setHours(hh, mm, 0, 0);
  return d.toISOString();
}

export default function RequestChangeModal({ shift, onSaved, onClose }: Props) {
  const isNew = !shift;

  const [date, setDate] = useState(shift ? toDateStr(shift.clocked_in_at) : todayLocal);
  const [timeIn, setTimeIn] = useState(shift ? toTimeStr(shift.clocked_in_at) : "09:00");
  const [timeOut, setTimeOut] = useState(
    shift?.clocked_out_at ? toTimeStr(shift.clocked_out_at) : "17:00"
  );
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    const inISO = buildISO(date, timeIn);
    let outISO = buildISO(date, timeOut);

    if (new Date(outISO) <= new Date(inISO)) {
      const d = new Date(outISO);
      d.setDate(d.getDate() + 1);
      outISO = d.toISOString();
    }

    if (new Date(outISO) <= new Date(inISO)) {
      setError("End time must be after start time.");
      return;
    }

    setSaving(true);
    const res = await fetch("/api/shift-requests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        shift_id: shift?.id ?? null,
        requested_in: inISO,
        requested_out: outISO,
        reason: reason.trim(),
      }),
    });
    setSaving(false);

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Failed to submit request.");
      return;
    }

    onSaved();
    onClose();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-[2px]"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4">
        <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100">
          <h2 className="text-base font-bold text-gray-900">
            {isNew ? "Request new shift" : "Request time change"}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-xl leading-none transition-colors cursor-pointer">×</button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Date</label>
            {isNew ? (
              <DatePicker value={date} onChange={setDate} />
            ) : (
              <p className="text-sm font-semibold text-gray-900 px-3 py-2.5 bg-gray-50 rounded-xl border border-gray-100">
                {new Date(date + "T12:00:00").toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}
              </p>
            )}
          </div>

          {!isNew && shift?.clocked_out_at && (
            <div className="text-xs text-gray-400 bg-gray-50 rounded-xl px-3 py-2 border border-gray-100">
              Current: {toTimeStr(shift.clocked_in_at)} → {toTimeStr(shift.clocked_out_at)}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                {isNew ? "Clock in" : "Corrected in"}
              </label>
              <input
                type="time"
                value={timeIn}
                onChange={e => setTimeIn(e.target.value)}
                required
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm font-mono outline-none focus:border-gray-800 transition-colors"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                {isNew ? "Clock out" : "Corrected out"}
              </label>
              <input
                type="time"
                value={timeOut}
                onChange={e => setTimeOut(e.target.value)}
                required
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm font-mono outline-none focus:border-gray-800 transition-colors"
              />
            </div>
          </div>
          <p className="text-xs text-gray-400 -mt-1">If end is earlier than start, the shift is treated as overnight (+1 day).</p>

          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Reason</label>
            <textarea
              value={reason}
              onChange={e => setReason(e.target.value)}
              rows={2}
              placeholder="e.g. Forgot to clock in"
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-gray-800 transition-colors resize-none"
            />
          </div>

          {error && (
            <p className="text-sm text-red-500 bg-red-50 rounded-xl px-3 py-2">{error}</p>
          )}

          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold text-gray-600 bg-gray-100 hover:bg-gray-200 transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold text-white bg-gray-900 hover:bg-gray-700 disabled:opacity-50 transition-colors cursor-pointer"
            >
              {saving ? "Submitting…" : "Submit request"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
