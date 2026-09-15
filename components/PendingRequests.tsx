"use client";
import { useState, useEffect, useCallback } from "react";

interface ShiftRequest {
  id: string;
  profile_id: string;
  shift_id: string | null;
  requested_in: string;
  requested_out: string;
  reason: string;
  created_at: string;
  profile: { name: string | null } | null;
  shift: { clocked_in_at: string; clocked_out_at: string | null } | null;
}

function fmt(iso: string) {
  const d = new Date(iso);
  return d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
}

function hours(inISO: string, outISO: string) {
  const h = (new Date(outISO).getTime() - new Date(inISO).getTime()) / 3_600_000;
  return h > 6 ? h - 0.5 : h;
}

export default function PendingRequests({ onApproved }: { onApproved: () => void }) {
  const [requests, setRequests] = useState<ShiftRequest[]>([]);
  const [acting, setActing] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/shift-requests");
    if (res.ok) setRequests(await res.json());
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function handleAction(id: string, action: "approve" | "reject") {
    setActing(id);
    const res = await fetch(`/api/shift-requests/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    setActing(null);
    if (res.ok) {
      setRequests(prev => prev.filter(r => r.id !== id));
      if (action === "approve") onApproved();
    }
  }

  if (requests.length === 0) return null;

  return (
    <div className="mb-4 bg-white rounded-2xl border border-amber-200 overflow-hidden" style={{ boxShadow: "0 2px 12px rgba(0,0,0,0.04)" }}>
      <div className="px-4 sm:px-5 py-3 bg-amber-50 border-b border-amber-200 flex items-center gap-2">
        <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
        <span className="text-sm font-semibold text-amber-800">
          {requests.length} shift change request{requests.length !== 1 ? "s" : ""}
        </span>
      </div>

      <div className="divide-y divide-gray-100">
        {requests.map(r => {
          const isNew = !r.shift_id;
          const name = r.profile?.name ?? "Unknown";
          const reqHours = hours(r.requested_in, r.requested_out);

          return (
            <div key={r.id} className="px-4 sm:px-5 py-3 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold text-sm text-gray-900">{name}</span>
                  <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${isNew ? "bg-blue-50 text-blue-700" : "bg-amber-50 text-amber-700"}`}>
                    {isNew ? "New shift" : "Change"}
                  </span>
                  <span className="text-xs text-gray-400">{fmtDate(r.requested_in)}</span>
                </div>

                <div className="mt-1 text-xs text-gray-600 flex items-center gap-2 flex-wrap">
                  {!isNew && r.shift && (
                    <>
                      <span className="text-gray-400 line-through">
                        {fmt(r.shift.clocked_in_at)}–{r.shift.clocked_out_at ? fmt(r.shift.clocked_out_at) : "?"}
                      </span>
                      <span className="text-gray-300">→</span>
                    </>
                  )}
                  <span className="font-mono font-semibold">
                    {fmt(r.requested_in)}–{fmt(r.requested_out)}
                  </span>
                  <span className="text-gray-400">({reqHours.toFixed(1)}h)</span>
                </div>

                <p className="mt-1 text-xs text-gray-500 italic">"{r.reason}"</p>
              </div>

              <div className="flex gap-2 flex-shrink-0">
                <button
                  onClick={() => handleAction(r.id, "reject")}
                  disabled={acting === r.id}
                  className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-100 disabled:opacity-50 transition-colors cursor-pointer"
                >
                  Reject
                </button>
                <button
                  onClick={() => handleAction(r.id, "approve")}
                  disabled={acting === r.id}
                  className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-green-600 text-white hover:bg-green-700 disabled:opacity-50 transition-colors cursor-pointer"
                >
                  ✓ Approve
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
