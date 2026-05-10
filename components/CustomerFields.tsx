"use client";

import { useRef, useState } from "react";

export interface ContactSuggestion {
  id: string;
  name: string;
  address?: string | null;
  email?: string | null;
}

interface Props {
  name: string;
  onNameChange: (v: string) => void;
  street: string;
  onStreetChange: (v: string) => void;
  zip: string;
  onZipChange: (v: string) => void;
  city: string;
  onCityChange: (v: string) => void;
  country: string;
  onCountryChange: (v: string) => void;
  email?: string;
  onEmailChange?: (v: string) => void;
  emailLabel?: string;
  // Optional business details (invoices only)
  tradeReg?: string;
  onTradeRegChange?: (v: string) => void;
  taxNum?: string;
  onTaxNumChange?: (v: string) => void;
  vatNum?: string;
  onVatNumChange?: (v: string) => void;
  contacts?: ContactSuggestion[];
  onContactSelect?: (c: ContactSuggestion) => void;
}

export default function CustomerFields({
  name, onNameChange,
  street, onStreetChange,
  zip, onZipChange,
  city, onCityChange,
  country, onCountryChange,
  email, onEmailChange,
  emailLabel = "Email (for sending)",
  tradeReg, onTradeRegChange,
  taxNum, onTaxNumChange,
  vatNum, onVatNumChange,
  contacts = [],
  onContactSelect,
}: Props) {
  const showBusinessFields = onTradeRegChange !== undefined || onTaxNumChange !== undefined || onVatNumChange !== undefined;
  const [suggestions, setSuggestions] = useState<ContactSuggestion[]>([]);
  const [highlight, setHighlight] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);

  function handleNameChange(v: string) {
    onNameChange(v);
    setHighlight(-1);
    if (!v.trim() || contacts.length === 0) { setSuggestions([]); return; }
    setSuggestions(contacts.filter(c => c.name.toLowerCase().includes(v.toLowerCase())).slice(0, 6));
  }

  function select(c: ContactSuggestion) {
    setSuggestions([]);
    setHighlight(-1);
    onContactSelect?.(c);
  }

  return (
    <div className="space-y-3">
      {/* Name with autocomplete */}
      <div ref={containerRef} className="relative">
        <label className="block text-xs font-semibold text-gray-500 mb-1.5">Name</label>
        <input
          type="text"
          value={name}
          onChange={e => handleNameChange(e.target.value)}
          onBlur={() => setTimeout(() => setSuggestions([]), 150)}
          onKeyDown={e => {
            if (!suggestions.length) return;
            if (e.key === "ArrowDown") { e.preventDefault(); setHighlight(h => Math.min(h + 1, suggestions.length - 1)); }
            else if (e.key === "ArrowUp") { e.preventDefault(); setHighlight(h => Math.max(h - 1, 0)); }
            else if (e.key === "Enter" && highlight >= 0) { e.preventDefault(); select(suggestions[highlight]); }
            else if (e.key === "Escape") { setSuggestions([]); setHighlight(-1); }
          }}
          autoComplete="name"
          placeholder="Name or company"
          className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm outline-none focus:border-gray-800 bg-gray-50"
        />
        {suggestions.length > 0 && (
          <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-lg z-30 overflow-hidden">
            {suggestions.map((c, i) => (
              <button
                key={c.id}
                type="button"
                onMouseDown={() => select(c)}
                onMouseEnter={() => setHighlight(i)}
                className={`w-full text-left px-4 py-2.5 text-sm border-b border-gray-100 last:border-0 ${i === highlight ? "bg-indigo-50" : "hover:bg-gray-50"}`}
              >
                <span className="font-semibold">{c.name}</span>
                {c.address && <span className="text-gray-400 text-xs block truncate">{c.address}</span>}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Street */}
      <div>
        <label className="block text-xs font-semibold text-gray-500 mb-1.5">Street &amp; number</label>
        <input
          type="text"
          value={street}
          onChange={e => onStreetChange(e.target.value)}
          autoComplete="street-address"
          placeholder="Musterstraße 1"
          className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm outline-none focus:border-gray-800 bg-gray-50"
        />
      </div>

      {/* ZIP / City / Country */}
      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className="block text-xs font-semibold text-gray-500 mb-1.5">ZIP code</label>
          <input
            type="text"
            value={zip}
            onChange={e => onZipChange(e.target.value)}
            autoComplete="postal-code"
            placeholder="10115"
            className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm outline-none focus:border-gray-800 bg-gray-50"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-500 mb-1.5">City</label>
          <input
            type="text"
            value={city}
            onChange={e => onCityChange(e.target.value)}
            autoComplete="address-level2"
            placeholder="Berlin"
            className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm outline-none focus:border-gray-800 bg-gray-50"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-500 mb-1.5">Country</label>
          <input
            type="text"
            value={country}
            onChange={e => onCountryChange(e.target.value)}
            autoComplete="country-name"
            placeholder="Germany"
            className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm outline-none focus:border-gray-800 bg-gray-50"
          />
        </div>
      </div>

      {/* Email (optional slot) */}
      {onEmailChange !== undefined && (
        <div>
          <label className="block text-xs font-semibold text-gray-500 mb-1.5">
            {emailLabel}
          </label>
          <input
            type="email"
            value={email ?? ""}
            onChange={e => onEmailChange(e.target.value)}
            autoComplete="email"
            placeholder="kunde@firma.de"
            className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm outline-none focus:border-gray-800 bg-gray-50"
          />
        </div>
      )}

      {/* Business details (invoices only) */}
      {showBusinessFields && (
        <div className="grid grid-cols-3 gap-3">
          {onTradeRegChange !== undefined && (
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1.5">
                Handelsregister <span className="font-normal text-gray-400">(optional)</span>
              </label>
              <input
                type="text"
                value={tradeReg ?? ""}
                onChange={e => onTradeRegChange(e.target.value)}
                placeholder="HRB 12345"
                className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm outline-none focus:border-gray-800 bg-gray-50"
              />
            </div>
          )}
          {onTaxNumChange !== undefined && (
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1.5">
                St.-Nr. <span className="font-normal text-gray-400">(optional)</span>
              </label>
              <input
                type="text"
                value={taxNum ?? ""}
                onChange={e => onTaxNumChange(e.target.value)}
                placeholder="37/250/12345"
                className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm outline-none focus:border-gray-800 bg-gray-50"
              />
            </div>
          )}
          {onVatNumChange !== undefined && (
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1.5">
                USt-IdNr. <span className="font-normal text-gray-400">(optional)</span>
              </label>
              <input
                type="text"
                value={vatNum ?? ""}
                onChange={e => onVatNumChange(e.target.value)}
                placeholder="DE123456789"
                className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm outline-none focus:border-gray-800 bg-gray-50"
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
