"use client";

import { useState } from "react";

interface Item {
  qty: string;
  description: string;
  vat_rate: string;
  sum: string;
}

const EMPTY_ITEM = (): Item => ({ qty: "1", description: "", vat_rate: "7", sum: "" });

function parseNum(s: string) {
  if (!s) return 0;
  return parseFloat(s.replace(",", ".")) || 0;
}

function fmt(n: number) {
  return n.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

export default function NewBewirtungsbelegPage() {
  const [items, setItems] = useState<Item[]>([EMPTY_ITEM()]);
  const [date, setDate] = useState(todayISO());
  const [customerEmail, setCustomerEmail] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [sendError, setSendError] = useState("");

  function updateItem(idx: number, field: keyof Item, value: string) {
    setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, [field]: value } : it)));
  }

  function addRow() {
    setItems((prev) => [...prev, EMPTY_ITEM()]);
  }

  function removeRow(idx: number) {
    setItems((prev) => prev.filter((_, i) => i !== idx));
  }

  const filledItems = items.filter((it) => it.description.trim() && parseNum(it.sum) > 0);
  const totalGross = filledItems.reduce((acc, it) => acc + parseNum(it.sum), 0);

  async function handleSend() {
    if (!customerEmail || filledItems.length === 0) return;
    setSending(true);
    setSendError("");
    setSent(false);

    const payload = filledItems.map((it) => ({
      qty: it.qty || "1",
      description: it.description,
      vat_rate: it.vat_rate,
      sum: parseNum(it.sum),
    }));

    try {
      const res = await fetch("/api/send-bewirtungsbeleg", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: payload,
          date,
          customerEmail,
          customerName: customerName || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        setSendError(data.error || "Failed to send.");
      } else {
        setSent(true);
      }
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
    <div className="max-w-3xl mx-auto px-6 py-10">
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Bewirtungsbeleg</h1>
      <p className="text-sm text-gray-500 mb-8">
        Enter the items from the receipt, then send the fillable PDF to your customer.
      </p>

      {/* Items */}
      <div
        className="bg-white rounded-2xl p-8 mb-6"
        style={{ boxShadow: "0 2px 20px rgba(0,0,0,0.07)" }}
      >
        <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-5">
          1. Items
        </p>

        <table className="w-full text-sm mb-4">
          <thead>
            <tr className="text-xs font-semibold text-gray-400 border-b border-gray-100">
              <th className="text-left pb-2 w-14">Qty</th>
              <th className="text-left pb-2">Description</th>
              <th className="text-right pb-2 w-24">VAT</th>
              <th className="text-right pb-2 w-28">
                Gross total
                <span className="block font-normal text-gray-300 text-[9px]">brutto</span>
              </th>
              <th className="w-8" />
            </tr>
          </thead>
          <tbody>
            {items.map((item, idx) => (
              <tr key={idx} className="border-b border-gray-50 group">
                <td className="py-1.5 pr-2">
                  <input
                    type="text"
                    value={item.qty}
                    onChange={(e) => updateItem(idx, "qty", e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-2 py-2 text-sm text-center outline-none focus:border-gray-700 bg-gray-50"
                  />
                </td>
                <td className="py-1.5 pr-2">
                  <input
                    type="text"
                    value={item.description}
                    onChange={(e) => updateItem(idx, "description", e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-2 py-2 text-sm outline-none focus:border-gray-700 bg-gray-50"
                    placeholder="e.g. Sparkling Water"
                  />
                </td>
                <td className="py-1.5 pr-2">
                  <select
                    value={item.vat_rate}
                    onChange={(e) => updateItem(idx, "vat_rate", e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-2 py-2 text-sm outline-none focus:border-gray-700 bg-gray-50"
                  >
                    <option value="7">7%</option>
                    <option value="19">19%</option>
                  </select>
                </td>
                <td className="py-1.5 pr-2">
                  <input
                    type="text"
                    value={item.sum}
                    onChange={(e) => updateItem(idx, "sum", e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-2 py-2 text-sm text-right outline-none focus:border-gray-700 bg-gray-50"
                    placeholder="0,00"
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
            ))}
          </tbody>
        </table>

        <button
          type="button"
          onClick={addRow}
          className="text-xs font-semibold text-gray-400 hover:text-gray-700 transition-colors"
        >
          + Add row
        </button>

        {totalGross > 0 && (
          <div className="mt-5 pt-4 border-t border-gray-100 flex justify-between items-center">
            <span className="text-sm text-gray-500">Total (gross)</span>
            <span className="font-bold text-gray-900 text-base">{fmt(totalGross)}</span>
          </div>
        )}
      </div>

      {/* Send */}
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
              <span className="font-normal text-gray-400">(optional — for the email greeting)</span>
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
              Customer Email <span className="text-red-400">*</span>
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

        {sendError && <p className="mt-4 text-sm text-red-600">{sendError}</p>}

        {sent ? (
          <div className="mt-6 flex items-center gap-2 text-green-700 bg-green-50 border border-green-200 rounded-lg px-4 py-3 text-sm font-semibold">
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
