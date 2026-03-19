"use client";
export const dynamic = "force-dynamic";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { CompanySettings } from "@/lib/types";

const EMPTY: CompanySettings = {
  name: "", display_name: "", address: "", phone: "",
  vat: "", tax: "", iban: "", bic: "", email: "", logo_url: "", trade_register: "",
};

export default function SettingsPage() {
  const supabase = createClient();
  const [company, setCompany] = useState<CompanySettings>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [nextNum, setNextNum] = useState<number | null>(null);
  const [counterOverride, setCounterOverride] = useState("");
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [removeLogo, setRemoveLogo] = useState(false);
  const [logoError, setLogoError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    async function load() {
      const [{ data: cs }, { data: counter }] = await Promise.all([
        supabase.from("company_settings").select("*").limit(1).single(),
        supabase.from("invoice_counter").select("last_number").eq("id", 1).single(),
      ]);
      if (cs) setCompany(cs);
      if (counter) setNextNum(counter.last_number + 1);
      setLoading(false);
    }
    load();
  }, []);

  function pickLogo(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setLogoFile(f);
    setRemoveLogo(false);
    const reader = new FileReader();
    reader.onload = (ev) => setLogoPreview(ev.target?.result as string);
    reader.readAsDataURL(f);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);

    let logo_url = company.logo_url;

    // Handle logo upload
    setLogoError(null);
    if (logoFile) {
      const ext = logoFile.name.split(".").pop() || "png";
      const path = `logo_${Date.now()}.${ext}`;
      const { data, error } = await supabase.storage
        .from("logos")
        .upload(path, logoFile, { upsert: true, contentType: logoFile.type });
      if (error) {
        setLogoError(`Logo upload failed: ${error.message}. Make sure the "logos" bucket exists and is public in Supabase Storage.`);
        setSaving(false);
        return;
      }
      if (data) {
        const { data: pub } = supabase.storage.from("logos").getPublicUrl(data.path);
        logo_url = pub.publicUrl;
      }
    }
    if (removeLogo) logo_url = null as unknown as string;

    const payload = { ...company, logo_url, updated_at: new Date().toISOString() };

    // Upsert (the table has a single row)
    const existing = await supabase.from("company_settings").select("id").limit(1).single();
    if (existing.data?.id) {
      await supabase.from("company_settings").update(payload).eq("id", existing.data.id);
    } else {
      await supabase.from("company_settings").insert(payload);
    }

    // Counter override
    if (counterOverride && /^\d+$/.test(counterOverride)) {
      await supabase
        .from("invoice_counter")
        .update({ last_number: parseInt(counterOverride) - 1 })
        .eq("id", 1);
      setNextNum(parseInt(counterOverride));
      setCounterOverride("");
    }

    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  }

  if (loading) return <PageShell><p className="text-gray-400 text-sm">Loading…</p></PageShell>;

  return (
    <PageShell>
      <h1 className="text-2xl font-bold mb-1">Company Settings</h1>
      <p className="text-sm text-gray-400 mb-8">These details appear on every invoice.</p>

      {saved && (
        <div className="bg-gray-900 text-white text-sm rounded-lg px-4 py-3 mb-6 text-center">
          Settings saved successfully.
        </div>
      )}
      {logoError && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3 mb-6">
          {logoError}
        </div>
      )}

      <form onSubmit={handleSave} className="space-y-6">
        {/* Logo */}
        <Section title="Logo">
          {(company.logo_url && !removeLogo) || logoPreview ? (
            <div className="flex items-start gap-4 mb-3">
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
                <img
                  src={logoPreview || company.logo_url!}
                  alt="Logo"
                  className="max-h-16 max-w-[180px] object-contain"
                />
              </div>
              <div className="flex flex-col gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => { setLogoFile(null); setLogoPreview(null); setRemoveLogo(true); }}
                  className="text-xs text-red-500 hover:text-red-700 font-semibold"
                >
                  Remove logo
                </button>
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  className="text-xs text-gray-500 hover:text-gray-800 font-semibold"
                >
                  Replace
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="w-full border-2 border-dashed border-gray-200 rounded-xl py-8 text-center text-sm text-gray-400 hover:border-gray-400 hover:text-gray-600 transition-colors cursor-pointer mb-2"
            >
              <span className="text-2xl block mb-1">📁</span>
              Click to upload logo (PNG, JPG, WebP)
            </button>
          )}
          <input
            ref={fileRef}
            type="file"
            accept=".png,.jpg,.jpeg,.webp,.gif"
            className="hidden"
            onChange={pickLogo}
          />
        </Section>

        {/* Legal entity */}
        <Section title="Legal Entity">
          <Field label="Legal Name — shown bold on invoice & in footer" required>
            <Input value={company.name} onChange={(v) => setCompany({ ...company, name: v })} placeholder="Belhans & Shuva GbR" required />
          </Field>
          <Field label="Trading / Display Name (optional — italic below legal name)">
            <Input value={company.display_name || ""} onChange={(v) => setCompany({ ...company, display_name: v })} placeholder="Teller Berlin" />
          </Field>
        </Section>

        {/* Contact */}
        <Section title="Contact & Address">
          <Field label="Address" required>
            <Input value={company.address} onChange={(v) => setCompany({ ...company, address: v })} placeholder="Pappelallee 29, 10437 Berlin" required />
          </Field>
          <Field label="Phone">
            <Input value={company.phone || ""} onChange={(v) => setCompany({ ...company, phone: v })} placeholder="+49…" />
          </Field>
          <Field label="Email">
            <Input value={company.email || ""} onChange={(v) => setCompany({ ...company, email: v })} placeholder="hello@…" />
          </Field>
        </Section>

        {/* Banking & Tax */}
        <Section title="Banking & Tax">
          <Field label="IBAN">
            <Input value={company.iban || ""} onChange={(v) => setCompany({ ...company, iban: v })} placeholder="DE48…" />
          </Field>
          <Field label="BIC">
            <Input value={company.bic || ""} onChange={(v) => setCompany({ ...company, bic: v })} placeholder="DEUTDEBB101" />
          </Field>
          <Field label="VAT Number (USt-IdNr.)">
            <Input value={company.vat || ""} onChange={(v) => setCompany({ ...company, vat: v })} placeholder="DE449881127" />
          </Field>
          <Field label="Tax Number (St.-Nr. / Steuernummer)">
            <Input value={company.tax || ""} onChange={(v) => setCompany({ ...company, tax: v })} placeholder="37/250/51293" />
          </Field>
          <Field label="Trade Register (Handelsregister)">
            <Input value={company.trade_register || ""} onChange={(v) => setCompany({ ...company, trade_register: v })} placeholder="HRB 267127 B" />
          </Field>
        </Section>

        {/* Invoice Counter */}
        <Section title="Invoice Counter">
          <p className="text-xs text-gray-400 mb-3">
            Next invoice will be <strong className="text-gray-700">#{nextNum}</strong>.
            Enter a number below to override.
          </p>
          <Input
            value={counterOverride}
            onChange={setCounterOverride}
            placeholder="Leave blank to keep current sequence"
          />
        </Section>

        <button
          type="submit"
          disabled={saving}
          className="w-full bg-gray-900 text-white rounded-xl py-3.5 font-semibold text-sm hover:bg-gray-700 transition-colors disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save Settings"}
        </button>
      </form>
    </PageShell>
  );
}

// ── Small reusable UI pieces ──────────────────────────────────────────────────

function PageShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="max-w-xl mx-auto px-6 py-10">
      <div className="bg-white rounded-2xl shadow-sm p-10" style={{ boxShadow: "0 2px 20px rgba(0,0,0,0.07)" }}>
        {children}
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 border-b border-gray-100 pb-2 mb-4">
        {title}
      </p>
      <div className="space-y-4">{children}</div>
    </div>
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-gray-500 mb-1.5">
        {label}{required && " *"}
      </label>
      {children}
    </div>
  );
}

function Input({
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
      className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm outline-none focus:border-gray-800 transition-colors bg-gray-50"
    />
  );
}
