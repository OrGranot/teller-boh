import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import { createClient } from "@/lib/supabase/server";
import { generateVoucherPDF } from "@/lib/voucher-pdf";

const resend = new Resend(process.env.RESEND_API_KEY);
const FROM_EMAIL = process.env.RESEND_FROM_EMAIL ?? "invoices@tellerberlin.com";

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: member } = await supabase
    .from("restaurant_members")
    .select("restaurant_id, role:roles(is_owner, permissions)")
    .eq("profile_id", user.id)
    .single();
  if (!member) return NextResponse.json({ error: "No restaurant" }, { status: 403 });

  const restaurantId = member.restaurant_id;

  try {
    const body = await req.json();
    const {
      voucher_code,
      amount,
      buyer_name,
      buyer_email,
      recipient_name,
      recipient_email,
      personal_message,
      valid_until,
      notes,
      send_to_recipient,
      needs_invoice,
      invoice_company,
      invoice_address,
      invoice_vat,
      invoice_tax,
    } = body;

    // Insert voucher
    const { data: voucher, error } = await supabase
      .from("vouchers")
      .insert({
        voucher_code: (voucher_code as string).toUpperCase().trim(),
        amount: parseFloat(amount),
        buyer_name: buyer_name || null,
        buyer_email: buyer_email || null,
        recipient_name: recipient_name || null,
        recipient_email: send_to_recipient ? (recipient_email || null) : null,
        personal_message: personal_message || null,
        valid_until: valid_until || null,
        notes: notes || null,
        status: "active",
        restaurant_id: restaurantId,
      })
      .select()
      .single();

    if (error || !voucher) {
      return NextResponse.json({ error: error?.message ?? "Failed to create voucher" }, { status: 500 });
    }

    // Generate voucher PDF
    const pdfBuffer = await generateVoucherPDF({
      voucher_code: voucher.voucher_code,
      amount: voucher.amount,
      recipient_name: voucher.recipient_name,
      personal_message: voucher.personal_message,
      valid_until: voucher.valid_until,
    });

    const filename = `Teller-Voucher-${voucher.voucher_code}.pdf`;
    const attachment = { content: Buffer.from(pdfBuffer).toString("base64"), filename };

    // Send to recipient if requested
    if (send_to_recipient && recipient_email) {
      const recipientFirst = (recipient_name || "").split(" ")[0] || "there";
      await resend.emails.send({
        from: `Teller Berlin <${FROM_EMAIL}>`,
        to: recipient_email,
        subject: `${buyer_name || "Someone"} has sent you a gift – Teller Berlin`,
        html: buildRecipientEmail({ buyer_name, recipient_name: recipientFirst, amount: voucher.amount, voucher_code: voucher.voucher_code, personal_message, valid_until }),
        attachments: [attachment],
      });
    }

    // Send copy to buyer
    if (buyer_email) {
      await resend.emails.send({
        from: `Teller Berlin <${FROM_EMAIL}>`,
        to: buyer_email,
        subject: `Your Teller Berlin voucher – ${voucher.voucher_code}`,
        html: buildBuyerEmail({ buyer_name, recipient_name, recipient_email: send_to_recipient ? recipient_email : null, amount: voucher.amount, voucher_code: voucher.voucher_code, valid_until }),
        attachments: [attachment],
      });
    }

    // Generate and send invoice if requested — calls the existing invoice webhook internally
    if (needs_invoice && buyer_email) {
      const grossAmount = parseFloat(amount);
      const netPrice = (grossAmount / 1.07).toFixed(2);
      const secret = process.env.INVOICE_WEBHOOK_SECRET;
      const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? `http://localhost:${process.env.PORT ?? 3000}`;

      const invoicePayload = {
        customer_name: invoice_company || buyer_name,
        customer_email: buyer_email,
        customer_address: invoice_address || null,
        customer_vat_number: invoice_vat || null,
        customer_tax_number: invoice_tax || null,
        lang: "de",
        items: [{ description: "Gutschein / Gift Voucher", qty: "1", price: netPrice, vat_rate: "7" }],
        restaurant_id: restaurantId,
      };

      try {
        const invoiceRes = await fetch(`${baseUrl}/api/webhook/invoice`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${secret}`,
          },
          body: JSON.stringify(invoicePayload),
        });
        if (!invoiceRes.ok) {
          console.error("Invoice generation failed:", await invoiceRes.text());
        }
      } catch (err) {
        console.error("Invoice request error:", err);
      }
    }

    return NextResponse.json({ success: true, voucherId: voucher.id });
  } catch (err) {
    console.error("Send voucher error:", err);
    return NextResponse.json({ error: "Failed to create voucher. Please try again." }, { status: 500 });
  }
}

function buildRecipientEmail({ buyer_name, recipient_name, amount, voucher_code, personal_message, valid_until }: {
  buyer_name: string; recipient_name: string; amount: number; voucher_code: string; personal_message?: string; valid_until?: string;
}) {
  const validStr = valid_until ? new Date(valid_until).toLocaleDateString("en-GB") : null;
  return buildEmailWrapper("A Gift from " + buyer_name, `
    <tr><td style="padding:30px 40px 10px;text-align:center;">
      <p style="margin:0 0 20px;color:#3A3A3A;font-size:15px;line-height:1.6;">${buyer_name} has gifted you a voucher for Teller Berlin.</p>
      <p style="margin:0;font-size:52px;font-weight:bold;color:#3E1A28;">€${amount}</p>
    </td></tr>
    ${personal_message ? `<tr><td style="padding:20px 40px;"><p style="margin:0;font-style:italic;color:#3A3A3A;font-size:15px;line-height:1.6;text-align:center;">${personal_message}</p></td></tr>` : ""}
    <tr><td style="padding:20px 40px;text-align:center;">
      <p style="margin:0 0 8px;font-size:11px;text-transform:uppercase;letter-spacing:2px;color:#C1785A;">Your Voucher Code</p>
      <p style="margin:0;padding:12px 24px;display:inline-block;border:2px solid #5B2A3C;border-radius:4px;font-size:22px;font-weight:bold;color:#3E1A28;letter-spacing:2px;">${voucher_code}</p>
    </td></tr>
    <tr><td style="padding:20px 40px;text-align:center;">
      ${validStr ? `<p style="margin:0 0 5px;font-size:13px;color:#3A3A3A;">Valid until ${validStr}</p>` : ""}
      <p style="margin:0 0 15px;font-size:14px;color:#3A3A3A;">Present this voucher when you visit Teller Berlin.</p>
      <p style="margin:0;font-size:12px;color:#888;">Your voucher is also attached to this email as a PDF.</p>
    </td></tr>
  `);
}

function buildBuyerEmail({ buyer_name, recipient_name, recipient_email, amount, voucher_code, valid_until }: {
  buyer_name: string; recipient_name: string; recipient_email?: string | null; amount: number; voucher_code: string; valid_until?: string;
}) {
  const validStr = valid_until ? new Date(valid_until).toLocaleDateString("en-GB") : null;
  const firstName = (buyer_name || "").split(" ")[0] || "there";
  return buildEmailWrapper("Your Voucher Order", `
    <tr><td style="padding:30px 40px 10px;text-align:center;">
      <p style="margin:0 0 25px;color:#3A3A3A;font-size:15px;line-height:1.6;">Thank you for your purchase! Here is your confirmation.</p>
    </td></tr>
    <tr><td style="padding:0 40px;">
      <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #E8DDD0;border-radius:4px;">
        <tr style="border-bottom:1px solid #E8DDD0;">
          <td style="padding:12px 16px;font-size:13px;color:#888;">Amount</td>
          <td style="padding:12px 16px;font-size:15px;font-weight:bold;color:#3E1A28;text-align:right;">€${amount}</td>
        </tr>
        <tr style="border-bottom:1px solid #E8DDD0;">
          <td style="padding:12px 16px;font-size:13px;color:#888;">Recipient</td>
          <td style="padding:12px 16px;font-size:14px;color:#3A3A3A;text-align:right;">${recipient_name || "—"}</td>
        </tr>
        <tr style="border-bottom:1px solid #E8DDD0;">
          <td style="padding:12px 16px;font-size:13px;color:#888;">Voucher Code</td>
          <td style="padding:12px 16px;font-size:14px;font-weight:bold;color:#5B2A3C;text-align:right;letter-spacing:1px;">${voucher_code}</td>
        </tr>
        ${validStr ? `<tr><td style="padding:12px 16px;font-size:13px;color:#888;">Valid until</td><td style="padding:12px 16px;font-size:14px;color:#3A3A3A;text-align:right;">${validStr}</td></tr>` : ""}
      </table>
    </td></tr>
    <tr><td style="padding:25px 40px;text-align:center;">
      ${recipient_email ? `<p style="margin:0 0 8px;font-size:14px;color:#3A3A3A;">The voucher has also been sent to ${recipient_email}.</p>` : ""}
      <p style="margin:0;font-size:12px;color:#888;">A copy of the voucher is attached to this email as a PDF.</p>
    </td></tr>
  `);
}

function buildEmailWrapper(heading: string, bodyRows: string) {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#FAF5F0;font-family:Georgia,'Times New Roman',serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#FAF5F0;padding:40px 20px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:4px;overflow:hidden;box-shadow:0 2px 8px rgba(91,42,60,0.08);">
        <tr><td style="background-color:#5B2A3C;padding:30px;text-align:center;">
          <p style="margin:0 0 8px;font-size:24px;color:#FAF5F0;letter-spacing:8px;font-weight:normal;">TELLER</p>
          <p style="margin:0;font-size:9px;color:#C5A55A;letter-spacing:3px;">BERLIN</p>
        </td></tr>
        <tr><td style="padding:30px 40px 0;text-align:center;">
          <h1 style="margin:0;font-size:22px;color:#3E1A28;font-weight:normal;">${heading}</h1>
        </td></tr>
        ${bodyRows}
        <tr><td style="padding:25px 40px;text-align:center;border-top:1px solid #E8DDD0;">
          <p style="margin:0 0 5px;font-size:12px;color:#888;">Teller Berlin · Pappelallee 29 · 10437 Berlin</p>
          <p style="margin:0;font-size:12px;color:#888;">hello@tellerberlin.com</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}
