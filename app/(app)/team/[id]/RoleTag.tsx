"use client";
import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";

export interface Role { id: string; name: string; is_owner: boolean; }

interface Props {
  profileId: string;
  initialRole: Role | null;
  allRoles: Role[];
  canEdit: boolean;
}

export default function RoleTag({ profileId, initialRole, allRoles, canEdit }: Props) {
  const router = useRouter();
  const [role, setRole]   = useState<Role | null>(initialRole);
  const [open, setOpen]   = useState(false);
  const [saving, setSaving] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  // Sync if parent re-renders with fresh server data
  useEffect(() => { setRole(initialRole); }, [initialRole]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  async function handleSelect(newRole: Role) {
    if (newRole.id === role?.id) { setOpen(false); return; }
    setSaving(newRole.id);
    const res = await fetch(`/api/members/${profileId}/role`, {
      method:  "PATCH",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ roleId: newRole.id }),
    });
    setSaving(null);
    if (res.ok) {
      setRole(newRole);
      setOpen(false);
      router.refresh();
    }
  }

  const chipClass = `inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium transition-all select-none ${
    role?.is_owner ? "bg-indigo-100 text-indigo-700" : "bg-gray-100 text-gray-600"
  } ${canEdit ? "cursor-pointer hover:ring-1 hover:ring-offset-0 hover:ring-gray-300" : ""}`;

  if (!canEdit) {
    return <span className={chipClass}>{role?.name || "—"}</span>;
  }

  return (
    <div ref={ref} className="relative inline-block">
      <span className={chipClass} onClick={() => setOpen(v => !v)}>
        {role?.name || "—"}
      </span>

      {open && (
        <div className="absolute left-0 top-full mt-1.5 z-50 bg-white border border-gray-200 rounded-xl shadow-lg py-1 min-w-[160px]">
          {allRoles.map(r => {
            const isCurrent = r.id === role?.id;
            const isSaving  = saving === r.id;
            return (
              <button
                key={r.id}
                onClick={() => handleSelect(r)}
                disabled={!!saving}
                className={`w-full text-left px-3 py-1.5 text-sm flex items-center justify-between gap-3 transition-colors
                  ${isCurrent
                    ? "text-indigo-600 font-semibold bg-indigo-50"
                    : "text-gray-700 hover:bg-gray-50"
                  } disabled:opacity-50`}
              >
                <span>{r.name}</span>
                {isSaving  && <span className="text-gray-400 text-xs">…</span>}
                {!isSaving && isCurrent && <span className="text-indigo-400">✓</span>}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
