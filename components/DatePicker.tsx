"use client";
import { useState, useRef, useEffect, useCallback } from "react";

const MONTHS = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
];
const WEEKDAYS = ["Su","Mo","Tu","We","Th","Fr","Sa"];

function toISO(y: number, m: number, d: number) {
  return `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}
function todayISO() {
  const t = new Date();
  return toISO(t.getFullYear(), t.getMonth(), t.getDate());
}
function fmtDisplay(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  return `${String(d).padStart(2,"0")}/${String(m).padStart(2,"0")}/${y}`;
}

interface Props {
  value: string; // YYYY-MM-DD
  onChange: (date: string) => void;
  placeholder?: string;
  maxDate?: string;
  disabled?: boolean;
  /** When value is empty, open the calendar here instead of today */
  initialViewDate?: string;
  /** Open the calendar immediately on mount */
  autoOpen?: boolean;
  /** Called whenever the visible month changes (navigation or month/year grid selection) */
  onMonthChange?: (year: number, month: number) => void;
  /** Which edge the calendar popup aligns to (default: "left") */
  align?: "left" | "right";
}

export default function DatePicker({ value, onChange, placeholder = "Pick a date", maxDate, disabled, initialViewDate, autoOpen, onMonthChange, align = "left" }: Props) {
  const TODAY = todayISO();

  const [isOpen, setIsOpen] = useState(autoOpen ?? false);
  const [viewY, setViewY] = useState(() => { const src = value || initialViewDate; return src ? new Date(src + "T12:00:00").getFullYear() : new Date().getFullYear(); });
  const [viewM, setViewM] = useState(() => { const src = value || initialViewDate; return src ? new Date(src + "T12:00:00").getMonth() : new Date().getMonth(); });
  const [viewMode, setViewMode] = useState<"days" | "months" | "years">("days");

  const containerRef = useRef<HTMLDivElement>(null);

  const close = useCallback(() => {
    setIsOpen(false);
    setViewMode("days");
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    function handler(e: MouseEvent) {
      if (!containerRef.current?.contains(e.target as Node)) close();
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [isOpen, close]);

  function open() {
    if (disabled) return;
    const src = value || initialViewDate;
    const d = src ? new Date(src + "T12:00:00") : new Date();
    setViewY(d.getFullYear()); setViewM(d.getMonth()); setViewMode("days");
    setIsOpen(true);
  }

  // Navigation
  function prevMonth() { const newM = viewM === 0 ? 11 : viewM - 1; const newY = viewM === 0 ? viewY - 1 : viewY; setViewY(newY); setViewM(newM); onMonthChange?.(newY, newM); }
  function nextMonth() { const newM = viewM === 11 ? 0 : viewM + 1; const newY = viewM === 11 ? viewY + 1 : viewY; setViewY(newY); setViewM(newM); onMonthChange?.(newY, newM); }
  function onLeft()  { if (viewMode === "years") setViewY(y => y - 10); else if (viewMode === "months") setViewY(y => y - 1); else prevMonth(); }
  function onRight() { if (viewMode === "years") setViewY(y => y + 10); else if (viewMode === "months") setViewY(y => y + 1); else nextMonth(); }

  function handleDayClick(iso: string) {
    if (maxDate && iso > maxDate) return;
    onChange(iso);
    close();
  }

  function buildGrid() {
    const firstWd  = new Date(viewY, viewM, 1).getDay();
    const dInMonth = new Date(viewY, viewM + 1, 0).getDate();
    const prevM = viewM === 0 ? 11 : viewM - 1; const prevY = viewM === 0 ? viewY - 1 : viewY;
    const nextM = viewM === 11 ? 0 : viewM + 1; const nextY = viewM === 11 ? viewY + 1 : viewY;
    const dInPrev = new Date(prevY, prevM + 1, 0).getDate();
    const cells: { iso: string; day: number; cur: boolean }[] = [];
    for (let i = firstWd - 1; i >= 0; i--)
      cells.push({ iso: toISO(prevY, prevM, dInPrev - i), day: dInPrev - i, cur: false });
    for (let d = 1; d <= dInMonth; d++)
      cells.push({ iso: toISO(viewY, viewM, d), day: d, cur: true });
    let nd = 1;
    while (cells.length < 42)
      cells.push({ iso: toISO(nextY, nextM, nd), day: nd++, cur: false });
    return cells;
  }

  const cells = buildGrid();
  const navBtn = "p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 transition-colors text-sm leading-none select-none";

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => isOpen ? close() : open()}
        disabled={disabled}
        className={`flex items-center gap-2 border rounded-xl px-3 py-2 text-sm bg-white transition-colors outline-none
          ${disabled ? "opacity-50 cursor-default border-gray-200" : isOpen ? "border-gray-800" : "border-gray-200 hover:border-gray-300"}`}
      >
        <svg className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
        </svg>
        <span className={`tabular-nums ${value ? "font-medium text-gray-700" : "text-gray-400"}`}>
          {value ? fmtDisplay(value) : placeholder}
        </span>
        {!disabled && (
          <svg className={`w-3.5 h-3.5 text-gray-400 transition-transform flex-shrink-0 ${isOpen ? "rotate-180" : ""}`} viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" clipRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" />
          </svg>
        )}
      </button>

      {isOpen && (
        <div className={`absolute z-50 top-full mt-2 ${align === "right" ? "right-0" : "left-0"} bg-white border border-gray-200 rounded-2xl shadow-xl overflow-hidden`} style={{ width: "17rem" }}>

          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
            <button type="button" onClick={onLeft} className={navBtn}>←</button>
            <button type="button" onClick={() => setViewMode(v => v === "days" ? "months" : v === "months" ? "years" : "months")}
              className="flex items-center gap-1.5 px-2 py-1 rounded-lg hover:bg-gray-100 transition-colors">
              <span className="text-sm font-semibold text-gray-800 select-none">
                {viewMode === "days" ? `${MONTHS[viewM]} ${viewY}` : viewMode === "months" ? viewY : `${Math.floor(viewY / 10) * 10}–${Math.floor(viewY / 10) * 10 + 9}`}
              </span>
              <svg className={`w-3 h-3 text-gray-400 transition-transform ${viewMode !== "days" ? "rotate-180" : ""}`} viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" clipRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" />
              </svg>
            </button>
            <button type="button" onClick={onRight} className={navBtn}>→</button>
          </div>

          {/* Year grid */}
          {viewMode === "years" && (() => {
            const decadeStart = Math.floor(viewY / 10) * 10;
            const years = Array.from({ length: 12 }, (_, i) => decadeStart - 1 + i);
            return (
              <div className="grid grid-cols-3 gap-1.5 px-3 py-3">
                {years.map(y => (
                  <button key={y} type="button" onClick={() => { setViewY(y); setViewMode("months"); }}
                    className={`py-2.5 rounded-xl text-sm font-medium transition-colors
                      ${y === viewY ? "bg-indigo-600 text-white" : "text-gray-700 hover:bg-gray-100"}`}>
                    {y}
                  </button>
                ))}
              </div>
            );
          })()}

          {/* Month grid */}
          {viewMode === "months" && (
            <div className="grid grid-cols-3 gap-1.5 px-3 py-3">
              {MONTHS.map((name, i) => (
                <button key={name} type="button" onClick={() => { setViewM(i); setViewMode("days"); onMonthChange?.(viewY, i); }}
                  className={`py-2.5 rounded-xl text-sm font-medium transition-colors
                    ${i === viewM ? "bg-indigo-600 text-white" : "text-gray-700 hover:bg-gray-100"}`}>
                  {name.slice(0, 3)}
                </button>
              ))}
            </div>
          )}

          {/* Day grid */}
          {viewMode === "days" && (
            <>
              <div className="grid grid-cols-7 px-3 pt-3 pb-1">
                {WEEKDAYS.map(d => (
                  <div key={d} className="text-center text-[10px] font-semibold text-gray-400 tracking-wide">{d}</div>
                ))}
              </div>
              <div className="grid grid-cols-7 px-3 pb-4">
                {cells.map(({ iso, day, cur }) => {
                  const isSelected = iso === value;
                  const isToday    = iso === TODAY;
                  const isPast     = !!maxDate && iso > maxDate;
                  return (
                    <div key={iso} className="relative flex items-center justify-center h-8">
                      <button
                        type="button"
                        onClick={() => handleDayClick(iso)}
                        disabled={isPast}
                        className={`relative z-10 w-7 h-7 rounded-full flex items-center justify-center text-xs transition-colors select-none
                          ${isSelected    ? "bg-indigo-600 text-white font-semibold"
                          : isPast        ? "text-gray-200 cursor-default"
                          : cur           ? "text-gray-700 hover:bg-gray-100"
                                          : "text-gray-300 hover:bg-gray-50"}
                          ${isToday && !isSelected ? "ring-1 ring-indigo-400 ring-offset-1" : ""}`}
                      >
                        {day}
                      </button>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
