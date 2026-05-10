import { NextRequest, NextResponse } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
// eslint-disable-next-line @typescript-eslint/no-require-imports
const React = require("react");
import { Resend } from "resend";
import { createClient } from "@/lib/supabase/server";
import { getNextInvoiceNumber } from "@/lib/invoice-counter";
import InvoicePDF from "@/components/InvoicePDF";
import type { Invoice, CompanySettings } from "@/lib/types";

const resend = new Resend(process.env.RESEND_API_KEY);
const FROM_EMAIL =
  process.env.RESEND_FROM_EMAIL ?? "invoices@tellerberlin.com";

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

    if (!invoice.customer_email) {
      return NextResponse.json(
        { error: "Recipient email is required." },
        { status: 400 }
      );
    }

    // Load company settings
    const { data: company } = await supabase
      .from("company_settings")
      .select("*")
      .eq("restaurant_id", restaurantId)
      .limit(1)
      .single();

    if (!company) {
      return NextResponse.json(
        { error: "Company settings not found" },
        { status: 400 }
      );
    }

    // Assign invoice number if needed
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
    const tipPct = parseFloat(invoice.tip_percent || "0");
    const tipAmt = tipPct > 0 ? (subtotal * tipPct) / 100 : 0;
    const total = subtotal + tipAmt;

    // Save invoice to DB
    let savedInvoiceId = invoice.id;
    if (invoice.id) {
      await supabase
        .from("invoices")
        .update({
          date: invoice.date,
          due_date: invoice.due_date,
          customer_name: invoice.customer_name,
          customer_address: invoice.customer_address,
          customer_email: invoice.customer_email,
          customer_trade_register: invoice.customer_trade_register || null,
          customer_tax_number: invoice.customer_tax_number || null,
          customer_vat_number: invoice.customer_vat_number || null,
          tip_percent: tipPct,
          lang: invoice.lang,
          total,
          status: invoice.status === "paid" ? "paid" : "sent",
          updated_at: new Date().toISOString(),
        })
        .eq("id", invoice.id)
        .eq("restaurant_id", restaurantId);
      await supabase
        .from("invoice_items")
        .delete()
        .eq("invoice_id", invoice.id);
    } else {
      const { data: newInvoice } = await supabase
        .from("invoices")
        .insert({
          invoice_number: invoiceNumber,
          date: invoice.date,
          due_date: invoice.due_date,
          customer_name: invoice.customer_name,
          customer_address: invoice.customer_address,
          customer_email: invoice.customer_email,
          customer_trade_register: invoice.customer_trade_register || null,
          customer_tax_number: invoice.customer_tax_number || null,
          customer_vat_number: invoice.customer_vat_number || null,
          tip_percent: tipPct,
          lang: invoice.lang,
          total,
          status: invoice.status === "paid" ? "paid" : "sent",
          restaurant_id: restaurantId,
        })
        .select("id")
        .single();
      savedInvoiceId = newInvoice?.id;
    }

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

    // Fetch logo
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
        /* continue without logo */
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

    // Send email
    const isGerman = invoice.lang !== "en";
    const subject = isGerman
      ? `Rechnung ${invoiceNumber} – ${company.name}`
      : `Invoice ${invoiceNumber} – ${company.name}`;
    const body = isGerman
      ? `Guten Tag,\n\nim Anhang finden Sie unsere Rechnung Nr. ${invoiceNumber}.\n\nBei Fragen stehen wir Ihnen gerne zur Verfügung.\n\nMit freundlichen Grüßen\n${company.name}`
      : `Dear recipient,\n\nPlease find attached our invoice no. ${invoiceNumber}.\n\nDon't hesitate to reach out if you have any questions.\n\nBest regards,\n${company.name}`;

    await resend.emails.send({
      to: invoice.customer_email,
      from: `${company.name} <${FROM_EMAIL}>`,
      subject,
      text: body,
      attachments: [
        {
          content: Buffer.from(pdfBuffer).toString("base64"),
          filename,
        },
      ],
    });

    return NextResponse.json({
      success: true,
      invoiceId: savedInvoiceId,
      invoiceNumber,
    });
  } catch (err) {
    console.error("Send invoice error:", err);
    return NextResponse.json(
      { error: "Failed to send invoice. Please try again." },
      { status: 500 }
    );
  }
}
