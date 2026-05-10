// eslint-disable-next-line @typescript-eslint/no-require-imports
const PDFDocument = require("pdfkit");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const QRCode = require("qrcode");

const APP_URL =
  process.env.NEXT_PUBLIC_APP_URL ?? "https://cheery-lolly-7b09bd.netlify.app";

export interface VoucherPDFData {
  voucher_code: string;
  amount: number;
  recipient_name?: string | null;
  personal_message?: string | null;
  valid_until?: string | null;
}

export async function generateVoucherPDF(data: VoucherPDFData): Promise<Buffer> {
  const redeemUrl = `${APP_URL}/redeem/${data.voucher_code}`;
  const qrBuffer = await QRCode.toBuffer(redeemUrl, {
    width: 160,
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

    const PLUM = "#5B2A3C";
    const PLUM_DARK = "#3E1A28";
    const CREAM = "#FAF5F0";
    const TERRACOTTA = "#C1785A";
    const GOLD = "#C5A55A";
    const SAND = "#E8DDD0";
    const TEXT = "#3A3A3A";

    // Background
    doc.rect(0, 0, width, height).fill(CREAM);

    // Decorative border
    const bi = 30;
    doc.rect(bi, bi, width - bi * 2, height - bi * 2).lineWidth(1).stroke(GOLD);
    doc.rect(bi + 8, bi + 8, width - (bi + 8) * 2, height - (bi + 8) * 2).lineWidth(0.5).stroke(SAND);

    // Header band
    doc.rect(0, 0, width, 120).fill(PLUM);
    doc.fontSize(34).fillColor(CREAM).font("Helvetica")
      .text("TELLER", 0, 38, { align: "center", width, characterSpacing: 14 });
    doc.fontSize(10).fillColor(GOLD)
      .text("BERLIN  ·  PAPPELALLEE 29  ·  PRENZLAUER BERG", 0, 83, { align: "center", width, characterSpacing: 3 });

    // Gift voucher label
    doc.fontSize(12).fillColor(TERRACOTTA)
      .text("GIFT VOUCHER", 0, 152, { align: "center", width, characterSpacing: 7 });

    // Decorative line
    doc.moveTo(width / 2 - 35, 178).lineTo(width / 2 + 35, 178).lineWidth(1).stroke(TERRACOTTA);

    // Amount
    doc.fontSize(64).fillColor(PLUM_DARK).font("Helvetica-Bold")
      .text(`€${data.amount}`, 0, 195, { align: "center", width });

    // Recipient
    if (data.recipient_name) {
      doc.fontSize(14).fillColor(TEXT).font("Helvetica")
        .text("for", 0, 278, { align: "center", width });
      doc.fontSize(26).fillColor(PLUM_DARK).font("Helvetica-Bold")
        .text(data.recipient_name, 0, 300, { align: "center", width });
    }

    // Personal message — no quotes, italic
    let nextY = data.recipient_name ? 348 : 290;
    if (data.personal_message) {
      doc.fontSize(15).fillColor(TEXT).font("Helvetica-Oblique")
        .text(data.personal_message, 120, nextY, { align: "center", width: width - 240, lineGap: 4 });
      nextY += 58;
    } else {
      nextY += 25;
    }

    // Voucher code label
    doc.fontSize(10).fillColor(TERRACOTTA).font("Helvetica")
      .text("VOUCHER CODE", 0, nextY, { align: "center", width, characterSpacing: 4 });

    // Code box — centred
    const codeBoxW = 240;
    const codeBoxH = 42;
    const codeBoxX = (width - codeBoxW) / 2;
    const codeBoxY = nextY + 20;
    doc.roundedRect(codeBoxX, codeBoxY, codeBoxW, codeBoxH, 4).lineWidth(1.5).stroke(PLUM);
    doc.fontSize(20).fillColor(PLUM_DARK).font("Helvetica-Bold")
      .text(data.voucher_code, codeBoxX, codeBoxY + 11, { align: "center", width: codeBoxW, characterSpacing: 2 });

    // QR code — bottom right corner
    const qrSize = 110;
    const qrX = width - bi - 20 - qrSize;
    const qrY = height - bi - 20 - qrSize - 18;
    doc.image(qrBuffer, qrX, qrY, { width: qrSize, height: qrSize });
    doc.fontSize(9).fillColor(TEXT).font("Helvetica")
      .text("Scan to redeem", qrX, qrY + qrSize + 5, { width: qrSize, align: "center" });

    // Footer info — centred across full page width
    const footerY = height - 102;
    if (data.valid_until) {
      doc.fontSize(11).fillColor(TEXT).font("Helvetica")
        .text(`Valid until: ${new Date(data.valid_until).toLocaleDateString("en-GB")}`, 0, footerY, { align: "center", width });
    }
    doc.fontSize(10).fillColor(TEXT)
      .text("Redeemable at Teller Berlin  ·  Pappelallee 29  ·  10437 Berlin", 0, footerY + 20, { align: "center", width });
    doc.fontSize(10).fillColor(TEXT)
      .text("hello@tellerberlin.com", 0, footerY + 37, { align: "center", width });

    // Bottom band
    doc.rect(0, height - 30, width, 30).fill(PLUM);
    doc.fontSize(8).fillColor(GOLD)
      .text("SEASONAL  ·  LEVANTINE-INSPIRED  ·  CUISINE", 0, height - 22, { align: "center", width, characterSpacing: 4 });

    doc.end();
  });
}
