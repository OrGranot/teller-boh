import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import { createClient } from "@/lib/supabase/server";
import { buildBewirtungsbelegPdf, type BewItem } from "@/lib/bewirtungsbeleg-pdf";

const resend = new Resend(process.env.RESEND_API_KEY);

export async function POST(req: NextRequest) {
  try {
    const { items, date, customerEmail, customerName, customerAddress } = await req.json() as {
      items: BewItem[];
      date: string;
      customerEmail: string;
      customerName?: string;
      customerAddress?: string;
    };

    if (!customerEmail) return NextResponse.json({ error: "Email is required" }, { status: 400 });
    if (!items?.length)  return NextResponse.json({ error: "No items provided" }, { status: 400 });

    const supabase = await createClient();
    const { data: company } = await supabase.from("company_settings").select("*").limit(1).single();
    if (!company) return NextResponse.json({ error: "Company settings not found" }, { status: 400 });

    const pdfBytes = await buildBewirtungsbelegPdf(items, date, company, customerAddress);

    const dateDisplay = date.split("-").reverse().join(".");
    const greeting    = customerName ? `Guten Tag ${customerName},` : "Guten Tag,";

    await resend.emails.send({
      from: `${company.name} <invoices@tellerberlin.com>`,
      to: customerEmail,
      subject: `Ihr Bewirtungsbeleg vom ${dateDisplay} – ${company.name}`,
      html: `
        <p>${greeting}</p>
        <p>anbei erhalten Sie Ihren Bewirtungsbeleg vom ${dateDisplay}.</p>
        <p>Bitte füllen Sie die markierten Felder aus (Bewirtender, Unternehmen, Anlass der Bewirtung, Teilnehmer und Unterschrift) und bewahren Sie das Dokument für Ihre steuerlichen Unterlagen auf.</p>
        <p>Bei Rückfragen stehen wir Ihnen gerne zur Verfügung.</p>
        <br />
        <p>Mit freundlichen Grüßen,<br /><strong>${company.name}</strong></p>
      `,
      attachments: [{ filename: `Bewirtungsbeleg_${date}.pdf`, content: Buffer.from(pdfBytes).toString("base64") }],
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("send-bewirtungsbeleg error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
