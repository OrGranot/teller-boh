"use client";
import { useState, useRef, useEffect, useCallback } from "react";


export interface DateRange {
  from: string; // YYYY-MM-DD
  to:   string; // YYYY-MM-DD
}

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
function fmtShort(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  return `${String(d).padStart(2,"0")}/${String(m).padStart(2,"0")}/${y}`;
}
function fmtTiny(iso: string) {
  const [, m, d] = iso.split("-").map(Number);
  return `${String(d).padStart(2,"0")}/${String(m).padStart(2,"0")}`;
}

interface Props {
  initialRange?: DateRange;
  onChange: (range: DateRange) => void;
}

export default function DateRangePicker({ initialRange, onChange }: Props) {
  const TODAY = todayISO();

  const [value, setValue] = useState<DateRange>(() => {
    if (initialRange) return initialRange;
    const d = new Date();
    return { from: toISO(d.getFullYear(), d.getMonth(), 1), to: toISO(d.getFullYear(), d.getMonth(), new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()) };
  });

  const [isOpen,       setIsOpen]       = useState(false);
  const [viewY,        setViewY]        = useState(2024);
  const [viewM,        setViewM]        = useState(0);
  const [viewMode,     setViewMode]     = useState<"days" | "months" | "years">("days");
  const [pendingStart, setPendingStart] = useState<string | null>(null);
  const [pickingEnd,   setPickingEnd]   = useState(false);
  const [hovered,      setHovered]      = useState<string | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);

  const close = useCallback(() => {
    setIsOpen(false);
    setViewMode("days");
    setPendingStart(null);
    setPickingEnd(false);
    setHovered(null);
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
    const d = new Date(value.from + "T12:00:00");
    setViewY(d.getFullYear()); setViewM(d.getMonth()); setViewMode("days");
    setPendingStart(value.from); setPickingEnd(false); setHovered(null);
    setIsOpen(true);
  }

  // Navigation
  function selectFullMonth(y: number, m: number) {
    const from = toISO(y, m, 1);
    const to   = toISO(y, m, new Date(y, m + 1, 0).getDate());
    const next = { from, to };
    setValue(next); onChange(next);
    setPendingStart(from); setPickingEnd(false); setHovered(null);
  }
  function prevMonth() {
    const newM = viewM === 0 ? 11 : viewM - 1;
    const newY = viewM === 0 ? viewY - 1 : viewY;
    setViewY(newY); setViewM(newM);
    selectFullMonth(newY, newM);
  }
  function nextMonth() {
    const newM = viewM === 11 ? 0 : viewM + 1;
    const newY = viewM === 11 ? viewY + 1 : viewY;
    setViewY(newY); setViewM(newM);
    selectFullMonth(newY, newM);
  }
  function prevYear()  { setViewY(y => y - 1); }
  function nextYear()  { setViewY(y => y + 1); }

  function onLeft()  { if (viewMode === "years") setViewY(y => y - 10); else if (viewMode === "months") prevYear();  else prevMonth(); }
  function onRight() { if (viewMode === "years") setViewY(y => y + 10); else if (viewMode === "months") nextYear();  else nextMonth(); }

  // Day picking
  function handleDayClick(iso: string) {
    if (!pickingEnd) {
      setPendingStart(iso); setPickingEnd(true);
    } else {
      if (iso >= pendingStart!) {
        const next = { from: pendingStart!, to: iso };
        setValue(next); onChange(next); close();
      } else {
        setPendingStart(iso);
      }
    }
  }

  // Grid
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

  const cells     = buildGrid();
  const dispFrom  = pendingStart ?? value.from;
  const dispTo    = pickingEnd
    ? (hovered && hovered >= (pendingStart ?? "") ? hovered : (pendingStart ?? value.from))
    : value.to;
  const singleDot = dispFrom === dispTo;
  const navBtn    = "p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 transition-colors text-sm leading-none select-none";

  return (
    <div ref={containerRef} className="relative">
      {/* Trigger */}
      <button type="button" onClick={() => isOpen ? close() : open()}
        className={`flex items-center gap-1.5 border rounded-xl px-3 py-2 text-sm bg-white transition-colors outline-none
          ${isOpen ? "border-gray-800" : "border-gray-200 hover:border-gray-300"}`}>
        <svg className="w-3.5 h-3.5 text-gray-400 flex-shrink-0 hidden sm:block" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
        </svg>
        <span className="font-medium text-gray-700 tabular-nums">
          <span className="hidden sm:inline">{fmtShort(value.from)}</span>
          <span className="sm:hidden">{fmtTiny(value.from)}</span>
        </span>
        <span className="text-gray-400 text-xs">→</span>
        <span className="font-medium text-gray-700 tabular-nums">
          <span className="hidden sm:inline">{fmtShort(value.to)}</span>
          <span className="sm:hidden">{fmtTiny(value.to)}</span>
        </span>
        <svg className={`w-3.5 h-3.5 text-gray-400 transition-transform flex-shrink-0 ${isOpen ? "rotate-180" : ""}`} viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" clipRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" />
        </svg>
      </button>

      {/* Dropdown — z-50 in root stacking context (parent has no z-index so no stacking context is created) */}
      {isOpen && (
        <div className="absolute z-50 top-full mt-2 left-0 bg-white border border-gray-200 rounded-2xl shadow-xl overflow-hidden"
          style={{ width: "17rem" }}>

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
                <button key={name} type="button" onClick={() => { setViewM(i); setViewMode("days"); selectFullMonth(viewY, i); }}
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
                  const isStart = !singleDot && iso === dispFrom;
                  const isEnd   = !singleDot && iso === dispTo;
                  const isDot   = singleDot  && iso === dispFrom;
                  const inRange = !singleDot && iso > dispFrom && iso < dispTo;
                  const isToday = iso === TODAY;
                  const endpoint = isStart || isEnd || isDot;
                  return (
                    <div key={iso} className="relative flex items-center justify-center h-8">
                      {(isStart || isEnd || inRange) && (
                        <div className={`absolute inset-y-1 bg-indigo-50
                          ${isStart ? "left-1/2 right-0" : ""}
                          ${isEnd   ? "left-0 right-1/2" : ""}
                          ${inRange ? "inset-x-0"        : ""}`} />
                      )}
                      <button type="button"
                        onClick={() => handleDayClick(iso)}
                        onMouseEnter={() => setHovered(iso)}
                        onMouseLeave={() => setHovered(null)}
                        className={`relative z-10 w-7 h-7 rounded-full flex items-center justify-center text-xs transition-colors select-none
                          ${endpoint ? "bg-indigo-600 text-white font-semibold"
                          : inRange  ? "text-indigo-700 hover:bg-indigo-100"
                          : cur      ? "text-gray-700 hover:bg-gray-100"
                                     : "text-gray-300 hover:bg-gray-50"}
                          ${isToday && !endpoint ? "ring-1 ring-indigo-400 ring-offset-1" : ""}`}>
                        {day}
                      </button>
                    </div>
                  );
                })}
              </div>
              <div className="px-4 py-2.5 border-t border-gray-100 text-center">
                <p className="text-[11px] text-gray-400">
                  {pickingEnd ? "Now pick an end date" : "Click a date to start a new range"}
                </p>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
