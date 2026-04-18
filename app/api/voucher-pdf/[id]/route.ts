import { NextRequest, NextResponse } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
// eslint-disable-next-line @typescript-eslint/no-require-imports
const React = require("react");
import { createClient } from "@/lib/supabase/server";
import VoucherPDF from "@/components/VoucherPDF";

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

  const { data: company } = await supabase
    .from("company_settings")
    .select("name")
    .limit(1)
    .single();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pdfBuffer = await renderToBuffer(
    React.createElement(VoucherPDF, {
      voucher,
      companyName: company?.name ?? "Teller",
    }) as any
  );

  const filename = `Voucher_${voucher.voucher_code}.pdf`;

  return new NextResponse(new Uint8Array(pdfBuffer), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
