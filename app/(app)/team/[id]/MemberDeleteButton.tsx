"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function MemberDeleteButton({ profileId, restaurantId }: { profileId: string; restaurantId: string }) {
  const router = useRouter();
  const [confirm, setConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");

  async function handleDelete() {
    setDeleting(true);
    const res = await fetch(`/api/members/${profileId}`, { method: "DELETE" });
    if (res.ok) {
      router.push("/team");
    } else {
      const data = await res.json();
      setError(data.error || "Failed to delete");
      setDeleting(false);
      setConfirm(false);
    }
  }

  if (error) return <p className="text-xs text-red-600">{error}</p>;

  if (confirm) {
    return (
      <div className="flex items-center gap-2">
        <span className="text-xs text-amber-700">Delete permanently?</span>
        <button
          onClick={handleDelete}
          disabled={deleting}
          className="text-xs font-semibold text-white bg-red-500 hover:bg-red-600 px-2.5 py-1.5 rounded-lg transition-colors disabled:opacity-50"
        >
          {deleting ? "Deleting…" : "Yes, delete"}
        </button>
        <button onClick={() => setConfirm(false)} className="text-xs text-amber-600 hover:text-amber-800">Cancel</button>
      </div>
    );
  }

  return (
    <button
      onClick={() => setConfirm(true)}
      className="text-xs font-semibold text-red-500 hover:text-red-700 border border-red-200 hover:border-red-400 px-3 py-1.5 rounded-lg transition-colors"
    >
      Delete employee
    </button>
  );
}
