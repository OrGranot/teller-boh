"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import DatePicker from "@/components/DatePicker";

interface Props {
  profileId: string;
  contractEnd: string | null;
  isPlaceholder?: boolean;
}

function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default function MemberActions({ profileId, contractEnd, isPlaceholder }: Props) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  async function handleDelete() {
    setDeleting(true);
    setError("");
    const res = await fetch(`/api/members/${profileId}`, { method: "DELETE" });
    if (res.ok) {
      router.push("/team");
    } else {
      const data = await res.json();
      setError(data.error || "Failed to delete employee");
      setDeleting(false);
      setConfirmDelete(false);
    }
  }

  const [deactivating, setDeactivating] = useState(false);
  const [endDate, setEndDate] = useState(todayISO());
  const [savingDeactivate, setSavingDeactivate] = useState(false);
  const [localContractEnd, setLocalContractEnd] = useState(contractEnd);
  useEffect(() => { setLocalContractEnd(contractEnd); }, [contractEnd]);

  const isDeactivated = !!localContractEnd && localContractEnd <= todayISO();

  async function handleDeactivate() {
    setSavingDeactivate(true);
    setError("");
    const res = await fetch(`/api/members/${profileId}/contract`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contract_end: endDate }),
    });
    if (res.ok) {
      setLocalContractEnd(endDate);
      setDeactivating(false);
      router.refresh();
    } else {
      const data = await res.json();
      setError(data.error || "Failed to deactivate");
    }
    setSavingDeactivate(false);
  }

  async function handleReactivate() {
    setSavingDeactivate(true);
    setError("");
    const res = await fetch(`/api/members/${profileId}/contract`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contract_end: null }),
    });
    if (res.ok) {
      setLocalContractEnd(null);
      router.refresh();
    } else {
      const data = await res.json();
      setError(data.error || "Failed to reactivate");
    }
    setSavingDeactivate(false);
  }

  return (
    <div className="flex flex-col items-end gap-3">
      {isDeactivated && (
        <span className="inline-block px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-600">
          Deactivated
        </span>
      )}
      {/* Deactivate / Reactivate */}
      {isDeactivated ? (
        <button
          onClick={handleReactivate}
          disabled={savingDeactivate}
          className="text-sm text-green-600 hover:text-green-800 font-semibold px-3 py-2 rounded-xl border border-green-200 hover:border-green-400 transition-colors disabled:opacity-50"
        >
          {savingDeactivate ? "…" : "Reactivate"}
        </button>
      ) : deactivating ? (
        <div className="flex items-center gap-2 flex-wrap justify-end">
          <DatePicker value={endDate} onChange={setEndDate} />
          <button
            onClick={handleDeactivate}
            disabled={savingDeactivate || !endDate}
            className="text-sm text-white bg-red-500 hover:bg-red-600 font-semibold px-3 py-2 rounded-xl transition-colors disabled:opacity-50"
          >
            {savingDeactivate ? "…" : "Confirm"}
          </button>
          <button onClick={() => setDeactivating(false)} className="text-sm text-gray-400 hover:text-gray-600">✕</button>
        </div>
      ) : (
        <button
          onClick={() => { setEndDate(localContractEnd ?? todayISO()); setDeactivating(true); }}
          className="text-sm text-red-500 hover:text-red-700 font-semibold px-3 py-2 rounded-xl border border-red-200 hover:border-red-400 transition-colors"
        >
          Deactivate
        </button>
      )}

      {isPlaceholder && (
        confirmDelete ? (
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500">Delete permanently?</span>
            <button
              onClick={handleDelete}
              disabled={deleting}
              className="text-xs font-semibold text-white bg-red-500 hover:bg-red-600 px-2.5 py-1.5 rounded-lg transition-colors disabled:opacity-50"
            >
              {deleting ? "Deleting…" : "Yes, delete"}
            </button>
            <button onClick={() => setConfirmDelete(false)} className="text-xs text-gray-400 hover:text-gray-600">Cancel</button>
          </div>
        ) : (
          <button
            onClick={() => setConfirmDelete(true)}
            className="text-xs text-gray-400 hover:text-red-500 font-semibold transition-colors"
          >
            Delete employee
          </button>
        )
      )}

      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
