"use client";

import { useRef, useState } from "react";

interface ParsedItem {
  qty: string;
  description: string;
  vat_rate: string;
  sum: number;
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function fmt(n: number) {
  return (
    n.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €"
  );
}

export default function NewBewirtungsbelegPage() {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [items, setItems] = useState<ParsedItem[]>([]);
  const [date, setDate] = useState(todayISO());
  const [customerEmail, setCustomerEmail] = useState("");
  const [customerName, setCustomerName] = useState("");

  const [parsing, setParsing] = useState(false);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [parseError, setParseError] = useState("");
  const [sendError, setSendError] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [fileName, setFileName] = useState("");

  async function handleFile(file: File) {
    setFileName(file.name);
    setItems([]);
    setParseError("");
    setSent(false);
    setParsing(true);

    const fd = new FormData();
    fd.append("receipt", file);

    try {
      const res = await fetch("/api/parse-receipt", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok || data.error) {
        setParseError(data.error || "Could not parse receipt.");
      } else {
        setItems(data.items);
      }
    } catch {
      setParseError("Network error. Please try again.");
    } finally {
      setParsing(false);
    }
  }

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  }

  async function handleSend() {
    if (!customerEmail || !items.length) return;
    setSending(true);
    setSendError("");
    setSent(false);

    try {
      const res = await fetch("/api/send-bewirtungsbeleg", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items,
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

  const totalGross = items.reduce((acc, i) => acc + Number(i.sum), 0);

  return (
    <div className="max-w-2xl mx-auto px-6 py-10">
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Bewirtungsbeleg</h1>
      <p className="text-sm text-gray-500 mb-8">
        Upload a payment receipt — items are extracted automatically, then send the fillable PDF to
        your customer.
      </p>

      {/* Step 1 — Upload */}
      <div
        className="bg-white rounded-2xl p-8 mb-6"
        style={{ boxShadow: "0 2px 20px rgba(0,0,0,0.07)" }}
      >
        <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-4">
          1. Upload Receipt
        </p>

        <div
          className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors ${
            dragOver
              ? "border-gray-700 bg-gray-50"
              : "border-gray-200 hover:border-gray-400"
          }`}
          onClick={() => fileInputRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,application/pdf"
            className="hidden"
            onChange={handleInputChange}
          />
          {parsing ? (
            <div className="text-sm text-gray-500 animate-pulse">
              Parsing receipt with Claude…
            </div>
          ) : fileName ? (
            <div className="space-y-1">
              <div className="text-sm font-semibold text-gray-700">{fileName}</div>
              <div className="text-xs text-gray-400">Click to upload a different file</div>
            </div>
          ) : (
            <div className="space-y-1">
              <div className="text-3xl mb-2">🧾</div>
              <div className="text-sm text-gray-500">Drop receipt here or click to browse</div>
              <div className="text-xs text-gray-400">PDF or image (JPG, PNG)</div>
            </div>
          )}
        </div>

        {parseError && <p className="mt-3 text-sm text-red-600">{parseError}</p>}
      </div>

      {/* Step 2 — Items preview */}
      {items.length > 0 && (
        <div
          className="bg-white rounded-2xl p-8 mb-6"
          style={{ boxShadow: "0 2px 20px rgba(0,0,0,0.07)" }}
        >
          <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-4">
            2. Extracted Items
          </p>

          <div className="divide-y divide-gray-100">
            {items.map((item, i) => {
              const vr = parseFloat(item.vat_rate);
              const vatAmt = Number(item.sum) * vr / (100 + vr);
              return (
                <div key={i} className="flex items-center justify-between py-2 text-sm">
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <span className="text-gray-400 w-5 text-right shrink-0">{item.qty}×</span>
                    <span className="text-gray-800 truncate">{item.description}</span>
                  </div>
                  <div className="flex items-center gap-4 shrink-0 ml-4">
                    <span className="text-xs text-gray-400">
                      {vr}% {fmt(vatAmt)}
                    </span>
                    <span className="font-semibold text-gray-900 w-20 text-right">
                      {fmt(Number(item.sum))}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="mt-4 pt-3 border-t border-gray-200 flex justify-between items-center">
            <span className="text-sm text-gray-500">Total (gross)</span>
            <span className="font-bold text-gray-900 text-base">{fmt(totalGross)}</span>
          </div>
        </div>
      )}

      {/* Step 3 — Send */}
      {items.length > 0 && (
        <div
          className="bg-white rounded-2xl p-8"
          style={{ boxShadow: "0 2px 20px rgba(0,0,0,0.07)" }}
        >
          <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-5">
            3. Send to Customer
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
              disabled={sending || !customerEmail}
              className="mt-6 w-full py-3 rounded-xl text-sm font-bold transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              style={{ background: "#1a1a1a", color: "#fff" }}
            >
              {sending ? "Sending…" : "Send Bewirtungsbeleg"}
            </button>
          )}

          {sent && (
            <button
              onClick={() => {
                setItems([]);
                setFileName("");
                setCustomerEmail("");
                setCustomerName("");
                setSent(false);
                setDate(todayISO());
              }}
              className="mt-3 w-full py-2.5 rounded-xl text-sm font-semibold text-gray-600 hover:text-gray-900 hover:bg-gray-100 transition-colors"
            >
              New Bewirtungsbeleg
            </button>
          )}
        </div>
      )}
    </div>
  );
}
