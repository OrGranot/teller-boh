"use client";
import { useState, useRef, useEffect } from "react";

interface Option {
  value: string;
  label: string;
}

interface Props {
  value: string;
  onChange: (value: string) => void;
  options: Option[];
  placeholder?: string;
  icon?: React.ReactNode;
}

export default function SearchableSelect({ value, onChange, options, placeholder = "All", icon }: Props) {
  const [open, setOpen]   = useState(false);
  const [query, setQuery] = useState("");
  const containerRef      = useRef<HTMLDivElement>(null);
  const inputRef          = useRef<HTMLInputElement>(null);

  const selected = options.find(o => o.value === value);

  // Close on outside click
  useEffect(() => {
    function handle(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery("");
      }
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, []);

  // Focus search input when opened
  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 0);
  }, [open]);

  const filtered = query.trim()
    ? options.filter(o => o.label.toLowerCase().includes(query.toLowerCase().trim()))
    : options;

  function select(val: string) {
    onChange(val);
    setOpen(false);
    setQuery("");
  }

  return (
    <div ref={containerRef} className="relative">
      {/* Trigger */}
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className={`flex items-center gap-2 border rounded-xl px-3 py-2 text-sm bg-white transition-colors outline-none
          ${open ? "border-gray-800" : "border-gray-200 hover:border-gray-300"}`}
      >
        {icon && <span className="text-gray-400 flex-shrink-0">{icon}</span>}
        <span className={selected ? "text-gray-800 font-medium" : "text-gray-500"}>
          {selected ? selected.label : placeholder}
        </span>
        <svg className={`w-3.5 h-3.5 text-gray-400 ml-1 transition-transform flex-shrink-0 ${open ? "rotate-180" : ""}`}
          viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
        </svg>
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute z-50 top-full mt-1 left-0 min-w-[200px] bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden">
          {/* Search */}
          <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-100">
            <svg className="w-3.5 h-3.5 text-gray-300 flex-shrink-0" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M9 3.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11zM2 9a7 7 0 1112.452 4.391l3.328 3.329a.75.75 0 11-1.06 1.06l-3.329-3.328A7 7 0 012 9z" clipRule="evenodd" />
            </svg>
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={e => {
                if (e.key === "Escape") { setOpen(false); setQuery(""); }
                if (e.key === "Enter" && filtered.length === 1) select(filtered[0].value);
              }}
              placeholder="Search…"
              className="flex-1 text-sm outline-none bg-transparent placeholder-gray-300 text-gray-700"
            />
            {query && (
              <button onClick={() => setQuery("")} className="text-gray-300 hover:text-gray-500 text-xs">✕</button>
            )}
          </div>

          {/* Options */}
          <div className="max-h-56 overflow-y-auto py-1">
            {/* All option */}
            <button type="button" onClick={() => select("")}
              className={`w-full text-left px-3 py-2 text-sm transition-colors
                ${!value ? "bg-indigo-50 text-indigo-700 font-medium" : "text-gray-600 hover:bg-gray-50"}`}>
              {placeholder}
            </button>

            {filtered.length === 0 ? (
              <p className="px-3 py-2 text-xs text-gray-400">No results</p>
            ) : (
              filtered.map(o => (
                <button key={o.value} type="button" onClick={() => select(o.value)}
                  className={`w-full text-left px-3 py-2 text-sm transition-colors
                    ${value === o.value ? "bg-indigo-50 text-indigo-700 font-medium" : "text-gray-700 hover:bg-gray-50"}`}>
                  {o.label}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
