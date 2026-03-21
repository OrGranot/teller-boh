"use client";
export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { formatEuro } from "@/lib/format";

interface Invoice {
  id: string;
  invoice_number: string;
  date: string;
  due_date: string;
  customer_name: string;
  total: number;
  lang: string;
  status: "draft" | "sent" | "paid";
  created_at: string;
}

const STATUS_COLORS = {
  draft: "bg-gray-100 text-gray-600",
  sent: "bg-blue-50 text-blue-700",
  paid: "bg-green-50 text-green-700",
};

const STATUS_LABELS_EN = { draft: "Draft", sent: "Sent", paid: "Paid" };

// Parse DD.MM.YYYY → Date for comparison
function parseDate(d: string): Date | null {
  const parts = d?.split(".");
  if (parts?.length !== 3) return null;
  return new Date(`${parts[2]}-${parts[1]}-${parts[0]}`);
}

export default function InvoicesPage() {
  const supabase = createClient();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "draft" | "sent" | "paid">("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  async function load() {
    const { data } = await supabase
      .from("invoices")
      .select("*")
      .order("invoice_number", { ascending: false });
    setInvoices(data || []);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function updateStatus(id: string, status: "draft" | "sent" | "paid") {
    await supabase.from("invoices").update({ status }).eq("id", id);
    setInvoices((prev) =>
      prev.map((inv) => (inv.id === id ? { ...inv, status } : inv))
    );
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this invoice?")) return;
    await supabase.from("invoices").delete().eq("id", id);
    setInvoices((prev) => prev.filter((inv) => inv.id !== id));
  }

  const filtered = invoices.filter((inv) => {
    const q = search.toLowerCase().trim();
    const matchSearch = !q ||
      inv.customer_name.toLowerCase().includes(q) ||
      String(inv.invoice_number).toLowerCase().includes(q) ||
      String(inv.total).includes(q) ||
      formatEuro(inv.total).replace(/[€\s]/g, "").includes(q.replace(",", ".").replace("€", "").trim());

    const matchFilter = filter === "all" || inv.status === filter;

    const invDate = parseDate(inv.date);
    const matchFrom = !dateFrom || (invDate && invDate >= new Date(dateFrom));
    const matchTo = !dateTo || (invDate && invDate <= new Date(dateTo));

    return matchSearch && matchFilter && matchFrom && matchTo;
  });

  const clearDates = () => { setDateFrom(""); setDateTo(""); };

  // Quick month shortcuts
  const setMonth = (offset: number) => {
    const d = new Date();
    d.setMonth(d.getMonth() + offset);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const last = new Date(y, d.getMonth() + 1, 0).getDate();
    setDateFrom(`${y}-${m}-01`);
    setDateTo(`${y}-${m}-${last}`);
  };

  return (
    <div className="max-w-4xl mx-auto px-6 py-10">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Invoices</h1>
          <p className="text-sm text-gray-400 mt-0.5">{invoices.length} total</p>
        </div>
        <Link
          href="/invoices/new"
          className="bg-gray-900 text-white px-4 py-2.5 rounded-xl text-sm font-semibold hover:bg-gray-700 transition-colors"
        >
          + New invoice
        </Link>
      </div>

      {/* Search + Filter */}
      <div className="flex gap-3 mb-3">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by customer, invoice # or amount…"
          className="flex-1 border border-gray-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-gray-800 bg-white"
        />
        <div className="flex items-center gap-1 bg-white border border-gray-200 rounded-xl px-2">
          {(["all", "draft", "sent", "paid"] as const).map((s) => (
            <button
              key={s}
              onClick={() => setFilter(s)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors capitalize ${
                filter === s ? "bg-gray-900 text-white" : "text-gray-400 hover:text-gray-700"
              }`}
            >
              {s === "all" ? "All" : STATUS_LABELS_EN[s]}
            </button>
          ))}
        </div>
      </div>

      {/* Date range filter */}
      <div className="flex gap-2 mb-4 items-center flex-wrap">
        <input
          type="date"
          value={dateFrom}
          onChange={(e) => setDateFrom(e.target.value)}
          className="border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-gray-800 bg-white"
        />
        <span className="text-gray-400 text-sm">→</span>
        <input
          type="date"
          value={dateTo}
          onChange={(e) => setDateTo(e.target.value)}
          className="border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-gray-800 bg-white"
        />
        <button onClick={() => setMonth(0)} className="text-xs px-3 py-2 rounded-xl border border-gray-200 bg-white text-gray-500 hover:text-gray-900 hover:border-gray-400 transition-colors">
          This month
        </button>
        <button onClick={() => setMonth(-1)} className="text-xs px-3 py-2 rounded-xl border border-gray-200 bg-white text-gray-500 hover:text-gray-900 hover:border-gray-400 transition-colors">
          Last month
        </button>
        {(dateFrom || dateTo) && (
          <button onClick={clearDates} className="text-xs px-3 py-2 rounded-xl text-gray-400 hover:text-gray-700 transition-colors">
            ✕ Clear
          </button>
        )}
      </div>

      {loading ? (
        <p className="text-sm text-gray-400 text-center py-10">Loading…</p>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-2xl border border-dashed border-gray-200 py-16 text-center">
          <p className="text-gray-400 text-sm">
            {search || filter !== "all" || dateFrom || dateTo ? "No invoices found." : "No invoices yet — create your first one."}
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl overflow-hidden" style={{ boxShadow: "0 2px 12px rgba(0,0,0,0.05)" }}>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs font-semibold text-gray-400 border-b border-gray-100">
                <th className="text-left px-5 py-3">#</th>
                <th className="text-left px-3 py-3">Customer</th>
                <th className="text-left px-3 py-3">Date</th>
                <th className="text-right px-3 py-3">Total</th>
                <th className="text-center px-3 py-3">Status</th>
                <th className="px-5 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((inv, i) => (
                <tr
                  key={inv.id}
                  className={`group ${i < filtered.length - 1 ? "border-b border-gray-100" : ""} hover:bg-gray-50 transition-colors`}
                >
                  <td className="px-5 py-3.5 font-semibold text-gray-700">{inv.invoice_number}</td>
                  <td className="px-3 py-3.5">
                    <Link href={`/invoices/${inv.id}`} className="font-semibold hover:underline">
                      {inv.customer_name}
                    </Link>
                  </td>
                  <td className="px-3 py-3.5 text-gray-500">{inv.date}</td>
                  <td className="px-3 py-3.5 text-right font-semibold">{formatEuro(inv.total)}</td>
                  <td className="px-3 py-3.5 text-center">
                    {inv.status === "paid" ? (
                      <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-green-50 text-green-700">
                        Bezahlt / Paid
                      </span>
                    ) : (
                      <select
                        value={inv.status}
                        onChange={(e) => updateStatus(inv.id, e.target.value as "draft" | "sent")}
                        className={`text-xs font-semibold px-2.5 py-1 rounded-full border-0 outline-none cursor-pointer ${STATUS_COLORS[inv.status]}`}
                      >
                        <option value="draft">Entwurf / Draft</option>
                        <option value="sent">Versendet / Sent</option>
                        <option value="paid">Bezahlt / Paid</option>
                      </select>
                    )}
                  </td>
                  <td className="px-5 py-3.5">
                    <div className="flex gap-2 justify-end opacity-0 group-hover:opacity-100 transition-opacity">
                      <Link
                        href={`/invoices/${inv.id}`}
                        className="text-xs text-gray-500 hover:text-gray-900 font-semibold px-3 py-1.5 rounded-lg hover:bg-gray-100 transition-colors"
                      >
                        Edit
                      </Link>
                      <button
                        onClick={() => handleDelete(inv.id)}
                        className="text-xs text-red-400 hover:text-red-700 font-semibold px-3 py-1.5 rounded-lg hover:bg-red-50 transition-colors"
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
