import { NextRequest, NextResponse } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
// eslint-disable-next-line @typescript-eslint/no-require-imports
const React = require("react");
import { createClient } from "@/lib/supabase/server";
import { getNextInvoiceNumber } from "@/lib/invoice-counter";
import InvoicePDF from "@/components/InvoicePDF";
import type { Invoice, CompanySettings } from "@/lib/types";

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: member } = await supabase
    .from("restaurant_members")
    .select("restaurant_id, role:roles(is_owner, permissions)")
    .eq("profile_id", user.id)
    .single();
  if (!member) return NextResponse.json({ error: "No restaurant" }, { status: 403 });

  const role = member.role as unknown as {
    is_owner: boolean;
    permissions: Record<string, boolean>;
  } | null;
  const canManageInvoices =
    role?.is_owner || !!role?.permissions?.can_manage_invoices;
  if (!canManageInvoices)
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const restaurantId = member.restaurant_id;

  try {
    const { invoice }: { invoice: Invoice } = await req.json();

    // Load company settings for this restaurant (fall back to any row if migration not yet run)
    let { data: company } = await supabase
      .from("company_settings")
      .select("*")
      .eq("restaurant_id", restaurantId)
      .limit(1)
      .single();

    if (!company) {
      const { data: fallback } = await supabase
        .from("company_settings")
        .select("*")
        .limit(1)
        .single();
      company = fallback;
    }

    if (!company) {
      return NextResponse.json(
        { error: "Company settings not found. Please set up your company details first." },
        { status: 400 }
      );
    }

    // Get next invoice number (atomic), filtered by restaurant
    const invoiceNumber =
      invoice.invoice_number ||
      (await getNextInvoiceNumber(supabase, restaurantId));
    const invoiceWithNumber = { ...invoice, invoice_number: invoiceNumber };

    // Calculate totals
    const subtotal = invoice.items.reduce((acc, item) => {
      const qty = parseFloat(item.qty || "0");
      const price = parseFloat(item.price || "0");
      const vat = parseFloat(item.vat_rate || "0");
      const manSum = parseFloat(item.sum || "0");
      return acc + (manSum > 0 ? manSum : qty * price * (1 + vat / 100));
    }, 0);
    const tipPct = parseFloat(String(invoice.tip_percent || "0"));
    const tipFixedAmt = parseFloat(String(invoice.tip_amount || "0"));
    const tipAmt = tipFixedAmt > 0 ? tipFixedAmt : tipPct > 0 ? (subtotal * tipPct) / 100 : 0;
    const total = subtotal + tipAmt;

    const coreInvoicePayload = {
      date: invoice.date,
      due_date: invoice.due_date,
      customer_name: invoice.customer_name,
      customer_address: invoice.customer_address,
      customer_trade_register: invoice.customer_trade_register || null,
      customer_tax_number: invoice.customer_tax_number || null,
      customer_vat_number: invoice.customer_vat_number || null,
      tip_percent: tipPct,
      lang: invoice.lang,
      total,
    };

    let savedInvoiceId = invoice.id;
    if (invoice.id) {
      // Try with tip_amount; fall back without if column missing (migration pending)
      const { error: upErr } = await supabase.from("invoices").update({
        ...coreInvoicePayload,
        tip_amount: tipFixedAmt > 0 ? tipFixedAmt : null,
        status: invoice.status === "paid" ? "paid" : "sent",
        updated_at: new Date().toISOString(),
      }).eq("id", invoice.id).eq("restaurant_id", restaurantId);
      if (upErr) {
        await supabase.from("invoices").update({
          ...coreInvoicePayload,
          status: invoice.status === "paid" ? "paid" : "sent",
          updated_at: new Date().toISOString(),
        }).eq("id", invoice.id).eq("restaurant_id", restaurantId);
      }
      await supabase.from("invoice_items").delete().eq("invoice_id", invoice.id);
    } else {
      const baseInsert = {
        invoice_number: invoiceNumber,
        ...coreInvoicePayload,
        status: "sent",
        restaurant_id: restaurantId,
      };
      let { data: newInvoice } = await supabase.from("invoices").insert({
        ...baseInsert,
        tip_amount: tipFixedAmt > 0 ? tipFixedAmt : null,
      }).select("id").single();
      if (!newInvoice) {
        const { data: fallbackInvoice } = await supabase.from("invoices").insert(baseInsert).select("id").single();
        newInvoice = fallbackInvoice;
      }
      savedInvoiceId = newInvoice?.id;
    }

    // Insert line items
    if (savedInvoiceId) {
      const itemRows = invoice.items
        .filter((item) => item.description?.trim())
        .map((item, idx) => ({
          invoice_id: savedInvoiceId,
          qty: parseFloat(item.qty || "0"),
          description: item.description,
          price: parseFloat(item.price || "0"),
          vat_rate: parseFloat(item.vat_rate || "7"),
          sort_order: idx,
        }));
      if (itemRows.length > 0) {
        await supabase.from("invoice_items").insert(itemRows);
      }
    }

    // Fetch logo as base64
    let logoBase64: string | undefined;
    if (company.logo_url) {
      try {
        const res = await fetch(company.logo_url);
        if (res.ok) {
          const ab = await res.arrayBuffer();
          const b64 = Buffer.from(ab).toString("base64");
          const mime = res.headers.get("content-type") || "image/png";
          logoBase64 = `data:${mime};base64,${b64}`;
        }
      } catch {
        // Logo fetch failed — continue without logo
      }
    }

    // Generate PDF
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pdfBuffer = await renderToBuffer(
      React.createElement(InvoicePDF, {
        invoice: invoiceWithNumber,
        company: company as CompanySettings,
        logoBase64,
      }) as any
    );

    const filename = `Rechnung_${invoiceNumber}_${invoice.customer_name.replace(/\s+/g, "_")}.pdf`;

    return new NextResponse(new Uint8Array(pdfBuffer), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "X-Invoice-Id": savedInvoiceId || "",
        "X-Invoice-Number": String(invoiceNumber),
      },
    });
  } catch (err) {
    console.error("PDF generation error:", err);
    return NextResponse.json(
      { error: "Failed to generate PDF. Please try again." },
      { status: 500 }
    );
  }
}
