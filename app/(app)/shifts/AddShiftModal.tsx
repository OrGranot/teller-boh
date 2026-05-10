"use client";
import { useState, useEffect, useRef } from "react";
import DatePicker from "@/components/DatePicker";

interface TeamMember { profile_id: string; name: string | null; }

interface Props {
  restaurantId:     string;
  currentUserId:    string;
  teamMembers:      TeamMember[];
  onSaved:          () => void;
  onClose:          () => void;
  /** When provided, skips the employee picker and always uses this profile */
  lockedProfileId?: string;
  /** Display name shown when the employee is locked */
  lockedName?:      string | null;
}

function todayLocal() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function buildISO(dateStr: string, timeStr: string): string {
  const [hh, mm] = timeStr.split(":").map(Number);
  const d = new Date(`${dateStr}T00:00:00`);
  d.setHours(hh, mm, 0, 0);
  return d.toISOString();
}

export default function AddShiftModal({
  currentUserId, teamMembers, onSaved, onClose,
  lockedProfileId, lockedName,
}: Props) {
  const [profileId, setProfileId] = useState(lockedProfileId ?? currentUserId);
  const [date,      setDate]      = useState(todayLocal);
  const [timeIn,    setTimeIn]    = useState("09:00");
  const [timeOut,   setTimeOut]   = useState("17:00");
  const [saving,    setSaving]    = useState(false);
  const [error,     setError]     = useState("");

  const firstInputRef = useRef<HTMLSelectElement>(null);
  useEffect(() => {
    if (!lockedProfileId) firstInputRef.current?.focus();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Close on Escape
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    const inISO  = buildISO(date, timeIn);
    let   outISO = buildISO(date, timeOut);

    // Handle overnight shifts
    if (new Date(outISO) <= new Date(inISO)) {
      const d = new Date(outISO);
      d.setDate(d.getDate() + 1);
      outISO = d.toISOString();
    }

    // Final sanity check (shouldn't happen after auto next-day)
    if (new Date(outISO) <= new Date(inISO)) {
      setError("End time must be after start time.");
      return;
    }

    setSaving(true);
    const res = await fetch("/api/shifts", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ profile_id: profileId, clocked_in_at: inISO, clocked_out_at: outISO }),
    });
    setSaving(false);

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Failed to save shift.");
      return;
    }

    onSaved();
    onClose();
  }

  return (
    /* Backdrop */
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-[2px]"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100">
          <h2 className="text-base font-bold text-gray-900">Add shift</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-xl leading-none transition-colors">×</button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          {/* Employee — hidden when locked to a specific profile */}
          {lockedProfileId ? (
            lockedName ? (
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Employee</label>
                <p className="text-sm font-semibold text-gray-900 px-3 py-2.5 bg-gray-50 rounded-xl border border-gray-100">
                  {lockedName}
                </p>
              </div>
            ) : null
          ) : (
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Employee</label>
              <select
                ref={firstInputRef}
                value={profileId}
                onChange={e => setProfileId(e.target.value)}
                required
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-white outline-none focus:border-gray-800 transition-colors"
              >
                {teamMembers.map(m => (
                  <option key={m.profile_id} value={m.profile_id}>
                    {m.name || m.profile_id}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Date */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Date</label>
            <DatePicker value={date} onChange={setDate} />
          </div>

          {/* Times */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Clock in</label>
              <input
                type="time"
                value={timeIn}
                onChange={e => setTimeIn(e.target.value)}
                required
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm font-mono outline-none focus:border-gray-800 transition-colors"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Clock out</label>
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

          {error && (
            <p className="text-sm text-red-500 bg-red-50 rounded-xl px-3 py-2">{error}</p>
          )}

          {/* Actions */}
          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold text-gray-600 bg-gray-100 hover:bg-gray-200 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold text-white bg-gray-900 hover:bg-gray-700 disabled:opacity-50 transition-colors"
            >
              {saving ? "Saving…" : "Add shift"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
