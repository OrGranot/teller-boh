import { NextRequest, NextResponse } from "next/server";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { Resend } from "resend";
import { createClient } from "@/lib/supabase/server";

const resend = new Resend(process.env.RESEND_API_KEY);

interface BewItem {
  qty: string;
  description: string;
  vat_rate: string;
  sum: number;
}

function fmt(n: number) {
  return (
    n.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €"
  );
}

async function buildPdf(
  items: BewItem[],
  dateStr: string,
  company: { name: string; address: string; vat?: string; tax?: string; iban?: string }
): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const reg = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  const W = 595.28;
  const H = 841.89;
  const MX = 50;
  const CW = W - MX * 2; // 495.28

  const black = rgb(0.1, 0.1, 0.1);
  const dgray = rgb(0.38, 0.38, 0.38);
  const lgray = rgb(0.93, 0.93, 0.93);
  const green = rgb(0.14, 0.5, 0.14);
  const fieldBg = rgb(0.97, 0.98, 1.0);
  const fieldBorder = rgb(0.6, 0.6, 0.65);

  // Column right-edges (for right-aligned numbers) and left-edges (for labels)
  const QTY_L = MX;           // 50  — qty left
  const DESC_L = MX + 34;     // 84  — description left
  const VAT_L = MX + 300;     // 350 — "7%" / "19%" left
  const VATAMT_R = MX + 405;  // 455 — vat amount right edge
  const GROSS_R = MX + CW;    // 545 — gross right edge

  const addrStr = company.address;

  function addPage() {
    const p = doc.addPage([W, H]);
    return { page: p, y: H - 48 };
  }

  const { page, y: startY } = addPage();
  let y = startY;

  // ── Title ──────────────────────────────────────────────────────────────────────
  page.drawText("Bewirtungsbeleg", { x: MX, y, size: 22, font: bold, color: black });

  const dateDisplay = dateStr.split("-").reverse().join(".");
  const dateW = bold.widthOfTextAtSize(dateDisplay, 10);
  page.drawText(dateDisplay, { x: W - MX - dateW, y: y + 4, size: 10, font: bold, color: dgray });

  y -= 14;
  page.drawText("Bewirtungskostenbeleg gemäß § 4 Abs. 5 Nr. 2 EStG", {
    x: MX, y, size: 8, font: reg, color: dgray,
  });

  y -= 13;
  page.drawLine({ start: { x: MX, y }, end: { x: W - MX, y }, thickness: 1, color: rgb(0.28, 0.28, 0.28) });

  // ── Bewirtungslokal ────────────────────────────────────────────────────────────
  y -= 16;
  page.drawText("Bewirtungslokal:", { x: MX, y, size: 8, font: bold, color: dgray });
  page.drawText(company.name, { x: MX + 92, y, size: 9, font: bold, color: black });

  y -= 13;
  page.drawText(addrStr, { x: MX + 92, y, size: 8.5, font: reg, color: black });

  y -= 13;
  const vatTax = [
    company.vat ? `USt-IdNr.: ${company.vat}` : "",
    company.tax ? `St.-Nr.: ${company.tax}` : "",
  ].filter(Boolean).join("  ·  ");
  if (vatTax) page.drawText(vatTax, { x: MX + 92, y, size: 8, font: reg, color: dgray });

  // ── Items Table ────────────────────────────────────────────────────────────────
  y -= 18;
  page.drawLine({ start: { x: MX, y }, end: { x: W - MX, y }, thickness: 0.5, color: rgb(0.72, 0.72, 0.72) });
  y -= 16;

  // Header
  page.drawRectangle({ x: MX, y: y - 5, width: CW, height: 17, color: lgray });

  page.drawText("Menge", { x: QTY_L, y, size: 8, font: bold, color: black });
  page.drawText("Bezeichnung", { x: DESC_L, y, size: 8, font: bold, color: black });
  page.drawText("MwSt", { x: VAT_L, y, size: 8, font: bold, color: black });

  const vatAmtHdr = "MwSt-Betrag";
  page.drawText(vatAmtHdr, {
    x: VATAMT_R - bold.widthOfTextAtSize(vatAmtHdr, 8),
    y, size: 8, font: bold, color: black,
  });
  const grossHdr = "Brutto";
  page.drawText(grossHdr, {
    x: GROSS_R - bold.widthOfTextAtSize(grossHdr, 8),
    y, size: 8, font: bold, color: black,
  });

  y -= 14;

  // Rows
  let net7 = 0, vat7 = 0, net19 = 0, vat19 = 0, gross = 0;
  const maxDescW = VAT_L - DESC_L - 8;

  for (const item of items) {
    const g = Number(item.sum);
    const vr = parseFloat(item.vat_rate);
    const vatAmt = g * vr / (100 + vr);
    const net = g - vatAmt;

    if (vr <= 7) { vat7 += vatAmt; net7 += net; }
    else { vat19 += vatAmt; net19 += net; }
    gross += g;

    let desc = item.description;
    while (reg.widthOfTextAtSize(desc, 8) > maxDescW && desc.length > 6) {
      desc = desc.slice(0, -4) + "…";
    }

    page.drawText(item.qty, { x: QTY_L, y, size: 8, font: reg, color: black });
    page.drawText(desc, { x: DESC_L, y, size: 8, font: reg, color: black });
    page.drawText(`${vr}%`, { x: VAT_L, y, size: 8, font: reg, color: black });

    const vatStr = fmt(vatAmt);
    page.drawText(vatStr, { x: VATAMT_R - reg.widthOfTextAtSize(vatStr, 8), y, size: 8, font: reg, color: black });

    const grossStr = fmt(g);
    page.drawText(grossStr, { x: GROSS_R - reg.widthOfTextAtSize(grossStr, 8), y, size: 8, font: reg, color: black });

    y -= 12;
    page.drawLine({
      start: { x: MX, y: y + 2 },
      end: { x: W - MX, y: y + 2 },
      thickness: 0.3,
      color: rgb(0.87, 0.87, 0.87),
    });
  }

  // ── VAT Summary ────────────────────────────────────────────────────────────────
  y -= 8;
  page.drawLine({ start: { x: MX, y }, end: { x: W - MX, y }, thickness: 0.5, color: rgb(0.7, 0.7, 0.7) });
  y -= 13;

  function drawVatRow(label: string, netAmt: number, vatAmt: number) {
    page.drawText(label, { x: MX, y, size: 8, font: reg, color: dgray });
    const netStr = fmt(netAmt);
    page.drawText(netStr, { x: MX + 175 - reg.widthOfTextAtSize(netStr, 8), y, size: 8, font: reg, color: black });
    page.drawText("MwSt:", { x: MX + 185, y, size: 8, font: reg, color: dgray });
    const vatStr = fmt(vatAmt);
    page.drawText(vatStr, { x: MX + 295 - reg.widthOfTextAtSize(vatStr, 8), y, size: 8, font: reg, color: black });
    y -= 12;
  }

  if (net7 > 0) drawVatRow("Netto 7%:", net7, vat7);
  if (net19 > 0) drawVatRow("Netto 19%:", net19, vat19);

  y -= 4;
  page.drawLine({ start: { x: MX, y }, end: { x: W - MX, y }, thickness: 1, color: rgb(0.22, 0.22, 0.22) });
  y -= 16;

  const grossStr = fmt(gross);
  page.drawText("Gesamtbetrag:", { x: MX, y, size: 11, font: bold, color: black });
  page.drawText(grossStr, { x: W - MX - bold.widthOfTextAtSize(grossStr, 11), y, size: 11, font: bold, color: black });
  y -= 15;
  page.drawText("✓ Bar bezahlt", { x: MX, y, size: 9, font: bold, color: green });

  // ── Customer fillable section ──────────────────────────────────────────────────
  // Start a new page if not enough room (need ~270pt for fields + footer)
  let fp = page;
  let fy = y - 22;

  if (fy < 270 + 50) {
    const { page: p2, y: ny } = addPage();
    fp = p2;
    fy = ny;
  }

  fp.drawLine({ start: { x: MX, y: fy }, end: { x: W - MX, y: fy }, thickness: 1.5, color: rgb(0.22, 0.22, 0.22) });
  fy -= 20;

  fp.drawText("Vom Bewirtenden auszufüllen", { x: MX, y: fy, size: 11, font: bold, color: black });
  fp.drawText("(für den Betriebsausgabenabzug gemäß § 4 Abs. 5 Nr. 2 EStG)", {
    x: MX + 210, y: fy + 1, size: 7.5, font: reg, color: dgray,
  });
  fy -= 20;

  const form = doc.getForm();

  function drawField(label: string, name: string, h: number, multi = false): void {
    fp.drawText(label, { x: MX, y: fy, size: 8, font: bold, color: dgray });
    fy -= 5;
    const tf = form.createTextField(name);
    if (multi) tf.enableMultiline();
    tf.setFontSize(9);
    tf.addToPage(fp, {
      x: MX,
      y: fy - h,
      width: CW,
      height: h,
      borderWidth: 0.5,
      borderColor: fieldBorder,
      backgroundColor: fieldBg,
    });
    fy -= h + 14;
  }

  drawField("Bewirtender (Name, Vorname):", "bewirtender_name", 22);
  fy -= 2;
  drawField("Unternehmen / Firma:", "bewirtender_firma", 22);
  fy -= 2;
  drawField("Anlass der Bewirtung (geschäftlicher Zweck):", "anlass", 34, true);
  fy -= 2;
  drawField(
    "Teilnehmer der Bewirtung (alle Namen und Unternehmen, inkl. Bewirtender):",
    "teilnehmer",
    54,
    true
  );
  fy -= 10;

  // Signature line
  fp.drawText("Ort, Datum", { x: MX, y: fy, size: 8, font: bold, color: dgray });
  fp.drawText("Unterschrift des Bewirtenden", { x: MX + 215, y: fy, size: 8, font: bold, color: dgray });
  fy -= 32;
  fp.drawLine({ start: { x: MX, y: fy }, end: { x: MX + 165, y: fy }, thickness: 0.5, color: rgb(0.5, 0.5, 0.5) });
  fp.drawLine({ start: { x: MX + 215, y: fy }, end: { x: W - MX, y: fy }, thickness: 0.5, color: rgb(0.5, 0.5, 0.5) });

  // ── Footer on every page ───────────────────────────────────────────────────────
  const footerParts = [company.name, addrStr, company.iban ? `IBAN: ${company.iban}` : ""].filter(Boolean);
  const footerText = footerParts.join("  ·  ");
  const footerX = W / 2 - reg.widthOfTextAtSize(footerText, 7) / 2;

  for (const p of doc.getPages()) {
    p.drawLine({ start: { x: MX, y: 40 }, end: { x: W - MX, y: 40 }, thickness: 0.5, color: rgb(0.78, 0.78, 0.78) });
    p.drawText(footerText, { x: footerX, y: 27, size: 7, font: reg, color: rgb(0.54, 0.54, 0.54) });
  }

  return doc.save();
}

export async function POST(req: NextRequest) {
  try {
    const { items, date, customerEmail, customerName } = await req.json() as {
      items: BewItem[];
      date: string;
      customerEmail: string;
      customerName?: string;
    };

    if (!customerEmail) return NextResponse.json({ error: "Email is required" }, { status: 400 });
    if (!items?.length) return NextResponse.json({ error: "No items provided" }, { status: 400 });

    const supabase = await createClient();
    const { data: company } = await supabase.from("company_settings").select("*").limit(1).single();
    if (!company) return NextResponse.json({ error: "Company settings not found" }, { status: 400 });

    const pdfBytes = await buildPdf(items, date, company);

    const dateDisplay = date.split("-").reverse().join(".");
    const filename = `Bewirtungsbeleg_${date}.pdf`;
    const greeting = customerName ? `Guten Tag ${customerName},` : "Guten Tag,";

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
      attachments: [
        {
          filename,
          content: Buffer.from(pdfBytes).toString("base64"),
        },
      ],
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("send-bewirtungsbeleg error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
