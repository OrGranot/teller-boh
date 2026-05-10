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
  sum: string; // gross row total — takes priority if filled
}

interface Draft {
  id: string;
  savedAt: string; // ISO timestamp
  items: Item[];
  tip: string;
  date: string;
  customerEmail: string;
  customerName: string;
  customerAddress: string;
}

const DRAFTS_KEY = "bewirtungsbeleg_drafts";
const EMPTY_ITEM = (): Item => ({
  qty: "1",
  description: "",
  vat_rate: "7",
  price: "",
  sum: "",
});

function parseNum(s: string): number {
  if (s === "" || s == null) return 0;
  const str = String(s)
    .replace(",", ".")
    .replace(/[^\d.\-]/g, "");
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
  return (
    n.toLocaleString("de-DE", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }) + " €"
  );
}

function fmtDate(iso: string): string {
  return iso.split("-").reverse().join(".");
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function loadDrafts(): Draft[] {
  try {
    const raw = localStorage.getItem(DRAFTS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveDrafts(drafts: Draft[]) {
  try {
    localStorage.setItem(DRAFTS_KEY, JSON.stringify(drafts));
  } catch {
    /* ignore */
  }
}

interface Props {
  restaurantId: string;
}

export default function BewirtungsbelegClient({ restaurantId }: Props) {
  const supabase = createClient();

  const [items, setItems] = useState<Item[]>([EMPTY_ITEM()]);
  const [tip, setTip] = useState("");
  const [date, setDate] = useState(todayISO());
  const [customerEmail, setCustomerEmail] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [customerAddress, setCustomerAddress] = useState("");
  const [sending, setSending] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [sent, setSent] = useState(false);
  const [sendError, setSendError] = useState("");
  const [draftSaved, setDraftSaved] = useState(false);

  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [suggestions, setSuggestions] = useState<{
    items: CatalogItem[];
    rowIdx: number;
  } | null>(null);
  const [dropPos, setDropPos] = useState<{
    top: number;
    left: number;
    width: number;
  } | null>(null);
  const [drafts, setDrafts] = useState<Draft[]>([]);

  const qtyRefs = useRef<(HTMLInputElement | null)[]>([]);
  const descRefs = useRef<(HTMLInputElement | null)[]>([]);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    supabase
      .from("catalog_items")
      .select("*")
      .eq("restaurant_id", restaurantId)
      .order("name")
      .then(({ data }) => setCatalog(data || []));
    setDrafts(loadDrafts());
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function setItem(idx: number, patch: Partial<Item>) {
    setItems((prev) =>
      prev.map((it, i) => (i === idx ? { ...it, ...patch } : it))
    );
  }

  function openSuggestions(idx: number, value: string) {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    if (!value.trim()) {
      setSuggestions(null);
      return;
    }
    const matches = catalog
      .filter((c) => c.name.toLowerCase().includes(value.toLowerCase()))
      .slice(0, 6);
    if (matches.length === 0) {
      setSuggestions(null);
      return;
    }
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
    openSuggestions(idx, items[idx]?.description || "");
  }

  function handleDescBlur() {
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
    document
      .querySelector<HTMLInputElement>(`[data-sum="${idx}"]`)
      ?.focus();
  }

  function addRow() {
    setItems((prev) => {
      const next = [...prev, EMPTY_ITEM()];
      setTimeout(() => qtyRefs.current[next.length - 1]?.focus(), 0);
      return next;
    });
  }

  function removeRow(idx: number) {
    if (items.length > 1)
      setItems((prev) => prev.filter((_, i) => i !== idx));
  }

  function handleLastTab(e: React.KeyboardEvent, idx: number) {
    if (e.key === "Tab" && !e.shiftKey && idx === items.length - 1) {
      e.preventDefault();
      addRow();
    }
  }

  // Totals
  const filledItems = items.filter((it) => it.description.trim());
  const tipAmt = parseNum(tip);
  let net7 = 0,
    vat7 = 0,
    net19 = 0,
    vat19 = 0;
  for (const it of filledItems) {
    const gross = rowGross(it);
    const net = rowNet(it);
    if (parseNum(it.vat_rate) <= 7) {
      net7 += net;
      vat7 += gross - net;
    } else {
      net19 += net;
      vat19 += gross - net;
    }
  }
  const totalGross = net7 + vat7 + net19 + vat19;
  const grandTotal = totalGross + tipAmt;

  function toFilename(s: string): string {
    return s
      .trim()
      .replace(/[^a-zA-Z0-9äöüÄÖÜß\- ]/g, "")
      .replace(/\s+/g, "_")
      .slice(0, 40);
  }
  function pdfFilename(): string {
    const parts = ["Bewirtungsbeleg", date];
    if (customerName.trim()) parts.push(toFilename(customerName));
    return parts.join("_") + ".pdf";
  }

  // Catalog sync — add new items to catalog for this restaurant
  async function syncCatalog() {
    const existingNames = new Set(catalog.map((c) => c.name.toLowerCase()));
    for (const it of filledItems) {
      if (!existingNames.has(it.description.toLowerCase().trim())) {
        const qty = parseNum(it.qty) || 1;
        const net = parseNum(it.price) || rowNet(it) / qty;
        await supabase.from("catalog_items").insert({
          name: it.description.trim(),
          vat_rate: parseNum(it.vat_rate),
          price: net > 0 ? net : null,
          restaurant_id: restaurantId,
        });
        existingNames.add(it.description.toLowerCase().trim());
      }
    }
  }

  async function handleSaveDraft() {
    if (filledItems.length === 0) return;
    const draft: Draft = {
      id: Date.now().toString(),
      savedAt: new Date().toISOString(),
      items,
      tip,
      date,
      customerEmail,
      customerName,
      customerAddress,
    };
    const updated = [draft, ...drafts];
    setDrafts(updated);
    saveDrafts(updated);
    await syncCatalog();
    setDraftSaved(true);
    setTimeout(() => setDraftSaved(false), 2000);
  }

  function loadDraft(draft: Draft) {
    setItems(draft.items);
    setTip(draft.tip || "");
    setDate(draft.date);
    setCustomerEmail(draft.customerEmail || "");
    setCustomerName(draft.customerName || "");
    setCustomerAddress(draft.customerAddress || "");
    setSent(false);
    setSendError("");
  }

  function deleteDraft(id: string) {
    const updated = drafts.filter((d) => d.id !== id);
    setDrafts(updated);
    saveDrafts(updated);
  }

  function draftLabel(draft: Draft): string {
    const parts: string[] = [];
    if (draft.customerName) parts.push(draft.customerName);
    parts.push(fmtDate(draft.date));
    return parts.join(" · ");
  }

  function draftSub(draft: Draft): string {
    const count = draft.items.filter((it) => it.description.trim()).length;
    const savedTime = new Date(draft.savedAt).toLocaleTimeString("de-DE", {
      hour: "2-digit",
      minute: "2-digit",
    });
    return `${count} item${count !== 1 ? "s" : ""}  ·  ${savedTime}`;
  }

  async function handleDownload() {
    if (filledItems.length === 0) return;
    setDownloading(true);
    setSendError("");
    await syncCatalog();
    try {
      const res = await fetch("/api/download-bewirtungsbeleg", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: filledItems.map((it) => ({
            qty: it.qty || "1",
            description: it.description,
            vat_rate: it.vat_rate,
            sum: rowGross(it),
          })),
          date,
          customerAddress: customerAddress || undefined,
          tip: tipAmt > 0 ? tipAmt : undefined,
        }),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => null);
        setSendError(`Download failed: ${errData?.error || res.statusText}`);
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = pdfFilename();
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setSendError("Download failed. Please try again.");
    } finally {
      setDownloading(false);
    }
  }

  async function handleSend() {
    if (!customerEmail || filledItems.length === 0) return;
    setSending(true);
    setSendError("");
    await syncCatalog();
    try {
      const res = await fetch("/api/send-bewirtungsbeleg", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: filledItems.map((it) => ({
            qty: it.qty || "1",
            description: it.description,
            vat_rate: it.vat_rate,
            sum: rowGross(it),
          })),
          date,
          customerEmail,
          customerName: customerName || undefined,
          customerAddress: customerAddress || undefined,
          tip: tipAmt > 0 ? tipAmt : undefined,
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

  function clearForm() {
    setItems([EMPTY_ITEM()]);
    setTip("");
    setDate(todayISO());
    setCustomerEmail("");
    setCustomerName("");
    setCustomerAddress("");
    setSent(false);
    setSendError("");
  }

  return (
    <div className="px-6 py-10 flex gap-6 items-start">
      {/* Main form */}
      <div className="flex-1 min-w-0">
        <h1 className="text-2xl font-bold text-gray-900 mb-1">
          Bewirtungsbeleg
        </h1>
        <p className="text-sm text-gray-500 mb-8">
          Enter items from the receipt, then send the fillable PDF to your
          customer.
        </p>

        {/* Items */}
        <div
          className="bg-white rounded-2xl p-8 mb-6"
          style={{ boxShadow: "0 2px 20px rgba(0,0,0,0.07)" }}
        >
          <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-5">
            1. Items
          </p>

          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs font-semibold text-gray-400 border-b border-gray-100">
                <th className="text-left pb-2 w-14">Qty</th>
                <th className="text-left pb-2">Description</th>
                <th className="text-center pb-2 w-20">VAT</th>
                <th className="text-right pb-2 w-28">
                  Net / unit
                  <span className="block font-normal text-gray-300 text-[9px]">
                    netto
                  </span>
                </th>
                <th className="text-right pb-2 w-28">
                  Gross total
                  <span className="block font-normal text-gray-300 text-[9px]">
                    brutto
                  </span>
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
                const netPlaceholder =
                  item.sum.trim() !== "" && netUnit !== 0
                    ? fmt(netUnit).replace(" €", "")
                    : "0,00";

                return (
                  <tr key={idx} className="border-b border-gray-50 group">
                    <td className="py-1.5 pr-2">
                      <input
                        ref={(el) => {
                          qtyRefs.current[idx] = el;
                        }}
                        type="text"
                        value={item.qty}
                        onChange={(e) => setItem(idx, { qty: e.target.value })}
                        className="w-full border border-gray-200 rounded-lg px-2 py-2 text-sm text-center outline-none focus:border-gray-700 bg-gray-50"
                      />
                    </td>
                    <td className="py-1.5 pr-2">
                      <input
                        ref={(el) => {
                          descRefs.current[idx] = el;
                        }}
                        type="text"
                        value={item.description}
                        onChange={(e) =>
                          handleDescChange(idx, e.target.value)
                        }
                        onFocus={() => handleDescFocus(idx)}
                        onBlur={handleDescBlur}
                        className="w-full border border-gray-200 rounded-lg px-2 py-2 text-sm outline-none focus:border-gray-700 bg-gray-50"
                        placeholder="Item description"
                      />
                    </td>
                    <td className="py-1.5 pr-2">
                      <select
                        value={item.vat_rate}
                        onChange={(e) =>
                          setItem(idx, { vat_rate: e.target.value })
                        }
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
                        onChange={(e) =>
                          setItem(idx, { price: e.target.value, sum: "" })
                        }
                        placeholder={netPlaceholder}
                        className="w-full border border-gray-200 rounded-lg px-2 py-2 text-sm text-right outline-none focus:border-gray-700 bg-gray-50"
                      />
                    </td>
                    <td className="py-1.5 pr-2">
                      <input
                        data-sum={idx}
                        type="text"
                        value={item.sum}
                        onChange={(e) =>
                          setItem(idx, { sum: e.target.value, price: "" })
                        }
                        onKeyDown={(e) => handleLastTab(e, idx)}
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

          {/* Trinkgeld */}
          <div className="mt-4 flex items-center gap-3">
            <label className="text-xs font-semibold text-gray-500 whitespace-nowrap">
              Trinkgeld{" "}
              <span className="font-normal text-gray-400">(optional)</span>
            </label>
            <input
              type="text"
              value={tip}
              onChange={(e) => setTip(e.target.value)}
              placeholder="0,00"
              className="w-32 border border-gray-200 rounded-lg px-3 py-2 text-sm text-right outline-none focus:border-gray-700 bg-gray-50"
            />
            <span className="text-xs text-gray-400">
              Kein MwSt-Anteil — wird separat ausgewiesen
            </span>
          </div>

          {/* VAT breakdown */}
          {totalGross !== 0 && (
            <div className="mt-6 pt-4 border-t border-gray-100 space-y-1.5">
              {net7 + vat7 !== 0 && (
                <div className="flex justify-between text-xs text-gray-400">
                  <span>
                    Netto 7%:{" "}
                    <span className="text-gray-600 font-medium">
                      {fmt(net7)}
                    </span>
                  </span>
                  <span>
                    MwSt 7%:{" "}
                    <span className="text-gray-600 font-medium">
                      {fmt(vat7)}
                    </span>
                  </span>
                </div>
              )}
              {net19 + vat19 !== 0 && (
                <div className="flex justify-between text-xs text-gray-400">
                  <span>
                    Netto 19%:{" "}
                    <span className="text-gray-600 font-medium">
                      {fmt(net19)}
                    </span>
                  </span>
                  <span>
                    MwSt 19%:{" "}
                    <span className="text-gray-600 font-medium">
                      {fmt(vat19)}
                    </span>
                  </span>
                </div>
              )}
              {tipAmt > 0 && (
                <div className="flex justify-between text-xs text-gray-400">
                  <span>
                    Rechnungsbetrag:{" "}
                    <span className="text-gray-600 font-medium">
                      {fmt(totalGross)}
                    </span>
                  </span>
                  <span>
                    Trinkgeld:{" "}
                    <span className="text-gray-600 font-medium">
                      {fmt(tipAmt)}
                    </span>
                  </span>
                </div>
              )}
              <div className="flex justify-between items-center pt-2 border-t border-gray-100">
                <span className="text-sm font-semibold text-gray-500">
                  Gesamtbetrag
                </span>
                <span className="font-bold text-gray-900 text-base">
                  {fmt(grandTotal)}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Send section */}
        <div
          className="bg-white rounded-2xl p-8"
          style={{ boxShadow: "0 2px 20px rgba(0,0,0,0.07)" }}
        >
          <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-5">
            2. Send to Customer
          </p>

          <div className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1.5">
                Date of Dining
              </label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm outline-none focus:border-gray-800 bg-gray-50"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1.5">
                Customer Name{" "}
                <span className="font-normal text-gray-400">(optional)</span>
              </label>
              <input
                type="text"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                placeholder="Dr. Max Mustermann"
                className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm outline-none focus:border-gray-800 bg-gray-50"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1.5">
                Customer Address{" "}
                <span className="font-normal text-gray-400">
                  (optional — shown on PDF)
                </span>
              </label>
              <textarea
                value={customerAddress}
                onChange={(e) => setCustomerAddress(e.target.value)}
                placeholder={"Musterstraße 1\n10115 Berlin"}
                rows={3}
                className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm outline-none focus:border-gray-800 bg-gray-50 resize-none"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1.5">
                Customer Email{" "}
                <span className="font-normal text-gray-400">
                  (required to send)
                </span>
              </label>
              <input
                type="email"
                value={customerEmail}
                onChange={(e) => setCustomerEmail(e.target.value)}
                placeholder="kunde@firma.de"
                className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm outline-none focus:border-gray-800 bg-gray-50"
              />
            </div>
          </div>

          {sendError && (
            <p className="mt-4 text-sm text-red-600">{sendError}</p>
          )}

          {/* Action buttons */}
          <div className="mt-6 flex gap-3">
            <button
              onClick={handleSaveDraft}
              disabled={filledItems.length === 0}
              className="flex-1 py-3 rounded-xl text-sm font-bold border border-gray-200 hover:bg-gray-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed text-gray-700"
            >
              {draftSaved ? "✓ Saved" : "Save Draft"}
            </button>
            <button
              onClick={handleDownload}
              disabled={downloading || filledItems.length === 0}
              className="flex-1 py-3 rounded-xl text-sm font-bold border border-gray-200 hover:bg-gray-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed text-gray-700"
            >
              {downloading ? "Generating…" : "⬇ Download PDF"}
            </button>
          </div>

          {sent ? (
            <div className="mt-3 text-green-700 bg-green-50 border border-green-200 rounded-lg px-4 py-3 text-sm font-semibold">
              ✓ Bewirtungsbeleg sent to {customerEmail}
            </div>
          ) : (
            <button
              onClick={handleSend}
              disabled={sending || !customerEmail || filledItems.length === 0}
              className="mt-3 w-full py-3 rounded-xl text-sm font-bold transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              style={{ background: "#1a1a1a", color: "#fff" }}
            >
              {sending ? "Sending…" : "Send Bewirtungsbeleg"}
            </button>
          )}

          {sent && (
            <button
              onClick={clearForm}
              className="mt-3 w-full py-2.5 rounded-xl text-sm font-semibold text-gray-600 hover:text-gray-900 hover:bg-gray-100 transition-colors"
            >
              New Bewirtungsbeleg
            </button>
          )}
        </div>
      </div>

      {/* Drafts panel */}
      <div className="w-72 flex-shrink-0">
        <div
          className="bg-white rounded-2xl p-6 sticky top-8"
          style={{ boxShadow: "0 2px 20px rgba(0,0,0,0.07)" }}
        >
          <div className="flex items-center justify-between mb-4">
            <p className="text-xs font-semibold uppercase tracking-widest text-gray-400">
              Drafts
            </p>
            {filledItems.length > 0 && (
              <button
                onClick={clearForm}
                className="text-xs text-gray-400 hover:text-gray-700 font-medium transition-colors"
              >
                Clear form
              </button>
            )}
          </div>

          {drafts.length === 0 ? (
            <p className="text-xs text-gray-400 text-center py-8 leading-relaxed">
              No drafts yet.
              <br />
              Save a draft to see it here.
            </p>
          ) : (
            <div className="space-y-2">
              {drafts.map((draft) => (
                <div
                  key={draft.id}
                  className="group relative rounded-xl border border-gray-100 hover:border-gray-300 transition-colors cursor-pointer"
                  onClick={() => loadDraft(draft)}
                >
                  <div className="px-3 py-3 pr-8">
                    <p className="text-sm font-semibold text-gray-800 truncate">
                      {draftLabel(draft)}
                    </p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {draftSub(draft)}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteDraft(draft.id);
                    }}
                    className="absolute top-2.5 right-2.5 w-5 h-5 flex items-center justify-center text-gray-300 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100 text-base leading-none"
                    title="Delete draft"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Catalog suggestions dropdown */}
      {suggestions && dropPos && (
        <div
          className="fixed z-50 bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden"
          style={{
            top: dropPos.top,
            left: dropPos.left,
            width: dropPos.width,
            minWidth: 220,
          }}
          onMouseDown={(e) => e.preventDefault()}
        >
          {suggestions.items.map((cat) => (
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
    </div>
  );
}
