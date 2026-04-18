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

function generateCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const seg = () => Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
  return `TELLER-${seg()}-${seg()}`;
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

  const [deleteConfirm, setDeleteConfirm] = useState<{ id: string; code: string } | null>(null);
  const [deleteInput, setDeleteInput] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [downloadingPdf, setDownloadingPdf] = useState<string | null>(null);

  async function downloadPdf(id: string, code: string) {
    setDownloadingPdf(id);
    const res = await fetch(`/api/voucher-pdf/${id}`);
    if (res.ok) {
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Voucher_${code}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    }
    setDownloadingPdf(null);
  }

  // Create voucher modal
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createForm, setCreateForm] = useState({
    voucher_code: generateCode(),
    amount: "",
    buyer_name: "",
    buyer_email: "",
    recipient_name: "",
    recipient_email: "",
    personal_message: "",
    valid_until: "",
    notes: "",
  });

  function setField(k: string, v: string) {
    setCreateForm(f => ({ ...f, [k]: v }));
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!createForm.amount || isNaN(parseFloat(createForm.amount))) return;
    setCreating(true);
    const { data, error } = await supabase.from("vouchers").insert({
      voucher_code: createForm.voucher_code.toUpperCase().trim(),
      amount: parseFloat(createForm.amount),
      buyer_name: createForm.buyer_name || null,
      buyer_email: createForm.buyer_email || null,
      recipient_name: createForm.recipient_name || null,
      recipient_email: createForm.recipient_email || null,
      personal_message: createForm.personal_message || null,
      valid_until: createForm.valid_until || null,
      notes: createForm.notes || null,
      status: "active",
    }).select().single();
    if (!error && data) {
      setVouchers(prev => [data as Voucher, ...prev]);
      setShowCreate(false);
      setCreateForm({ voucher_code: generateCode(), amount: "", buyer_name: "", buyer_email: "", recipient_name: "", recipient_email: "", personal_message: "", valid_until: "", notes: "" });
    }
    setCreating(false);
  }

  const formatDate = (d: string | null) => {
    if (!d) return "—";
    return new Date(d).toLocaleDateString("de-DE");
  };

  const formatDateTime = (d: string | null) => {
    if (!d) return "—";
    const dt = new Date(d);
    return dt.toLocaleDateString("de-DE") + " " + dt.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
  };

  async function deleteVoucher() {
    if (!deleteConfirm) return;
    setDeleting(true);
    await supabase.from("vouchers").delete().eq("id", deleteConfirm.id);
    setVouchers((prev) => prev.filter((v) => v.id !== deleteConfirm.id));
    setExpanded(null);
    setDeleteConfirm(null);
    setDeleteInput("");
    setDeleting(false);
  }

  return (
    <div className="max-w-5xl mx-auto px-6 py-10">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Vouchers</h1>
          <p className="text-sm text-gray-400 mt-0.5">{vouchers.length} total</p>
        </div>
        <div className="flex gap-3 items-center text-sm">
          <div className="bg-green-50 text-green-700 px-4 py-2 rounded-xl font-semibold">
            Active value: {formatEuro(totalActive)}
          </div>
          <div className="bg-gray-100 text-gray-600 px-4 py-2 rounded-xl font-semibold">
            Redeemed: {totalRedeemed}
          </div>
          <button
            onClick={() => { setCreateForm(f => ({ ...f, voucher_code: generateCode() })); setShowCreate(true); }}
            className="bg-gray-900 text-white px-4 py-2 rounded-xl font-semibold hover:bg-gray-700 transition-colors"
          >
            + New voucher
          </button>
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
                    <td className="px-3 py-3.5 text-center text-gray-500 text-xs">{formatDateTime(v.purchased_at)}</td>
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
                      <td colSpan={6} className="px-5 py-4">
                        <div className="grid grid-cols-2 gap-4 text-sm">
                          <div>
                            {v.personal_message && (
                              <div className="mb-3">
                                <span className="text-xs font-semibold text-gray-400 uppercase">Message</span>
                                <p className="mt-1 text-gray-700 italic">&ldquo;{v.personal_message}&rdquo;</p>
                              </div>
                            )}
                            <div className="text-xs text-gray-400">
                              Valid until: {formatDate(v.valid_until)}
                            </div>
                            {v.redeemed_at && (
                              <div className="text-xs text-gray-400 mt-1">Redeemed on {formatDate(v.redeemed_at)}</div>
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
                        {/* Actions */}
                        <div className="mt-4 pt-4 border-t border-gray-200 flex items-center justify-between">
                          <button
                            onClick={(e) => { e.stopPropagation(); downloadPdf(v.id, v.voucher_code); }}
                            disabled={downloadingPdf === v.id}
                            className="text-xs font-semibold text-gray-500 hover:text-gray-900 px-3 py-1.5 rounded-lg border border-gray-200 hover:border-gray-800 transition-colors disabled:opacity-50"
                          >
                            {downloadingPdf === v.id ? "Generating…" : "↓ Download PDF"}
                          </button>
                        </div>
                        {/* Delete section */}
                        <div className="mt-3">
                          {deleteConfirm?.id === v.id ? (
                            <div onClick={(e) => e.stopPropagation()} className="flex items-center gap-3">
                              <span className="text-xs text-red-600 font-semibold">Type the voucher code to confirm deletion:</span>
                              <input
                                type="text"
                                value={deleteInput}
                                onChange={(e) => setDeleteInput(e.target.value)}
                                placeholder={v.voucher_code}
                                className="border border-red-300 rounded-lg px-3 py-1.5 text-sm font-mono outline-none focus:border-red-600 w-48"
                                autoFocus
                              />
                              <button
                                onClick={deleteVoucher}
                                disabled={deleteInput !== v.voucher_code || deleting}
                                className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-red-600 text-white disabled:opacity-30 hover:bg-red-700 transition-colors"
                              >
                                {deleting ? "Deleting…" : "Delete permanently"}
                              </button>
                              <button
                                onClick={(e) => { e.stopPropagation(); setDeleteConfirm(null); setDeleteInput(""); }}
                                className="text-xs text-gray-400 hover:text-gray-700"
                              >
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={(e) => { e.stopPropagation(); setDeleteConfirm({ id: v.id, code: v.voucher_code }); setDeleteInput(""); }}
                              className="text-xs text-red-400 hover:text-red-600 font-semibold"
                            >
                              Delete voucher…
                            </button>
                          )}
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
      {/* Create voucher modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => setShowCreate(false)}>
          <form
            onClick={e => e.stopPropagation()}
            onSubmit={handleCreate}
            className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 p-6"
          >
            <h2 className="text-lg font-bold mb-5">New voucher</h2>

            <div className="space-y-3">
              <div className="flex gap-2 items-end">
                <div className="flex-1">
                  <label className="text-xs font-semibold text-gray-400 uppercase">Code</label>
                  <input value={createForm.voucher_code} onChange={e => setField("voucher_code", e.target.value)}
                    className="mt-1 w-full border border-gray-200 rounded-xl px-3 py-2 text-sm font-mono outline-none focus:border-gray-800" />
                </div>
                <button type="button" onClick={() => setField("voucher_code", generateCode())}
                  className="px-3 py-2 text-xs font-semibold text-gray-500 border border-gray-200 rounded-xl hover:border-gray-800 transition-colors mb-0.5">
                  ↺
                </button>
              </div>

              <div>
                <label className="text-xs font-semibold text-gray-400 uppercase">Amount (€) *</label>
                <input type="number" min="0.01" step="0.01" required value={createForm.amount} onChange={e => setField("amount", e.target.value)}
                  placeholder="0.00"
                  className="mt-1 w-full border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-gray-800" />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-gray-400 uppercase">Buyer name</label>
                  <input value={createForm.buyer_name} onChange={e => setField("buyer_name", e.target.value)}
                    className="mt-1 w-full border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-gray-800" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-400 uppercase">Buyer email</label>
                  <input type="email" value={createForm.buyer_email} onChange={e => setField("buyer_email", e.target.value)}
                    className="mt-1 w-full border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-gray-800" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-400 uppercase">Recipient name</label>
                  <input value={createForm.recipient_name} onChange={e => setField("recipient_name", e.target.value)}
                    className="mt-1 w-full border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-gray-800" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-400 uppercase">Recipient email</label>
                  <input type="email" value={createForm.recipient_email} onChange={e => setField("recipient_email", e.target.value)}
                    className="mt-1 w-full border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-gray-800" />
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-gray-400 uppercase">Valid until</label>
                <input type="date" value={createForm.valid_until} onChange={e => setField("valid_until", e.target.value)}
                  className="mt-1 w-full border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-gray-800" />
              </div>

              <div>
                <label className="text-xs font-semibold text-gray-400 uppercase">Personal message</label>
                <textarea value={createForm.personal_message} onChange={e => setField("personal_message", e.target.value)}
                  rows={2} placeholder="Optional gift message…"
                  className="mt-1 w-full border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-gray-800 resize-none" />
              </div>

              <div>
                <label className="text-xs font-semibold text-gray-400 uppercase">Notes</label>
                <input value={createForm.notes} onChange={e => setField("notes", e.target.value)}
                  className="mt-1 w-full border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-gray-800" />
              </div>
            </div>

            <div className="flex gap-2 mt-6">
              <button type="submit" disabled={creating}
                className="flex-1 bg-gray-900 text-white py-2.5 rounded-xl font-semibold text-sm hover:bg-gray-700 disabled:opacity-50 transition-colors">
                {creating ? "Creating…" : "Create voucher"}
              </button>
              <button type="button" onClick={() => setShowCreate(false)}
                className="px-4 py-2.5 rounded-xl border border-gray-200 text-sm font-semibold text-gray-500 hover:border-gray-800 transition-colors">
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
