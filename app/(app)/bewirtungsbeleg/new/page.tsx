"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";

interface CatalogItem {
  id: string;
  name: string;
  price?: number;
  vat_rate?: number;
}

interface Item {
  qty: string;
  description: string;
  vat_rate: string;
  price: string; // net unit price
  sum: string;   // gross row total — takes priority if filled
}

const EMPTY_ITEM = (): Item => ({ qty: "1", description: "", vat_rate: "7", price: "", sum: "" });

function parseNum(s: string): number {
  if (s === "" || s == null) return 0;
  const str = String(s).replace(",", ".").replace(/[^\d.\-]/g, "");
  const n = parseFloat(str);
  return isNaN(n) ? 0 : n;
}

function rowGross(item: Item): number {
  if (item.sum.trim() !== "") return parseNum(item.sum);
  const qty = parseNum(item.qty) || 1;
  return qty * parseNum(item.price) * (1 + parseNum(item.vat_rate) / 100);
}

function rowNet(item: Item): number {
  return rowGross(item) / (1 + parseNum(item.vat_rate) / 100);
}

function fmt(n: number): string {
  return n.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function NewBewirtungsbelegPage() {
  const supabase = createClient();

  const [items, setItems] = useState<Item[]>([EMPTY_ITEM()]);
  const [date, setDate] = useState(todayISO());
  const [customerEmail, setCustomerEmail] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [sendError, setSendError] = useState("");

  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [suggestions, setSuggestions] = useState<{ items: CatalogItem[]; rowIdx: number } | null>(null);
  // Position of the dropdown (fixed positioning to avoid any clipping)
  const [dropPos, setDropPos] = useState<{ top: number; left: number; width: number } | null>(null);

  const qtyRefs = useRef<(HTMLInputElement | null)[]>([]);
  const descRefs = useRef<(HTMLInputElement | null)[]>([]);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    supabase.from("catalog_items").select("*").order("name").then(({ data }) => setCatalog(data || []));
  }, []);

  function setItem(idx: number, patch: Partial<Item>) {
    setItems(prev => prev.map((it, i) => i === idx ? { ...it, ...patch } : it));
  }

  function openSuggestions(idx: number, value: string) {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    if (!value.trim()) { setSuggestions(null); return; }
    const matches = catalog.filter(c => c.name.toLowerCase().includes(value.toLowerCase())).slice(0, 6);
    if (matches.length === 0) { setSuggestions(null); return; }
    // Calculate position from the input element
    const el = descRefs.current[idx];
    if (el) {
      const rect = el.getBoundingClientRect();
      setDropPos({ top: rect.bottom + 4, left: rect.left, width: rect.width });
    }
    setSuggestions({ items: matches, rowIdx: idx });
  }

  function handleDescChange(idx: number, value: string) {
    setItem(idx, { description: value });
    openSuggestions(idx, value);
  }

  function handleDescFocus(idx: number) {
    const value = items[idx]?.description || "";
    openSuggestions(idx, value);
  }

  function handleDescBlur() {
    // Delay so click on suggestion registers first
    closeTimer.current = setTimeout(() => setSuggestions(null), 180);
  }

  function selectCatalogItem(cat: CatalogItem, idx: number) {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    setItem(idx, {
      description: cat.name,
      vat_rate: String(cat.vat_rate ?? 7),
      price: cat.price != null ? String(cat.price) : "",
      sum: "",
    });
    setSuggestions(null);
    // Move focus to gross total field
    const sumInput = document.querySelector<HTMLInputElement>(`[data-sum="${idx}"]`);
    sumInput?.focus();
  }

  function addRow() {
    setItems(prev => {
      const next = [...prev, EMPTY_ITEM()];
      setTimeout(() => qtyRefs.current[next.length - 1]?.focus(), 0);
      return next;
    });
  }

  function removeRow(idx: number) {
    if (items.length > 1) setItems(prev => prev.filter((_, i) => i !== idx));
  }

  function handleLastTab(e: React.KeyboardEvent, idx: number) {
    if (e.key === "Tab" && !e.shiftKey && idx === items.length - 1) {
      e.preventDefault();
      addRow();
    }
  }

  // Totals
  const filledItems = items.filter(it => it.description.trim());
  let net7 = 0, vat7 = 0, net19 = 0, vat19 = 0;
  for (const it of filledItems) {
    const gross = rowGross(it);
    const net = rowNet(it);
    if (parseNum(it.vat_rate) <= 7) { net7 += net; vat7 += gross - net; }
    else { net19 += net; vat19 += gross - net; }
  }
  const totalGross = net7 + vat7 + net19 + vat19;

  async function handleSend() {
    if (!customerEmail || filledItems.length === 0) return;
    setSending(true);
    setSendError("");

    // Auto-create new catalog items
    const existingNames = new Set(catalog.map(c => c.name.toLowerCase()));
    for (const it of filledItems) {
      if (!existingNames.has(it.description.toLowerCase().trim())) {
        const qty = parseNum(it.qty) || 1;
        const net = parseNum(it.price) || rowNet(it) / qty;
        await supabase.from("catalog_items").insert({
          name: it.description.trim(),
          vat_rate: parseNum(it.vat_rate),
          price: net > 0 ? net : null,
        });
      }
    }

    try {
      const res = await fetch("/api/send-bewirtungsbeleg", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: filledItems.map(it => ({
            qty: it.qty || "1",
            description: it.description,
            vat_rate: it.vat_rate,
            sum: rowGross(it),
          })),
          date,
          customerEmail,
          customerName: customerName || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok || data.error) setSendError(data.error || "Failed to send.");
      else setSent(true);
    } catch {
      setSendError("Network error. Please try again.");
    } finally {
      setSending(false);
    }
  }

  function reset() {
    setItems([EMPTY_ITEM()]);
    setDate(todayISO());
    setCustomerEmail("");
    setCustomerName("");
    setSent(false);
    setSendError("");
  }

  return (
    <div className="max-w-4xl mx-auto px-6 py-10">
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Bewirtungsbeleg</h1>
      <p className="text-sm text-gray-500 mb-8">
        Enter items from the receipt, then send the fillable PDF to your customer.
      </p>

      {/* Items */}
      <div className="bg-white rounded-2xl p-8 mb-6" style={{ boxShadow: "0 2px 20px rgba(0,0,0,0.07)" }}>
        <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-5">1. Items</p>

        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs font-semibold text-gray-400 border-b border-gray-100">
              <th className="text-left pb-2 w-14">Qty</th>
              <th className="text-left pb-2">Description</th>
              <th className="text-center pb-2 w-20">VAT</th>
              <th className="text-right pb-2 w-28">
                Net / unit
                <span className="block font-normal text-gray-300 text-[9px]">netto</span>
              </th>
              <th className="text-right pb-2 w-28">
                Gross total
                <span className="block font-normal text-gray-300 text-[9px]">brutto</span>
              </th>
              <th className="w-8" />
            </tr>
          </thead>
          <tbody>
            {items.map((item, idx) => {
              const gross = rowGross(item);
              const net = rowNet(item);
              const qty = parseNum(item.qty) || 1;
              const netUnit = net / qty;
              const netPlaceholder = item.sum.trim() !== "" && netUnit !== 0
                ? fmt(netUnit).replace(" €", "")
                : "0,00";

              return (
                <tr key={idx} className="border-b border-gray-50 group">
                  <td className="py-1.5 pr-2">
                    <input
                      ref={el => { qtyRefs.current[idx] = el; }}
                      type="text"
                      value={item.qty}
                      onChange={e => setItem(idx, { qty: e.target.value })}
                      className="w-full border border-gray-200 rounded-lg px-2 py-2 text-sm text-center outline-none focus:border-gray-700 bg-gray-50"
                    />
                  </td>
                  <td className="py-1.5 pr-2">
                    <input
                      ref={el => { descRefs.current[idx] = el; }}
                      type="text"
                      value={item.description}
                      onChange={e => handleDescChange(idx, e.target.value)}
                      onFocus={() => handleDescFocus(idx)}
                      onBlur={handleDescBlur}
                      className="w-full border border-gray-200 rounded-lg px-2 py-2 text-sm outline-none focus:border-gray-700 bg-gray-50"
                      placeholder="Item description"
                    />
                  </td>
                  <td className="py-1.5 pr-2">
                    <select
                      value={item.vat_rate}
                      onChange={e => setItem(idx, { vat_rate: e.target.value })}
                      className="w-full border border-gray-200 rounded-lg px-2 py-2 text-sm outline-none focus:border-gray-700 bg-gray-50"
                    >
                      <option value="7">7%</option>
                      <option value="19">19%</option>
                    </select>
                  </td>
                  <td className="py-1.5 pr-2">
                    <input
                      type="text"
                      value={item.price}
                      onChange={e => setItem(idx, { price: e.target.value, sum: "" })}
                      placeholder={netPlaceholder}
                      className="w-full border border-gray-200 rounded-lg px-2 py-2 text-sm text-right outline-none focus:border-gray-700 bg-gray-50"
                    />
                  </td>
                  <td className="py-1.5 pr-2">
                    <input
                      data-sum={idx}
                      type="text"
                      value={item.sum}
                      onChange={e => setItem(idx, { sum: e.target.value, price: "" })}
                      onKeyDown={e => handleLastTab(e, idx)}
                      placeholder="0,00"
                      className="w-full border border-gray-200 rounded-lg px-2 py-2 text-sm text-right outline-none focus:border-gray-700 bg-gray-50"
                    />
                  </td>
                  <td className="py-1.5">
                    {items.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeRow(idx)}
                        className="text-gray-300 hover:text-red-400 text-xl leading-none w-7 h-7 flex items-center justify-center rounded transition-colors opacity-0 group-hover:opacity-100"
                      >
                        ×
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        <button
          type="button"
          onClick={addRow}
          className="mt-3 text-xs font-semibold text-gray-400 hover:text-gray-700 transition-colors"
        >
          + Add row
        </button>

        {/* VAT breakdown */}
        {totalGross !== 0 && (
          <div className="mt-6 pt-4 border-t border-gray-100 space-y-1.5">
            {net7 + vat7 !== 0 && (
              <div className="flex justify-between text-xs text-gray-400">
                <span>Netto 7%: <span className="text-gray-600 font-medium">{fmt(net7)}</span></span>
                <span>MwSt 7%: <span className="text-gray-600 font-medium">{fmt(vat7)}</span></span>
              </div>
            )}
            {net19 + vat19 !== 0 && (
              <div className="flex justify-between text-xs text-gray-400">
                <span>Netto 19%: <span className="text-gray-600 font-medium">{fmt(net19)}</span></span>
                <span>MwSt 19%: <span className="text-gray-600 font-medium">{fmt(vat19)}</span></span>
              </div>
            )}
            <div className="flex justify-between items-center pt-2 border-t border-gray-100">
              <span className="text-sm font-semibold text-gray-500">Total (gross)</span>
              <span className="font-bold text-gray-900 text-base">{fmt(totalGross)}</span>
            </div>
          </div>
        )}
      </div>

      {/* Catalog suggestions dropdown — fixed position, never clipped */}
      {suggestions && dropPos && (
        <div
          className="fixed z-50 bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden"
          style={{ top: dropPos.top, left: dropPos.left, width: dropPos.width, minWidth: 220 }}
          onMouseDown={e => e.preventDefault()} // prevent blur before click
        >
          {suggestions.items.map(cat => (
            <button
              key={cat.id}
              type="button"
              onClick={() => selectCatalogItem(cat, suggestions.rowIdx)}
              className="w-full text-left px-4 py-2.5 text-sm hover:bg-gray-50 border-b border-gray-100 last:border-0"
            >
              <span className="font-semibold">{cat.name}</span>
              {cat.price != null && (
                <span className="text-gray-400 text-xs ml-2">
                  {fmt(cat.price)} · {cat.vat_rate}% MwSt
                </span>
              )}
            </button>
          ))}
        </div>
      )}

      {/* Send */}
      <div className="bg-white rounded-2xl p-8" style={{ boxShadow: "0 2px 20px rgba(0,0,0,0.07)" }}>
        <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-5">2. Send to Customer</p>

        <div className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1.5">Date of Dining</label>
            <input
              type="date"
              value={date}
              onChange={e => setDate(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm outline-none focus:border-gray-800 bg-gray-50"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1.5">
              Customer Name <span className="font-normal text-gray-400">(optional)</span>
            </label>
            <input
              type="text"
              value={customerName}
              onChange={e => setCustomerName(e.target.value)}
              placeholder="Dr. Max Mustermann"
              className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm outline-none focus:border-gray-800 bg-gray-50"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1.5">
              Customer Email <span className="text-red-400">*</span>
            </label>
            <input
              type="email"
              value={customerEmail}
              onChange={e => setCustomerEmail(e.target.value)}
              placeholder="kunde@firma.de"
              className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm outline-none focus:border-gray-800 bg-gray-50"
            />
          </div>
        </div>

        {sendError && <p className="mt-4 text-sm text-red-600">{sendError}</p>}

        {sent ? (
          <div className="mt-6 text-green-700 bg-green-50 border border-green-200 rounded-lg px-4 py-3 text-sm font-semibold">
            ✓ Bewirtungsbeleg sent to {customerEmail}
          </div>
        ) : (
          <button
            onClick={handleSend}
            disabled={sending || !customerEmail || filledItems.length === 0}
            className="mt-6 w-full py-3 rounded-xl text-sm font-bold transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ background: "#1a1a1a", color: "#fff" }}
          >
            {sending ? "Sending…" : "Send Bewirtungsbeleg"}
          </button>
        )}

        {sent && (
          <button
            onClick={reset}
            className="mt-3 w-full py-2.5 rounded-xl text-sm font-semibold text-gray-600 hover:text-gray-900 hover:bg-gray-100 transition-colors"
          >
            New Bewirtungsbeleg
          </button>
        )}
      </div>
    </div>
  );
}
