import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

export interface BewItem {
  qty: string;
  description: string;
  vat_rate: string;
  sum: number;
}

export interface BewCompany {
  name: string;
  address?: string | null;
  vat?: string | null;
  tax?: string | null;
  iban?: string | null;
}

function fmt(n: number) {
  return n.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";
}

export async function buildBewirtungsbelegPdf(
  items: BewItem[],
  dateStr: string,
  company: BewCompany,
  customerAddress?: string,
  tip?: number
): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const reg  = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  const W = 595.28, H = 841.89, MX = 50;
  const CW = W - MX * 2;

  const black      = rgb(0.1,  0.1,  0.1);
  const dgray      = rgb(0.38, 0.38, 0.38);
  const lgray      = rgb(0.93, 0.93, 0.93);
  const green      = rgb(0.14, 0.5,  0.14);
  const fieldBg    = rgb(0.97, 0.98, 1.0);
  const fieldBorder = rgb(0.6,  0.6,  0.65);

  const QTY_L    = MX;
  const DESC_L   = MX + 34;
  const VAT_L    = MX + 300;
  const VATAMT_R = MX + 405;
  const GROSS_R  = MX + CW;

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

  // ── Two-column: customer address (left) + restaurant (right) ──────────────────
  y -= 16;
  const colMid = MX + CW / 2 + 10;

  // Left: customer address (if provided)
  if (customerAddress && customerAddress.trim()) {
    page.drawText("An:", { x: MX, y, size: 8, font: bold, color: dgray });
    const addrLines = customerAddress.split("\n").map(l => l.trim()).filter(Boolean);
    let ay = y;
    for (const line of addrLines) {
      page.drawText(line, { x: MX + 28, y: ay, size: 9, font: reg, color: black });
      ay -= 13;
    }
    // Right column starts at same y
    page.drawText("Bewirtungslokal:", { x: colMid, y, size: 8, font: bold, color: dgray });
    page.drawText(company.name ?? "", { x: colMid + 92, y, size: 9, font: bold, color: black });
    y -= 13;
    if (company.address) page.drawText(company.address, { x: colMid + 92, y, size: 8, font: reg, color: black });
    y -= 13;
    const vatTax = [
      company.vat ? `USt-IdNr.: ${company.vat}` : "",
      company.tax ? `St.-Nr.: ${company.tax}` : "",
    ].filter(Boolean).join("  ·  ");
    if (vatTax) page.drawText(vatTax, { x: colMid + 92, y, size: 7.5, font: reg, color: dgray });
    // Use the lower of the two columns
    const afterAddr = ay;
    const afterRest = y;
    y = Math.min(afterAddr, afterRest);
  } else {
    // Full-width restaurant info
    page.drawText("Bewirtungslokal:", { x: MX, y, size: 8, font: bold, color: dgray });
    page.drawText(company.name ?? "", { x: MX + 92, y, size: 9, font: bold, color: black });
    y -= 13;
    if (company.address) page.drawText(company.address, { x: MX + 92, y, size: 8.5, font: reg, color: black });
    y -= 13;
    const vatTax = [
      company.vat ? `USt-IdNr.: ${company.vat}` : "",
      company.tax ? `St.-Nr.: ${company.tax}` : "",
    ].filter(Boolean).join("  ·  ");
    if (vatTax) page.drawText(vatTax, { x: MX + 92, y, size: 8, font: reg, color: dgray });
  }

  // ── Items Table ────────────────────────────────────────────────────────────────
  y -= 18;
  page.drawLine({ start: { x: MX, y }, end: { x: W - MX, y }, thickness: 0.5, color: rgb(0.72, 0.72, 0.72) });
  y -= 16;

  page.drawRectangle({ x: MX, y: y - 5, width: CW, height: 17, color: lgray });
  page.drawText("Menge",       { x: QTY_L,  y, size: 8, font: bold, color: black });
  page.drawText("Bezeichnung", { x: DESC_L,  y, size: 8, font: bold, color: black });
  page.drawText("MwSt",        { x: VAT_L,   y, size: 8, font: bold, color: black });

  const vatAmtHdr = "MwSt-Betrag";
  page.drawText(vatAmtHdr, { x: VATAMT_R - bold.widthOfTextAtSize(vatAmtHdr, 8), y, size: 8, font: bold, color: black });
  const grossHdr = "Brutto";
  page.drawText(grossHdr, { x: GROSS_R - bold.widthOfTextAtSize(grossHdr, 8), y, size: 8, font: bold, color: black });

  y -= 14;

  let net7 = 0, vat7 = 0, net19 = 0, vat19 = 0, totalGross = 0;
  const maxDescW = VAT_L - DESC_L - 8;

  for (const item of items) {
    const g   = Number(item.sum);
    const vr  = parseFloat(item.vat_rate);
    const vatAmt = g * vr / (100 + vr);
    const net = g - vatAmt;

    if (vr <= 7) { vat7 += vatAmt; net7 += net; }
    else         { vat19 += vatAmt; net19 += net; }
    totalGross += g;

    let desc = item.description;
    while (reg.widthOfTextAtSize(desc, 8) > maxDescW && desc.length > 6) desc = desc.slice(0, -4) + "…";

    page.drawText(item.qty,    { x: QTY_L,  y, size: 8, font: reg, color: black });
    page.drawText(desc,        { x: DESC_L,  y, size: 8, font: reg, color: black });
    page.drawText(`${vr}%`,   { x: VAT_L,   y, size: 8, font: reg, color: black });

    const vatStr   = fmt(vatAmt);
    const grossStr = fmt(g);
    page.drawText(vatStr,   { x: VATAMT_R - reg.widthOfTextAtSize(vatStr,   8), y, size: 8, font: reg, color: black });
    page.drawText(grossStr, { x: GROSS_R  - reg.widthOfTextAtSize(grossStr, 8), y, size: 8, font: reg, color: black });

    y -= 12;
    page.drawLine({ start: { x: MX, y: y + 2 }, end: { x: W - MX, y: y + 2 }, thickness: 0.3, color: rgb(0.87, 0.87, 0.87) });
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

  if (net7  > 0 || vat7  !== 0) drawVatRow("Netto 7%:",  net7,  vat7);
  if (net19 > 0 || vat19 !== 0) drawVatRow("Netto 19%:", net19, vat19);

  y -= 4;
  page.drawLine({ start: { x: MX, y }, end: { x: W - MX, y }, thickness: 1, color: rgb(0.22, 0.22, 0.22) });
  y -= 16;

  // ── Tip (Trinkgeld) — shown before grand total if present ─────────────────────
  const tipAmt = tip && tip > 0 ? tip : 0;
  if (tipAmt > 0) {
    const subtotalStr = fmt(totalGross);
    page.drawText("Rechnungsbetrag:", { x: MX, y, size: 9, font: reg, color: dgray });
    page.drawText(subtotalStr, { x: W - MX - reg.widthOfTextAtSize(subtotalStr, 9), y, size: 9, font: reg, color: black });
    y -= 13;

    const tipStr = fmt(tipAmt);
    page.drawText("Trinkgeld (kein MwSt-Anteil):", { x: MX, y, size: 9, font: reg, color: dgray });
    page.drawText(tipStr, { x: W - MX - reg.widthOfTextAtSize(tipStr, 9), y, size: 9, font: reg, color: black });
    y -= 6;
    page.drawLine({ start: { x: MX, y }, end: { x: W - MX, y }, thickness: 0.5, color: rgb(0.7, 0.7, 0.7) });
    y -= 14;
  }

  const grandTotal = totalGross + tipAmt;
  const totalStr = fmt(grandTotal);
  page.drawText("Gesamtbetrag:", { x: MX, y, size: 11, font: bold, color: black });
  page.drawText(totalStr, { x: W - MX - bold.widthOfTextAtSize(totalStr, 11), y, size: 11, font: bold, color: black });
  y -= 15;
  page.drawText("Bar bezahlt", { x: MX, y, size: 9, font: bold, color: green });

  // ── Fillable customer section ──────────────────────────────────────────────────
  let fp = page;
  let fy = y - 22;

  if (fy < 280 + 50) {
    const { page: p2, y: ny } = addPage();
    fp = p2;
    fy = ny;
  }

  fp.drawLine({ start: { x: MX, y: fy }, end: { x: W - MX, y: fy }, thickness: 1.5, color: rgb(0.22, 0.22, 0.22) });
  fy -= 20;
  fp.drawText("Vom Bewirtenden auszufüllen", { x: MX, y: fy, size: 11, font: bold, color: black });
  fp.drawText("(für den Betriebsausgabenabzug gemäß § 4 Abs. 5 Nr. 2 EStG)", { x: MX + 210, y: fy + 1, size: 7.5, font: reg, color: dgray });
  fy -= 20;

  const form = doc.getForm();

  function drawField(label: string, name: string, h: number, multi = false, hint?: string): void {
    fp.drawText(label, { x: MX, y: fy, size: 8, font: bold, color: dgray });
    if (hint) {
      const labelW = bold.widthOfTextAtSize(label, 8);
      fp.drawText(hint, { x: MX + labelW + 6, y: fy, size: 7, font: reg, color: rgb(0.65, 0.35, 0.1) });
    }
    fy -= 5;
    const tf = form.createTextField(name);
    if (multi) tf.enableMultiline();
    tf.addToPage(fp, { x: MX, y: fy - h, width: CW, height: h, borderWidth: 0.5, borderColor: fieldBorder, backgroundColor: fieldBg });
    tf.updateAppearances(reg);
    fy -= h + 14;
  }

  drawField("Bewirtender (Name, Vorname):", "bewirtender_name", 22);
  fy -= 2;
  drawField("Unternehmen / Firma:", "bewirtender_firma", 22);
  fy -= 2;
  drawField(
    "Anlass der Bewirtung (geschäftlicher Zweck):",
    "anlass",
    34,
    true,
    "Bitte konkret angeben — z. B. nicht 'Kundenpflege'"
  );
  fy -= 2;
  drawField("Teilnehmer der Bewirtung (alle Namen und Unternehmen, inkl. Bewirtender):", "teilnehmer", 54, true);
  fy -= 10;

  fp.drawText("Ort, Datum", { x: MX, y: fy, size: 8, font: bold, color: dgray });
  fp.drawText("Unterschrift des Bewirtenden", { x: MX + 215, y: fy, size: 8, font: bold, color: dgray });
  fy -= 32;
  fp.drawLine({ start: { x: MX, y: fy }, end: { x: MX + 165, y: fy }, thickness: 0.5, color: rgb(0.5, 0.5, 0.5) });
  fp.drawLine({ start: { x: MX + 215, y: fy }, end: { x: W - MX, y: fy }, thickness: 0.5, color: rgb(0.5, 0.5, 0.5) });

  // ── Footer ─────────────────────────────────────────────────────────────────────
  const footerText = [company.name ?? "", company.address ?? "", company.iban ? `IBAN: ${company.iban}` : ""]
    .filter(Boolean).join("  ·  ");
  const footerX = W / 2 - reg.widthOfTextAtSize(footerText, 7) / 2;

  for (const p of doc.getPages()) {
    p.drawLine({ start: { x: MX, y: 40 }, end: { x: W - MX, y: 40 }, thickness: 0.5, color: rgb(0.78, 0.78, 0.78) });
    p.drawText(footerText, { x: footerX, y: 27, size: 7, font: reg, color: rgb(0.54, 0.54, 0.54) });
  }

  return doc.save();
}
