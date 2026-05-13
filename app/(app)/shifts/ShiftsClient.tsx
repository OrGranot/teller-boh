"use client";
import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { TimeRecord, Department } from "@/lib/types";
import ImportButton from "./ImportButton";
import AddShiftModal from "./AddShiftModal";
import DateRangePicker, { DateRange } from "@/components/DateRangePicker";
import ShiftTable, { ShiftRow } from "@/components/ShiftTable";
import SearchableSelect from "@/components/SearchableSelect";
import ChecklistSelect from "@/components/ChecklistSelect";
import LiveDuration from "@/components/LiveDuration";
import { useImport } from "@/lib/import-context";

interface ActiveEmployee {
  id: string;
  profile_id: string;
  clocked_in_at: string;
}

type EmployeeStatus = "active" | "imported" | "deactivated";
interface TeamMember { profile_id: string; name: string | null; employeeStatus: EmployeeStatus; }

const EMPLOYEE_STATUS_OPTS: { value: EmployeeStatus; label: string }[] = [
  { value: "active",      label: "Active"      },
  { value: "imported",    label: "Imported"    },
  { value: "deactivated", label: "Deactivated" },
];

interface Props {
  currentUserId: string;
  restaurantId: string;
  canViewAll: boolean;
  canApprove: boolean;
  canEdit: boolean;
  isCurrentUserDeactivated: boolean;
  departments: Department[];
  teamMembers: TeamMember[];
  profilesMap: Record<string, string>;
  profileDeptMap: Record<string, { id: string; name: string }[]>;
}

function formatTime(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

export default function ShiftsClient({
  currentUserId, restaurantId, canViewAll, canApprove, canEdit,
  isCurrentUserDeactivated,
  departments, teamMembers, profilesMap, profileDeptMap,
}: Props) {
  const supabase = createClient();
  const router   = useRouter();
  const { isRunning: importRunning } = useImport();

  const [records,       setRecords]       = useState<ShiftRow[]>([]);
  const [loading,       setLoading]       = useState(true);
  const [clocking,      setClocking]      = useState(false);
  const [activeShift,   setActiveShift]   = useState<TimeRecord | null>(null);
  const [showAddShift,  setShowAddShift]  = useState(false);
  const [activeEmployees, setActiveEmployees] = useState<ActiveEmployee[]>([]);
  const [clockingOutId,  setClockingOutId]  = useState<string | null>(null);

  // Keep allDepartments in state so creating a new dept in any row updates all rows instantly
  // Stored as narrow {id,name} so onDepartmentCreated can append without type mismatch
  const [allDepartments, setAllDepartments] = useState<{ id: string; name: string }[]>(
    departments.map(d => ({ id: d.id, name: d.name }))
  );

  // Keep profileDeptMap in state so toggling a dept in one row syncs all rows for that profile
  const [localDeptMap, setLocalDeptMap] = useState(profileDeptMap);

  const [deptFilter,          setDeptFilter]          = useState<string[]>([]);
  const [memberFilter,        setMemberFilter]        = useState<string[]>(canViewAll ? [] : [currentUserId]);
  const [statusFilter,        setStatusFilter]        = useState("");
  const [employeeStatusFilter, setEmployeeStatusFilter] = useState<EmployeeStatus[]>(["active", "imported"]);
  const [dateRange, setDateRange] = useState<DateRange>(() => {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return { from: `${y}-${m}-01`, to: `${y}-${m}-${day}` };
  });
  const dateRangeRef = useRef(dateRange);

  // loadRecords reads dateRange from ref so calling it directly works without stale closure
  const loadRecords = useCallback(async () => {
    setLoading(true);
    const r = dateRangeRef.current;
    let query = supabase
      .from("time_records")
      .select("*, department:department_id(name)")
      .eq("restaurant_id", restaurantId)
      .gte("clocked_in_at", r.from + "T00:00:00")
      .lte("clocked_in_at", r.to   + "T23:59:59")
      .order("clocked_in_at", { ascending: false });

    if (!canViewAll) {
      query = query.eq("profile_id", currentUserId);
    } else {
      // Build the profile-ID pool, starting from employee-status filter
      let poolIds: string[] | null = null;

      if (memberFilter.length > 0) {
        // Explicit employee selection takes priority
        poolIds = memberFilter;
      } else if (employeeStatusFilter.length > 0) {
        poolIds = teamMembers
          .filter(m => employeeStatusFilter.includes(m.employeeStatus))
          .map(m => m.profile_id);
      }

      // Intersect with dept filter: keep only profiles that belong to any selected dept
      if (deptFilter.length > 0) {
        const deptSet = new Set(deptFilter);
        const deptProfileIds = Object.entries(profileDeptMap)
          .filter(([, depts]) => depts.some(d => deptSet.has(d.id)))
          .map(([pid]) => pid);
        poolIds = poolIds
          ? poolIds.filter(id => deptProfileIds.includes(id))
          : deptProfileIds;
      }

      if (poolIds !== null) {
        if (poolIds.length === 0) {
          // No profiles match — return empty immediately
          setRecords([]);
          setLoading(false);
          return;
        }
        query = query.in("profile_id", poolIds);
      }
    }

    if (statusFilter) query = query.eq("status", statusFilter);

    const { data } = await query;
    setRecords((data as ShiftRow[]) || []);
    setLoading(false);
  }, [restaurantId, deptFilter, memberFilter, statusFilter, canViewAll, currentUserId, employeeStatusFilter, teamMembers, profileDeptMap]);
  // Note: dateRange intentionally NOT in deps — use ref to avoid stale closure

  const loadActiveShift = useCallback(async () => {
    const { data } = await supabase
      .from("time_records").select("*")
      .eq("profile_id", currentUserId).eq("restaurant_id", restaurantId)
      .eq("status", "active").limit(1).maybeSingle();
    setActiveShift(data as TimeRecord | null);
  }, [currentUserId, restaurantId]);

  useEffect(() => { loadRecords(); loadActiveShift(); }, [loadRecords, loadActiveShift]);

  // Separate effect for the owner "currently clocked in" panel — runs on mount
  // and every 30s; also triggered manually via refreshActiveEmployees ref.
  const refreshActiveEmployees = useRef<() => void>(() => {});
  useEffect(() => {
    if (!canViewAll) return;
    async function fetch() {
      const { data } = await supabase
        .from("time_records")
        .select("id, profile_id, clocked_in_at")
        .eq("restaurant_id", restaurantId)
        .eq("status", "active")
        .order("clocked_in_at", { ascending: true });
      setActiveEmployees((data as ActiveEmployee[]) || []);
    }
    refreshActiveEmployees.current = fetch;
    fetch();
    const id = setInterval(fetch, 30_000);
    return () => clearInterval(id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleClock() {
    if (isCurrentUserDeactivated) return;
    setClocking(true);
    if (activeShift) {
      await supabase.from("time_records")
        .update({ clocked_out_at: new Date().toISOString(), status: "pending" })
        .eq("id", activeShift.id);
    } else {
      await supabase.from("time_records").insert({
        profile_id: currentUserId, restaurant_id: restaurantId,
        clocked_in_at: new Date().toISOString(), status: "active",
      });
    }
    await loadActiveShift();
    await loadRecords();
    refreshActiveEmployees.current();
    router.refresh();
    setClocking(false);
  }

  async function handleApproveAll() {
    const ids = records.filter(r => r.status === "pending").map(r => r.id);
    if (!ids.length) return;
    await supabase.from("time_records")
      .update({ status: "approved", approved_by: currentUserId, approved_at: new Date().toISOString() })
      .in("id", ids);
    loadRecords();
    router.refresh();
  }

  async function handleClockOutEmployee(shiftId: string) {
    setClockingOutId(shiftId);
    await fetch(`/api/shifts/${shiftId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clocked_out_at: new Date().toISOString(), status: "pending" }),
    });
    setClockingOutId(null);
    refreshActiveEmployees.current();
    loadRecords();
    router.refresh();
  }

  function handleEmployeeStatusChange(next: string[]) {
    const nextStatuses = next as EmployeeStatus[];
    // Drop name selections no longer in the new pool
    const validIds = new Set(
      (nextStatuses.length > 0 ? teamMembers.filter(m => nextStatuses.includes(m.employeeStatus)) : teamMembers)
        .map(m => m.profile_id)
    );
    setMemberFilter(mf => mf.filter(id => validIds.has(id)));
    setEmployeeStatusFilter(nextStatuses);
  }

  // Name options restricted to the current employee-status pool
  const nameOptions = (() => {
    const pool = employeeStatusFilter.length > 0
      ? teamMembers.filter(m => employeeStatusFilter.includes(m.employeeStatus))
      : teamMembers;
    return pool.map(m => ({ value: m.profile_id, label: m.name || m.profile_id }));
  })();

  const pendingCount = records.filter(r => r.status === "pending").length;

  return (
    <div className="px-4 sm:px-6 py-4 sm:py-8">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3 mb-5">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold">Shifts</h1>
          {pendingCount > 0 && canApprove && (
            <p className="text-sm text-amber-600 mt-0.5">{pendingCount} shift{pendingCount > 1 ? "s" : ""} awaiting approval</p>
          )}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {canApprove && pendingCount > 0 && (
            <button onClick={handleApproveAll}
              className="px-3 py-2 rounded-xl text-sm font-semibold bg-green-600 text-white hover:bg-green-700 transition-colors whitespace-nowrap">
              Approve all ({pendingCount})
            </button>
          )}
          {canEdit && (
            <button onClick={() => setShowAddShift(true)}
              className="px-3 py-2 rounded-xl text-sm font-semibold border border-gray-200 bg-white hover:bg-gray-50 text-gray-700 transition-colors whitespace-nowrap">
              + Add shift
            </button>
          )}
          {canEdit && <ImportButton onImported={loadRecords} />}
          {!isCurrentUserDeactivated && (
            <button onClick={handleClock} disabled={clocking}
              className={`px-4 py-2 rounded-xl text-sm font-semibold transition-colors disabled:opacity-50 whitespace-nowrap ${
                activeShift ? "bg-red-500 hover:bg-red-600 text-white" : "bg-gray-900 hover:bg-gray-700 text-white"
              }`}>
              {clocking ? "…" : activeShift ? "⏹ Clock out" : "▶ Clock in"}
            </button>
          )}
        </div>
      </div>

      {/* My active shift banner */}
      {activeShift && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 mb-5 flex items-center justify-between">
          <span className="text-sm text-blue-700 flex items-center gap-2">
            🟢 Active shift started at {formatTime(activeShift.clocked_in_at)}
          </span>
          <LiveDuration
            since={activeShift.clocked_in_at}
            className="text-sm font-bold tabular-nums text-blue-800 tracking-tight"
          />
        </div>
      )}

      {/* Owner: currently clocked-in employees */}
      {canViewAll && activeEmployees.length > 0 && (
        <div className="mb-5 bg-white rounded-2xl overflow-hidden" style={{ boxShadow: "0 2px 12px rgba(0,0,0,0.05)" }}>
          <div className="px-4 py-2.5 border-b border-gray-100 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse flex-shrink-0" />
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
              Currently clocked in — {activeEmployees.length}
            </span>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="px-4 py-2 text-left text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Name</th>
                <th className="px-4 py-2 text-left text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Start time</th>
                <th className="px-4 py-2 text-left text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Duration</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {activeEmployees.map(e => (
                <tr key={e.id}>
                  <td className="px-4 py-2.5 font-medium text-gray-800 whitespace-nowrap">
                    {profilesMap[e.profile_id] ?? "Unknown"}
                  </td>
                  <td className="px-4 py-2.5 text-gray-500 tabular-nums whitespace-nowrap">
                    {formatTime(e.clocked_in_at)}
                  </td>
                  <td className="px-4 py-2.5 whitespace-nowrap">
                    <LiveDuration
                      since={e.clocked_in_at}
                      className="font-bold tabular-nums text-gray-800 text-xs tracking-tight"
                    />
                  </td>
                  <td className="px-4 py-2.5 text-right whitespace-nowrap">
                    <button
                      onClick={() => handleClockOutEmployee(e.id)}
                      disabled={clockingOutId === e.id}
                      className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-red-500 hover:bg-red-600 text-white transition-colors disabled:opacity-50 whitespace-nowrap"
                    >
                      {clockingOutId === e.id ? "…" : "⏹ Clock out"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Filters */}
      <div className="relative bg-white rounded-2xl border border-gray-100 px-4 sm:px-5 py-4 mb-4" style={{ boxShadow: "0 2px 12px rgba(0,0,0,0.04)" }}>
        <div className="flex flex-wrap gap-x-3 gap-y-3 items-end min-w-0">
          <DateRangePicker initialRange={dateRange} onChange={r => { dateRangeRef.current = r; setDateRange(r); loadRecords(); }} />
          <div className="flex flex-wrap gap-2 items-center">
            {canViewAll && (
              <ChecklistSelect
                values={deptFilter}
                onChange={setDeptFilter}
                placeholder="All departments"
                options={allDepartments.map(d => ({ value: d.id, label: d.name }))}
              />
            )}
            {canViewAll && (
              <ChecklistSelect
                values={memberFilter}
                onChange={setMemberFilter}
                placeholder="All employees"
                options={nameOptions}
                icon={
                  <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                    <path d="M10 9a3 3 0 100-6 3 3 0 000 6zM6 8a2 2 0 11-4 0 2 2 0 014 0zM1.49 15.326a.78.78 0 01-.358-.442 3 3 0 014.308-3.516 6.484 6.484 0 00-1.905 3.959c-.023.222-.014.442.025.654a4.97 4.97 0 01-2.07-.655zM16.44 15.98a4.97 4.97 0 002.07-.654.78.78 0 00.357-.442 3 3 0 00-4.308-3.517 6.484 6.484 0 011.907 3.96 2.32 2.32 0 01-.026.654zM18 8a2 2 0 11-4 0 2 2 0 014 0zM5.304 16.19a.844.844 0 01-.277-.71 5 5 0 019.947 0 .843.843 0 01-.277.71A6.975 6.975 0 0110 18a6.974 6.974 0 01-4.696-1.81z" />
                  </svg>
                }
              />
            )}
            {canViewAll && (
              <ChecklistSelect
                values={employeeStatusFilter}
                onChange={handleEmployeeStatusChange}
                options={EMPLOYEE_STATUS_OPTS}
                placeholder="Employee status"
                countLabel="statuses"
                showAllOption={false}
              />
            )}
            <SearchableSelect
              value={statusFilter}
              onChange={setStatusFilter}
              placeholder="All statuses"
              options={[
                { value: "active",   label: "Active" },
                { value: "pending",  label: "Pending" },
                { value: "approved", label: "Approved" },
                { value: "rejected", label: "Rejected" },
              ]}
            />
          </div>
        </div>
      </div>

      {importRunning && (
        <div className="mb-3 px-4 py-2.5 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-700 flex items-center gap-2">
          <span className="inline-block w-3 h-3 border-2 border-amber-300 border-t-amber-600 rounded-full animate-spin flex-shrink-0" />
          Import in progress — shift editing is temporarily disabled.
        </div>
      )}

      <ShiftTable
        shifts={records}
        loading={loading}
        currentUserId={currentUserId}
        canEdit={canEdit && !importRunning}
        canApprove={canApprove}
        hideClockOut
        profilesMap={canViewAll ? profilesMap : undefined}
        profileDeptMap={localDeptMap}
        allDepartments={allDepartments}
        onDepartmentCreated={d => {
          setAllDepartments(prev => [...prev, d]);
          loadRecords();
          router.refresh();
        }}
        onDepartmentToggled={(profileId, dept, assigned) => {
          setLocalDeptMap(prev => ({
            ...prev,
            [profileId]: assigned
              ? [...(prev[profileId] || []), dept]
              : (prev[profileId] || []).filter(d => d.id !== dept.id),
          }));
        }}
        onDepartmentDeleted={dept => {
          setAllDepartments(prev => prev.filter(d => d.id !== dept.id));
          setLocalDeptMap(prev => {
            const next = { ...prev };
            for (const pid of Object.keys(next)) {
              next[pid] = next[pid].filter(d => d.id !== dept.id);
            }
            return next;
          });
        }}
        onRefresh={() => { loadRecords(); router.refresh(); }}
      />

      {showAddShift && (
        <AddShiftModal
          restaurantId={restaurantId}
          currentUserId={currentUserId}
          teamMembers={teamMembers}
          onSaved={() => { loadRecords(); router.refresh(); }}
          onClose={() => setShowAddShift(false)}
        />
      )}
    </div>
  );
}
