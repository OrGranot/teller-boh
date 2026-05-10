"use client";
import { useState } from "react";

interface Feature { en: string; de: string; }

interface Props {
  features: Feature[];
  onSave: (features: Feature[]) => Promise<void>;
}

export default function FeaturesEditor({ features, onSave }: Props) {
  const [items, setItems] = useState<Feature[]>(features);
  const [status, setStatus] = useState<"idle" | "saving" | "saved">("idle");

  function update(i: number, field: "en" | "de", value: string) {
    setItems(prev => prev.map((f, idx) => idx === i ? { ...f, [field]: value } : f));
  }

  function move(i: number, dir: -1 | 1) {
    setItems(prev => {
      const next = [...prev];
      const j = i + dir;
      if (j < 0 || j >= next.length) return prev;
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  }

  function remove(i: number) {
    setItems(prev => prev.filter((_, idx) => idx !== i));
  }

  function add() {
    setItems(prev => [...prev, { en: "", de: "" }]);
  }

  async function save() {
    setStatus("saving");
    await onSave(items);
    setStatus("saved");
    setTimeout(() => setStatus("idle"), 1500);
  }

  return (
    <div className="space-y-2">
      {items.map((f, i) => (
        <div key={i} className="flex items-center gap-2">
          <div className="flex flex-col gap-1 shrink-0">
            <button onClick={() => move(i, -1)} disabled={i === 0} className="w-5 h-4 flex items-center justify-center rounded hover:bg-gray-200 disabled:opacity-30 text-gray-400 text-xs leading-none">↑</button>
            <button onClick={() => move(i,  1)} disabled={i === items.length - 1} className="w-5 h-4 flex items-center justify-center rounded hover:bg-gray-200 disabled:opacity-30 text-gray-400 text-xs leading-none">↓</button>
          </div>
          <div className="w-4 h-4 rounded-full bg-gray-200 shrink-0" />
          <input
            value={f.en}
            onChange={e => update(i, "en", e.target.value)}
            placeholder="English…"
            className="flex-1 border border-gray-200 rounded-lg px-3 py-1.5 text-sm outline-none focus:border-blue-400 bg-white"
          />
          <input
            value={f.de}
            onChange={e => update(i, "de", e.target.value)}
            placeholder="Deutsch…"
            className="flex-1 border border-gray-200 rounded-lg px-3 py-1.5 text-sm outline-none focus:border-blue-400 bg-white"
          />
          <button onClick={() => remove(i)} className="w-6 h-6 flex items-center justify-center rounded hover:bg-red-100 text-red-400 text-sm shrink-0">×</button>
        </div>
      ))}

      <div className="flex items-center gap-3 pt-1">
        <button onClick={add} className="px-3 py-1.5 text-xs border border-dashed border-gray-300 rounded-lg text-gray-500 hover:border-gray-400 hover:text-gray-700 transition-colors">
          + Add feature
        </button>
        <button onClick={save} disabled={status === "saving"} className="px-4 py-1.5 text-xs bg-gray-900 text-white rounded-lg hover:bg-gray-700 disabled:opacity-50 transition-colors">
          {status === "saving" ? "Saving…" : "Save features"}
        </button>
        {status === "saved" && <span className="text-green-500 text-xs">✓ Saved</span>}
      </div>
    </div>
  );
}
