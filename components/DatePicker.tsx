"use client";
import { useState, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";

const MONTHS = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
];
// Monday-first
const WEEKDAYS = ["Mo","Tu","We","Th","Fr","Sa","Su"];

function toISO(y: number, m: number, d: number) {
  return `${y}-${String(m + 1).padStart(2,"0")}-${String(d).padStart(2,"0")}`;
}
function todayISO() {
  const t = new Date();
  return toISO(t.getFullYear(), t.getMonth(), t.getDate());
}
function fmtDisplay(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  return `${String(d).padStart(2,"0")}.${String(m).padStart(2,"0")}.${y}`;
}

interface Props {
  value: string;
  onChange: (date: string) => void;
  placeholder?: string;
  maxDate?: string;
  disabled?: boolean;
  initialViewDate?: string;
  autoOpen?: boolean;
  onMonthChange?: (year: number, month: number) => void;
  align?: "left" | "right";
}

export default function DatePicker({
  value, onChange, placeholder = "DD.MM.YYYY", maxDate, disabled,
  initialViewDate, autoOpen, onMonthChange, align = "left",
}: Props) {
  const TODAY = todayISO();

  const [isOpen, setIsOpen] = useState(autoOpen ?? false);
  const [viewY, setViewY] = useState(() => {
    const src = value || initialViewDate;
    return src ? new Date(src + "T12:00:00").getFullYear() : new Date().getFullYear();
  });
  const [viewM, setViewM] = useState(() => {
    const src = value || initialViewDate;
    return src ? new Date(src + "T12:00:00").getMonth() : new Date().getMonth();
  });
  const [viewMode, setViewMode] = useState<"days" | "months" | "years">("days");
  const [popupStyle, setPopupStyle] = useState<React.CSSProperties>({});

  const triggerRef  = useRef<HTMLDivElement>(null);
  const popupRef    = useRef<HTMLDivElement>(null);

  const close = useCallback(() => { setIsOpen(false); setViewMode("days"); }, []);

  useEffect(() => {
    if (!isOpen) return;
    function handler(e: MouseEvent) {
      const t = e.target as Node;
      if (!triggerRef.current?.contains(t) && !popupRef.current?.contains(t)) close();
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [isOpen, close]);

  function open() {
    if (disabled) return;
    const src = value || initialViewDate;
    const d = src ? new Date(src + "T12:00:00") : new Date();
    setViewY(d.getFullYear()); setViewM(d.getMonth()); setViewMode("days");
    if (triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      const popH = 340;
      const below = window.innerHeight - rect.bottom > popH || rect.top < popH;
      setPopupStyle({
        position: "fixed",
        ...(below ? { top: rect.bottom + 6 } : { bottom: window.innerHeight - rect.top + 6 }),
        ...(align === "right" ? { right: window.innerWidth - rect.right } : { left: rect.left }),
        width: "17rem",
        zIndex: 9999,
      });
    }
    setIsOpen(true);
  }

  function prevMonth() {
    const m = viewM === 0 ? 11 : viewM - 1, y = viewM === 0 ? viewY - 1 : viewY;
    setViewY(y); setViewM(m); onMonthChange?.(y, m);
  }
  function nextMonth() {
    const m = viewM === 11 ? 0 : viewM + 1, y = viewM === 11 ? viewY + 1 : viewY;
    setViewY(y); setViewM(m); onMonthChange?.(y, m);
  }
  function onLeft()  { if (viewMode === "years") setViewY(y => y - 10); else if (viewMode === "months") setViewY(y => y - 1); else prevMonth(); }
  function onRight() { if (viewMode === "years") setViewY(y => y + 10); else if (viewMode === "months") setViewY(y => y + 1); else nextMonth(); }

  function handleDayClick(iso: string) {
    if (maxDate && iso > maxDate) return;
    onChange(iso); close();
  }

  function buildGrid() {
    // Monday-first: Monday=0 … Sunday=6
    const rawFirstWd = new Date(viewY, viewM, 1).getDay(); // 0=Sun…6=Sat
    const firstWd = (rawFirstWd + 6) % 7; // shift so Mon=0
    const dInMonth = new Date(viewY, viewM + 1, 0).getDate();
    const prevM = viewM === 0 ? 11 : viewM - 1, prevY = viewM === 0 ? viewY - 1 : viewY;
    const nextM = viewM === 11 ? 0 : viewM + 1, nextY = viewM === 11 ? viewY + 1 : viewY;
    const dInPrev = new Date(prevY, prevM + 1, 0).getDate();
    const cells: { iso: string; day: number; cur: boolean }[] = [];
    for (let i = firstWd - 1; i >= 0; i--)
      cells.push({ iso: toISO(prevY, prevM, dInPrev - i), day: dInPrev - i, cur: false });
    for (let d = 1; d <= dInMonth; d++)
      cells.push({ iso: toISO(viewY, viewM, d), day: d, cur: true });
    let nd = 1;
    while (cells.length < 42)
      cells.push({ iso: toISO(nextY, nextM, nd++), day: nd - 1, cur: false });
    return cells;
  }

  const cells = buildGrid();

  const popup = isOpen ? (
    <div
      ref={popupRef}
      style={popupStyle}
      className="bg-white rounded-2xl shadow-2xl border border-gray-100 overflow-hidden select-none"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3.5 border-b border-gray-100">
        <button type="button" onClick={onLeft}
          className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-700 transition-colors text-sm">
          ‹
        </button>
        <button type="button"
          onClick={() => setViewMode(v => v === "days" ? "months" : v === "months" ? "years" : "months")}
          className="flex items-center gap-1 px-2 py-1 rounded-lg hover:bg-gray-100 transition-colors group">
          <span className="text-sm font-semibold text-gray-800">
            {viewMode === "days"   ? `${MONTHS[viewM]} ${viewY}`
           : viewMode === "months" ? viewY
           : `${Math.floor(viewY/10)*10}–${Math.floor(viewY/10)*10+9}`}
          </span>
          <svg className={`w-3 h-3 text-gray-400 group-hover:text-gray-600 transition-transform ${viewMode !== "days" ? "rotate-180" : ""}`}
            viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" clipRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" />
          </svg>
        </button>
        <button type="button" onClick={onRight}
          className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-700 transition-colors text-sm">
          ›
        </button>
      </div>

      {/* Year grid */}
      {viewMode === "years" && (() => {
        const start = Math.floor(viewY / 10) * 10;
        return (
          <div className="grid grid-cols-3 gap-1 p-3">
            {Array.from({ length: 12 }, (_, i) => start - 1 + i).map(y => (
              <button key={y} type="button" onClick={() => { setViewY(y); setViewMode("months"); }}
                className={`py-2.5 rounded-xl text-sm font-medium transition-colors
                  ${y === viewY ? "bg-gray-900 text-white" : "text-gray-600 hover:bg-gray-100"}`}>
                {y}
              </button>
            ))}
          </div>
        );
      })()}

      {/* Month grid */}
      {viewMode === "months" && (
        <div className="grid grid-cols-3 gap-1 p-3">
          {MONTHS.map((name, i) => (
            <button key={name} type="button" onClick={() => { setViewM(i); setViewMode("days"); onMonthChange?.(viewY, i); }}
              className={`py-2.5 rounded-xl text-sm font-medium transition-colors
                ${i === viewM ? "bg-gray-900 text-white" : "text-gray-600 hover:bg-gray-100"}`}>
              {name.slice(0, 3)}
            </button>
          ))}
        </div>
      )}

      {/* Day grid */}
      {viewMode === "days" && (
        <>
          <div className="grid grid-cols-7 px-3 pt-3 pb-1 gap-y-0.5">
            {WEEKDAYS.map(d => (
              <div key={d} className="text-center text-[10px] font-semibold text-gray-400 tracking-wide py-0.5">{d}</div>
            ))}
          </div>
          <div className="grid grid-cols-7 px-3 pb-3 gap-y-0.5">
            {cells.map(({ iso, day, cur }) => {
              const isSelected = iso === value;
              const isToday    = iso === TODAY;
              const disabled   = !!maxDate && iso > maxDate;
              return (
                <div key={iso} className="flex items-center justify-center h-8">
                  <button type="button" onClick={() => handleDayClick(iso)} disabled={disabled}
                    className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-medium transition-all
                      ${isSelected  ? "bg-gray-900 text-white shadow-sm"
                      : disabled    ? "text-gray-200 cursor-default"
                      : isToday     ? "text-gray-900 ring-1.5 ring-gray-900 ring-offset-1 hover:bg-gray-100"
                      : cur         ? "text-gray-700 hover:bg-gray-100"
                                    : "text-gray-300 hover:bg-gray-50"}
                    `}>
                    {day}
                  </button>
                </div>
              );
            })}
          </div>
          {/* Footer */}
          <div className="flex items-center justify-between px-4 py-2.5 border-t border-gray-100">
            <button type="button" onClick={() => { onChange(""); close(); }}
              className="text-xs font-semibold text-gray-400 hover:text-gray-700 transition-colors">
              Clear
            </button>
            <button type="button" onClick={() => handleDayClick(TODAY)}
              className="text-xs font-semibold text-gray-700 hover:text-gray-900 transition-colors">
              Today
            </button>
          </div>
        </>
      )}
    </div>
  ) : null;

  return (
    <div ref={triggerRef} className="relative">
      <button
        type="button"
        onClick={() => isOpen ? close() : open()}
        disabled={disabled}
        className={`flex items-center gap-2 border rounded-xl px-3 py-2 text-sm bg-white transition-colors outline-none w-full
          ${disabled ? "opacity-50 cursor-default border-gray-200"
          : isOpen   ? "border-gray-800"
                     : "border-gray-200 hover:border-gray-400"}`}
      >
        <svg className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
        </svg>
        <span className={`flex-1 text-left tabular-nums ${value ? "text-gray-800 font-medium" : "text-gray-400"}`}>
          {value ? fmtDisplay(value) : placeholder}
        </span>
        {!disabled && value && (
          <span role="button" onClick={e => { e.stopPropagation(); onChange(""); }}
            className="text-gray-300 hover:text-gray-500 transition-colors leading-none text-base cursor-pointer">
            ×
          </span>
        )}
      </button>

      {typeof window !== "undefined" && popup && createPortal(popup, document.body)}
    </div>
  );
}
