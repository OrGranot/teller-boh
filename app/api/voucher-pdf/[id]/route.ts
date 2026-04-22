import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
// eslint-disable-next-line @typescript-eslint/no-require-imports
const PDFDocument = require("pdfkit");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const QRCode = require("qrcode");

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: voucher, error } = await supabase
    .from("vouchers")
    .select("voucher_code, amount, buyer_name, recipient_name, recipient_email, personal_message, valid_until, purchased_at")
    .eq("id", id)
    .single();

  if (error || !voucher) {
    return NextResponse.json({ error: "Voucher not found" }, { status: 404 });
  }

  const pdfBuffer = await generateVoucherPDF(voucher);

  return new NextResponse(new Uint8Array(pdfBuffer), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="teller-berlin-voucher-${voucher.voucher_code}.pdf"`,
    },
  });
}

async function generateVoucherPDF(data: {
  voucher_code: string;
  amount: number;
  buyer_name?: string | null;
  recipient_name?: string | null;
  personal_message?: string | null;
  valid_until?: string | null;
}) {
  const redeemUrl = `https://cheery-lolly-7b09bd.netlify.app/redeem/${data.voucher_code}`;
  const qrBuffer = await QRCode.toBuffer(redeemUrl, {
    width: 120,
    margin: 1,
    color: { dark: "#5B2A3C", light: "#FAF5F0" },
  });

  return new Promise<Buffer>((resolve, reject) => {
    const doc = new PDFDocument({
      size: "A4",
      layout: "landscape",
      margins: { top: 0, bottom: 0, left: 0, right: 0 },
    });

    const buffers: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => buffers.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(buffers)));
    doc.on("error", reject);

    const width = 841.89;
    const height = 595.28;

    // Color palette
    const PLUM      = "#5B2A3C";
    const PLUM_DARK = "#3E1A28";
    const CREAM     = "#FAF5F0";
    const TERRACOTTA= "#C1785A";
    const GOLD      = "#C5A55A";
    const SAND      = "#E8DDD0";
    const TEXT      = "#3A3A3A";

    // Background
    doc.rect(0, 0, width, height).fill(CREAM);

    // Decorative double border
    const bi = 30;
    doc.rect(bi, bi, width - bi * 2, height - bi * 2).lineWidth(1).stroke(GOLD);
    doc.rect(bi + 8, bi + 8, width - (bi + 8) * 2, height - (bi + 8) * 2).lineWidth(0.5).stroke(SAND);

    // Header band
    doc.rect(0, 0, width, 120).fill(PLUM);

    // Restaurant name
    doc.fontSize(32).fillColor(CREAM).font("Helvetica")
       .text("TELLER", 0, 40, { align: "center", width, characterSpacing: 12 });
    doc.fontSize(9).fillColor(GOLD)
       .text("BERLIN  \u00B7  PAPPELALLEE 29  \u00B7  PRENZLAUER BERG", 0, 82, {
         align: "center", width, characterSpacing: 3,
       });

    // Gift voucher label
    doc.fontSize(11).fillColor(TERRACOTTA)
       .text("GIFT VOUCHER", 0, 150, { align: "center", width, characterSpacing: 6 });

    // Decorative line
    doc.moveTo(width / 2 - 30, 175).lineTo(width / 2 + 30, 175).lineWidth(1).stroke(TERRACOTTA);

    // Amount
    doc.fontSize(56).fillColor(PLUM_DARK).font("Helvetica-Bold")
       .text(`\u20AC${data.amount}`, 0, 195, { align: "center", width });

    // Recipient
    if (data.recipient_name) {
      doc.fontSize(13).fillColor(TEXT).font("Helvetica")
         .text("for", 0, 270, { align: "center", width });
      doc.fontSize(22).fillColor(PLUM_DARK).font("Helvetica-Bold")
         .text(data.recipient_name, 0, 292, { align: "center", width });
    }

    // Personal message
    let nextY = data.recipient_name ? 335 : 285;
    if (data.personal_message) {
      doc.fontSize(11).fillColor(TEXT).font("Helvetica-Oblique")
         .text(`\u201C${data.personal_message}\u201D`, 100, nextY, {
           align: "center", width: width - 200, lineGap: 4,
         });
      nextY += 70;
    } else {
      nextY += 35;
    }

    // Voucher code label
    doc.fontSize(9).fillColor(TERRACOTTA).font("Helvetica")
       .text("VOUCHER CODE", 0, nextY, { align: "center", width, characterSpacing: 3 });

    // Code box
    const codeBoxW = 220;
    const codeBoxH = 38;
    const codeBoxX = (width - codeBoxW) / 2;
    const codeBoxY = nextY + 18;
    doc.roundedRect(codeBoxX, codeBoxY, codeBoxW, codeBoxH, 4).lineWidth(1.5).stroke(PLUM);
    doc.fontSize(18).fillColor(PLUM_DARK).font("Helvetica-Bold")
       .text(data.voucher_code, codeBoxX, codeBoxY + 10, {
         align: "center", width: codeBoxW, characterSpacing: 2,
       });

    // QR code
    const qrSize = 80;
    const qrX = codeBoxX + codeBoxW + 30;
    const qrY = nextY - 10;
    doc.image(qrBuffer, qrX, qrY, { width: qrSize, height: qrSize });
    doc.fontSize(6).fillColor(TEXT).font("Helvetica")
       .text("Scan to redeem", qrX, qrY + qrSize + 4, { width: qrSize, align: "center" });

    // Footer info
    const footerY = height - 100;
    const validUntil = data.valid_until
      ? new Date(data.valid_until).toLocaleDateString("en-GB")
      : null;
    if (validUntil) {
      doc.fontSize(9).fillColor(TEXT).font("Helvetica")
         .text(`Valid until: ${validUntil}`, 0, footerY, { align: "center", width });
    }
    doc.fontSize(8).fillColor(TEXT)
       .text("Redeemable at Teller Berlin  \u00B7  Pappelallee 29  \u00B7  10437 Berlin",
             0, footerY + 18, { align: "center", width });
    doc.fontSize(8).fillColor(TEXT)
       .text("hello@tellerberlin.com", 0, footerY + 33, { align: "center", width });

    // Bottom band
    doc.rect(0, height - 30, width, 30).fill(PLUM);
    doc.fontSize(7).fillColor(GOLD)
       .text("SEASONAL  \u00B7  LEVANTINE-INSPIRED  \u00B7  CUISINE", 0, height - 22, {
         align: "center", width, characterSpacing: 4,
       });

    doc.end();
  });
}
