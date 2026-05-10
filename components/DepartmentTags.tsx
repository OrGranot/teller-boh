"use client";
import { useState, useRef, useEffect } from "react";

export interface Department { id: string; name: string; }

interface Props {
  profileId: string;
  initialDepartments: Department[];
  allDepartments: Department[];
  canEdit: boolean;
  /** Show a "New department" input at the bottom of the popover */
  canCreate?: boolean;
  /** compact = smaller chips + gap — for table cells */
  compact?: boolean;
  /** Called after a brand-new department is created, so parent can add it to shared state */
  onCreated?: (dept: Department) => void;
  /** Called after a dept is toggled on/off, so parent can sync sibling rows */
  onToggled?: (dept: Department, assigned: boolean) => void;
  /** Called when a dept is auto-deleted (had no remaining members), so parent removes it everywhere */
  onDeleted?: (dept: Department) => void;
}

export default function DepartmentTags({
  profileId,
  initialDepartments,
  allDepartments: initialAll,
  canEdit,
  canCreate = false,
  compact = false,
  onCreated,
  onToggled,
  onDeleted,
}: Props) {
  const [departments, setDepartments] = useState<Department[]>(initialDepartments);
  const [allDepts, setAllDepts] = useState<Department[]>(initialAll);
  const [open, setOpen]     = useState(false);
  const [saving, setSaving] = useState<string | null>(null);

  // Create-new state
  const [newName, setNewName]       = useState("");
  const [creating, setCreating]     = useState(false);
  const [createError, setCreateError] = useState("");

  const ref     = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Sync allDepts when parent updates its shared list (e.g. another instance created a dept)
  useEffect(() => { setAllDepts(initialAll); }, [initialAll]);

  // Sync assigned departments when parent refreshes server data (e.g. after router.refresh())
  useEffect(() => { setDepartments(initialDepartments); }, [initialDepartments]);

  // Close on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setNewName("");
        setCreateError("");
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  async function toggle(dept: Department) {
    if (saving) return;
    const isAssigned = departments.some(d => d.id === dept.id);
    setSaving(dept.id);

    const res = await fetch(`/api/members/${profileId}/departments`, {
      method: isAssigned ? "DELETE" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ departmentId: dept.id }),
    });

    if (res.ok) {
      const nowAssigned = !isAssigned;
      setDepartments(prev =>
        isAssigned ? prev.filter(d => d.id !== dept.id) : [...prev, dept]
      );
      onToggled?.(dept, nowAssigned);

      // If the dept was auto-deleted (no remaining members), remove from available list
      if (isAssigned) {
        const body = await res.json().catch(() => ({}));
        if (body.departmentDeleted) {
          setAllDepts(prev => prev.filter(d => d.id !== dept.id));
          onDeleted?.(dept);
        }
      }
    }
    setSaving(null);
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    const name = newName.trim();
    if (!name) return;

    // Prevent duplicates (checked against local state which is kept in sync by parent)
    if (allDepts.some(d => d.name.toLowerCase() === name.toLowerCase())) {
      setCreateError("Already exists");
      return;
    }

    setCreating(true);
    setCreateError("");

    const res = await fetch("/api/departments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });

    if (!res.ok) {
      setCreateError("Failed to create");
      setCreating(false);
      return;
    }

    const { department } = await res.json();
    const newDept: Department = { id: department.id, name: department.name };

    // Add to local list + notify parent so ALL instances see the new dept immediately
    setAllDepts(prev => [...prev, newDept]);
    setNewName("");
    onCreated?.(newDept);

    // Auto-assign to this employee
    setSaving(newDept.id);
    const assignRes = await fetch(`/api/members/${profileId}/departments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ departmentId: newDept.id }),
    });
    if (assignRes.ok) {
      setDepartments(prev => [...prev, newDept]);
      // Notify parent so sibling rows for the same profile update immediately
      onToggled?.(newDept, true);
    }
    setSaving(null);
    setCreating(false);

    // Close the popover
    setOpen(false);
  }

  return (
    <div ref={ref} className="relative">
      <div className={`flex flex-wrap items-center ${compact ? "gap-1" : "gap-1.5"}`}>
        {departments.map(d => (
          <span
            key={d.id}
            className={`inline-flex items-center bg-indigo-50 text-indigo-700 rounded-full font-medium border border-indigo-100 ${
              compact ? "px-1.5 py-0 text-[11px]" : "px-2.5 py-0.5 text-xs"
            }`}
          >
            {d.name}
          </span>
        ))}

        {departments.length === 0 && !canEdit && !compact && (
          <span className="text-xs text-gray-400 italic">No departments</span>
        )}

        {canEdit && (
          <button
            onClick={() => setOpen(o => !o)}
            className={`inline-flex items-center rounded-full border border-dashed border-gray-300 text-gray-400 hover:text-gray-600 hover:border-gray-400 transition-colors ${
              compact ? "px-1.5 py-0 text-[11px]" : "px-2 py-0.5 text-xs"
            }`}
          >
            {departments.length === 0 ? "+ dept" : "···"}
          </button>
        )}
      </div>

      {open && canEdit && (
        <div className="absolute top-full left-0 mt-1.5 z-50 bg-white border border-gray-200 rounded-xl shadow-xl p-1.5 min-w-48">
          {/* Existing departments */}
          {allDepts.length === 0 && !canCreate && (
            <p className="text-xs text-gray-400 px-3 py-2">No departments set up yet.</p>
          )}

          {allDepts.map(dept => {
            const isAssigned = departments.some(d => d.id === dept.id);
            const isSaving   = saving === dept.id;
            return (
              <button
                key={dept.id}
                disabled={!!saving}
                onClick={() => toggle(dept)}
                className={`flex items-center gap-2.5 w-full text-left px-3 py-1.5 rounded-lg text-sm transition-colors ${
                  isSaving ? "opacity-40" : "hover:bg-gray-50"
                }`}
              >
                <span
                  className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 transition-colors ${
                    isAssigned ? "bg-indigo-600 border-indigo-600" : "border-gray-300"
                  }`}
                >
                  {isAssigned && (
                    <svg className="w-2.5 h-2.5 text-white" viewBox="0 0 10 8" fill="none">
                      <path d="M1 4l3 3 5-6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  )}
                </span>
                <span className={isAssigned ? "font-medium text-gray-900" : "text-gray-600"}>
                  {dept.name}
                </span>
              </button>
            );
          })}

          {/* Create new department */}
          {canCreate && (
            <>
              {allDepts.length > 0 && <div className="my-1 border-t border-gray-100" />}
              <form onSubmit={handleCreate} className="px-2 py-1">
                <div className="flex items-center gap-1.5">
                  <input
                    ref={inputRef}
                    value={newName}
                    onChange={e => { setNewName(e.target.value); setCreateError(""); }}
                    placeholder="New department…"
                    disabled={creating}
                    className="flex-1 text-sm border border-gray-200 rounded-lg px-2 py-1 outline-none focus:border-indigo-400 disabled:opacity-50 min-w-0"
                  />
                  <button
                    type="submit"
                    disabled={!newName.trim() || creating}
                    className="text-xs font-semibold px-2.5 py-1 rounded-lg bg-indigo-600 text-white disabled:opacity-40 hover:bg-indigo-700 transition-colors flex-shrink-0"
                  >
                    {creating ? "…" : "Add"}
                  </button>
                </div>
                {createError && <p className="text-[11px] text-red-500 mt-1 px-1">{createError}</p>}
              </form>
            </>
          )}
        </div>
      )}
    </div>
  );
}
