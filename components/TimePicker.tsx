"use client";
import { useState, useRef, useEffect, useCallback } from "react";

const HOURS   = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, "0"));
const MINUTES = ["00", "05", "10", "15", "20", "25", "30", "35", "40", "45", "50", "55"];

interface Props {
  value:       string;   // "HH:MM"
  onChange:    (v: string) => void;
  placeholder?: string;
  disabled?:   boolean;
}

function snap(raw: string): string {
  // round raw minute string to nearest 5-min slot
  const n = parseInt(raw, 10) || 0;
  return MINUTES.reduce((a, b) =>
    Math.abs(parseInt(b) - n) < Math.abs(parseInt(a) - n) ? b : a
  );
}

export default function TimePicker({ value, onChange, placeholder = "Pick time", disabled }: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const hourColRef   = useRef<HTMLDivElement>(null);
  const minColRef    = useRef<HTMLDivElement>(null);

  const [hh, rawMm] = value ? value.split(":") : ["", ""];
  const mm = rawMm ? snap(rawMm) : "";

  const close = useCallback(() => setIsOpen(false), []);

  // Close on outside click
  useEffect(() => {
    if (!isOpen) return;
    function handler(e: MouseEvent) {
      if (!containerRef.current?.contains(e.target as Node)) close();
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [isOpen, close]);

  // Scroll selected items into view when opening
  useEffect(() => {
    if (!isOpen) return;
    requestAnimationFrame(() => {
      if (hh) hourColRef.current?.querySelector(`[data-v="${hh}"]`)?.scrollIntoView({ block: "center" });
      if (mm) minColRef.current?.querySelector(`[data-v="${mm}"]`)?.scrollIntoView({ block: "center" });
    });
  }, [isOpen, hh, mm]);

  function selectHour(h: string) {
    onChange(`${h}:${mm || "00"}`);
    // stay open so user picks minute next
    minColRef.current?.querySelector<HTMLElement>(`[data-v="${mm || "00"}"]`)?.focus();
  }

  function selectMinute(m: string) {
    onChange(`${hh || "00"}:${m}`);
    close();
  }

  // Arrow keys on the trigger button adjust time without opening the dropdown
  function handleTriggerKey(e: React.KeyboardEvent<HTMLButtonElement>) {
    if (e.key === "Escape") { close(); return; }
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setIsOpen(v => !v); return; }
    if (!value && (e.key === "ArrowUp" || e.key === "ArrowDown")) {
      e.preventDefault(); onChange("09:00"); return;
    }
    const [h, m] = (value || "09:00").split(":").map(Number);
    if (e.key === "ArrowUp") {
      e.preventDefault();
      const newM = m - 5;
      if (newM < 0) onChange(`${String((h - 1 + 24) % 24).padStart(2, "0")}:55`);
      else          onChange(`${String(h).padStart(2, "0")}:${String(newM).padStart(2, "0")}`);
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      const newM = m + 5;
      if (newM >= 60) onChange(`${String((h + 1) % 24).padStart(2, "0")}:00`);
      else            onChange(`${String(h).padStart(2, "0")}:${String(newM).padStart(2, "0")}`);
    }
  }

  // Arrow keys inside columns
  function handleColKey(e: React.KeyboardEvent, items: string[], current: string, onSelect: (v: string) => void) {
    const idx = items.indexOf(current);
    if (e.key === "ArrowDown") { e.preventDefault(); onSelect(items[(idx + 1) % items.length]); }
    if (e.key === "ArrowUp")   { e.preventDefault(); onSelect(items[(idx - 1 + items.length) % items.length]); }
    if (e.key === "Escape")    { close(); }
  }

  const btnClass = `
    flex items-center gap-2 border rounded-xl px-3 py-2 text-sm bg-white transition-colors outline-none
    ${disabled
      ? "opacity-50 cursor-default border-gray-200"
      : isOpen
      ? "border-gray-800 ring-1 ring-gray-800"
      : "border-gray-200 hover:border-gray-300 focus-visible:border-gray-800 focus-visible:ring-1 focus-visible:ring-gray-800"}
  `;

  return (
    <div ref={containerRef} className="relative">
      {/* Trigger */}
      <button
        type="button"
        onClick={() => !disabled && setIsOpen(v => !v)}
        onKeyDown={handleTriggerKey}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        className={btnClass}
      >
        {/* Clock icon */}
        <svg className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <span className={`font-mono tabular-nums text-sm ${value ? "font-medium text-gray-700" : "text-gray-400"}`}>
          {value ? `${hh}:${mm}` : placeholder}
        </span>
        {!disabled && (
          <svg className={`w-3.5 h-3.5 text-gray-400 flex-shrink-0 transition-transform ${isOpen ? "rotate-180" : ""}`} viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" clipRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" />
          </svg>
        )}
      </button>

      {/* Dropdown */}
      {isOpen && (
        <div
          className="absolute z-50 top-full mt-2 left-0 bg-white border border-gray-200 rounded-2xl shadow-xl overflow-hidden"
          style={{ width: "9rem" }}
        >
          <div className="flex h-52">
            {/* Hours column */}
            <div
              ref={hourColRef}
              role="listbox"
              aria-label="Hour"
              className="flex-1 overflow-y-auto py-1 border-r border-gray-100"
              style={{ scrollbarWidth: "none" }}
            >
              {HOURS.map(h => (
                <button
                  key={h}
                  type="button"
                  role="option"
                  data-v={h}
                  aria-selected={hh === h}
                  tabIndex={hh === h ? 0 : -1}
                  onClick={() => selectHour(h)}
                  onKeyDown={e => handleColKey(e, HOURS, hh, selectHour)}
                  className={`w-full text-center py-2 text-sm font-mono transition-colors leading-none
                    ${hh === h
                      ? "bg-indigo-600 text-white font-semibold"
                      : "text-gray-700 hover:bg-gray-100 focus-visible:bg-gray-100 outline-none"}`}
                >
                  {h}
                </button>
              ))}
            </div>

            {/* Minutes column */}
            <div
              ref={minColRef}
              role="listbox"
              aria-label="Minute"
              className="flex-1 overflow-y-auto py-1"
              style={{ scrollbarWidth: "none" }}
            >
              {MINUTES.map(m => (
                <button
                  key={m}
                  type="button"
                  role="option"
                  data-v={m}
                  aria-selected={mm === m}
                  tabIndex={mm === m ? 0 : -1}
                  onClick={() => selectMinute(m)}
                  onKeyDown={e => handleColKey(e, MINUTES, mm, selectMinute)}
                  className={`w-full text-center py-2 text-sm font-mono transition-colors leading-none
                    ${mm === m
                      ? "bg-indigo-600 text-white font-semibold"
                      : "text-gray-700 hover:bg-gray-100 focus-visible:bg-gray-100 outline-none"}`}
                >
                  :{m}
                </button>
              ))}
            </div>
          </div>

          {/* Hint */}
          <p className="text-center text-[10px] text-gray-400 py-1.5 border-t border-gray-100 select-none">
            ↑ ↓ arrow keys to adjust
          </p>
        </div>
      )}
    </div>
  );
}
