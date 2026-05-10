import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import InvoiceForm from "@/components/InvoiceForm";
import type { Invoice, InvoiceItem } from "@/lib/types";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function EditInvoicePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: member } = await supabase
    .from("restaurant_members")
    .select("restaurant_id, role:roles(is_owner, permissions)")
    .eq("profile_id", user.id)
    .single();
  if (!member) redirect("/setup");

  const role = member.role as unknown as {
    is_owner: boolean;
    permissions: Record<string, boolean>;
  } | null;
  const canManageInvoices =
    !!role?.is_owner || !!role?.permissions?.can_manage_invoices;
  if (!canManageInvoices) redirect("/shifts");

  const restaurantId = member.restaurant_id;

  const [{ data: inv }, { data: lineItems }] = await Promise.all([
    supabase
      .from("invoices")
      .select("*")
      .eq("id", id)
      .eq("restaurant_id", restaurantId)
      .single(),
    supabase
      .from("invoice_items")
      .select("*")
      .eq("invoice_id", id)
      .order("sort_order"),
  ]);

  if (!inv) {
    return (
      <div className="max-w-2xl mx-auto px-6 py-20 text-center">
        <h1 className="text-2xl font-bold mb-3">Invoice not found</h1>
        <Link
          href="/invoices"
          className="text-gray-500 hover:text-gray-900 text-sm font-semibold"
        >
          ← Back to invoices
        </Link>
      </div>
    );
  }

  const items: InvoiceItem[] = (lineItems || []).map((li) => {
    const qty = Number(li.qty ?? 1);
    const price = Number(li.price ?? 0);
    const vat = Number(li.vat_rate ?? 7);
    // Always restore the exact saved gross; fall back to computing it if the
    // DB row predates the sum column (i.e. sum is null but price is known).
    const savedSum = li.sum != null ? Number(li.sum) : null;
    const computedSum = Math.round(qty * price * (1 + vat / 100) * 100) / 100;
    const sumStr = savedSum != null
      ? String(savedSum)
      : price > 0 ? String(computedSum) : "";
    return {
      id: li.id,
      qty: String(qty),
      description: li.description ?? "",
      price: String(price),
      vat_rate: String(vat),
      sum: sumStr,
    };
  });

  // Resolve tip — prefer explicit tip_amount column; if that column doesn't
  // exist yet (migration pending), infer a fixed tip from the difference
  // between the stored total and the computed subtotal.
  const tipPercent = Number(inv.tip_percent ?? 0);
  const tipAmountFromDb = (inv.tip_amount != null && Number(inv.tip_amount) > 0)
    ? Number(inv.tip_amount)
    : null;
  const computedSubtotal = items.reduce((acc, item) => {
    const s = Number(item.sum);
    return acc + (s > 0 ? s : Number(item.qty) * Number(item.price) * (1 + Number(item.vat_rate) / 100));
  }, 0);
  const storedTotal = Number(inv.total ?? 0);
  console.log("[invoice load]", { tip_percent: inv.tip_percent, tip_amount: inv.tip_amount, total: inv.total, tipAmountFromDb, computedSubtotal, storedTotal });
  // If no explicit tip_amount and no tip_percent, but stored total > subtotal,
  // infer the fixed tip from the difference (handles invoices saved before migration).
  const inferredFixedTip =
    tipAmountFromDb == null && tipPercent === 0 && storedTotal > computedSubtotal + 0.01
      ? Math.round((storedTotal - computedSubtotal) * 100) / 100
      : null;
  const resolvedTipAmount = tipAmountFromDb != null
    ? String(tipAmountFromDb)
    : inferredFixedTip != null
    ? String(inferredFixedTip)
    : undefined;

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
    tip_percent: String(tipPercent),
    tip_amount: resolvedTipAmount,
    lang: (inv.lang || "de") as "de" | "en",
    status: inv.status,
    notes: inv.notes || "",
    items:
      items.length > 0
        ? items
        : [{ qty: "1", description: "", price: "", vat_rate: "7" }],
  };

  return (
    <div>
      <div className="max-w-4xl mx-auto px-6 pt-6">
        <Link
          href="/invoices"
          className="text-sm text-gray-400 hover:text-gray-700 font-semibold"
        >
          ← Back to invoices
        </Link>
      </div>
      <InvoiceForm initial={invoice} restaurantId={restaurantId} />
    </div>
  );
}
