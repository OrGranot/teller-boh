import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import { createClient } from "@/lib/supabase/server";
import { buildBewirtungsbelegPdf, type BewItem } from "@/lib/bewirtungsbeleg-pdf";

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
  const canManage =
    role?.is_owner || !!role?.permissions?.can_manage_bewirtungsbeleg;
  if (!canManage) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const restaurantId = member.restaurant_id;

  try {
    const {
      items,
      date,
      customerEmail,
      customerName,
      customerAddress,
      tip,
    } = (await req.json()) as {
      items: BewItem[];
      date: string;
      customerEmail: string;
      customerName?: string;
      customerAddress?: string;
      tip?: number;
    };

    if (!customerEmail)
      return NextResponse.json(
        { error: "Email is required" },
        { status: 400 }
      );
    if (!items?.length)
      return NextResponse.json(
        { error: "No items provided" },
        { status: 400 }
      );

    const { data: company } = await supabase
      .from("company_settings")
      .select("*")
      .eq("restaurant_id", restaurantId)
      .limit(1)
      .single();

    if (!company)
      return NextResponse.json(
        { error: "Company settings not found" },
        { status: 400 }
      );

    const pdfBytes = await buildBewirtungsbelegPdf(
      items,
      date,
      company,
      customerAddress,
      tip
    );

    const dateDisplay = date.split("-").reverse().join(".");
    const greeting = customerName
      ? `Guten Tag ${customerName},`
      : "Guten Tag,";

    await resend.emails.send({
      from: `${company.name} <${FROM_EMAIL}>`,
      to: customerEmail,
      subject: `Ihr Bewirtungsbeleg vom ${dateDisplay} – ${company.name}`,
      html: `
        <p>${greeting}</p>
        <p>anbei erhalten Sie Ihren Bewirtungsbeleg vom ${dateDisplay}.</p>
        <p>Bitte füllen Sie die markierten Felder aus (Bewirtender, Unternehmen, Anlass der Bewirtung, Teilnehmer und Unterschrift) und unterschreiben Sie das Dokument.</p>
        <p><strong>Wichtig:</strong> Bitte heften Sie diesen Bewirtungsbeleg zusammen mit dem maschinell erstellten Kassenbon/der Rechnung ab – beide Dokumente zusammen sind für die steuerliche Anerkennung gemäß § 4 Abs. 5 Nr. 2 EStG erforderlich.</p>
        <p>Beim Ausfüllen des Anlasses beachten Sie bitte: Der geschäftliche Zweck muss konkret und spezifisch angegeben werden (z. B. nicht „Kundenpflege", sondern den tatsächlichen Anlass). Bewahren Sie das vollständig ausgefüllte Dokument mindestens 10 Jahre auf.</p>
        <p>Bei Rückfragen stehen wir Ihnen gerne zur Verfügung.</p>
        <br />
        <p>Mit freundlichen Grüßen,<br /><strong>${company.name}</strong></p>
      `,
      attachments: [
        {
          filename: `Bewirtungsbeleg_${date}.pdf`,
          content: Buffer.from(pdfBytes).toString("base64"),
        },
      ],
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("send-bewirtungsbeleg error:", err);
    return NextResponse.json(
      { error: "Failed to send Bewirtungsbeleg. Please try again." },
      { status: 500 }
    );
  }
}
