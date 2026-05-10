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

const TRANSLATIONS = {
  de: {
    title: "Bewirtungsbeleg",
    subtitle: "Bewirtungskostenbeleg gemäß § 4 Abs. 5 Nr. 2 EStG",
    to: "An:",
    restaurant: "Bewirtungslokal:",
    colQty: "Menge",
    colDesc: "Bezeichnung",
    colVat: "MwSt",
    colVatAmt: "MwSt-Betrag",
    colGross: "Brutto",
    vatTableType: "Steuerart",
    vatTableNet: "Nettobetrag",
    vatTableRate: "MwSt-Satz",
    vatTableVatAmt: "MwSt-Betrag",
    vatTableGross: "Bruttobetrag",
    vatRowLabel: (rate: number) => `${rate}% MwSt`,
    vatTotal: "Gesamt",
    subtotal: "Rechnungsbetrag:",
    tip: "Trinkgeld (kein MwSt-Anteil):",
    grandTotal: "Gesamtbetrag:",
    paymentSuffix: "bezahlt",
    paymentLabel: (method: string) => {
      const map: Record<string, string> = { Cash: "Bar", Card: "Karte", "Bank Transfer": "Überweisung", Other: "Andere" };
      return `${map[method] ?? method} bezahlt`;
    },
    fillSection: "Vom Bewirtenden auszufüllen",
    fillSubtitle: "(für den Betriebsausgabenabzug gemäß § 4 Abs. 5 Nr. 2 EStG)",
    fieldHost: "Bewirtender (Name, Vorname):",
    fieldCompany: "Unternehmen / Firma:",
    fieldPurpose: "Anlass der Bewirtung (geschäftlicher Zweck):",
    fieldPurposeHint: "Bitte konkret angeben — z. B. nicht 'Kundenpflege'",
    fieldParticipants: "Teilnehmer der Bewirtung (alle Namen und Unternehmen, inkl. Bewirtender):",
    fieldPlaceDate: "Ort, Datum",
    fieldSignature: "Unterschrift des Bewirtenden",
  },
  en: {
    title: "Entertainment Expense Receipt",
    subtitle: "Entertainment expense pursuant to § 4 (5) No. 2 EStG",
    to: "To:",
    restaurant: "Restaurant:",
    colQty: "Qty",
    colDesc: "Description",
    colVat: "VAT",
    colVatAmt: "VAT Amount",
    colGross: "Gross",
    vatTableType: "Tax Type",
    vatTableNet: "Net Amount",
    vatTableRate: "VAT Rate",
    vatTableVatAmt: "VAT Amount",
    vatTableGross: "Gross Amount",
    vatRowLabel: (rate: number) => `${rate}% VAT`,
    vatTotal: "Total",
    subtotal: "Subtotal:",
    tip: "Tip (no VAT):",
    grandTotal: "Grand Total:",
    paymentSuffix: "paid",
    paymentLabel: (method: string) => `Paid by ${method}`,
    fillSection: "To be completed by the host",
    fillSubtitle: "(for business expense deduction pursuant to § 4 (5) No. 2 EStG)",
    fieldHost: "Host (Last name, First name):",
    fieldCompany: "Company / Business:",
    fieldPurpose: "Purpose of Entertainment (Business Reason):",
    fieldPurposeHint: "Be specific — e.g. not just 'client relations'",
    fieldParticipants: "Participants (all names and companies, incl. host):",
    fieldPlaceDate: "Place, Date",
    fieldSignature: "Signature of Host",
  },
} as const;

export async function buildBewirtungsbelegPdf(
  items: BewItem[],
  dateStr: string,
  company: BewCompany,
  customerName?: string,
  customerAddress?: string,
  tip?: number,
  paymentMethod?: string,
  language: "de" | "en" = "de"
): Promise<Uint8Array> {
  const t = TRANSLATIONS[language];

  const doc = await PDFDocument.create();
  const reg  = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  const W = 595.28, H = 841.89, MX = 50;
  const CW = W - MX * 2;

  const black       = rgb(0.1,  0.1,  0.1);
  const dgray       = rgb(0.38, 0.38, 0.38);
  const lgray       = rgb(0.93, 0.93, 0.93);
  const green       = rgb(0.14, 0.5,  0.14);
  const fieldBg     = rgb(0.97, 0.98, 1.0);
  const fieldBorder = rgb(0.6,  0.6,  0.65);

  const QTY_L    = MX;
  const DESC_L   = MX + 34;
  const VAT_L    = MX + 300;
  const VATAMT_R = MX + 405;
  const GROSS_R  = MX + CW;

  const VSUM_NET_R  = VAT_L - 10;
  const VSUM_RATE_L = VAT_L;
  const VSUM_VAT_R  = VATAMT_R;
  const VSUM_GRS_R  = GROSS_R;

  function addPage() {
    const p = doc.addPage([W, H]);
    return { page: p, y: H - 48 };
  }

  const { page, y: startY } = addPage();
  let y = startY;

  // ── Title ──────────────────────────────────────────────────────────────────────
  page.drawText(t.title, { x: MX, y, size: 22, font: bold, color: black });

  const dateDisplay = dateStr.split("-").reverse().join(".");
  const dateW = bold.widthOfTextAtSize(dateDisplay, 10);
  page.drawText(dateDisplay, { x: W - MX - dateW, y: y + 4, size: 10, font: bold, color: dgray });

  y -= 14;
  page.drawText(t.subtitle, { x: MX, y, size: 8, font: reg, color: dgray });

  y -= 13;
  page.drawLine({ start: { x: MX, y }, end: { x: W - MX, y }, thickness: 1, color: rgb(0.28, 0.28, 0.28) });

  // ── Two-column: customer address (left) + restaurant (right) ──────────────────
  y -= 16;
  const colMid = MX + CW / 2 + 10;

  if ((customerName && customerName.trim()) || (customerAddress && customerAddress.trim())) {
    page.drawText(t.to, { x: MX, y, size: 8, font: bold, color: dgray });
    let ay = y;
    if (customerName && customerName.trim()) {
      page.drawText(customerName.trim(), { x: MX + 28, y: ay, size: 9, font: bold, color: black });
      ay -= 13;
    }
    const addrLines = (customerAddress ?? "").split("\n").map(l => l.trim()).filter(Boolean);
    for (const line of addrLines) {
      page.drawText(line, { x: MX + 28, y: ay, size: 9, font: reg, color: black });
      ay -= 13;
    }
    page.drawText(t.restaurant, { x: colMid, y, size: 8, font: bold, color: dgray });
    const restLabelW = bold.widthOfTextAtSize(t.restaurant, 8);
    page.drawText(company.name ?? "", { x: colMid + restLabelW + 6, y, size: 9, font: bold, color: black });
    y -= 13;
    if (company.address) page.drawText(company.address, { x: colMid + restLabelW + 6, y, size: 8, font: reg, color: black });
    y -= 13;
    const vatTax = [
      company.vat ? `USt-IdNr.: ${company.vat}` : "",
      company.tax ? `St.-Nr.: ${company.tax}` : "",
    ].filter(Boolean).join("  ·  ");
    if (vatTax) page.drawText(vatTax, { x: colMid + restLabelW + 6, y, size: 7.5, font: reg, color: dgray });
    y = Math.min(ay, y);
  } else {
    page.drawText(t.restaurant, { x: MX, y, size: 8, font: bold, color: dgray });
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
  page.drawText(t.colQty,  { x: QTY_L,  y, size: 8, font: bold, color: black });
  page.drawText(t.colDesc, { x: DESC_L, y, size: 8, font: bold, color: black });
  page.drawText(t.colVat,  { x: VAT_L,  y, size: 8, font: bold, color: black });

  const vatAmtHdr = t.colVatAmt;
  page.drawText(vatAmtHdr, { x: VATAMT_R - bold.widthOfTextAtSize(vatAmtHdr, 8), y, size: 8, font: bold, color: black });
  const grossHdr = t.colGross;
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

    page.drawText(item.qty, { x: QTY_L,  y, size: 8, font: reg, color: black });
    page.drawText(desc,     { x: DESC_L, y, size: 8, font: reg, color: black });
    page.drawText(`${vr}%`, { x: VAT_L,  y, size: 8, font: reg, color: black });

    const vatStr   = fmt(vatAmt);
    const grossStr = fmt(g);
    page.drawText(vatStr,   { x: VATAMT_R - reg.widthOfTextAtSize(vatStr,   8), y, size: 8, font: reg, color: black });
    page.drawText(grossStr, { x: GROSS_R  - reg.widthOfTextAtSize(grossStr, 8), y, size: 8, font: reg, color: black });

    y -= 12;
    page.drawLine({ start: { x: MX, y: y + 2 }, end: { x: W - MX, y: y + 2 }, thickness: 0.3, color: rgb(0.87, 0.87, 0.87) });
  }

  // ── VAT Summary Table ──────────────────────────────────────────────────────────
  y -= 10;
  page.drawLine({ start: { x: MX, y }, end: { x: W - MX, y }, thickness: 0.5, color: rgb(0.7, 0.7, 0.7) });
  y -= 2;

  page.drawRectangle({ x: MX, y: y - 5, width: CW, height: 16, color: lgray });
  page.drawText(t.vatTableType, { x: MX, y, size: 7.5, font: bold, color: dgray });

  const h2 = t.vatTableNet;
  page.drawText(h2, { x: VSUM_NET_R - bold.widthOfTextAtSize(h2, 7.5), y, size: 7.5, font: bold, color: dgray });

  page.drawText(t.vatTableRate, { x: VSUM_RATE_L, y, size: 7.5, font: bold, color: dgray });

  const h4 = t.vatTableVatAmt;
  page.drawText(h4, { x: VSUM_VAT_R - bold.widthOfTextAtSize(h4, 7.5), y, size: 7.5, font: bold, color: dgray });

  const h5 = t.vatTableGross;
  page.drawText(h5, { x: VSUM_GRS_R - bold.widthOfTextAtSize(h5, 7.5), y, size: 7.5, font: bold, color: dgray });

  y -= 15;

  function drawVatRow(rate: number, netAmt: number, vatAmt: number) {
    const grossAmt = netAmt + vatAmt;

    page.drawText(t.vatRowLabel(rate), { x: MX, y, size: 8, font: reg, color: black });

    const netStr = fmt(netAmt);
    page.drawText(netStr, { x: VSUM_NET_R - reg.widthOfTextAtSize(netStr, 8), y, size: 8, font: reg, color: black });

    page.drawText(`${rate}%`, { x: VSUM_RATE_L, y, size: 8, font: reg, color: black });

    const vatStr = fmt(vatAmt);
    page.drawText(vatStr, { x: VSUM_VAT_R - reg.widthOfTextAtSize(vatStr, 8), y, size: 8, font: reg, color: black });

    const gStr = fmt(grossAmt);
    page.drawText(gStr, { x: VSUM_GRS_R - reg.widthOfTextAtSize(gStr, 8), y, size: 8, font: reg, color: black });

    y -= 11;
    page.drawLine({ start: { x: MX, y: y + 2 }, end: { x: W - MX, y: y + 2 }, thickness: 0.3, color: rgb(0.87, 0.87, 0.87) });
  }

  if (net7  > 0 || vat7  !== 0) drawVatRow(7,  net7,  vat7);
  if (net19 > 0 || vat19 !== 0) drawVatRow(19, net19, vat19);

  y -= 2;
  const totalNet = net7 + net19;
  const totalVat = vat7 + vat19;

  page.drawText(t.vatTotal, { x: MX, y, size: 8, font: bold, color: black });

  const totNetStr = fmt(totalNet);
  page.drawText(totNetStr, { x: VSUM_NET_R - bold.widthOfTextAtSize(totNetStr, 8), y, size: 8, font: bold, color: black });

  const totVatStr = fmt(totalVat);
  page.drawText(totVatStr, { x: VSUM_VAT_R - bold.widthOfTextAtSize(totVatStr, 8), y, size: 8, font: bold, color: black });

  const totGrossStr = fmt(totalGross);
  page.drawText(totGrossStr, { x: VSUM_GRS_R - bold.widthOfTextAtSize(totGrossStr, 8), y, size: 8, font: bold, color: black });

  y -= 14;

  // ── Separator before grand total ───────────────────────────────────────────────
  page.drawLine({ start: { x: MX, y }, end: { x: W - MX, y }, thickness: 1, color: rgb(0.22, 0.22, 0.22) });
  y -= 16;

  // ── Tip ───────────────────────────────────────────────────────────────────────
  const tipAmt = tip && tip > 0 ? tip : 0;
  if (tipAmt > 0) {
    const subtotalStr = fmt(totalGross);
    page.drawText(t.subtotal, { x: MX, y, size: 9, font: reg, color: dgray });
    page.drawText(subtotalStr, { x: W - MX - reg.widthOfTextAtSize(subtotalStr, 9), y, size: 9, font: reg, color: black });
    y -= 13;

    const tipStr = fmt(tipAmt);
    page.drawText(t.tip, { x: MX, y, size: 9, font: reg, color: dgray });
    page.drawText(tipStr, { x: W - MX - reg.widthOfTextAtSize(tipStr, 9), y, size: 9, font: reg, color: black });
    y -= 6;
    page.drawLine({ start: { x: MX, y }, end: { x: W - MX, y }, thickness: 0.5, color: rgb(0.7, 0.7, 0.7) });
    y -= 14;
  }

  const grandTotal = totalGross + tipAmt;
  const totalStr = fmt(grandTotal);
  page.drawText(t.grandTotal, { x: MX, y, size: 11, font: bold, color: black });
  page.drawText(totalStr, { x: W - MX - bold.widthOfTextAtSize(totalStr, 11), y, size: 11, font: bold, color: black });
  y -= 15;

  const paymentLabel = t.paymentLabel(paymentMethod && paymentMethod.trim() ? paymentMethod : "Cash");
  page.drawText(paymentLabel, { x: MX, y, size: 9, font: bold, color: green });

  // ── Fillable customer section ──────────────────────────────────────────────────
  let fp = page;
  let fy = y - 22;

  if (fy < 300 + 50) {
    const { page: p2, y: ny } = addPage();
    fp = p2;
    fy = ny;
  }

  fp.drawLine({ start: { x: MX, y: fy }, end: { x: W - MX, y: fy }, thickness: 1.5, color: rgb(0.22, 0.22, 0.22) });
  fy -= 20;
  fp.drawText(t.fillSection, { x: MX, y: fy, size: 11, font: bold, color: black });
  fp.drawText(t.fillSubtitle, { x: MX + 210, y: fy + 1, size: 7.5, font: reg, color: dgray });
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

  drawField(t.fieldHost, "host_name", 22);
  fy -= 2;
  drawField(t.fieldCompany, "host_company", 22);
  fy -= 2;
  drawField(t.fieldPurpose, "purpose", 34, true, t.fieldPurposeHint);
  fy -= 2;
  drawField(t.fieldParticipants, "participants", 54, true);
  fy -= 10;

  fp.drawText(t.fieldPlaceDate, { x: MX, y: fy, size: 8, font: bold, color: dgray });
  fp.drawText(t.fieldSignature, { x: MX + 215, y: fy, size: 8, font: bold, color: dgray });
  fy -= 5;

  const ortDatum = form.createTextField("place_date");
  ortDatum.addToPage(fp, {
    x: MX,
    y: fy - 24,
    width: 165,
    height: 24,
    borderWidth: 0.5,
    borderColor: fieldBorder,
    backgroundColor: fieldBg,
  });
  ortDatum.updateAppearances(reg);

  fp.drawLine({
    start: { x: MX + 215, y: fy - 26 },
    end:   { x: W - MX,   y: fy - 26 },
    thickness: 0.5,
    color: rgb(0.5, 0.5, 0.5),
  });

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
