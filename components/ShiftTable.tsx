"use client";
import React, { useState } from "react";
import Link from "next/link";
import TimeInput from "@/components/TimeInput";
import { createClient } from "@/lib/supabase/client";
import DepartmentTags from "@/components/DepartmentTags";
import ConfirmModal from "@/components/ConfirmModal";

// ── Types ─────────────────────────────────────────────────────
export interface ShiftRow {
  id: string;
  profile_id: string;
  clocked_in_at: string;
  clocked_out_at: string | null;
  status: string;
  notes: string | null;
  department?: { name: string } | null;
}

interface Props {
  shifts: ShiftRow[];
  loading?: boolean;
  currentUserId: string;
  canEdit: boolean;
  canApprove?: boolean;
  /** Pass to show employee name column and link each row to their profile page */
  profilesMap?: Record<string, string>;
  /** Employee department memberships per profile, shown in the Department column */
  profileDeptMap?: Record<string, { id: string; name: string }[]>;
  /** All available departments — enables editing from within the table */
  allDepartments?: { id: string; name: string }[];
  /** Called when a brand-new department is created inside the table, so parent can propagate */
  onDepartmentCreated?: (dept: { id: string; name: string }) => void;
  /** Called when a dept is toggled on/off for a profile */
  onDepartmentToggled?: (profileId: string, dept: { id: string; name: string }, assigned: boolean) => void;
  /** Called when a dept is auto-deleted (no remaining members) */
  onDepartmentDeleted?: (dept: { id: string; name: string }) => void;
  onRefresh: () => void;
}

// ── Helpers ───────────────────────────────────────────────────
const pad = (n: number) => String(n).padStart(2, "0");

function toTimeInput(iso: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function formatTime(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

function calcHours(inAt: string, outAt: string | null) {
  if (!outAt) return "—";
  const h = (new Date(outAt).getTime() - new Date(inAt).getTime()) / 3600000;
  return `${h.toFixed(2)} hrs`;
}

function buildISO(originalISO: string, newTime: string, clockInISO?: string): string {
  const [hh, mm] = newTime.split(":").map(Number);
  const refDate = clockInISO ? new Date(clockInISO) : new Date(originalISO);
  const result = new Date(refDate);
  result.setHours(hh, mm, 0, 0);
  if (clockInISO) {
    const inTime = new Date(clockInISO);
    if (hh * 60 + mm < inTime.getHours() * 60 + inTime.getMinutes()) {
      result.setDate(result.getDate() + 1);
    }
  }
  return result.toISOString();
}

const STATUS_STYLE: Record<string, string> = {
  active:   "bg-blue-50 text-blue-700",
  pending:  "bg-amber-50 text-amber-700",
  approved: "bg-green-50 text-green-700",
  rejected: "bg-red-50 text-red-700",
};

type SortKey = "date" | "employee" | "status";
type SortDir = "asc" | "desc";
type EditKey = `${string}:${"in" | "out"}`;


function SortTh({ label, sortKey, current, dir, onSort, className = "" }: {
  label: string; sortKey: SortKey; current: SortKey; dir: SortDir;
  onSort: (k: SortKey) => void; className?: string;
}) {
  const active = current === sortKey;
  return (
    <th className={`text-left px-3 py-3 cursor-pointer select-none group ${className}`} onClick={() => onSort(sortKey)}>
      <span className="inline-flex items-center gap-1 text-xs font-semibold text-gray-400">
        <span className={active ? "text-gray-700" : ""}>{label}</span>
        <span className={`text-[10px] transition-opacity ${active ? "opacity-100" : "opacity-0 group-hover:opacity-40"}`}>
          {active && dir === "asc" ? "↑" : "↓"}
        </span>
      </span>
    </th>
  );
}

// ── Component ─────────────────────────────────────────────────
export default function ShiftTable({
  shifts, loading, currentUserId, canEdit, canApprove = false, profilesMap, profileDeptMap, allDepartments = [],
  onDepartmentCreated, onDepartmentToggled, onDepartmentDeleted, onRefresh,
}: Props) {
  const supabase = createClient();
  const showEmployee = !!profilesMap;
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  // Editing
  const [editingCell, setEditingCell] = useState<EditKey | null>(null);
  const [saving,      setSaving]      = useState<string | null>(null);
  const [editError,   setEditError]   = useState<string | null>(null);
  const [saveError,   setSaveError]   = useState<string | null>(null);

  // Row expand (mobile drawer)
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  function toggleExpand(id: string) {
    setExpandedIds(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }

  // Sorting
  const [sortKey, setSortKey] = useState<SortKey>("date");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("asc"); }
  }

  function startEdit(shiftId: string, field: "in" | "out") {
    if (!canEdit) return;
    const s = shifts.find(x => x.id === shiftId)!;
    if (s.status === "active") return;
    setEditingCell(`${shiftId}:${field}`);
    setEditError(null);
    setSaveError(null);
  }

  async function commitEdit(shiftId: string, field: "in" | "out", finalValue: string) {
    const s = shifts.find(x => x.id === shiftId);
    if (!s || !finalValue) { setEditingCell(null); return; }

    const isoValue = field === "in"
      ? buildISO(s.clocked_in_at, finalValue)
      : buildISO(s.clocked_out_at || s.clocked_in_at, finalValue, s.clocked_in_at);

    // Validation
    if (field === "out" && s.clocked_in_at && new Date(isoValue) <= new Date(s.clocked_in_at)) {
      setEditError(`${shiftId}:out`); setEditingCell(null);
      setTimeout(() => setEditError(null), 3000); return;
    }
    if (field === "in" && s.clocked_out_at && new Date(isoValue) >= new Date(s.clocked_out_at)) {
      setEditError(`${shiftId}:in`); setEditingCell(null);
      setTimeout(() => setEditError(null), 3000); return;
    }

    setSaving(`${shiftId}:${field}`);
    const payload = field === "in" ? { clocked_in_at: isoValue } : { clocked_out_at: isoValue };

    const res = await fetch(`/api/shifts/${shiftId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    setSaving(null);
    setEditingCell(null);

    if (!res.ok) {
      setSaveError(`${shiftId}:${field}`);
      setTimeout(() => setSaveError(null), 4000); return;
    }
    onRefresh();
  }

  async function handleApprove(id: string) {
    await supabase.from("time_records").update({
      status: "approved", approved_by: currentUserId, approved_at: new Date().toISOString(),
    }).eq("id", id);
    onRefresh();
  }

  async function handleDelete(id: string) {
    await fetch(`/api/shifts/${id}`, { method: "DELETE" });
    setDeleteConfirm(null);
    onRefresh();
  }

  async function handleClockOut(id: string) {
    setSaving(`${id}:clockout`);
    await fetch(`/api/shifts/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clocked_out_at: new Date().toISOString(), status: "pending" }),
    });
    setSaving(null);
    onRefresh();
  }

  // ── Sort ───────────────────────────────────────────────────
  const sorted = [...shifts].sort((a, b) => {
    let cmp = 0;
    if (sortKey === "date")     cmp = new Date(a.clocked_in_at).getTime() - new Date(b.clocked_in_at).getTime();
    if (sortKey === "employee") cmp = (profilesMap?.[a.profile_id] ?? "").localeCompare(profilesMap?.[b.profile_id] ?? "");
    if (sortKey === "status")   cmp = a.status.localeCompare(b.status);
    return sortDir === "asc" ? cmp : -cmp;
  });

  // Net hours: deduct 30 min for any shift over 6 hrs
  const netHours = sorted.reduce((sum, s) => {
    if (!s.clocked_out_at) return sum;
    const h = (new Date(s.clocked_out_at).getTime() - new Date(s.clocked_in_at).getTime()) / 3600000;
    return sum + h - (h > 6 ? 0.5 : 0);
  }, 0);

  // Mobile column count: Date + [Employee] + Hours + Status + Expand chevron
  const mobileColSpan = 3 + (showEmployee ? 1 : 0) + 1;

  // Helper — the clock-in / clock-out cell content (used in both main row and expand drawer)
  function ClockInCell({ s, editable }: { s: typeof sorted[0]; editable: boolean }) {
    const editIn = editingCell === `${s.id}:in`;
    return editIn ? (
      <TimeInput value={toTimeInput(s.clocked_in_at)}
        onCommit={v => commitEdit(s.id, "in", v)} onCancel={() => setEditingCell(null)} />
    ) : (
      <span className="inline-flex flex-col gap-0.5">
        <span onClick={() => editable && startEdit(s.id, "in")}
          className={`font-mono text-xs ${editable ? "cursor-pointer hover:text-indigo-600 hover:underline underline-offset-2" : ""} ${editError === `${s.id}:in` ? "text-red-500" : ""}`}>
          {formatTime(s.clocked_in_at)}
        </span>
        {editError === `${s.id}:in` && <span className="text-[10px] text-red-500">Must be before end</span>}
        {saveError === `${s.id}:in` && <span className="text-[10px] text-red-500">Save failed</span>}
      </span>
    );
  }

  function ClockOutCell({ s, editable }: { s: typeof sorted[0]; editable: boolean }) {
    const editOut = editingCell === `${s.id}:out`;
    const nextDay = s.clocked_out_at &&
      new Date(s.clocked_out_at).toDateString() !== new Date(s.clocked_in_at).toDateString();
    return editOut ? (
      <TimeInput value={toTimeInput(s.clocked_out_at)}
        onCommit={v => commitEdit(s.id, "out", v)} onCancel={() => setEditingCell(null)} />
    ) : (
      <span className="inline-flex flex-col gap-0.5">
        <span onClick={() => editable && startEdit(s.id, "out")}
          className={`font-mono text-xs inline-flex items-center gap-1 ${editable ? "cursor-pointer hover:text-indigo-600 hover:underline underline-offset-2" : ""} ${editError === `${s.id}:out` ? "text-red-500" : ""}`}>
          {s.clocked_out_at ? formatTime(s.clocked_out_at) : <span className="text-gray-300">—</span>}
          {nextDay && <span className="text-[10px] font-semibold bg-amber-100 text-amber-600 px-1 rounded">+1</span>}
        </span>
        {editError === `${s.id}:out` && <span className="text-[10px] text-red-500">Must be after start</span>}
        {saveError === `${s.id}:out` && <span className="text-[10px] text-red-500">Save failed</span>}
      </span>
    );
  }

  return (
    <div className="bg-white rounded-2xl overflow-hidden w-full min-w-0" style={{ boxShadow: "0 2px 12px rgba(0,0,0,0.05)" }}>

      {/* Stats header */}
      <div className="px-4 sm:px-5 py-3 border-b border-gray-100 flex items-center gap-4">
        <span className={`text-sm text-gray-600 transition-opacity ${loading ? "opacity-40" : ""}`}>
          <span className="font-semibold">{sorted.length}</span>{" "}shift{sorted.length !== 1 ? "s" : ""}
        </span>
        <span className={`text-sm text-gray-600 flex items-center gap-1.5 transition-opacity ${loading ? "opacity-40" : ""}`}>
          <span className="font-semibold">{netHours.toFixed(1)}</span> hrs
          <span className="relative group inline-flex items-center cursor-help">
            <span className="w-3.5 h-3.5 rounded-full border border-gray-300 text-gray-400 text-[9px] font-bold inline-flex items-center justify-center leading-none select-none">?</span>
            <div className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:flex flex-col items-center z-[60]">
              <div className="bg-gray-900 text-white text-[11px] rounded-lg px-3 py-2 shadow-xl max-w-[200px] text-center">
                30-min break deducted for shifts over 6 hours
              </div>
              <div className="border-[5px] border-transparent border-t-gray-900 -mt-px" />
            </div>
          </span>
        </span>
      </div>

      {/* Table — no internal scroll; columns collapse on narrow screens */}
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-100">
            <SortTh label="Date"     sortKey="date"     current={sortKey} dir={sortDir} onSort={toggleSort} className="px-4 sm:px-5 whitespace-nowrap" />
            {showEmployee && <SortTh label="Employee"   sortKey="employee" current={sortKey} dir={sortDir} onSort={toggleSort} className="whitespace-nowrap" />}
            {/* Clock in / out — hidden on mobile */}
            <th className="hidden sm:table-cell text-left px-3 py-3 text-xs font-semibold text-gray-400 whitespace-nowrap">In</th>
            <th className="hidden sm:table-cell text-left px-3 py-3 text-xs font-semibold text-gray-400 whitespace-nowrap">Out</th>
            <th className="text-left px-3 py-3 text-xs font-semibold text-gray-400 whitespace-nowrap">Hours</th>
            {/* Department — hidden on mobile */}
            {showEmployee && <th className="hidden sm:table-cell text-left px-3 py-3 text-xs font-semibold text-gray-400 whitespace-nowrap">Dept</th>}
            <SortTh label="Status"   sortKey="status"   current={sortKey} dir={sortDir} onSort={toggleSort} className="whitespace-nowrap" />
            {/* Desktop actions column */}
            {canEdit && <th className="hidden sm:table-cell px-4 py-3" />}
            {/* Mobile expand chevron column */}
            <th className="sm:hidden px-3 py-3 w-8" />
          </tr>
        </thead>

        <tbody className={loading ? "opacity-40 pointer-events-none" : ""}>
          {sorted.length === 0 ? (
            <tr>
              <td colSpan={10} className="px-5 py-10 text-center text-sm text-gray-400">
                No shifts for this period.
              </td>
            </tr>
          ) : sorted.map((s, i) => {
            const isSaving   = saving?.startsWith(s.id);
            const editable   = canEdit && s.status !== "active";
            const isExpanded = expandedIds.has(s.id);
            const isLast     = i === sorted.length - 1;

            return (
              <React.Fragment key={s.id}>
                {/* ── Main row ── */}
                <tr className={`group transition-colors hover:bg-gray-50 ${!isLast || isExpanded ? "border-b border-gray-100" : ""}`}>

                  <td className="px-4 sm:px-5 py-3 text-xs text-gray-500 whitespace-nowrap">{formatDate(s.clocked_in_at)}</td>

                  {showEmployee && (
                    <td className="px-3 py-3 font-semibold whitespace-nowrap">
                      {profilesMap?.[s.profile_id]
                        ? <Link href={`/team/${s.profile_id}`} className="hover:text-indigo-600 transition-colors">{profilesMap[s.profile_id]}</Link>
                        : "—"}
                    </td>
                  )}

                  {/* Clock in — desktop only */}
                  <td className="hidden sm:table-cell px-3 py-3">
                    <ClockInCell s={s} editable={editable} />
                  </td>

                  {/* Clock out — desktop only */}
                  <td className="hidden sm:table-cell px-3 py-3">
                    <ClockOutCell s={s} editable={editable} />
                  </td>

                  {/* Hours — always */}
                  <td className="px-3 py-3 text-gray-600 text-xs whitespace-nowrap">
                    {isSaving ? <span className="text-gray-400">…</span> : calcHours(s.clocked_in_at, s.clocked_out_at)}
                  </td>

                  {/* Department — desktop only */}
                  {showEmployee && (
                    <td className="hidden sm:table-cell px-3 py-3">
                      <DepartmentTags
                        profileId={s.profile_id}
                        initialDepartments={profileDeptMap?.[s.profile_id] || []}
                        allDepartments={allDepartments}
                        canEdit={canEdit} canCreate compact
                        onCreated={onDepartmentCreated}
                        onToggled={(dept, assigned) => onDepartmentToggled?.(s.profile_id, dept, assigned)}
                        onDeleted={onDepartmentDeleted}
                      />
                    </td>
                  )}

                  {/* Status — always */}
                  <td className="px-3 py-3">
                    {s.status === "pending" && canApprove ? (
                      <button onClick={() => handleApprove(s.id)}
                        className="text-xs font-semibold px-2.5 py-1 rounded-full bg-amber-50 text-amber-700 hover:bg-amber-100 transition-colors whitespace-nowrap">
                        Approve
                      </button>
                    ) : (
                      <span className={`text-xs font-semibold px-2.5 py-1 rounded-full whitespace-nowrap ${STATUS_STYLE[s.status] || ""}`}>
                        {s.status.charAt(0).toUpperCase() + s.status.slice(1)}
                      </span>
                    )}
                  </td>

                  {/* Desktop actions — hover reveal */}
                  {canEdit && (
                    <td className="hidden sm:table-cell px-4 py-3">
                      <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        {s.status === "active" && (
                          <button onClick={() => handleClockOut(s.id)} disabled={saving === `${s.id}:clockout`}
                            className="text-xs font-semibold px-2.5 py-1 rounded-lg bg-gray-900 text-white hover:bg-gray-700 disabled:opacity-50 transition-colors whitespace-nowrap">
                            {saving === `${s.id}:clockout` ? "…" : "Clock out"}
                          </button>
                        )}
                        <button onClick={() => setDeleteConfirm(s.id)}
                          className="text-xs text-red-400 hover:text-red-600 font-semibold transition-colors">
                          Delete
                        </button>
                      </div>
                    </td>
                  )}

                  {/* Mobile expand chevron */}
                  <td className="sm:hidden px-3 py-3 w-8">
                    <button
                      type="button"
                      onClick={() => toggleExpand(s.id)}
                      className="text-gray-400 hover:text-gray-600 transition-colors"
                      aria-label={isExpanded ? "Collapse" : "Expand"}
                    >
                      <svg className={`w-4 h-4 transition-transform ${isExpanded ? "rotate-180" : ""}`} viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" clipRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" />
                      </svg>
                    </button>
                  </td>
                </tr>

                {/* ── Mobile expand drawer — hidden on sm+ ── */}
                {isExpanded && (
                  <tr className="sm:hidden bg-gray-50 border-b border-gray-100">
                    <td colSpan={mobileColSpan} className="px-4 pb-3 pt-1">
                      <div className="grid grid-cols-2 gap-x-6 gap-y-3">
                        <div>
                          <p className="text-[10px] text-gray-400 uppercase tracking-wide mb-1">Clock in</p>
                          <ClockInCell s={s} editable={editable} />
                        </div>
                        <div>
                          <p className="text-[10px] text-gray-400 uppercase tracking-wide mb-1">Clock out</p>
                          <ClockOutCell s={s} editable={editable} />
                        </div>
                        {showEmployee && (
                          <div className="col-span-2">
                            <p className="text-[10px] text-gray-400 uppercase tracking-wide mb-1">Department</p>
                            <DepartmentTags
                              profileId={s.profile_id}
                              initialDepartments={profileDeptMap?.[s.profile_id] || []}
                              allDepartments={allDepartments}
                              canEdit={canEdit} canCreate compact
                              onCreated={onDepartmentCreated}
                              onToggled={(dept, assigned) => onDepartmentToggled?.(s.profile_id, dept, assigned)}
                              onDeleted={onDepartmentDeleted}
                            />
                          </div>
                        )}
                        {/* Actions */}
                        {canEdit && (
                          <div className="col-span-2 flex gap-2 pt-1 border-t border-gray-200">
                            {s.status === "pending" && canApprove && (
                              <button onClick={() => { handleApprove(s.id); toggleExpand(s.id); }}
                                className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-green-600 text-white hover:bg-green-700 transition-colors">
                                ✓ Approve
                              </button>
                            )}
                            {s.status === "active" && (
                              <button onClick={() => { handleClockOut(s.id); toggleExpand(s.id); }}
                                disabled={saving === `${s.id}:clockout`}
                                className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-gray-900 text-white hover:bg-gray-700 disabled:opacity-50 transition-colors">
                                {saving === `${s.id}:clockout` ? "…" : "Clock out"}
                              </button>
                            )}
                            <button onClick={() => setDeleteConfirm(s.id)}
                              className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-red-200 text-red-500 hover:bg-red-50 transition-colors">
                              Delete
                            </button>
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                )}
              </React.Fragment>
            );
          })}
        </tbody>
      </table>

      {deleteConfirm && (
        <ConfirmModal
          title="Delete shift record?"
          message="This action cannot be undone."
          confirmLabel="Delete"
          danger
          onConfirm={() => handleDelete(deleteConfirm)}
          onCancel={() => setDeleteConfirm(null)}
        />
      )}
    </div>
  );
}
