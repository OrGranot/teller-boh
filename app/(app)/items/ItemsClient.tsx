"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { formatEuro } from "@/lib/format";
import type { CatalogItem } from "@/lib/types";
import ConfirmModal from "@/components/ConfirmModal";

const EMPTY_ITEM = { name: "", description: "", price: "", vat_rate: "7" };

interface Props {
  restaurantId: string;
}

export default function ItemsClient({ restaurantId }: Props) {
  const supabase = createClient();
  const [items, setItems] = useState<CatalogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [modal, setModal] = useState<CatalogItem | null>(null);
  const [form, setForm] = useState(EMPTY_ITEM);
  const [saving, setSaving] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  async function load() {
    const { data } = await supabase
      .from("catalog_items")
      .select("*")
      .eq("restaurant_id", restaurantId)
      .order("name");
    setItems(data || []);
    setLoading(false);
  }

  useEffect(() => {
    load();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function openNew() {
    setForm(EMPTY_ITEM);
    setModal({ id: "", name: "" });
  }

  function openEdit(item: CatalogItem) {
    setForm({
      name: item.name,
      description: item.description || "",
      price: item.price?.toString() || "",
      vat_rate: item.vat_rate?.toString() || "7",
    });
    setModal(item);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const payload = {
      name: form.name,
      description: form.description || null,
      price: form.price ? parseFloat(form.price.replace(",", ".")) : null,
      vat_rate: parseFloat(form.vat_rate),
      restaurant_id: restaurantId,
    };
    if (modal?.id) {
      await supabase
        .from("catalog_items")
        .update(payload)
        .eq("id", modal.id)
        .eq("restaurant_id", restaurantId);
    } else {
      await supabase.from("catalog_items").insert(payload);
    }
    setSaving(false);
    setModal(null);
    load();
  }

  async function handleDelete(id: string) {
    await supabase
      .from("catalog_items")
      .delete()
      .eq("id", id)
      .eq("restaurant_id", restaurantId);
    setItems((prev) => prev.filter((i) => i.id !== id));
    setDeleteConfirm(null);
  }

  const filtered = items.filter(
    (i) =>
      i.name.toLowerCase().includes(search.toLowerCase()) ||
      (i.description || "").toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="max-w-3xl mx-auto px-6 py-10">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Catalog Items</h1>
          <p className="text-sm text-gray-400 mt-0.5">
            Reusable items with preset price &amp; VAT
          </p>
        </div>
        <button
          onClick={openNew}
          className="bg-gray-900 text-white px-4 py-2.5 rounded-xl text-sm font-semibold hover:bg-gray-700 transition-colors"
        >
          + Add item
        </button>
      </div>

      <input
        type="text"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search items…"
        className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-gray-800 mb-4 bg-white"
      />

      {loading ? (
        <p className="text-sm text-gray-400 text-center py-10">Loading…</p>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-2xl border border-dashed border-gray-200 py-16 text-center">
          <p className="text-gray-400 text-sm">
            {search ? "No items found." : "No items yet — add your first one."}
          </p>
        </div>
      ) : (
        <div
          className="bg-white rounded-2xl overflow-hidden"
          style={{ boxShadow: "0 2px 12px rgba(0,0,0,0.05)" }}
        >
          {filtered.map((item, i) => (
            <div
              key={item.id}
              className={`flex items-center gap-4 px-5 py-4 ${
                i < filtered.length - 1 ? "border-b border-gray-100" : ""
              }`}
            >
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm truncate">{item.name}</p>
                <p className="text-xs text-gray-400 mt-0.5">
                  {item.description && (
                    <span className="mr-2">{item.description}</span>
                  )}
                  {item.price != null && (
                    <span className="mr-2 font-medium text-gray-600">
                      {formatEuro(item.price)}
                    </span>
                  )}
                  <span className="text-gray-400">
                    MwSt. {item.vat_rate ?? 7}%
                  </span>
                </p>
              </div>
              <div className="flex gap-2 shrink-0">
                <button
                  onClick={() => openEdit(item)}
                  className="text-xs text-gray-500 hover:text-gray-900 font-semibold px-3 py-1.5 rounded-lg hover:bg-gray-100 transition-colors"
                >
                  Edit
                </button>
                <button
                  onClick={() => setDeleteConfirm(item.id)}
                  className="text-xs text-red-400 hover:text-red-700 font-semibold px-3 py-1.5 rounded-lg hover:bg-red-50 transition-colors"
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {deleteConfirm && (
        <ConfirmModal
          title="Delete item?"
          message="This action cannot be undone."
          confirmLabel="Delete"
          danger
          onConfirm={() => handleDelete(deleteConfirm)}
          onCancel={() => setDeleteConfirm(null)}
        />
      )}

      {modal !== null && (
        <Modal
          title={modal.id ? "Edit Item" : "New Item"}
          onClose={() => setModal(null)}
        >
          <form onSubmit={handleSave} className="space-y-4">
            <MField label="Name *">
              <MInput
                value={form.name}
                onChange={(v) => setForm({ ...form, name: v })}
                placeholder="e.g. Menü"
                required
              />
            </MField>
            <MField label="Description">
              <MInput
                value={form.description}
                onChange={(v) => setForm({ ...form, description: v })}
                placeholder="Optional longer description"
              />
            </MField>
            <div className="grid grid-cols-2 gap-3">
              <MField label="Default Price (€)">
                <MInput
                  value={form.price}
                  onChange={(v) => setForm({ ...form, price: v })}
                  placeholder="79.00"
                />
              </MField>
              <MField label="VAT Rate (%)">
                <select
                  value={form.vat_rate}
                  onChange={(e) =>
                    setForm({ ...form, vat_rate: e.target.value })
                  }
                  className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm outline-none focus:border-gray-800 bg-gray-50"
                >
                  <option value="0">0%</option>
                  <option value="7">7%</option>
                  <option value="19">19%</option>
                </select>
              </MField>
            </div>
            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={() => setModal(null)}
                className="flex-1 border border-gray-200 rounded-xl py-2.5 text-sm font-semibold hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="flex-1 bg-gray-900 text-white rounded-xl py-2.5 text-sm font-semibold hover:bg-gray-700 transition-colors disabled:opacity-50"
              >
                {saving ? "Saving…" : "Save"}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}

function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.4)" }}
    >
      <div
        className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-5">
          <h2 className="font-bold text-lg">{title}</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-700 text-xl leading-none"
          >
            ×
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function MField({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-xs font-semibold text-gray-500 mb-1.5">
        {label}
      </label>
      {children}
    </div>
  );
}

function MInput({
  value,
  onChange,
  placeholder,
  required,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  required?: boolean;
}) {
  return (
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      required={required}
      className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm outline-none focus:border-gray-800 bg-gray-50"
    />
  );
}
