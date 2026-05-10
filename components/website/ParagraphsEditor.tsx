"use client";
import { useState } from "react";

interface Paragraph { en: string; de: string; }

interface Props {
  paragraphs: Paragraph[];
  onSave: (paragraphs: Paragraph[]) => Promise<void>;
}

export default function ParagraphsEditor({ paragraphs, onSave }: Props) {
  const [items, setItems] = useState<Paragraph[]>(paragraphs);
  const [status, setStatus] = useState<"idle" | "saving" | "saved">("idle");

  function update(i: number, field: "en" | "de", value: string) {
    setItems(prev => prev.map((p, idx) => idx === i ? { ...p, [field]: value } : p));
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
    <div className="space-y-3">
      {items.map((p, i) => (
        <div key={i} className="border border-gray-200 rounded-xl p-4 space-y-3 bg-gray-50/50">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-gray-400 uppercase tracking-wide">Paragraph {i + 1}</span>
            <div className="flex items-center gap-1">
              <button onClick={() => move(i, -1)} disabled={i === 0} className="w-6 h-6 flex items-center justify-center rounded hover:bg-gray-200 disabled:opacity-30 text-gray-500 text-xs">↑</button>
              <button onClick={() => move(i,  1)} disabled={i === items.length - 1} className="w-6 h-6 flex items-center justify-center rounded hover:bg-gray-200 disabled:opacity-30 text-gray-500 text-xs">↓</button>
              <button onClick={() => remove(i)} className="w-6 h-6 flex items-center justify-center rounded hover:bg-red-100 text-red-400 text-sm">×</button>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-400 mb-1 block">English</label>
              <textarea value={p.en} onChange={e => update(i, "en", e.target.value)} rows={3} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white resize-y outline-none focus:border-blue-400" />
            </div>
            <div>
              <label className="text-xs text-gray-400 mb-1 block">Deutsch</label>
              <textarea value={p.de} onChange={e => update(i, "de", e.target.value)} rows={3} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white resize-y outline-none focus:border-blue-400" />
            </div>
          </div>
        </div>
      ))}

      <div className="flex items-center gap-3 pt-1">
        <button onClick={add} className="px-3 py-1.5 text-xs border border-dashed border-gray-300 rounded-lg text-gray-500 hover:border-gray-400 hover:text-gray-700 transition-colors">
          + Add paragraph
        </button>
        <button onClick={save} disabled={status === "saving"} className="px-4 py-1.5 text-xs bg-gray-900 text-white rounded-lg hover:bg-gray-700 disabled:opacity-50 transition-colors">
          {status === "saving" ? "Saving…" : "Save paragraphs"}
        </button>
        {status === "saved" && <span className="text-green-500 text-xs">✓ Saved</span>}
      </div>
    </div>
  );
}
