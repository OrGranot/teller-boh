"use client";
import { useState, useMemo, useEffect } from "react";
import Link from "next/link";
import ChecklistSelect from "@/components/ChecklistSelect";
import DepartmentTags, { type Department } from "@/components/DepartmentTags";
import { createClient } from "@/lib/supabase/client";

// ── Types ─────────────────────────────────────────────────────────────────────

type SortKey = "name" | "role" | "salary" | "contract_start" | "balance";
type SortDir = "asc" | "desc";
type Status  = "active" | "imported" | "deactivated";

export interface MemberRow {
  id:                   string;
  profile_id:           string;
  name:                 string | null;
  is_placeholder:       boolean;
  role_name:            string | null;
  is_owner:             boolean;
  hours_per_week:       number | null;
  salary:               number | null;
  contract_start:       string | null;
  contract_end:         string | null;
  contract_valid_until: string | null;  // latest contract's expiry (not employment end)
  balance:              number | null;
  status:               Status;
  departments:          Department[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const STATUS_OPTS: { value: Status; label: string }[] = [
  { value: "active",      label: "Active"      },
  { value: "imported",    label: "Imported"    },
  { value: "deactivated", label: "Deactivated" },
];

function fmtDate(iso: string) {
  return new Date(iso + "T12:00:00Z").toLocaleDateString("en-GB");
}

function contractDaysLeft(validUntil: string, today: string): number {
  return Math.ceil(
    (new Date(validUntil + "T12:00:00Z").getTime() - new Date(today + "T12:00:00Z").getTime())
    / 86_400_000
  );
}

function sortCmp(a: MemberRow, b: MemberRow, key: SortKey): number {
  switch (key) {
    case "name":
      if (!a.name && !b.name) return 0;
      if (!a.name) return 1; if (!b.name) return -1;
      return a.name.localeCompare(b.name);
    case "role":
      if (a.is_owner !== b.is_owner) return a.is_owner ? -1 : 1;
      return (a.role_name ?? "").localeCompare(b.role_name ?? "");
    case "salary":
      if (a.salary == null && b.salary == null) return 0;
      if (a.salary == null) return 1; if (b.salary == null) return -1;
      return a.salary - b.salary;
    case "contract_start":
      if (!a.contract_start && !b.contract_start) return 0;
      if (!a.contract_start) return 1; if (!b.contract_start) return -1;
      return a.contract_start.localeCompare(b.contract_start);
    case "balance":
      if (a.balance == null && b.balance == null) return 0;
      if (a.balance == null) return 1; if (b.balance == null) return -1;
      return a.balance - b.balance;
  }
}

// ── Responsive column visibility ──────────────────────────────────────────────
//
//  always    : Name, Role, Balance
//  sm (480px): Hours/week
//  lg (1024px): Departments, Contract start, Salary, View button
//
// This keeps the table readable on every viewport without horizontal scroll.

// ── Component ─────────────────────────────────────────────────────────────────

export default function TeamTableClient({
  members,
  allDepartments,
  serverToday,
}: {
  members: MemberRow[];
  allDepartments: Department[];
  serverToday: string;
}) {
  const [nameFilter,   setNameFilter]   = useState<string[]>([]);
  const [statusFilter, setStatusFilter] = useState<Status[]>(["active", "imported"]);
  const [deptFilter,   setDeptFilter]   = useState<string[]>([]);
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [localAllDepts, setLocalAllDepts] = useState<Department[]>(allDepartments);

  // ── Invite modal ──────────────────────────────────────────────────────────
  const [showInvite,      setShowInvite]      = useState(false);
  const [inviteName,      setInviteName]      = useState("");
  const [inviteEmail,     setInviteEmail]     = useState("");
  const [inviteDept,      setInviteDept]      = useState("");
  const [inviteRole,      setInviteRole]      = useState("");
  const [inviteHours,     setInviteHours]     = useState("");
  const [inviteSalary,    setInviteSalary]    = useState("");
  const [inviteStart,     setInviteStart]     = useState("");
  const [showContract,    setShowContract]    = useState(false);
  const [inviting,        setInviting]        = useState(false);
  const [inviteError,     setInviteError]     = useState("");
  const [inviteSuccess,   setInviteSuccess]   = useState("");
  const [roles,           setRoles]           = useState<{ id: string; name: string }[]>([]);

  useEffect(() => {
    if (!showInvite || roles.length > 0) return;
    createClient().from("roles").select("id, name").then(({ data }) => setRoles(data || []));
  }, [showInvite]);

  function resetInvite() {
    setInviteName(""); setInviteEmail(""); setInviteDept(""); setInviteRole("");
    setInviteHours(""); setInviteSalary(""); setInviteStart("");
    setShowContract(false); setInviteError(""); setInviteSuccess("");
  }

  async function submitInvite() {
    if (!inviteName.trim())  { setInviteError("Name is required.");  return; }
    if (!inviteEmail.trim()) { setInviteError("Email is required."); return; }
    setInviting(true); setInviteError("");
    const res = await fetch("/api/invite", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name:          inviteName.trim(),
        email:         inviteEmail.trim(),
        departmentId:  inviteDept   || undefined,
        roleId:        inviteRole   || undefined,
        hoursPerWeek:  inviteHours  ? Number(inviteHours)  : undefined,
        salary:        inviteSalary ? Number(inviteSalary) : undefined,
        contractStart: inviteStart  || undefined,
      }),
    });
    const json = await res.json();
    setInviting(false);
    if (!res.ok) { setInviteError(json.error || "Failed to send invite."); return; }
    setInviteSuccess(`Invite sent to ${inviteEmail.trim()} ✓`);
    setTimeout(() => { setShowInvite(false); resetInvite(); }, 2000);
  }

  function handleSort(key: SortKey) {
    if (key === sortKey) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("asc"); }
  }

  function handleStatusChange(next: string[]) {
    const nextStatuses = next as Status[];
    const validIds = new Set(
      (nextStatuses.length > 0 ? members.filter(m => nextStatuses.includes(m.status)) : members)
        .map(m => m.profile_id)
    );
    setNameFilter(nf => nf.filter(id => validIds.has(id)));
    setStatusFilter(nextStatuses);
  }

  const nameOptions = useMemo(() => {
    const pool = statusFilter.length > 0 ? members.filter(m => statusFilter.includes(m.status)) : members;
    return pool.filter(m => m.name).map(m => ({ value: m.profile_id, label: m.name! }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [members, statusFilter]);

  const deptOptions = useMemo(
    () => localAllDepts.map(d => ({ value: d.id, label: d.name })),
    [localAllDepts]
  );

  const visible = useMemo(() => {
    let result = members;
    if (statusFilter.length > 0) result = result.filter(m => statusFilter.includes(m.status));
    if (nameFilter.length > 0)   result = result.filter(m => nameFilter.includes(m.profile_id));
    if (deptFilter.length > 0)   result = result.filter(m => m.departments.some(d => deptFilter.includes(d.id)));
    return [...result].sort((a, b) => {
      const aD = a.status === "deactivated" ? 1 : 0;
      const bD = b.status === "deactivated" ? 1 : 0;
      if (aD !== bD) return aD - bD;
      const c = sortCmp(a, b, sortKey);
      return sortDir === "asc" ? c : -c;
    });
  }, [members, nameFilter, statusFilter, deptFilter, sortKey, sortDir]);

  function sortIndicator(col: SortKey) {
    if (col !== sortKey) return <span className="text-gray-300 ml-0.5 text-[10px]">↕</span>;
    return <span className="text-gray-700 ml-0.5 text-[10px]">{sortDir === "asc" ? "↑" : "↓"}</span>;
  }

  function SortableHeader({ col, label, className = "" }: { col: SortKey; label: string; className?: string }) {
    return (
      <th className={`text-left px-3 py-3 ${className}`}>
        <button
          onClick={() => handleSort(col)}
          className="flex items-center gap-0.5 text-xs font-semibold text-gray-400 hover:text-gray-700 transition-colors whitespace-nowrap"
        >
          {label}{sortIndicator(col)}
        </button>
      </th>
    );
  }

  return (
    <>
      {/* ── Invite modal ─────────────────────────────────────────────────── */}
      {showInvite && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-base font-bold text-gray-900">Invite employee</h2>
              <button onClick={() => { setShowInvite(false); resetInvite(); }} className="text-gray-400 hover:text-gray-700 text-xl leading-none">×</button>
            </div>

            {inviteSuccess ? (
              <p className="text-green-600 font-semibold text-sm py-4 text-center">{inviteSuccess}</p>
            ) : (
              <>
                {/* Required fields */}
                <div className="space-y-3 mb-4">
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 mb-1">Full name <span className="text-red-400">*</span></label>
                    <input value={inviteName} onChange={e => setInviteName(e.target.value)}
                      className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-gray-400"
                      placeholder="Jane Smith" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 mb-1">Email <span className="text-red-400">*</span></label>
                    <input type="email" value={inviteEmail} onChange={e => setInviteEmail(e.target.value)}
                      className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-gray-400"
                      placeholder="jane@example.com" />
                  </div>
                </div>

                {/* Contract details (optional) */}
                <button onClick={() => setShowContract(v => !v)}
                  className="flex items-center gap-1.5 text-xs font-semibold text-gray-400 hover:text-gray-700 mb-3 transition-colors">
                  <span className={`transition-transform duration-150 ${showContract ? "rotate-90" : ""}`}>›</span>
                  Contract details <span className="font-normal text-gray-300">(optional)</span>
                </button>

                {showContract && (
                  <div className="space-y-3 mb-4 pl-4 border-l-2 border-gray-100">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-semibold text-gray-500 mb-1">Department</label>
                        <select value={inviteDept} onChange={e => setInviteDept(e.target.value)}
                          className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-gray-400 bg-white">
                          <option value="">—</option>
                          {localAllDepts.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-gray-500 mb-1">Role</label>
                        <select value={inviteRole} onChange={e => setInviteRole(e.target.value)}
                          className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-gray-400 bg-white">
                          <option value="">—</option>
                          {roles.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                        </select>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-semibold text-gray-500 mb-1">Hours / week</label>
                        <input type="number" value={inviteHours} onChange={e => setInviteHours(e.target.value)}
                          className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-gray-400"
                          placeholder="40" min={0} />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-gray-500 mb-1">Salary (€)</label>
                        <input type="number" value={inviteSalary} onChange={e => setInviteSalary(e.target.value)}
                          className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-gray-400"
                          placeholder="2400" min={0} />
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-500 mb-1">Contract start</label>
                      <input type="date" value={inviteStart} onChange={e => setInviteStart(e.target.value)}
                        className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-gray-400" />
                    </div>
                  </div>
                )}

                {inviteError && <p className="text-red-500 text-xs mb-3">{inviteError}</p>}

                <div className="flex gap-2 mt-2">
                  <button onClick={submitInvite} disabled={inviting}
                    className="flex-1 py-2.5 rounded-xl font-semibold text-sm bg-gray-900 hover:bg-gray-700 text-white transition-colors disabled:opacity-50">
                    {inviting ? "Sending…" : "Send invite"}
                  </button>
                  <button onClick={() => { setShowInvite(false); resetInvite(); }}
                    className="px-4 py-2.5 rounded-xl border border-gray-200 text-sm font-semibold text-gray-500 hover:border-gray-800 transition-colors">
                    Cancel
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ── Toolbar ──────────────────────────────────────────────────────── */}
      <div className="mb-4 flex items-center gap-2 sm:gap-3 flex-wrap">
        <ChecklistSelect
          values={nameFilter}
          onChange={setNameFilter}
          options={nameOptions}
          placeholder="All employees"
          icon={
            <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor">
              <path d="M10 8a3 3 0 100-6 3 3 0 000 6zM3.465 14.493a1.23 1.23 0 00.41 1.412A9.957 9.957 0 0010 18c2.31 0 4.438-.784 6.131-2.1.43-.333.604-.903.408-1.41a7.002 7.002 0 00-13.074.003z" />
            </svg>
          }
        />
        <ChecklistSelect
          values={statusFilter}
          onChange={handleStatusChange}
          options={STATUS_OPTS}
          placeholder="Employee status"
          countLabel="statuses"
          showAllOption={false}
        />
        {localAllDepts.length > 0 && (
          <ChecklistSelect
            values={deptFilter}
            onChange={setDeptFilter}
            options={deptOptions}
            placeholder="All departments"
            countLabel="departments"
          />
        )}
        <span className="ml-auto text-xs text-gray-400 tabular-nums whitespace-nowrap">
          {visible.length !== members.length
            ? `${visible.length} of ${members.length}`
            : `${members.length} member${members.length !== 1 ? "s" : ""}`}
        </span>
        <button
          onClick={() => setShowInvite(true)}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-gray-900 hover:bg-gray-700 text-white text-xs font-semibold transition-colors whitespace-nowrap"
        >
          + Invite employee
        </button>
      </div>

      {/* ── Table ────────────────────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl overflow-x-auto" style={{ boxShadow: "0 2px 12px rgba(0,0,0,0.05)" }}>
        <table className="w-full text-sm min-w-[360px]">
          <thead>
            <tr className="text-xs font-semibold text-gray-400 border-b border-gray-100">
              {/* Name — always */}
              <SortableHeader col="name" label="Name" className="px-4 sm:px-5" />
              {/* Role — always */}
              <SortableHeader col="role" label="Role" />
              {/* Departments — lg+ */}
              <th className="hidden lg:table-cell text-left px-3 py-3 text-xs font-semibold text-gray-400 whitespace-nowrap">
                Departments
              </th>
              {/* Hours/week — sm+ */}
              <th className="hidden sm:table-cell text-left px-3 py-3 text-xs font-semibold text-gray-400 whitespace-nowrap">
                Hours / week
              </th>
              {/* Salary — lg+ */}
              <SortableHeader col="salary" label="Salary" className="hidden lg:table-cell" />
              {/* Contract start — lg+ */}
              <SortableHeader col="contract_start" label="Contract start" className="hidden lg:table-cell" />
              {/* Balance — always */}
              <SortableHeader col="balance" label="Balance" />
              {/* View button — lg+ */}
              <th className="hidden lg:table-cell px-5 py-3" />
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-5 py-12 text-center text-sm text-gray-400">
                  No members match the current filters.
                </td>
              </tr>
            ) : visible.map((m, i) => {
              const balanceColor =
                m.balance === null ? "text-gray-300" :
                m.balance >= 0    ? "text-green-600" :
                "text-red-500";

              // Contract expiry badge (only for active employees with a valid_until set)
              const expiryBadge = (() => {
                if (m.status !== "active" || !m.contract_valid_until) return null;
                const d = contractDaysLeft(m.contract_valid_until, serverToday);
                if (d > 30) return null;
                if (d < 0)  return { label: "expired",       cls: "bg-red-100 text-red-600" };
                if (d === 0) return { label: "expires today", cls: "bg-red-100 text-red-600" };
                return       { label: `expires in ${d}d`,   cls: "bg-amber-100 text-amber-700" };
              })();

              return (
                <tr
                  key={m.id}
                  className={`group ${i < visible.length - 1 ? "border-b border-gray-100" : ""} hover:bg-gray-50 transition-colors`}
                >
                  {/* Name — always */}
                  <td className="px-4 sm:px-5 py-3.5 font-semibold">
                    <Link
                      href={`/team/${m.profile_id}`}
                      className="hover:text-indigo-600 transition-colors"
                    >
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`whitespace-nowrap ${m.status === "deactivated" ? "text-gray-400" : ""}`}>
                          {m.name || <span className="text-gray-400 font-normal italic">No name</span>}
                        </span>
                        {m.status === "deactivated" && (
                          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-red-100 text-red-500 whitespace-nowrap">
                            deactivated
                          </span>
                        )}
                        {m.status === "imported" && (
                          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 whitespace-nowrap">
                            imported
                          </span>
                        )}
                        {expiryBadge && (
                          <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full whitespace-nowrap ${expiryBadge.cls}`}>
                            {expiryBadge.label}
                          </span>
                        )}
                      </div>
                    </Link>
                  </td>

                  {/* Role — always */}
                  <td className="px-3 py-3.5 whitespace-nowrap">
                    <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${
                      m.is_owner ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-600"
                    }`}>
                      {m.role_name || "—"}
                    </span>
                  </td>

                  {/* Departments — lg+ */}
                  <td className="hidden lg:table-cell px-3 py-3.5">
                    <DepartmentTags
                      profileId={m.profile_id}
                      initialDepartments={m.departments}
                      allDepartments={localAllDepts}
                      canEdit
                      canCreate
                      compact
                      onCreated={d => setLocalAllDepts(prev => [...prev, d])}
                      onDeleted={d => setLocalAllDepts(prev => prev.filter(x => x.id !== d.id))}
                    />
                  </td>

                  {/* Hours/week — sm+ */}
                  <td className="hidden sm:table-cell px-3 py-3.5 text-gray-500 whitespace-nowrap">
                    {m.hours_per_week != null ? `${m.hours_per_week}h` : "—"}
                  </td>

                  {/* Salary — lg+ */}
                  <td className="hidden lg:table-cell px-3 py-3.5 text-gray-500 whitespace-nowrap">
                    {m.salary != null ? `€${m.salary.toLocaleString("de-DE")}` : "—"}
                  </td>

                  {/* Contract start — lg+ */}
                  <td className="hidden lg:table-cell px-3 py-3.5 text-gray-500 whitespace-nowrap">
                    {m.contract_start ? fmtDate(m.contract_start) : "—"}
                  </td>

                  {/* Balance — always */}
                  <td className="px-3 py-3.5 whitespace-nowrap">
                    {m.balance == null ? (
                      <span className="text-gray-300 font-semibold">—</span>
                    ) : (
                      <div className="flex flex-col gap-0.5">
                        <span className={`font-semibold tabular-nums ${balanceColor}`}>
                          {m.balance >= 0 ? "+" : ""}{m.balance.toFixed(1)}h
                        </span>
                        {m.contract_end && (
                          <span className="text-[10px] text-gray-400 tabular-nums whitespace-nowrap">
                            until {fmtDate(m.contract_end)}
                          </span>
                        )}
                      </div>
                    )}
                  </td>

                  {/* View button — lg+, hover-only on desktop */}
                  <td className="hidden lg:table-cell px-5 py-3.5">
                    <Link
                      href={`/team/${m.profile_id}`}
                      className="text-xs text-gray-400 hover:text-gray-900 font-semibold px-3 py-1.5 rounded-lg hover:bg-gray-100 transition-colors opacity-0 group-hover:opacity-100"
                    >
                      View →
                    </Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
