"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function NamePrompt() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function handleSave() {
    if (!name.trim()) { setError("Please enter your name."); return; }
    setSaving(true);
    const res = await fetch("/api/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim() }),
    });
    if (res.ok) {
      router.refresh();
    } else {
      setError("Something went wrong. Try again.");
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl p-8 w-full max-w-sm shadow-2xl">
        <h2 className="text-lg font-bold text-gray-900 mb-1">What's your name?</h2>
        <p className="text-sm text-gray-500 mb-6">
          Every team member needs a name before using EasyBOH.
        </p>
        <input
          autoFocus
          type="text"
          placeholder="Full name"
          value={name}
          onChange={e => { setName(e.target.value); setError(""); }}
          onKeyDown={e => e.key === "Enter" && handleSave()}
          className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm outline-none focus:border-gray-800 mb-2"
        />
        {error && <p className="text-xs text-red-500 mb-2">{error}</p>}
        <button
          onClick={handleSave}
          disabled={saving}
          className="w-full bg-gray-900 text-white font-semibold rounded-xl py-3 text-sm hover:bg-gray-700 disabled:opacity-50 transition-colors mt-2"
        >
          {saving ? "Saving…" : "Continue"}
        </button>
      </div>
    </div>
  );
}
