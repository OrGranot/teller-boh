"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { formatEuro, parseNum, today, addDays, LABELS } from "@/lib/format";
import type { Contact, CatalogItem, Invoice, InvoiceItem } from "@/lib/types";
import DatePicker from "@/components/DatePicker";
import CustomerFields, { type ContactSuggestion } from "@/components/CustomerFields";

// DD.MM.YYYY ↔ YYYY-MM-DD helpers for DatePicker
function deToIso(de: string): string {
  const [d, m, y] = de.split(".");
  if (!d || !m || !y) return "";
  return `${y.padStart(4, "20")}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
}
function isoToDe(iso: string): string {
  const [y, m, d] = iso.split("-");
  if (!y || !m || !d) return iso;
  return `${d}.${m}.${y}`;
}
function addDaysToIso(iso: string, days: number): string {
  const d = new Date(iso);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

// Auto-complete partial dates: "25.4" → "25.04.2026", "1.1.25" → "01.01.2025"
function normalizeDate(val: string): string {
  const parts = val.trim().split(".");
  if (parts.length < 2) return val;
  const day   = parts[0].padStart(2, "0");
  const month = parts[1].padStart(2, "0");
  const rawYear = parts[2]?.trim() ?? "";
  const year  = rawYear.length === 0 ? String(new Date().getFullYear())
              : rawYear.length === 2  ? `20${rawYear}`
              : rawYear;
  return `${day}.${month}.${year}`;
}

const EMPTY_ITEM = (): InvoiceItem => ({
  qty: "1",
  description: "",
  price: "",
  vat_rate: "7",
  sum: "",
});

function calcRowSum(item: InvoiceItem): number {
  const manSum = parseNum(item.sum || "");
  if (manSum > 0) return manSum;
  const net = parseNum(item.qty) * parseNum(item.price);
  const vat = parseNum(item.vat_rate);
  return net * (1 + vat / 100);
}

function parseAddress(addr: string) {
  const lines = addr.split("\n").map((l) => l.trim()).filter(Boolean);
  const street = lines[0] || "";
  const zipCity = lines[1] || "";
  const country = lines[2] || "";
  const zipMatch = zipCity.match(/^(\d{4,5})\s+(.+)$/);
  return {
    street,
    zip: zipMatch ? zipMatch[1] : "",
    city: zipMatch ? zipMatch[2] : zipCity,
    country,
  };
}

function buildAddress(street: string, zip: string, city: string, country: string): string {
  const line2 = [zip, city].filter(Boolean).join(" ");
  return [street, line2, country].filter(Boolean).join("\n");
}

interface Props {
  initial?: Partial<Invoice>;
  restaurantId: string;
}

export default function InvoiceForm({ initial, restaurantId }: Props) {
  const router = useRouter();
  const supabase = createClient();

  const [lang, setLang] = useState<"de" | "en">(initial?.lang || "de");

  const [date, setDate] = useState(initial?.date || today());
  const [dueDate, setDueDate] = useState(initial?.due_date || addDays(today(), 14));
  const [isPaid, setIsPaid] = useState(initial?.status === "paid");
  const [customerName, setCustomerName] = useState(initial?.customer_name || "");

  const parsed = initial?.customer_address ? parseAddress(initial.customer_address) : null;
  const [addrStreet, setAddrStreet] = useState(parsed?.street || "");
  const [addrZip, setAddrZip] = useState(parsed?.zip || "");
  const [addrCity, setAddrCity] = useState(parsed?.city || "");
  const [addrCountry, setAddrCountry] = useState(parsed?.country || "");
  const [custEmail, setCustEmail] = useState(initial?.customer_email || "");
  const [custTradeReg, setCustTradeReg] = useState(initial?.customer_trade_register || "");
  const [custTaxNum, setCustTaxNum] = useState(initial?.customer_tax_number || "");
  const [custVatNum, setCustVatNum] = useState(initial?.customer_vat_number || "");

  const [items, setItems] = useState<InvoiceItem[]>(
    initial?.items?.length ? initial.items : [EMPTY_ITEM()]
  );
  const _initTipPct = parseNum(initial?.tip_percent || "0");
  const _initTipAmt = parseNum(initial?.tip_amount || "0");
  // Mode: if tip_percent is a whole number (user typed it) → % mode.
  // If it's a decimal (computed from a fixed € amount) → € mode.
  const _initMode: "percent" | "amount" =
    _initTipPct > 0 && _initTipPct !== Math.round(_initTipPct) ? "amount" : "percent";
  const [tipEnabled, setTipEnabled] = useState(_initTipPct > 0 || _initTipAmt > 0);
  const [tipMode, setTipMode] = useState<"percent" | "amount">(_initMode);
  const [tipPercent, setTipPercent] = useState(
    _initMode === "percent" && _initTipPct > 0 ? String(_initTipPct) : "10"
  );
  const [tipFixed, setTipFixed] = useState(
    _initTipAmt > 0 ? String(_initTipAmt) : ""
  );
  const [generating, setGenerating] = useState(false);
  const [sending, setSending] = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);
  const [savedId, setSavedId] = useState(initial?.id || "");
  const [invoiceNumber, setInvoiceNumber] = useState<string | undefined>(initial?.invoice_number);

  const [notes, setNotes] = useState(initial?.notes || "");
  const [parsingReceipt, setParsingReceipt] = useState(false);
  const receiptInputRef = useRef<HTMLInputElement>(null);

  const [toast, setToast] = useState<{ message: string; type: "success" | "error" | "info" } | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  function showToast(message: string, type: "success" | "error" | "info" = "info") {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast({ message, type });
    toastTimer.current = setTimeout(() => setToast(null), 4000);
  }

  const [contacts, setContacts] = useState<Contact[]>([]);
  const [catalogItems, setCatalogItems] = useState<CatalogItem[]>([]);
  const [itemSuggestions, setItemSuggestions] = useState<{ items: CatalogItem[]; rowIdx: number } | null>(null);
  const [itemHighlight, setItemHighlight] = useState(-1);
  const itemSugRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    supabase.from("contacts").select("*").eq("restaurant_id", restaurantId).order("name").then(({ data }) => setContacts(data || []));
    supabase.from("catalog_items").select("*").eq("restaurant_id", restaurantId).order("name").then(({ data }) => setCatalogItems(data || []));
  }, []);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (itemSugRef.current && !itemSugRef.current.contains(e.target as Node)) {
        setItemSuggestions(null);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  function handleCustomerNameChange(v: string) {
    setCustomerName(v);
  }

  function selectContact(c: ContactSuggestion) {
    setCustomerName(c.name);
    const p = parseAddress(c.address || "");
    setAddrStreet(p.street);
    setAddrZip(p.zip);
    setAddrCity(p.city);
    setAddrCountry(p.country);
    setCustEmail(c.email || "");
    const full = contacts.find(x => x.id === c.id);
    if (full) {
      setCustTradeReg(full.trade_register || "");
      setCustTaxNum(full.tax_number || "");
      setCustVatNum(full.vat_number || "");
    }
  }

  function handleDescChange(idx: number, v: string) {
    updateItem(idx, "description", v);
    setItemHighlight(-1);
    if (v.length < 1) { setItemSuggestions(null); return; }
    const matches = catalogItems.filter((ci) =>
      ci.name.toLowerCase().includes(v.toLowerCase()) ||
      (ci.description || "").toLowerCase().includes(v.toLowerCase())
    ).slice(0, 6);
    setItemSuggestions(matches.length > 0 ? { items: matches, rowIdx: idx } : null);
  }

  function selectCatalogItem(ci: CatalogItem, rowIdx: number) {
    setItems((prev) => {
      const updated = [...prev];
      const net = ci.price || 0;
      const vat = ci.vat_rate || 7;
      const qty = parseNum(updated[rowIdx].qty);
      const gross = net > 0 && qty > 0
        ? String(Math.round(net * qty * (1 + vat / 100) * 100) / 100)
        : "";
      updated[rowIdx] = {
        ...updated[rowIdx],
        description: ci.name,
        price: ci.price?.toString() || "",
        vat_rate: ci.vat_rate?.toString() || "7",
        sum: gross,
      };
      return updated;
    });
    setItemSuggestions(null);
  }

  function updateItem(idx: number, field: keyof InvoiceItem, value: string) {
    setItems((prev) => {
      const updated = [...prev];
      updated[idx] = { ...updated[idx], [field]: value };
      return updated;
    });
  }

  // Update net unit price → auto-recompute gross sum
  function updateItemPrice(idx: number, value: string) {
    setItems((prev) => {
      const updated = [...prev];
      const item = { ...updated[idx], price: value };
      const net = parseNum(value);
      const qty = parseNum(item.qty);
      const vat = parseNum(item.vat_rate);
      item.sum = net > 0 && qty > 0
        ? String(Math.round(net * qty * (1 + vat / 100) * 100) / 100)
        : "";
      updated[idx] = item;
      return updated;
    });
  }

  // Update gross sum → auto-recompute net unit price
  function updateItemSum(idx: number, value: string) {
    setItems((prev) => {
      const updated = [...prev];
      const item = { ...updated[idx], sum: value };
      const gross = parseNum(value);
      const qty = parseNum(item.qty);
      const vat = parseNum(item.vat_rate);
      if (gross > 0 && qty > 0) {
        item.price = String(Math.round(gross / qty / (1 + vat / 100) * 100) / 100);
      }
      updated[idx] = item;
      return updated;
    });
  }

  // Update qty → recompute gross sum from current net price
  function updateItemQty(idx: number, value: string) {
    setItems((prev) => {
      const updated = [...prev];
      const item = { ...updated[idx], qty: value };
      const net = parseNum(item.price);
      const qty = parseNum(value);
      const vat = parseNum(item.vat_rate);
      item.sum = net > 0 && qty > 0
        ? String(Math.round(net * qty * (1 + vat / 100) * 100) / 100)
        : "";
      updated[idx] = item;
      return updated;
    });
  }

  // Update VAT rate → recompute gross sum from current net price
  function updateItemVat(idx: number, value: string) {
    setItems((prev) => {
      const updated = [...prev];
      const item = { ...updated[idx], vat_rate: value };
      const net = parseNum(item.price);
      const qty = parseNum(item.qty);
      const vat = parseNum(value);
      item.sum = net > 0 && qty > 0
        ? String(Math.round(net * qty * (1 + vat / 100) * 100) / 100)
        : "";
      updated[idx] = item;
      return updated;
    });
  }

  async function ensureContactSaved() {
    if (!customerName.trim()) return;
    const address = buildAddress(addrStreet, addrZip, addrCity, addrCountry);
    const contactData = {
      restaurant_id: restaurantId,
      name: customerName.trim(),
      address: address || null,
      email: custEmail.trim() || null,
      trade_register: custTradeReg.trim() || null,
      tax_number: custTaxNum.trim() || null,
      vat_number: custVatNum.trim() || null,
    };
    const existing = contacts.find(
      (c) => c.name.toLowerCase() === customerName.trim().toLowerCase()
    );
    if (existing) {
      // Update existing contact with latest data
      await supabase.from("contacts").update(contactData).eq("id", existing.id);
      setContacts((prev) => prev.map((c) => c.id === existing.id ? {
        ...c,
        name: contactData.name,
        address: contactData.address ?? undefined,
        email: contactData.email ?? undefined,
        trade_register: contactData.trade_register ?? undefined,
        tax_number: contactData.tax_number ?? undefined,
        vat_number: contactData.vat_number ?? undefined,
      } : c));
    } else {
      // Create new contact
      const { data } = await supabase.from("contacts").insert(contactData).select().single();
      if (data) setContacts((prev) => [...prev, data]);
    }
  }

  async function handleReceiptUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    setParsingReceipt(true);
    try {
      const fd = new FormData();
      fd.append("receipt", file);
      const res = await fetch("/api/parse-receipt", { method: "POST", body: fd });
      const json = await res.json();
      if (!res.ok) { showToast("Could not read receipt: " + json.error, "error"); return; }
      const parsed: InvoiceItem[] = (json.items as Array<{qty:string; description:string; vat_rate:string; sum:number}>).map((item) => {
        const gross = item.sum;
        const qty = parseNum(item.qty);
        const vat = parseNum(item.vat_rate);
        const netUnit = qty > 0 ? Math.round(gross / qty / (1 + vat / 100) * 100) / 100 : 0;
        return {
          qty: item.qty,
          description: item.description,
          vat_rate: item.vat_rate,
          price: String(netUnit),
          sum: String(gross),
        };
      });
      setItems(parsed.length > 0 ? parsed : [EMPTY_ITEM()]);
    } catch (err) {
      showToast("Upload failed: " + err, "error");
    } finally {
      setParsingReceipt(false);
    }
  }

  function addRow() {
    setItems((prev) => [...prev, EMPTY_ITEM()]);
  }

  function removeRow(idx: number) {
    setItems((prev) => prev.filter((_, i) => i !== idx));
  }

  const activeItems = items.filter((i) => i.description.trim());
  const subtotal = activeItems.reduce((acc, item) => acc + calcRowSum(item), 0);
  const tipPct = tipEnabled && tipMode === "percent" ? parseNum(tipPercent) : 0;
  const tipAmount = tipEnabled
    ? (tipMode === "amount" ? parseNum(tipFixed) : tipPct > 0 ? subtotal * tipPct / 100 : 0)
    : 0;
  const total = subtotal + tipAmount;

  function buildInvoice(): Invoice {
    return {
      id: savedId || undefined,
      restaurant_id: restaurantId,
      invoice_number: invoiceNumber,
      date,
      due_date: dueDate,
      customer_name: customerName,
      customer_address: buildAddress(addrStreet, addrZip, addrCity, addrCountry),
      customer_email: custEmail || undefined,
      customer_trade_register: custTradeReg || undefined,
      customer_tax_number: custTaxNum || undefined,
      customer_vat_number: custVatNum || undefined,
      items: activeItems,
      tip_percent: tipEnabled && tipMode === "percent" ? tipPercent : "0",
      tip_amount: tipEnabled && tipMode === "amount" ? tipFixed : undefined,
      lang,
      status: isPaid ? "paid" : initial?.status,
      notes: notes.trim() || undefined,
    };
  }

  async function handleGenerate() {
    if (!customerName.trim()) { showToast("Please enter a customer name.", "error"); return; }
    setGenerating(true);
    await ensureContactSaved();
    try {
      const res = await fetch("/api/pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invoice: buildInvoice() }),
      });
      if (!res.ok) {
        const err = await res.json();
        showToast("Error generating PDF: " + err.error, "error");
        return;
      }
      const newId = res.headers.get("X-Invoice-Id");
      const newNum = res.headers.get("X-Invoice-Number");
      if (newId && !savedId) setSavedId(newId);
      if (newNum && !invoiceNumber) setInvoiceNumber(newNum);

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const num = res.headers.get("X-Invoice-Number") || invoiceNumber;
      a.href = url;
      a.download = `Rechnung_${num}_${customerName.replace(/\s+/g, "_")}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
      router.refresh();
    } finally {
      setGenerating(false);
    }
  }

  async function handleSaveDraft() {
    if (!customerName.trim()) { showToast("Please enter a customer name.", "error"); return; }
    setSavingDraft(true);
    await ensureContactSaved();

    // Assign invoice number on first save
    let num = invoiceNumber;
    if (!num) {
      const res = await fetch("/api/invoice-number", { method: "POST" });
      const json = await res.json();
      num = json.number as string;
      setInvoiceNumber(num);
    }

    const invoice = { ...buildInvoice(), invoice_number: num };
    const supabase2 = createClient();
    const subtotalVal = activeItems.reduce((acc, item) => acc + calcRowSum(item), 0);

    // Always derive BOTH tip_percent and tip_amount so either can restore the form.
    // % mode: user entered %, derive € amount. € mode: user entered €, derive %.
    let tipPctVal: number;
    let tipAmtVal: number;
    if (tipEnabled) {
      if (tipMode === "amount") {
        tipAmtVal = parseNum(tipFixed);
        tipPctVal = subtotalVal > 0 ? Math.round(tipAmtVal / subtotalVal * 10000) / 100 : 0;
      } else {
        tipPctVal = parseNum(tipPercent);
        tipAmtVal = Math.round(subtotalVal * tipPctVal / 100 * 100) / 100;
      }
    } else {
      tipPctVal = 0;
      tipAmtVal = 0;
    }
    const totalVal = subtotalVal + tipAmtVal;

    const invoiceRow = {
      date: invoice.date,
      due_date: invoice.due_date,
      customer_name: invoice.customer_name,
      customer_address: invoice.customer_address,
      customer_trade_register: invoice.customer_trade_register || null,
      customer_tax_number: invoice.customer_tax_number || null,
      customer_vat_number: invoice.customer_vat_number || null,
      tip_percent: tipPctVal,
      tip_amount: tipAmtVal > 0 ? tipAmtVal : null,
      lang: invoice.lang,
      total: totalVal,
      notes: notes.trim() || null,
    };

    let id = savedId;
    if (id) {
      const { error: upErr } = await supabase2.from("invoices").update({
        ...invoiceRow,
        status: isPaid ? "paid" : initial?.status === "paid" ? "paid" : "draft",
        updated_at: new Date().toISOString(),
      }).eq("id", id);
      if (upErr) { showToast("Save failed: " + upErr.message, "error"); setSavingDraft(false); return; }
      await supabase2.from("invoice_items").delete().eq("invoice_id", id);
    } else {
      const { data, error } = await supabase2.from("invoices").insert({
        restaurant_id: restaurantId,
        invoice_number: num,
        ...invoiceRow,
        status: isPaid ? "paid" : "draft",
      }).select("id").single();
      if (error) { showToast("Save failed: " + error.message, "error"); setSavingDraft(false); return; }
      id = data?.id;
      if (id) setSavedId(id);
    }

    if (id) {
      const itemRows = activeItems.map((item, idx) => ({
        invoice_id: id,
        qty: parseNum(item.qty),
        description: item.description,
        price: parseNum(item.price),
        vat_rate: parseNum(item.vat_rate),
        sum: calcRowSum(item) || null,
        sort_order: idx,
      }));
      if (itemRows.length > 0) {
        await supabase2.from("invoice_items").insert(itemRows);
      }
    }

    setSavingDraft(false);
    router.push("/invoices");
  }

  async function handleSend() {
    if (!customerName.trim()) { showToast("Please enter a customer name.", "error"); return; }
    if (!custEmail.trim()) { showToast("Please enter the recipient's email address.", "error"); return; }
    setSending(true);
    await ensureContactSaved();
    try {
      const res = await fetch("/api/send-invoice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invoice: buildInvoice() }),
      });
      const json = await res.json();
      if (!res.ok) { showToast("Error sending invoice: " + json.error, "error"); return; }
      const newId = json.invoiceId;
      const newNum = json.invoiceNumber;
      if (newId && !savedId) setSavedId(newId);
      if (newNum && !invoiceNumber) setInvoiceNumber(newNum);
      showToast(`Invoice sent to ${custEmail}`, "success");
      setTimeout(() => router.push("/invoices"), 1500);
    } finally {
      setSending(false);
    }
  }

  const L = LABELS[lang];

  return (
    <div className="max-w-4xl mx-auto px-6 py-10">
      {/* Toast */}
      {toast && (
        <div className={`fixed bottom-6 right-6 z-50 flex items-center gap-3 px-4 py-3 rounded-xl shadow-lg text-sm font-medium transition-all ${
          toast.type === "success" ? "bg-green-600 text-white"
          : toast.type === "error" ? "bg-red-600 text-white"
          : "bg-gray-900 text-white"
        }`}>
          <span>{toast.type === "success" ? "✓" : toast.type === "error" ? "✕" : "ℹ"}</span>
          <span>{toast.message}</span>
          <button onClick={() => setToast(null)} className="ml-2 opacity-70 hover:opacity-100">×</button>
        </div>
      )}
      {/* Top bar */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">
            {invoiceNumber ? `Invoice #${invoiceNumber}` : "New Invoice"}
          </h1>
          <p className="text-sm text-gray-400 mt-0.5">
            {savedId ? "Draft saved" : "Unsaved draft"}
          </p>
        </div>
        {/* PDF language toggle */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-400 font-semibold">PDF language</span>
          <div className="flex items-center gap-1 bg-gray-100 rounded-xl p-1">
            <button
              type="button"
              onClick={() => setLang("de")}
              className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors ${lang === "de" ? "bg-white shadow-sm text-gray-900" : "text-gray-400 hover:text-gray-700"}`}
            >
              🇩🇪 DE
            </button>
            <button
              type="button"
              onClick={() => setLang("en")}
              className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors ${lang === "en" ? "bg-white shadow-sm text-gray-900" : "text-gray-400 hover:text-gray-700"}`}
            >
              🇬🇧 EN
            </button>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-2xl p-8 space-y-8" style={{ boxShadow: "0 2px 20px rgba(0,0,0,0.07)" }}>
        {/* Dates */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1.5">Date</label>
            <DatePicker
              value={deToIso(date)}
              onChange={(iso) => {
                setDate(isoToDe(iso));
                setDueDate(isoToDe(addDaysToIso(iso, 7)));
              }}
            />
          </div>
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-semibold text-gray-500">
                {isPaid ? "Payment status" : "Due date"}
              </label>
              <button
                type="button"
                onClick={() => setIsPaid(p => !p)}
                className={`text-[10px] font-semibold px-2 py-0.5 rounded-full transition-colors ${
                  isPaid
                    ? "bg-green-100 text-green-700 hover:bg-green-200"
                    : "bg-gray-100 text-gray-400 hover:bg-gray-200"
                }`}
              >
                {isPaid ? "✓ Paid" : "Mark as paid"}
              </button>
            </div>
            {isPaid ? (
              <div className="w-full border border-green-200 bg-green-50 rounded-lg px-3 py-2.5 text-sm text-green-700 font-semibold">
                ✓ Already paid
              </div>
            ) : (
              <DatePicker
                value={deToIso(dueDate)}
                onChange={(iso) => setDueDate(isoToDe(iso))}
              />
            )}
          </div>
        </div>

        {/* Customer */}
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 border-b border-gray-100 pb-2 mb-4">
            Customer
          </p>
          <CustomerFields
            name={customerName}
            onNameChange={handleCustomerNameChange}
            street={addrStreet}
            onStreetChange={setAddrStreet}
            zip={addrZip}
            onZipChange={setAddrZip}
            city={addrCity}
            onCityChange={setAddrCity}
            country={addrCountry}
            onCountryChange={setAddrCountry}
            email={custEmail}
            onEmailChange={setCustEmail}
            emailLabel="Email (for sending invoice)"
            tradeReg={custTradeReg}
            onTradeRegChange={setCustTradeReg}
            taxNum={custTaxNum}
            onTaxNumChange={setCustTaxNum}
            vatNum={custVatNum}
            onVatNumChange={setCustVatNum}
            contacts={contacts as ContactSuggestion[]}
            onContactSelect={selectContact}
          />
        </div>

        {/* Items */}
        <div>
          <div className="flex items-center justify-between border-b border-gray-100 pb-2 mb-4">
            <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">
              Items
            </p>
            <div>
              <input
                ref={receiptInputRef}
                type="file"
                accept="image/*,application/pdf"
                className="hidden"
                onChange={handleReceiptUpload}
              />
              <button
                type="button"
                onClick={() => receiptInputRef.current?.click()}
                disabled={parsingReceipt}
                className="flex items-center gap-1.5 text-xs font-semibold text-indigo-600 hover:text-indigo-800 bg-indigo-50 hover:bg-indigo-100 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
              >
                {parsingReceipt ? (
                  <>
                    <svg className="animate-spin w-3.5 h-3.5" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
                    </svg>
                    Reading receipt…
                  </>
                ) : (
                  <>📷 Import from receipt</>
                )}
              </button>
            </div>
          </div>
          <div className="overflow-x-visible">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs font-semibold text-gray-400 border-b border-gray-100">
                  <th className="text-left pb-2 w-16">{L.qty}</th>
                  <th className="text-left pb-2">{L.desc}</th>
                  <th className="text-right pb-2 w-20">MwSt.%</th>
                  <th className="text-right pb-2 w-28">
                    {L.unit_price}
                    <span className="block font-normal text-gray-300 text-[9px]">netto</span>
                  </th>
                  <th className="text-right pb-2 w-28">
                    {L.sum}
                    <span className="block font-normal text-gray-300 text-[9px]">brutto</span>
                  </th>
                  <th className="w-8"></th>
                </tr>
              </thead>
              <tbody>
                {items.map((item, idx) => (
                  <tr key={idx} className="border-b border-gray-50 group">
                    <td className="py-1.5 pr-2">
                      <input
                        type="text"
                        value={item.qty}
                        onChange={(e) => updateItemQty(idx, e.target.value)}
                        className="w-full border border-gray-200 rounded-lg px-2 py-2 text-sm text-center outline-none focus:border-gray-700 bg-gray-50"
                      />
                    </td>
                    <td className="py-1.5 pr-2">
                      <div className="relative" ref={itemSuggestions?.rowIdx === idx ? itemSugRef : undefined}>
                        <input
                          type="text"
                          value={item.description}
                          onChange={(e) => handleDescChange(idx, e.target.value)}
                          onKeyDown={(e) => {
                            if (!itemSuggestions || itemSuggestions.rowIdx !== idx) return;
                            if (e.key === "ArrowDown") { e.preventDefault(); setItemHighlight(h => Math.min(h + 1, itemSuggestions.items.length - 1)); }
                            else if (e.key === "ArrowUp") { e.preventDefault(); setItemHighlight(h => Math.max(h - 1, 0)); }
                            else if (e.key === "Enter" && itemHighlight >= 0) { e.preventDefault(); selectCatalogItem(itemSuggestions.items[itemHighlight], idx); setItemHighlight(-1); }
                            else if (e.key === "Escape") { setItemSuggestions(null); setItemHighlight(-1); }
                          }}
                          className="w-full border border-gray-200 rounded-lg px-2 py-2 text-sm outline-none focus:border-gray-700 bg-gray-50"
                          placeholder="Description"
                        />
                        {itemSuggestions?.rowIdx === idx && (
                          <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-lg z-30 overflow-hidden">
                            {itemSuggestions.items.map((ci, i) => (
                              <button
                                key={ci.id}
                                type="button"
                                onMouseDown={() => selectCatalogItem(ci, idx)}
                                onMouseEnter={() => setItemHighlight(i)}
                                className={`w-full text-left px-4 py-2.5 text-sm border-b border-gray-100 last:border-0 ${i === itemHighlight ? "bg-indigo-50" : "hover:bg-gray-50"}`}
                              >
                                <span className="font-semibold">{ci.name}</span>
                                {ci.price && (
                                  <span className="text-gray-400 text-xs ml-2">{formatEuro(ci.price)} · {ci.vat_rate}% MwSt.</span>
                                )}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="py-1.5 pr-2">
                      <select
                        value={item.vat_rate}
                        onChange={(e) => updateItemVat(idx, e.target.value)}
                        className="w-full border border-gray-200 rounded-lg px-2 py-2 text-sm outline-none focus:border-gray-700 bg-gray-50"
                      >
                        <option value="0">0%</option>
                        <option value="7">7%</option>
                        <option value="19">19%</option>
                      </select>
                    </td>
                    <td className="py-1.5 pr-2">
                      <input
                        type="text"
                        value={item.price}
                        onChange={(e) => updateItemPrice(idx, e.target.value)}
                        className="w-full border border-gray-200 rounded-lg px-2 py-2 text-sm text-right outline-none focus:border-gray-700 bg-gray-50"
                        placeholder="0,00"
                      />
                    </td>
                    <td className="py-1.5 pr-2">
                      <input
                        type="text"
                        value={item.sum || ""}
                        onChange={(e) => updateItemSum(idx, e.target.value)}
                        className="w-full border border-gray-200 rounded-lg px-2 py-2 text-sm text-right outline-none focus:border-gray-700 bg-gray-50"
                        placeholder="0,00"
                      />
                    </td>
                    <td className="py-1.5">
                      {items.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeRow(idx)}
                          className="text-gray-300 hover:text-red-400 text-lg leading-none w-7 h-7 flex items-center justify-center rounded transition-colors opacity-0 group-hover:opacity-100"
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
              {/* Mode toggle — converts the value when switching */}
              <div className="flex rounded-lg border border-gray-200 overflow-hidden text-sm">
                <button
                  type="button"
                  onClick={() => {
                    if (tipMode === "amount") {
                      // € → %: convert fixed amount to percentage
                      const pct = subtotal > 0
                        ? Math.round(parseNum(tipFixed) / subtotal * 1000) / 10
                        : 0;
                      setTipPercent(pct > 0 ? String(pct) : "");
                    }
                    setTipMode("percent");
                  }}
                  className={`px-3 py-1.5 font-medium transition-colors ${tipMode === "percent" ? "bg-gray-800 text-white" : "bg-gray-50 text-gray-500 hover:bg-gray-100"}`}
                >%</button>
                <button
                  type="button"
                  onClick={() => {
                    if (tipMode === "percent") {
                      // % → €: convert percentage to fixed amount
                      const amt = Math.round(subtotal * parseNum(tipPercent) / 100 * 100) / 100;
                      setTipFixed(amt > 0 ? String(amt) : "");
                    }
                    setTipMode("amount");
                  }}
                  className={`px-3 py-1.5 font-medium transition-colors ${tipMode === "amount" ? "bg-gray-800 text-white" : "bg-gray-50 text-gray-500 hover:bg-gray-100"}`}
                >€</button>
              </div>
              {tipMode === "percent" ? (
                <>
                  <input
                    type="text"
                    value={tipPercent}
                    onChange={(e) => setTipPercent(e.target.value)}
                    className="w-20 border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-gray-800 text-center bg-gray-50"
                    placeholder="10"
                  />
                  <span className="text-sm text-gray-400">%</span>
                  {tipAmount > 0 && <span className="text-sm text-gray-500">= {formatEuro(tipAmount)}</span>}
                </>
              ) : (
                <input
                  type="text"
                  value={tipFixed}
                  onChange={(e) => setTipFixed(e.target.value)}
                  className="w-28 border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-gray-800 text-right bg-gray-50"
                  placeholder="0,00"
                />
              )}
            </div>
          )}
        </div>

        {/* Totals */}
        <div className="flex flex-col items-end gap-1.5 pt-2 border-t border-gray-100">
          {tipEnabled && tipAmount > 0 && (
            <div className="flex gap-8 text-sm text-gray-500">
              <span>Subtotal</span>
              <span className="w-28 text-right">{formatEuro(subtotal)}</span>
            </div>
          )}
          {tipEnabled && tipAmount > 0 && (
            <div className="flex gap-8 text-sm text-gray-500">
              <span>Tip {tipMode === "percent" ? `${tipPercent}%` : ""}</span>
              <span className="w-28 text-right">{formatEuro(tipAmount)}</span>
            </div>
          )}
          <div className="flex gap-8 text-base font-bold">
            <span>Total</span>
            <span className="w-28 text-right">{formatEuro(total)}</span>
          </div>
        </div>

        {/* Notes */}
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 border-b border-gray-100 pb-2 mb-4">
            Notes
          </p>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm outline-none focus:border-gray-800 bg-gray-50 resize-none"
            placeholder="Payment instructions, bank details, thank-you note…"
          />
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex gap-3 mt-5">
        <button
          type="button"
          onClick={handleSaveDraft}
          disabled={savingDraft}
          className="flex-1 border border-gray-300 bg-white text-gray-700 rounded-xl py-3.5 text-sm font-semibold hover:bg-gray-50 transition-colors disabled:opacity-50"
        >
          {savingDraft ? "Saving…" : "Save as draft"}
        </button>
        <button
          type="button"
          onClick={handleGenerate}
          disabled={generating}
          className="flex-1 border border-gray-300 bg-white text-gray-700 rounded-xl py-3.5 text-sm font-semibold hover:bg-gray-50 transition-colors disabled:opacity-50"
        >
          {generating ? "Generating…" : "↓ Download PDF"}
        </button>
        <button
          type="button"
          onClick={handleSend}
          disabled={sending}
          className="flex-[2] bg-gray-900 text-white rounded-xl py-3.5 text-sm font-bold hover:bg-gray-700 transition-colors disabled:opacity-50"
        >
          {sending ? "Sending…" : "✉ Send invoice by email"}
        </button>
      </div>
    </div>
  );
}
