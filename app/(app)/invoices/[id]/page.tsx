export const dynamic = "force-dynamic";

import { createClient } from "@/lib/supabase/server";
import InvoiceForm from "@/components/InvoiceForm";
import type { Invoice, InvoiceItem } from "@/lib/types";
import Link from "next/link";

export default async function EditInvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const [{ data: inv }, { data: lineItems }] = await Promise.all([
    supabase.from("invoices").select("*").eq("id", id).single(),
    supabase.from("invoice_items").select("*").eq("invoice_id", id).order("sort_order"),
  ]);

  if (!inv) {
    return (
      <div className="max-w-2xl mx-auto px-6 py-20 text-center">
        <h1 className="text-2xl font-bold mb-3">Invoice not found</h1>
        <Link href="/invoices" className="text-gray-500 hover:text-gray-900 text-sm font-semibold">
          ← Back to invoices
        </Link>
      </div>
    );
  }

  const items: InvoiceItem[] = (lineItems || []).map((li) => ({
    id: li.id,
    qty: String(li.qty ?? "1"),
    description: li.description ?? "",
    price: String(li.price ?? "0"),
    vat_rate: String(li.vat_rate ?? "7"),
    sum: li.sum != null ? String(li.sum) : "",
  }));

  const invoice: Invoice = {
    id: inv.id,
    invoice_number: inv.invoice_number,
    date: inv.date,
    due_date: inv.due_date,
    customer_name: inv.customer_name,
    customer_address: inv.customer_address || "",
    customer_email: inv.customer_email || "",
    customer_trade_register: inv.customer_trade_register || "",
    customer_tax_number: inv.customer_tax_number || "",
    customer_vat_number: inv.customer_vat_number || "",
    tip_percent: String(inv.tip_percent ?? "0"),
    lang: (inv.lang || "de") as "de" | "en",
    status: inv.status,
    notes: inv.notes || "",
    items: items.length > 0 ? items : [
      { qty: "1", description: "", price: "", vat_rate: "7" },
    ],
  };

  return (
    <div>
      <div className="max-w-4xl mx-auto px-6 pt-6">
        <Link href="/invoices" className="text-sm text-gray-400 hover:text-gray-700 font-semibold">
          ← Back to invoices
        </Link>
      </div>
      <InvoiceForm initial={invoice} />
    </div>
  );
}
