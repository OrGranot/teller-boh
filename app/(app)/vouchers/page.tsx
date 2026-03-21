"use client";
export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { formatEuro } from "@/lib/format";

interface Voucher {
  id: string;
  voucher_code: string;
  amount: number;
  buyer_name: string;
  buyer_email: string;
  recipient_name: string;
  recipient_email: string;
  personal_message: string;
  status: "active" | "redeemed" | "expired" | "cancelled";
  stripe_session_id: string;
  purchased_at: string;
  redeemed_at: string | null;
  valid_until: string | null;
  notes: string | null;
}

const STATUS_COLORS = {
  active: "bg-green-50 text-green-700",
  redeemed: "bg-gray-100 text-gray-500",
  expired: "bg-red-50 text-red-500",
  cancelled: "bg-red-50 text-red-400",
};

const STATUS_LABELS = {
  active: "Active",
  redeemed: "Redeemed",
  expired: "Expired",
  cancelled: "Cancelled",
};

export default function VouchersPage() {
  const supabase = createClient();
  const [vouchers, setVouchers] = useState<Voucher[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "active" | "redeemed" | "expired" | "cancelled">("all");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [editNotes, setEditNotes] = useState<{ [id: string]: string }>({});

  async function load() {
    const { data } = await supabase
      .from("vouchers")
      .select("*")
      .order("purchased_at", { ascending: false });
    setVouchers(data || []);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function updateStatus(id: string, status: Voucher["status"]) {
    const update: Partial<Voucher> = { status };
    if (status === "redeemed") update.redeemed_at = new Date().toISOString();
    await supabase.from("vouchers").update(update).eq("id", id);
    setVouchers((prev) => prev.map((v) => v.id === id ? { ...v, ...update } : v));
  }

  async function saveNotes(id: string) {
    const notes = editNotes[id] ?? "";
    await supabase.from("vouchers").update({ notes }).eq("id", id);
    setVouchers((prev) => prev.map((v) => v.id === id ? { ...v, notes } : v));
  }

  const filtered = vouchers.filter((v) => {
    const q = search.toLowerCase();
    const matchSearch = !q ||
      v.voucher_code?.toLowerCase().includes(q) ||
      v.buyer_name?.toLowerCase().includes(q) ||
      v.buyer_email?.toLowerCase().includes(q) ||
      v.recipient_name?.toLowerCase().includes(q) ||
      String(v.amount).includes(q);
    const matchFilter = filter === "all" || v.status === filter;
    return matchSearch && matchFilter;
  });

  const totalActive = vouchers.filter((v) => v.status === "active").reduce((s, v) => s + v.amount, 0);
  const totalRedeemed = vouchers.filter((v) => v.status === "redeemed").length;

  const formatDate = (d: string | null) => {
    if (!d) return "—";
    return new Date(d).toLocaleDateString("de-DE");
  };

  return (
    <div className="max-w-5xl mx-auto px-6 py-10">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Vouchers</h1>
          <p className="text-sm text-gray-400 mt-0.5">{vouchers.length} total</p>
        </div>
        <div className="flex gap-4 text-sm">
          <div className="bg-green-50 text-green-700 px-4 py-2 rounded-xl font-semibold">
            Active value: {formatEuro(totalActive)}
          </div>
          <div className="bg-gray-100 text-gray-600 px-4 py-2 rounded-xl font-semibold">
            Redeemed: {totalRedeemed}
          </div>
        </div>
      </div>

      {/* Search + Filter */}
      <div className="flex gap-3 mb-4">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by code, buyer, recipient or amount…"
          className="flex-1 border border-gray-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-gray-800 bg-white"
        />
        <div className="flex items-center gap-1 bg-white border border-gray-200 rounded-xl px-2">
          {(["all", "active", "redeemed", "expired", "cancelled"] as const).map((s) => (
            <button
              key={s}
              onClick={() => setFilter(s)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors capitalize ${
                filter === s ? "bg-gray-900 text-white" : "text-gray-400 hover:text-gray-700"
              }`}
            >
              {s === "all" ? "All" : STATUS_LABELS[s]}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-gray-400 text-center py-10">Loading…</p>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-2xl border border-dashed border-gray-200 py-16 text-center">
          <p className="text-gray-400 text-sm">No vouchers found.</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl overflow-hidden" style={{ boxShadow: "0 2px 12px rgba(0,0,0,0.05)" }}>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs font-semibold text-gray-400 border-b border-gray-100">
                <th className="text-left px-5 py-3">Code</th>
                <th className="text-left px-3 py-3">Buyer</th>
                <th className="text-left px-3 py-3">Recipient</th>
                <th className="text-right px-3 py-3">Amount</th>
                <th className="text-center px-3 py-3">Purchased</th>
                <th className="text-center px-3 py-3">Valid until</th>
                <th className="text-center px-3 py-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((v, i) => (
                <>
                  <tr
                    key={v.id}
                    onClick={() => {
                      setExpanded(expanded === v.id ? null : v.id);
                      if (!editNotes[v.id]) setEditNotes((n) => ({ ...n, [v.id]: v.notes || "" }));
                    }}
                    className={`cursor-pointer ${i < filtered.length - 1 ? "border-b border-gray-100" : ""} hover:bg-gray-50 transition-colors`}
                  >
                    <td className="px-5 py-3.5 font-mono font-semibold text-gray-700">{v.voucher_code}</td>
                    <td className="px-3 py-3.5">
                      <div className="font-semibold">{v.buyer_name || "—"}</div>
                      <div className="text-xs text-gray-400">{v.buyer_email}</div>
                    </td>
                    <td className="px-3 py-3.5">
                      <div className="font-semibold">{v.recipient_name || "—"}</div>
                      <div className="text-xs text-gray-400">{v.recipient_email || ""}</div>
                    </td>
                    <td className="px-3 py-3.5 text-right font-semibold">{formatEuro(v.amount)}</td>
                    <td className="px-3 py-3.5 text-center text-gray-500">{formatDate(v.purchased_at)}</td>
                    <td className="px-3 py-3.5 text-center text-gray-500">{formatDate(v.valid_until)}</td>
                    <td className="px-3 py-3.5 text-center">
                      <select
                        value={v.status}
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) => updateStatus(v.id, e.target.value as Voucher["status"])}
                        className={`text-xs font-semibold px-2.5 py-1 rounded-full border-0 outline-none cursor-pointer ${STATUS_COLORS[v.status]}`}
                      >
                        <option value="active">Active</option>
                        <option value="redeemed">Redeemed</option>
                        <option value="expired">Expired</option>
                        <option value="cancelled">Cancelled</option>
                      </select>
                    </td>
                  </tr>
                  {expanded === v.id && (
                    <tr key={`${v.id}-detail`} className="bg-gray-50 border-b border-gray-100">
                      <td colSpan={7} className="px-5 py-4">
                        <div className="grid grid-cols-2 gap-4 text-sm">
                          <div>
                            {v.personal_message && (
                              <div className="mb-3">
                                <span className="text-xs font-semibold text-gray-400 uppercase">Message</span>
                                <p className="mt-1 text-gray-700 italic">&ldquo;{v.personal_message}&rdquo;</p>
                              </div>
                            )}
                            {v.redeemed_at && (
                              <div className="text-xs text-gray-400">Redeemed on {formatDate(v.redeemed_at)}</div>
                            )}
                            {v.stripe_session_id && (
                              <div className="text-xs text-gray-400 mt-1">Stripe: {v.stripe_session_id}</div>
                            )}
                          </div>
                          <div>
                            <span className="text-xs font-semibold text-gray-400 uppercase">Notes</span>
                            <textarea
                              value={editNotes[v.id] ?? ""}
                              onChange={(e) => setEditNotes((n) => ({ ...n, [v.id]: e.target.value }))}
                              onClick={(e) => e.stopPropagation()}
                              rows={2}
                              placeholder="Add notes…"
                              className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-gray-800 bg-white resize-none"
                            />
                            <button
                              onClick={(e) => { e.stopPropagation(); saveNotes(v.id); }}
                              className="mt-1 text-xs font-semibold text-gray-500 hover:text-gray-900"
                            >
                              Save notes
                            </button>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
