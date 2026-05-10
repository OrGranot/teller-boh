"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import DatePicker from "@/components/DatePicker";
import CustomerFields, { type ContactSuggestion } from "@/components/CustomerFields";

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

type PaymentMethod = "Cash" | "Card" | "Bank Transfer" | "Other";
type PdfLanguage = "de" | "en";

interface Draft {
  id: string;
  savedAt: string;
  items: Item[];
  tip: string;
  date: string;
  customerEmail: string;
  customerName: string;
  addrStreet: string;
  addrZip: string;
  addrCity: string;
  addrCountry: string;
  paymentMethod?: PaymentMethod;
  otherPayment?: string;
  pdfLanguage?: PdfLanguage;
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

function parseAddress(addr: string) {
  const lines = addr.split("\n").map(l => l.trim()).filter(Boolean);
  const street = lines[0] || "";
  const zipCity = lines[1] || "";
  const country = lines[2] || "";
  const m = zipCity.match(/^(\d{4,5})\s+(.+)$/);
  return { street, zip: m ? m[1] : "", city: m ? m[2] : zipCity, country };
}

function buildAddress(street: string, zip: string, city: string, country: string): string {
  const line2 = [zip, city].filter(Boolean).join(" ");
  return [street, line2, country].filter(Boolean).join("\n");
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function normalizeItem(item: Item): Item {
  const net = parseNum(item.price);
  const gross = parseNum(item.sum);
  const qty = parseNum(item.qty) || 1;
  const vat = parseNum(item.vat_rate);
  if (item.sum.trim() === "" && net > 0) {
    return { ...item, sum: String(Math.round(net * qty * (1 + vat / 100) * 100) / 100) };
  }
  if (item.price.trim() === "" && gross > 0) {
    return { ...item, price: String(Math.round(gross / qty / (1 + vat / 100) * 100) / 100) };
  }
  return item;
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
  const [tipEnabled, setTipEnabled] = useState(false);
  const [date, setDate] = useState(todayISO());
  const [customerEmail, setCustomerEmail] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("Cash");
  const [otherPayment, setOtherPayment] = useState("");
  const [pdfLanguage, setPdfLanguage] = useState<PdfLanguage>("de");
  const [addrStreet, setAddrStreet] = useState("");
  const [addrZip, setAddrZip] = useState("");
  const [addrCity, setAddrCity] = useState("");
  const [addrCountry, setAddrCountry] = useState("");
  const [sending, setSending] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [sent, setSent] = useState(false);
  const [sendError, setSendError] = useState("");
  const [draftSaved, setDraftSaved] = useState(false);
  const [activeDraftId, setActiveDraftId] = useState<string | null>(null);
  const [draftsOpen, setDraftsOpen] = useState(false);

  const [contacts, setContacts] = useState<ContactSuggestion[]>([]);
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [suggestions, setSuggestions] = useState<{
    items: CatalogItem[];
    rowIdx: number;
  } | null>(null);
  const [highlightedIdx, setHighlightedIdx] = useState<number>(-1);
  const [dropPos, setDropPos] = useState<{
    top: number;
    left: number;
    width: number;
  } | null>(null);
  const [drafts, setDrafts] = useState<Draft[]>([]);

  const qtyRefs = useRef<(HTMLInputElement | null)[]>([]);
  const descRefs = useRef<(HTMLInputElement | null)[]>([]);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const draftsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    supabase.from("contacts").select("id, name, address, email").eq("restaurant_id", restaurantId).order("name").then(({ data }) => setContacts(data || []));
    supabase
      .from("catalog_items")
      .select("*")
      .eq("restaurant_id", restaurantId)
      .order("name")
      .then(({ data }) => setCatalog(data || []));
    setDrafts(loadDrafts());
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (draftsRef.current && !draftsRef.current.contains(e.target as Node)) {
        setDraftsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  function updatePrice(idx: number, value: string) {
    setItems(prev => {
      const updated = [...prev];
      const item = { ...updated[idx], price: value };
      const net = parseNum(value);
      const qty = parseNum(item.qty) || 1;
      const vat = parseNum(item.vat_rate);
      item.sum = net > 0 ? String(Math.round(net * qty * (1 + vat / 100) * 100) / 100) : "";
      updated[idx] = item;
      return updated;
    });
  }

  function updateSum(idx: number, value: string) {
    setItems(prev => {
      const updated = [...prev];
      const item = { ...updated[idx], sum: value };
      const gross = parseNum(value);
      const qty = parseNum(item.qty) || 1;
      const vat = parseNum(item.vat_rate);
      item.price = gross > 0 ? String(Math.round(gross / qty / (1 + vat / 100) * 100) / 100) : "";
      updated[idx] = item;
      return updated;
    });
  }

  function updateQty(idx: number, value: string) {
    setItems(prev => {
      const updated = [...prev];
      const item = { ...updated[idx], qty: value };
      const net = parseNum(item.price);
      const qty = parseNum(value) || 1;
      const vat = parseNum(item.vat_rate);
      if (net > 0) item.sum = String(Math.round(net * qty * (1 + vat / 100) * 100) / 100);
      updated[idx] = item;
      return updated;
    });
  }

  function updateVat(idx: number, value: string) {
    setItems(prev => {
      const updated = [...prev];
      const item = { ...updated[idx], vat_rate: value };
      const net = parseNum(item.price);
      const qty = parseNum(item.qty) || 1;
      const vat = parseNum(value);
      if (net > 0) item.sum = String(Math.round(net * qty * (1 + vat / 100) * 100) / 100);
      updated[idx] = item;
      return updated;
    });
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
    setHighlightedIdx(-1);
  }

  function handleDescChange(idx: number, value: string) {
    setItems(prev => prev.map((it, i) => i === idx ? { ...it, description: value } : it));
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
    setItems(prev => prev.map((it, i) => {
      if (i !== idx) return it;
      const price = cat.price != null ? String(cat.price) : "";
      const vat_rate = String(cat.vat_rate ?? 7);
      const net = cat.price ?? 0;
      const qty = parseNum(it.qty) || 1;
      const vat = cat.vat_rate ?? 7;
      const sum = net > 0 ? String(Math.round(net * qty * (1 + vat / 100) * 100) / 100) : "";
      return { ...it, description: cat.name, vat_rate, price, sum };
    }));
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
  const tipAmt = tipEnabled ? parseNum(tip) : 0;
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

  function buildDraft(id: string): Draft {
    return {
      id,
      savedAt: new Date().toISOString(),
      items,
      tip,
      date,
      customerEmail,
      customerName,
      addrStreet,
      addrZip,
      addrCity,
      addrCountry,
      paymentMethod,
      otherPayment,
      pdfLanguage,
    };
  }

  async function handleSaveDraft() {
    if (filledItems.length === 0) return;
    const draft = buildDraft(Date.now().toString());
    const updated = [draft, ...drafts];
    setDrafts(updated);
    saveDrafts(updated);
    setActiveDraftId(draft.id);
    await syncCatalog();
    setDraftSaved(true);
    setTimeout(() => setDraftSaved(false), 2000);
  }

  async function handleUpdateDraft() {
    if (!activeDraftId || filledItems.length === 0) return;
    const draft = buildDraft(activeDraftId);
    const updated = drafts.map(d => d.id === activeDraftId ? draft : d);
    setDrafts(updated);
    saveDrafts(updated);
    await syncCatalog();
    setDraftSaved(true);
    setTimeout(() => setDraftSaved(false), 2000);
  }

  function loadDraft(draft: Draft) {
    setItems(draft.items.map(normalizeItem));
    setTip(draft.tip || "");
    setTipEnabled(parseNum(draft.tip || "") > 0);
    setDate(draft.date);
    setCustomerEmail(draft.customerEmail || "");
    setCustomerName(draft.customerName || "");
    setAddrStreet(draft.addrStreet || "");
    setAddrZip(draft.addrZip || "");
    setAddrCity(draft.addrCity || "");
    setAddrCountry(draft.addrCountry || "");
    setPaymentMethod(draft.paymentMethod || "Cash");
    setOtherPayment(draft.otherPayment || "");
    setPdfLanguage(draft.pdfLanguage || "de");
    setActiveDraftId(draft.id);
    setSent(false);
    setSendError("");
    setDraftsOpen(false);
  }

  function deleteDraft(id: string) {
    const updated = drafts.filter((d) => d.id !== id);
    setDrafts(updated);
    saveDrafts(updated);
    if (activeDraftId === id) setActiveDraftId(null);
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
    if (!customerName.trim() || !addrStreet.trim()) {
      setSendError("Customer name and address are required.");
      return;
    }
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
          customerName: customerName || undefined,
          customerAddress: buildAddress(addrStreet, addrZip, addrCity, addrCountry) || undefined,
          tip: tipAmt > 0 ? tipAmt : undefined,
          paymentMethod: paymentMethod === "Other" ? (otherPayment.trim() || "Other") : paymentMethod,
          pdfLanguage,
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
    if (!customerName.trim() || !addrStreet.trim()) {
      setSendError("Customer name and address are required.");
      return;
    }
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
          customerAddress: buildAddress(addrStreet, addrZip, addrCity, addrCountry) || undefined,
          tip: tipAmt > 0 ? tipAmt : undefined,
          paymentMethod: paymentMethod === "Other" ? (otherPayment.trim() || "Other") : paymentMethod,
          pdfLanguage,
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
    setTipEnabled(false);
    setDate(todayISO());
    setCustomerEmail("");
    setCustomerName("");
    setAddrStreet("");
    setAddrZip("");
    setAddrCity("");
    setAddrCountry("");
    setPaymentMethod("Cash");
    setOtherPayment("");
    setActiveDraftId(null);
    setSent(false);
    setSendError("");
  }

  return (
    <div className="max-w-4xl mx-auto px-6 py-10">
      {/* Top bar */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">
            {activeDraftId
              ? `Bewirtungsbeleg · ${customerName || fmtDate(date)}`
              : "New Bewirtungsbeleg"}
          </h1>
          <p className="text-sm text-gray-400 mt-0.5">
            {activeDraftId ? "Editing draft" : "Unsaved"}
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* Drafts dropdown */}
          <div className="relative" ref={draftsRef}>
            <button
              type="button"
              onClick={() => setDraftsOpen(o => !o)}
              className="flex items-center gap-2 px-3 py-2 rounded-xl border border-gray-200 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors"
            >
              Drafts
              {drafts.length > 0 && (
                <span className="bg-gray-100 text-gray-600 rounded-full px-1.5 py-0.5 text-xs font-bold">
                  {drafts.length}
                </span>
              )}
              <svg
                className={`w-3.5 h-3.5 text-gray-400 transition-transform ${draftsOpen ? "rotate-180" : ""}`}
                fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {draftsOpen && (
              <div className="absolute right-0 top-full mt-2 w-80 bg-white border border-gray-200 rounded-2xl shadow-xl z-40 overflow-hidden">
                <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
                  <p className="text-xs font-bold uppercase tracking-widest text-gray-400">Drafts</p>
                  <button
                    type="button"
                    onClick={() => { clearForm(); setDraftsOpen(false); }}
                    className="text-xs text-gray-400 hover:text-gray-700 font-medium transition-colors"
                  >
                    Clear form
                  </button>
                </div>
                {drafts.length === 0 ? (
                  <p className="text-xs text-gray-400 text-center py-8 leading-relaxed">
                    No drafts yet.<br />Save a draft to see it here.
                  </p>
                ) : (
                  <div className="max-h-80 overflow-y-auto divide-y divide-gray-50">
                    {drafts.map((draft) => (
                      <div
                        key={draft.id}
                        className={`group relative cursor-pointer px-4 py-3 transition-colors ${
                          draft.id === activeDraftId
                            ? "bg-indigo-50"
                            : "hover:bg-gray-50"
                        }`}
                        onClick={() => loadDraft(draft)}
                      >
                        <p className={`text-sm font-semibold truncate pr-6 ${draft.id === activeDraftId ? "text-indigo-700" : "text-gray-800"}`}>
                          {draftLabel(draft)}
                        </p>
                        <p className="text-xs text-gray-400 mt-0.5">{draftSub(draft)}</p>
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); deleteDraft(draft.id); }}
                          className="absolute top-3 right-3 w-5 h-5 flex items-center justify-center text-gray-300 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100 text-base leading-none"
                          title="Delete draft"
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* PDF language toggle */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-400 font-semibold">PDF</span>
            <div className="flex items-center gap-1 bg-gray-100 rounded-xl p-1">
              <button
                type="button"
                onClick={() => setPdfLanguage("de")}
                className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors ${pdfLanguage === "de" ? "bg-white shadow-sm text-gray-900" : "text-gray-400 hover:text-gray-700"}`}
              >
                🇩🇪 DE
              </button>
              <button
                type="button"
                onClick={() => setPdfLanguage("en")}
                className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors ${pdfLanguage === "en" ? "bg-white shadow-sm text-gray-900" : "text-gray-400 hover:text-gray-700"}`}
              >
                🇬🇧 EN
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Single card */}
      <div className="bg-white rounded-2xl p-8 space-y-8" style={{ boxShadow: "0 2px 20px rgba(0,0,0,0.07)" }}>

        {/* Date of Dining */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1.5">Date of Dining</label>
            <DatePicker value={date} onChange={setDate} maxDate={todayISO()} />
          </div>
        </div>

        {/* Customer */}
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 border-b border-gray-100 pb-2 mb-4">
            Customer
          </p>
          <CustomerFields
            name={customerName}
            onNameChange={setCustomerName}
            street={addrStreet}
            onStreetChange={setAddrStreet}
            zip={addrZip}
            onZipChange={setAddrZip}
            city={addrCity}
            onCityChange={setAddrCity}
            country={addrCountry}
            onCountryChange={setAddrCountry}
            email={customerEmail}
            onEmailChange={setCustomerEmail}
            emailLabel="Email (required to send)"
            contacts={contacts}
            onContactSelect={(c) => {
              setCustomerName(c.name);
              if (c.address) {
                const p = parseAddress(c.address);
                setAddrStreet(p.street);
                setAddrZip(p.zip);
                setAddrCity(p.city);
                setAddrCountry(p.country);
              }
              if (c.email) setCustomerEmail(c.email);
            }}
          />
        </div>

        {/* Items */}
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 border-b border-gray-100 pb-2 mb-4">
            Items
          </p>
          <div className="overflow-x-visible">
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
                {items.map((item, idx) => (
                    <tr key={idx} className="border-b border-gray-50 group">
                      <td className="py-1.5 pr-2">
                        <input
                          ref={(el) => { qtyRefs.current[idx] = el; }}
                          type="text"
                          value={item.qty}
                          onChange={(e) => updateQty(idx, e.target.value)}
                          className="w-full border border-gray-200 rounded-lg px-2 py-2 text-sm text-center outline-none focus:border-gray-700 bg-gray-50"
                        />
                      </td>
                      <td className="py-1.5 pr-2">
                        <input
                          ref={(el) => { descRefs.current[idx] = el; }}
                          type="text"
                          value={item.description}
                          onChange={(e) => handleDescChange(idx, e.target.value)}
                          onFocus={() => handleDescFocus(idx)}
                          onBlur={handleDescBlur}
                          onKeyDown={(e) => {
                            if (!suggestions) return;
                            const count = suggestions.items.length;
                            if (e.key === "ArrowDown") {
                              e.preventDefault();
                              setHighlightedIdx((i) => (i + 1) % count);
                            } else if (e.key === "ArrowUp") {
                              e.preventDefault();
                              setHighlightedIdx((i) => (i - 1 + count) % count);
                            } else if (e.key === "Enter" && highlightedIdx >= 0) {
                              e.preventDefault();
                              selectCatalogItem(suggestions.items[highlightedIdx], suggestions.rowIdx);
                            } else if (e.key === "Escape") {
                              setSuggestions(null);
                            }
                          }}
                          className="w-full border border-gray-200 rounded-lg px-2 py-2 text-sm outline-none focus:border-gray-700 bg-gray-50"
                          placeholder="Item description"
                        />
                      </td>
                      <td className="py-1.5 pr-2">
                        <select
                          value={item.vat_rate}
                          onChange={(e) => updateVat(idx, e.target.value)}
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
                          onChange={(e) => updatePrice(idx, e.target.value)}
                          placeholder="0,00"
                          className="w-full border border-gray-200 rounded-lg px-2 py-2 text-sm text-right outline-none focus:border-gray-700 bg-gray-50"
                        />
                      </td>
                      <td className="py-1.5 pr-2">
                        <input
                          data-sum={idx}
                          type="text"
                          value={item.sum}
                          onChange={(e) => updateSum(idx, e.target.value)}
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
                  ))}
              </tbody>
            </table>
          </div>
          <button
            type="button"
            onClick={addRow}
            className="mt-3 text-sm text-gray-400 hover:text-gray-700 font-semibold border border-dashed border-gray-200 rounded-xl w-full py-2.5 hover:border-gray-400 transition-colors"
          >
            + Add row
          </button>
        </div>

        {/* Tip */}
        <div>
          <label className="flex items-center gap-2.5 cursor-pointer select-none mb-3">
            <input
              type="checkbox"
              checked={tipEnabled}
              onChange={(e) => setTipEnabled(e.target.checked)}
              className="w-4 h-4 rounded"
            />
            <span className="text-sm font-semibold">Add tip</span>
          </label>
          {tipEnabled && (
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={tip}
                onChange={(e) => setTip(e.target.value)}
                placeholder="0,00"
                className="w-32 border border-gray-200 rounded-lg px-3 py-2 text-sm text-right outline-none focus:border-gray-800 bg-gray-50"
              />
              <span className="text-sm text-gray-400">€ — no VAT, shown separately</span>
            </div>
          )}
        </div>

        {/* Totals */}
        <div className="flex flex-col items-end gap-1.5 pt-2 border-t border-gray-100">
          {net7 + vat7 !== 0 && (
            <div className="flex gap-8 text-sm text-gray-400">
              <span>Net 7%: <span className="text-gray-600 font-medium">{fmt(net7)}</span></span>
              <span className="w-28 text-right">VAT 7%: <span className="text-gray-600 font-medium">{fmt(vat7)}</span></span>
            </div>
          )}
          {net19 + vat19 !== 0 && (
            <div className="flex gap-8 text-sm text-gray-400">
              <span>Net 19%: <span className="text-gray-600 font-medium">{fmt(net19)}</span></span>
              <span className="w-28 text-right">VAT 19%: <span className="text-gray-600 font-medium">{fmt(vat19)}</span></span>
            </div>
          )}
          {tipEnabled && tipAmt > 0 && (
            <>
              <div className="flex gap-8 text-sm text-gray-500">
                <span>Subtotal</span>
                <span className="w-28 text-right">{fmt(totalGross)}</span>
              </div>
              <div className="flex gap-8 text-sm text-gray-500">
                <span>Tip</span>
                <span className="w-28 text-right">{fmt(tipAmt)}</span>
              </div>
            </>
          )}
          <div className="flex gap-8 text-base font-bold">
            <span>Total</span>
            <span className="w-28 text-right">{fmt(grandTotal)}</span>
          </div>
        </div>

        {/* Payment Method */}
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 border-b border-gray-100 pb-2 mb-4">
            Payment Method
          </p>
          <div className="flex gap-2 flex-wrap">
            {(["Cash", "Card", "Bank Transfer", "Other"] as PaymentMethod[]).map((method) => (
              <button
                key={method}
                type="button"
                onClick={() => setPaymentMethod(method)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
                  paymentMethod === method
                    ? "bg-gray-900 text-white border-gray-900"
                    : "bg-white text-gray-600 border-gray-200 hover:border-gray-400"
                }`}
              >
                {method}
              </button>
            ))}
          </div>
          {paymentMethod === "Other" && (
            <input
              type="text"
              value={otherPayment}
              onChange={(e) => setOtherPayment(e.target.value)}
              placeholder="Describe payment method…"
              autoFocus
              className="mt-3 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-gray-800 bg-gray-50"
            />
          )}
        </div>
      </div>

      {/* Error */}
      {sendError && (
        <p className="mt-4 text-sm text-red-600">{sendError}</p>
      )}

      {/* Action buttons */}
      <div className="flex gap-3 mt-5">
        {activeDraftId ? (
          <>
            <button
              type="button"
              onClick={handleUpdateDraft}
              disabled={filledItems.length === 0}
              className="flex-1 border border-gray-300 bg-white text-gray-700 rounded-xl py-3.5 text-sm font-semibold hover:bg-gray-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {draftSaved ? "✓ Updated" : "Update Draft"}
            </button>
            <button
              type="button"
              onClick={handleSaveDraft}
              disabled={filledItems.length === 0}
              className="flex-1 border border-gray-300 bg-white text-gray-700 rounded-xl py-3.5 text-sm font-semibold hover:bg-gray-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Save as New
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={handleSaveDraft}
            disabled={filledItems.length === 0}
            className="flex-1 border border-gray-300 bg-white text-gray-700 rounded-xl py-3.5 text-sm font-semibold hover:bg-gray-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {draftSaved ? "✓ Saved" : "Save Draft"}
          </button>
        )}
        <button
          type="button"
          onClick={handleDownload}
          disabled={downloading || filledItems.length === 0}
          className="flex-1 border border-gray-300 bg-white text-gray-700 rounded-xl py-3.5 text-sm font-semibold hover:bg-gray-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {downloading ? "Generating…" : "↓ Download PDF"}
        </button>
        {sent ? (
          <div className="flex-[2] text-green-700 bg-green-50 border border-green-200 rounded-xl px-4 py-3.5 text-sm font-semibold flex items-center justify-center">
            ✓ Sent to {customerEmail}
          </div>
        ) : (
          <button
            type="button"
            onClick={handleSend}
            disabled={sending || !customerEmail || filledItems.length === 0}
            className="flex-[2] bg-gray-900 text-white rounded-xl py-3.5 text-sm font-bold hover:bg-gray-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {sending ? "Sending…" : "✉ Send by email"}
          </button>
        )}
      </div>

      {sent && (
        <button
          type="button"
          onClick={clearForm}
          className="mt-3 w-full py-2.5 rounded-xl text-sm font-semibold text-gray-600 hover:text-gray-900 hover:bg-gray-100 transition-colors"
        >
          New Bewirtungsbeleg
        </button>
      )}

      {/* Catalog suggestions dropdown (portal-style fixed positioning) */}
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
          {suggestions.items.map((cat, i) => (
            <button
              key={cat.id}
              type="button"
              onClick={() => selectCatalogItem(cat, suggestions.rowIdx)}
              onMouseEnter={() => setHighlightedIdx(i)}
              className={`w-full text-left px-4 py-2.5 text-sm border-b border-gray-100 last:border-0 transition-colors ${
                i === highlightedIdx ? "bg-indigo-50" : "hover:bg-gray-50"
              }`}
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
