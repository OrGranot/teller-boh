"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Contact } from "@/lib/types";

const EMPTY_CONTACT: Omit<Contact, "id" | "created_at"> = {
  name: "",
  address: "",
  email: "",
  phone: "",
  notes: "",
  trade_register: "",
  tax_number: "",
  vat_number: "",
};

function parseAddress(addr: string) {
  const lines = addr
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
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

function buildAddress(
  street: string,
  zip: string,
  city: string,
  country: string
): string {
  const line2 = [zip, city].filter(Boolean).join(" ");
  return [street, line2, country].filter(Boolean).join("\n");
}

interface Props {
  restaurantId: string;
}

export default function ContactsClient({ restaurantId }: Props) {
  const supabase = createClient();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [modal, setModal] = useState<Contact | null>(null);
  const [form, setForm] = useState(EMPTY_CONTACT);
  const [saving, setSaving] = useState(false);
  const [addrStreet, setAddrStreet] = useState("");
  const [addrZip, setAddrZip] = useState("");
  const [addrCity, setAddrCity] = useState("");
  const [addrCountry, setAddrCountry] = useState("");

  async function load() {
    const { data } = await supabase
      .from("contacts")
      .select("*")
      .eq("restaurant_id", restaurantId)
      .order("name");
    setContacts(data || []);
    setLoading(false);
  }

  useEffect(() => {
    load();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function openNew() {
    setForm(EMPTY_CONTACT);
    setAddrStreet("");
    setAddrZip("");
    setAddrCity("");
    setAddrCountry("");
    setModal({ id: "", ...EMPTY_CONTACT });
  }

  function openEdit(c: Contact) {
    const p = parseAddress(c.address || "");
    setAddrStreet(p.street);
    setAddrZip(p.zip);
    setAddrCity(p.city);
    setAddrCountry(p.country);
    setForm({
      name: c.name,
      address: c.address || "",
      email: c.email || "",
      phone: c.phone || "",
      notes: c.notes || "",
      trade_register: c.trade_register || "",
      tax_number: c.tax_number || "",
      vat_number: c.vat_number || "",
    });
    setModal(c);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const address = buildAddress(addrStreet, addrZip, addrCity, addrCountry);
    const payload = { ...form, address, restaurant_id: restaurantId };
    if (modal?.id) {
      await supabase.from("contacts").update(payload).eq("id", modal.id);
    } else {
      await supabase.from("contacts").insert(payload);
    }
    setSaving(false);
    setModal(null);
    load();
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this contact?")) return;
    await supabase
      .from("contacts")
      .delete()
      .eq("id", id)
      .eq("restaurant_id", restaurantId);
    setContacts((prev) => prev.filter((c) => c.id !== id));
  }

  const filtered = contacts.filter(
    (c) =>
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      (c.email || "").toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="max-w-3xl mx-auto px-6 py-10">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Contacts</h1>
          <p className="text-sm text-gray-400 mt-0.5">
            Saved customers for quick fill-in
          </p>
        </div>
        <button
          onClick={openNew}
          className="bg-gray-900 text-white px-4 py-2.5 rounded-xl text-sm font-semibold hover:bg-gray-700 transition-colors"
        >
          + Add contact
        </button>
      </div>

      {/* Search */}
      <input
        type="text"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search by name or email…"
        className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-gray-800 mb-4 bg-white"
      />

      {/* List */}
      {loading ? (
        <p className="text-sm text-gray-400 text-center py-10">Loading…</p>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-2xl border border-dashed border-gray-200 py-16 text-center">
          <p className="text-gray-400 text-sm">
            {search
              ? "No contacts found."
              : "No contacts yet — add your first one."}
          </p>
        </div>
      ) : (
        <div
          className="bg-white rounded-2xl overflow-hidden"
          style={{ boxShadow: "0 2px 12px rgba(0,0,0,0.05)" }}
        >
          {filtered.map((c, i) => (
            <div
              key={c.id}
              className={`flex items-center gap-4 px-5 py-4 ${
                i < filtered.length - 1 ? "border-b border-gray-100" : ""
              }`}
            >
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm truncate">{c.name}</p>
                <p className="text-xs text-gray-400 truncate mt-0.5">
                  {[c.address, c.email, c.phone].filter(Boolean).join(" · ")}
                </p>
              </div>
              <div className="flex gap-2 shrink-0">
                <button
                  onClick={() => openEdit(c)}
                  className="text-xs text-gray-500 hover:text-gray-900 font-semibold px-3 py-1.5 rounded-lg hover:bg-gray-100 transition-colors"
                >
                  Edit
                </button>
                <button
                  onClick={() => handleDelete(c.id)}
                  className="text-xs text-red-400 hover:text-red-700 font-semibold px-3 py-1.5 rounded-lg hover:bg-red-50 transition-colors"
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal */}
      {modal !== null && (
        <Modal
          title={modal.id ? "Edit Contact" : "New Contact"}
          onClose={() => setModal(null)}
        >
          <form onSubmit={handleSave} className="space-y-4">
            <MField label="Name *">
              <MInput
                value={form.name}
                onChange={(v) => setForm({ ...form, name: v })}
                placeholder="Company or person name"
                required
              />
            </MField>
            <MField label="Street & number">
              <MInput
                value={addrStreet}
                onChange={setAddrStreet}
                placeholder="Musterstraße 1"
              />
            </MField>
            <div className="grid grid-cols-3 gap-3">
              <MField label="ZIP code">
                <MInput
                  value={addrZip}
                  onChange={setAddrZip}
                  placeholder="10115"
                />
              </MField>
              <MField label="City">
                <MInput
                  value={addrCity}
                  onChange={setAddrCity}
                  placeholder="Berlin"
                />
              </MField>
              <MField label="Country">
                <MInput
                  value={addrCountry}
                  onChange={setAddrCountry}
                  placeholder="Germany"
                />
              </MField>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <MField label="Email">
                <MInput
                  value={form.email || ""}
                  onChange={(v) => setForm({ ...form, email: v })}
                  placeholder="email@…"
                />
              </MField>
              <MField label="Phone">
                <MInput
                  value={form.phone || ""}
                  onChange={(v) => setForm({ ...form, phone: v })}
                  placeholder="+49…"
                />
              </MField>
            </div>
            <MField label="Notes">
              <MInput
                value={form.notes || ""}
                onChange={(v) => setForm({ ...form, notes: v })}
                placeholder="Optional notes"
              />
            </MField>
            <div className="grid grid-cols-3 gap-3">
              <MField label="Handelsregister">
                <MInput
                  value={form.trade_register || ""}
                  onChange={(v) => setForm({ ...form, trade_register: v })}
                  placeholder="HRB 12345"
                />
              </MField>
              <MField label="St.-Nr.">
                <MInput
                  value={form.tax_number || ""}
                  onChange={(v) => setForm({ ...form, tax_number: v })}
                  placeholder="37/250/12345"
                />
              </MField>
              <MField label="USt-IdNr.">
                <MInput
                  value={form.vat_number || ""}
                  onChange={(v) => setForm({ ...form, vat_number: v })}
                  placeholder="DE123456789"
                />
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
