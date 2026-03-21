import { NextRequest, NextResponse } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
// eslint-disable-next-line @typescript-eslint/no-require-imports
const React = require("react");
import sgMail from "@sendgrid/mail";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { getNextInvoiceNumber } from "@/lib/invoice-counter";
import InvoicePDF from "@/components/InvoicePDF";
import type { CompanySettings } from "@/lib/types";

export async function POST(req: NextRequest) {
  // ── Auth ─────────────────────────────────────────────────────────────────
  const auth = req.headers.get("authorization") || "";
  const secret = process.env.INVOICE_WEBHOOK_SECRET;
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();

    // Expected fields from the website:
    // customer_name, customer_email, customer_address (multiline),
    // customer_vat_number?, customer_tax_number?, customer_trade_register?,
    // items: [{ description, qty, price (NET), vat_rate }]
    // stripe_payment_id? (optional, stored as note)
    // lang? (default "de")
    const {
      customer_name,
      customer_email,
      customer_address,
      customer_vat_number,
      customer_tax_number,
      customer_trade_register,
      items,
      stripe_payment_id,
      lang = "de",
    } = body;

    if (!customer_name || !customer_email || !items?.length) {
      return NextResponse.json(
        { error: "Missing required fields: customer_name, customer_email, items" },
        { status: 400 }
      );
    }

    // Use service role key to bypass RLS — this endpoint is called server-to-server
    const supabase = createSupabaseClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // ── Load company settings ────────────────────────────────────────────────
    const { data: company } = await supabase
      .from("company_settings")
      .select("*")
      .limit(1)
      .single();

    if (!company) {
      return NextResponse.json({ error: "Company settings not found" }, { status: 500 });
    }

    // ── Assign invoice number ────────────────────────────────────────────────
    const invoiceNumber = await getNextInvoiceNumber(supabase);

    // ── Calculate totals ─────────────────────────────────────────────────────
    const today = new Date();
    const dd = String(today.getDate()).padStart(2, "0");
    const mm = String(today.getMonth() + 1).padStart(2, "0");
    const yyyy = today.getFullYear();
    const dateStr = `${dd}.${mm}.${yyyy}`;

    const due = new Date(today);
    due.setDate(due.getDate() + 14);
    const dueStr = `${String(due.getDate()).padStart(2, "0")}.${String(due.getMonth() + 1).padStart(2, "0")}.${due.getFullYear()}`;

    const parsedItems = items.map((item: { description: string; qty?: string; price: string; vat_rate?: string }) => ({
      description: item.description,
      qty: String(item.qty ?? "1"),
      price: String(item.price),
      vat_rate: String(item.vat_rate ?? "19"),
      sum: "",
    }));

    const subtotal = parsedItems.reduce((acc: number, item: { qty: string; price: string; vat_rate: string }) => {
      const qty = parseFloat(item.qty || "1");
      const price = parseFloat(item.price || "0");
      const vat = parseFloat(item.vat_rate || "19");
      return acc + qty * price * (1 + vat / 100);
    }, 0);

    const invoice = {
      invoice_number: invoiceNumber,
      date: dateStr,
      due_date: dueStr,
      customer_name,
      customer_address: customer_address || "",
      customer_email,
      customer_vat_number: customer_vat_number || null,
      customer_tax_number: customer_tax_number || null,
      customer_trade_register: customer_trade_register || null,
      tip_percent: "0",
      lang,
      status: "paid" as const,
      items: parsedItems,
    };

    // ── Save invoice to DB ───────────────────────────────────────────────────
    const { data: savedInvoice, error: invoiceErr } = await supabase
      .from("invoices")
      .insert({
        invoice_number: invoiceNumber,
        date: dateStr,
        due_date: dueStr,
        customer_name,
        customer_address: customer_address || "",
        customer_email,
        customer_vat_number: customer_vat_number || null,
        customer_tax_number: customer_tax_number || null,
        customer_trade_register: customer_trade_register || null,
        tip_percent: 0,
        lang,
        total: subtotal,
        status: "paid",
        notes: stripe_payment_id ? `Stripe: ${stripe_payment_id}` : null,
      })
      .select("id")
      .single();

    if (invoiceErr) {
      console.error("Invoice insert error:", invoiceErr);
      return NextResponse.json({ error: invoiceErr.message }, { status: 500 });
    }

    // Save line items
    if (savedInvoice?.id) {
      await supabase.from("invoice_items").insert(
        parsedItems.map((item: { description: string; qty: string; price: string; vat_rate: string }, idx: number) => ({
          invoice_id: savedInvoice.id,
          qty: parseFloat(item.qty),
          description: item.description,
          price: parseFloat(item.price),
          vat_rate: parseFloat(item.vat_rate),
          sort_order: idx,
        }))
      );
    }

    // Save / update contact
    const existingContact = await supabase
      .from("contacts")
      .select("id")
      .ilike("name", customer_name.trim())
      .maybeSingle();

    const contactData = {
      name: customer_name.trim(),
      email: customer_email,
      address: customer_address || null,
      vat_number: customer_vat_number || null,
      tax_number: customer_tax_number || null,
      trade_register: customer_trade_register || null,
    };

    if (existingContact.data?.id) {
      await supabase.from("contacts").update(contactData).eq("id", existingContact.data.id);
    } else {
      await supabase.from("contacts").insert(contactData);
    }

    // ── Fetch logo ───────────────────────────────────────────────────────────
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
      } catch { /* continue without logo */ }
    }

    // ── Generate PDF ─────────────────────────────────────────────────────────
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pdfBuffer = await renderToBuffer(
      React.createElement(InvoicePDF, {
        invoice,
        company: company as CompanySettings,
        logoBase64,
      }) as any
    );

    const filename = `Rechnung_${invoiceNumber}_${customer_name.replace(/\s+/g, "_")}.pdf`;

    // ── Send email to customer ───────────────────────────────────────────────
    const isGerman = lang !== "en";
    const subject = isGerman
      ? `Ihre Rechnung ${invoiceNumber} – ${company.name}`
      : `Your Invoice ${invoiceNumber} – ${company.name}`;
    const emailBody = isGerman
      ? `Guten Tag,\n\nvielen Dank für Ihren Einkauf! Im Anhang finden Sie Ihre Rechnung Nr. ${invoiceNumber}.\n\nBei Fragen stehen wir Ihnen gerne zur Verfügung.\n\nMit freundlichen Grüßen\n${company.name}`
      : `Dear customer,\n\nThank you for your purchase! Please find your invoice no. ${invoiceNumber} attached.\n\nDon't hesitate to reach out if you have any questions.\n\nBest regards,\n${company.name}`;

    await sgMail.send({
      to: customer_email,
      from: { email: "hello@tellerberlin.com", name: company.name },
      subject,
      text: emailBody,
      attachments: [
        {
          content: Buffer.from(pdfBuffer).toString("base64"),
          filename,
          type: "application/pdf",
          disposition: "attachment",
        },
      ],
    });

    return NextResponse.json({ success: true, invoiceNumber, invoiceId: savedInvoice?.id });
  } catch (err) {
    console.error("Webhook invoice error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
