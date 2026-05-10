"use client";
import { useState } from "react";

interface FAQItem {
  id?: string;
  sort_order: number;
  question_en: string; question_de: string;
  answer_en: string;   answer_de: string;
}

interface Props {
  items: FAQItem[];
  onSave: (items: FAQItem[]) => Promise<void>;
}

export default function FAQEditor({ items: initial, onSave }: Props) {
  const [items, setItems] = useState<FAQItem[]>(initial);
  const [open, setOpen] = useState<number | null>(null);
  const [status, setStatus] = useState<"idle" | "saving" | "saved">("idle");

  function update(i: number, field: keyof FAQItem, value: string) {
    setItems(prev => prev.map((item, idx) => idx === i ? { ...item, [field]: value } : item));
  }

  function move(i: number, dir: -1 | 1) {
    setItems(prev => {
      const next = [...prev];
      const j = i + dir;
      if (j < 0 || j >= next.length) return prev;
      [next[i], next[j]] = [next[j], next[i]];
      return next.map((item, idx) => ({ ...item, sort_order: idx + 1 }));
    });
    setOpen(null);
  }

  function remove(i: number) {
    setItems(prev => prev.filter((_, idx) => idx !== i).map((item, idx) => ({ ...item, sort_order: idx + 1 })));
    setOpen(null);
  }

  function add() {
    const newItem: FAQItem = {
      sort_order: items.length + 1,
      question_en: "", question_de: "",
      answer_en: "",   answer_de: "",
    };
    setItems(prev => [...prev, newItem]);
    setOpen(items.length);
  }

  async function save() {
    setStatus("saving");
    await onSave(items.map((item, idx) => ({ ...item, sort_order: idx + 1 })));
    setStatus("saved");
    setTimeout(() => setStatus("idle"), 1500);
  }

  const taCls = "w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-blue-400 bg-white resize-y";
  const inCls = "w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-blue-400 bg-white";

  return (
    <div className="space-y-2">
      {items.map((item, i) => (
        <div key={i} className="border border-gray-200 rounded-xl overflow-hidden">
          {/* Row header */}
          <div className="flex items-center gap-2 px-4 py-3 bg-gray-50 cursor-pointer hover:bg-gray-100 transition-colors"
               onClick={() => setOpen(open === i ? null : i)}>
            <span className="text-xs font-mono text-gray-400 w-5 shrink-0">{i + 1}</span>
            <span className="flex-1 text-sm text-gray-700 truncate font-medium">
              {item.question_en || <span className="text-gray-400 italic font-normal">New question…</span>}
            </span>
            <div className="flex items-center gap-1 shrink-0" onClick={e => e.stopPropagation()}>
              <button onClick={() => move(i, -1)} disabled={i === 0} className="w-6 h-6 flex items-center justify-center rounded hover:bg-gray-200 disabled:opacity-30 text-gray-400 text-xs">↑</button>
              <button onClick={() => move(i,  1)} disabled={i === items.length - 1} className="w-6 h-6 flex items-center justify-center rounded hover:bg-gray-200 disabled:opacity-30 text-gray-400 text-xs">↓</button>
              <button onClick={() => remove(i)} className="w-6 h-6 flex items-center justify-center rounded hover:bg-red-100 text-red-400 text-sm">×</button>
            </div>
            <span className="text-gray-400 text-xs">{open === i ? "▲" : "▼"}</span>
          </div>

          {/* Expanded editor */}
          {open === i && (
            <div className="p-4 space-y-4 bg-white">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs text-gray-400 mb-1 block">Question (EN)</label>
                  <input value={item.question_en} onChange={e => update(i, "question_en", e.target.value)} className={inCls} placeholder="Question in English…" />
                </div>
                <div>
                  <label className="text-xs text-gray-400 mb-1 block">Frage (DE)</label>
                  <input value={item.question_de} onChange={e => update(i, "question_de", e.target.value)} className={inCls} placeholder="Frage auf Deutsch…" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs text-gray-400 mb-1 block">Answer (EN) — HTML allowed</label>
                  <textarea value={item.answer_en} onChange={e => update(i, "answer_en", e.target.value)} rows={4} className={taCls} placeholder="Answer in English…" />
                </div>
                <div>
                  <label className="text-xs text-gray-400 mb-1 block">Antwort (DE) — HTML erlaubt</label>
                  <textarea value={item.answer_de} onChange={e => update(i, "answer_de", e.target.value)} rows={4} className={taCls} placeholder="Antwort auf Deutsch…" />
                </div>
              </div>
            </div>
          )}
        </div>
      ))}

      <div className="flex items-center gap-3 pt-1">
        <button onClick={add} className="px-3 py-1.5 text-xs border border-dashed border-gray-300 rounded-lg text-gray-500 hover:border-gray-400 hover:text-gray-700 transition-colors">
          + Add question
        </button>
        <button onClick={save} disabled={status === "saving"} className="px-4 py-1.5 text-xs bg-gray-900 text-white rounded-lg hover:bg-gray-700 disabled:opacity-50 transition-colors">
          {status === "saving" ? "Saving…" : "Save FAQ"}
        </button>
        {status === "saved" && <span className="text-green-500 text-xs">✓ Saved</span>}
      </div>
    </div>
  );
}
