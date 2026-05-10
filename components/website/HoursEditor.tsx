"use client";
import { useState } from "react";

interface OpeningRow { day_en: string; day_de: string; time?: string; time_en?: string; time_de?: string; }
interface SeatingRow { name_en: string; name_de: string; time?: string; time_en?: string; time_de?: string; }

interface Props {
  opening: OpeningRow[];
  seatings: SeatingRow[];
  onSave: (opening: OpeningRow[], seatings: SeatingRow[]) => Promise<void>;
}

export default function HoursEditor({ opening, seatings, onSave }: Props) {
  const [op, setOp] = useState<OpeningRow[]>(opening);
  const [se, setSe] = useState<SeatingRow[]>(seatings);
  const [status, setStatus] = useState<"idle" | "saving" | "saved">("idle");

  function updateOp(i: number, field: keyof OpeningRow, val: string) {
    setOp(prev => prev.map((r, idx) => idx === i ? { ...r, [field]: val } : r));
  }
  function updateSe(i: number, field: keyof SeatingRow, val: string) {
    setSe(prev => prev.map((r, idx) => idx === i ? { ...r, [field]: val } : r));
  }

  async function save() {
    setStatus("saving");
    await onSave(op, se);
    setStatus("saved");
    setTimeout(() => setStatus("idle"), 1500);
  }

  const inputCls = "border border-gray-200 rounded-lg px-2 py-1.5 text-sm outline-none focus:border-blue-400 bg-white w-full";

  return (
    <div className="space-y-6">
      {/* Opening hours */}
      <div>
        <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Opening Hours</p>
        <div className="space-y-2">
          {op.map((row, i) => (
            <div key={i} className="grid grid-cols-[1fr_1fr_1fr_1fr_auto] gap-2 items-center">
              <input value={row.day_en} onChange={e => updateOp(i, "day_en", e.target.value)} placeholder="Day (EN)" className={inputCls} />
              <input value={row.day_de} onChange={e => updateOp(i, "day_de", e.target.value)} placeholder="Tag (DE)" className={inputCls} />
              <input value={row.time ?? ""} onChange={e => updateOp(i, "time", e.target.value)} placeholder="Time (both)" className={inputCls} />
              <input value={row.time_en ?? row.time_de ?? ""} onChange={e => updateOp(i, "time_en", e.target.value)} placeholder="Time EN / Time DE" className={inputCls} />
              <button onClick={() => setOp(prev => prev.filter((_, idx) => idx !== i))} className="w-6 h-6 flex items-center justify-center rounded hover:bg-red-100 text-red-400">×</button>
            </div>
          ))}
          <button onClick={() => setOp(prev => [...prev, { day_en: "", day_de: "", time: "" }])} className="text-xs text-gray-400 hover:text-gray-600 border border-dashed border-gray-200 rounded-lg px-3 py-1.5 transition-colors">
            + Add row
          </button>
        </div>
      </div>

      {/* Seatings */}
      <div>
        <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Seatings</p>
        <div className="space-y-2">
          {se.map((row, i) => (
            <div key={i} className="grid grid-cols-[1fr_1fr_1fr_auto] gap-2 items-center">
              <input value={row.name_en} onChange={e => updateSe(i, "name_en", e.target.value)} placeholder="Name (EN)" className={inputCls} />
              <input value={row.name_de} onChange={e => updateSe(i, "name_de", e.target.value)} placeholder="Name (DE)" className={inputCls} />
              <input value={row.time ?? row.time_en ?? ""} onChange={e => updateSe(i, "time", e.target.value)} placeholder="Time" className={inputCls} />
              <button onClick={() => setSe(prev => prev.filter((_, idx) => idx !== i))} className="w-6 h-6 flex items-center justify-center rounded hover:bg-red-100 text-red-400">×</button>
            </div>
          ))}
          <button onClick={() => setSe(prev => [...prev, { name_en: "", name_de: "", time: "" }])} className="text-xs text-gray-400 hover:text-gray-600 border border-dashed border-gray-200 rounded-lg px-3 py-1.5 transition-colors">
            + Add seating
          </button>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button onClick={save} disabled={status === "saving"} className="px-4 py-1.5 text-xs bg-gray-900 text-white rounded-lg hover:bg-gray-700 disabled:opacity-50 transition-colors">
          {status === "saving" ? "Saving…" : "Save hours"}
        </button>
        {status === "saved" && <span className="text-green-500 text-xs">✓ Saved</span>}
      </div>
    </div>
  );
}
