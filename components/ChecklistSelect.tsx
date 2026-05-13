"use client";
import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";

interface Option {
  value: string;
  label: string;
}

interface Props {
  values: string[];
  onChange: (values: string[]) => void;
  options: Option[];
  placeholder?: string;
  /** Word used in the "N …" badge when multiple items are selected. Default: "employees" */
  countLabel?: string;
  icon?: React.ReactNode;
  /** Whether to show an "All" option at the top of the list. Default: true */
  showAllOption?: boolean;
}

export default function ChecklistSelect({ values, onChange, options, placeholder = "All", countLabel = "employees", icon, showAllOption = true }: Props) {
  const [open,  setOpen]  = useState(false);
  const [query, setQuery] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const dropdownRef  = useRef<HTMLDivElement>(null);
  const inputRef     = useRef<HTMLInputElement>(null);
  const [dropdownStyle, setDropdownStyle] = useState<React.CSSProperties>({});

  useEffect(() => {
    function handle(e: MouseEvent) {
      const t = e.target as Node;
      const inTrigger  = containerRef.current?.contains(t);
      const inDropdown = dropdownRef.current?.contains(t);
      if (!inTrigger && !inDropdown) { setOpen(false); setQuery(""); }
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, []);

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 0);
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        const dropdownHeight = 280;
        const spaceBelow = window.innerHeight - rect.bottom;
        const openAbove = spaceBelow < dropdownHeight && rect.top > dropdownHeight;
        setDropdownStyle({
          position: "fixed",
          ...(openAbove
            ? { bottom: window.innerHeight - rect.top + 4 }
            : { top: rect.bottom + 4 }),
          left: rect.left,
          minWidth: Math.max(rect.width, 220),
          zIndex: 9999,
        });
      }
    }
  }, [open]);

  const filtered = query.trim()
    ? options.filter(o => o.label.toLowerCase().includes(query.toLowerCase().trim()))
    : options;

  function toggle(value: string) {
    onChange(values.includes(value) ? values.filter(v => v !== value) : [...values, value]);
  }

  const hasSelection = values.length > 0;
  const triggerLabel =
    values.length === 0 ? placeholder :
    values.length === 1 ? (options.find(o => o.value === values[0])?.label ?? placeholder) :
    `${values.length} ${countLabel}`;

  const dropdown = open ? (
    <div
      ref={dropdownRef}
      style={dropdownStyle}
      className="bg-white border border-gray-200 rounded-xl shadow-lg"
    >
      {/* Search */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-100">
        <svg className="w-3.5 h-3.5 text-gray-300 flex-shrink-0" viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" clipRule="evenodd" d="M9 3.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11zM2 9a7 7 0 1112.452 4.391l3.328 3.329a.75.75 0 11-1.06 1.06l-3.329-3.328A7 7 0 012 9z" />
        </svg>
        <input ref={inputRef} type="text" value={query} onChange={e => setQuery(e.target.value)}
          onKeyDown={e => e.key === "Escape" && (setOpen(false), setQuery(""))}
          placeholder="Search…"
          className="flex-1 text-sm outline-none bg-transparent placeholder-gray-300 text-gray-700" />
        {query && <button onClick={() => setQuery("")} className="text-gray-300 hover:text-gray-500 text-xs">✕</button>}
      </div>

      <div className="max-h-60 overflow-y-auto py-1">
        {!showAllOption && !query && (
          <div className="px-3 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-gray-400 select-none">
            {placeholder}
          </div>
        )}
        {showAllOption && !query && (
          <button type="button" onClick={() => onChange([])}
            className={`w-full text-left px-3 py-2 text-sm flex items-center gap-2.5 transition-colors
              ${!hasSelection ? "bg-indigo-50 text-indigo-700 font-medium" : "text-gray-600 hover:bg-gray-50"}`}>
            <Checkbox checked={!hasSelection} />
            {placeholder}
          </button>
        )}
        {filtered.length === 0
          ? <p className="px-3 py-2 text-xs text-gray-400">No results</p>
          : filtered.map(o => {
              const checked = values.includes(o.value);
              return (
                <button key={o.value} type="button" onClick={() => toggle(o.value)}
                  className="w-full text-left px-3 py-2 text-sm flex items-center gap-2.5 hover:bg-gray-50 transition-colors">
                  <Checkbox checked={checked} />
                  <span className={checked ? "text-gray-800 font-medium" : "text-gray-700"}>{o.label}</span>
                </button>
              );
            })
        }
      </div>
    </div>
  ) : null;

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className={`flex items-center gap-2 border rounded-xl px-3 py-2 text-sm bg-white transition-colors outline-none
          ${open ? "border-gray-800" : "border-gray-200 hover:border-gray-300"}`}
      >
        {icon && <span className="text-gray-400 flex-shrink-0">{icon}</span>}
        <span className={hasSelection ? "text-gray-800 font-medium" : "text-gray-500"}>{triggerLabel}</span>
        {values.length > 1 && (
          <span className="bg-indigo-100 text-indigo-700 text-[10px] font-semibold px-1.5 py-0.5 rounded-full leading-none">
            {values.length}
          </span>
        )}
        <svg className={`w-3.5 h-3.5 text-gray-400 ml-0.5 transition-transform flex-shrink-0 ${open ? "rotate-180" : ""}`}
          viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" clipRule="evenodd"
            d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" />
        </svg>
      </button>

      {typeof window !== "undefined" && dropdown && createPortal(dropdown, document.body)}
    </div>
  );
}

function Checkbox({ checked }: { checked: boolean }) {
  return (
    <span className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 transition-colors
      ${checked ? "bg-indigo-600 border-indigo-600" : "border-gray-300 bg-white"}`}>
      {checked && (
        <svg className="w-2.5 h-2.5" viewBox="0 0 10 10" fill="none"
          stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M2 5.5L4 7.5L8 3" />
        </svg>
      )}
    </span>
  );
}
