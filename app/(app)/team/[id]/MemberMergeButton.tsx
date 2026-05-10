"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

interface Employee {
  profile_id: string;
  name: string | null;
  is_placeholder?: boolean;
}

interface Props {
  placeholderId: string;
  placeholderName: string | null;
  employees: Employee[];
}

export default function MemberMergeButton({ placeholderId, placeholderName, employees }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Employee | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const filtered = employees.filter(e =>
    !search || e.name?.toLowerCase().includes(search.toLowerCase())
  );

  async function handleMerge() {
    if (!selected) return;
    setLoading(true);
    setError("");
    const res = await fetch(`/api/members/${placeholderId}/merge`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ targetProfileId: selected.profile_id }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || "Merge failed");
      setLoading(false);
      return;
    }
    router.push(`/team/${selected.profile_id}`);
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="text-xs font-medium text-amber-700 hover:text-amber-900 px-3 py-1.5 rounded-lg bg-amber-50 hover:bg-amber-100 border border-amber-200 transition-colors"
      >
        Merge into existing employee
      </button>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-amber-200 p-4 w-full max-w-sm shadow-sm">
      {!confirming ? (
        <>
          <p className="text-xs font-semibold text-gray-700 mb-2">
            Move shifts from <span className="text-amber-700">{placeholderName || "this record"}</span> into:
          </p>
          <input
            autoFocus
            type="text"
            placeholder="Search employees…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-gray-400 mb-2"
          />
          <div className="max-h-40 overflow-y-auto space-y-0.5">
            {filtered.length === 0 && (
              <p className="text-xs text-gray-400 py-2 text-center">No employees found</p>
            )}
            {filtered.map(e => (
              <button
                key={e.profile_id}
                onClick={() => setSelected(e)}
                className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors flex items-center gap-2 ${
                  selected?.profile_id === e.profile_id
                    ? "bg-gray-900 text-white font-semibold"
                    : "hover:bg-gray-100 text-gray-700"
                }`}
              >
                <span>{e.name || <span className="italic text-gray-400">No name</span>}</span>
                {e.is_placeholder && (
                  <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${
                    selected?.profile_id === e.profile_id
                      ? "bg-white/20 text-white"
                      : "bg-amber-100 text-amber-700"
                  }`}>imported</span>
                )}
              </button>
            ))}
          </div>
          <div className="flex gap-2 mt-3">
            <button
              disabled={!selected}
              onClick={() => setConfirming(true)}
              className="flex-1 bg-gray-900 text-white text-sm font-semibold py-2 rounded-lg disabled:opacity-40 hover:bg-gray-700 transition-colors"
            >
              Continue →
            </button>
            <button
              onClick={() => { setOpen(false); setSelected(null); setSearch(""); }}
              className="text-sm text-gray-400 hover:text-gray-700 px-3"
            >
              Cancel
            </button>
          </div>
        </>
      ) : (
        <>
          <p className="text-sm font-semibold text-gray-800 mb-1">Confirm merge</p>
          <p className="text-xs text-gray-500 mb-3">
            All shifts recorded for <span className="font-semibold text-amber-700">{placeholderName || "this record"}</span> will be moved to <span className="font-semibold text-gray-800">{selected?.name}</span>. The imported record will be deleted. This cannot be undone.
          </p>
          {error && <p className="text-xs text-red-500 mb-2">{error}</p>}
          <div className="flex gap-2">
            <button
              onClick={handleMerge}
              disabled={loading}
              className="flex-1 bg-amber-600 hover:bg-amber-700 text-white text-sm font-semibold py-2 rounded-lg disabled:opacity-50 transition-colors"
            >
              {loading ? "Merging…" : "Merge shifts"}
            </button>
            <button
              onClick={() => setConfirming(false)}
              disabled={loading}
              className="text-sm text-gray-400 hover:text-gray-700 px-3"
            >
              Back
            </button>
          </div>
        </>
      )}
    </div>
  );
}
