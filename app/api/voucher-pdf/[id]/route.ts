import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { generateVoucherPDF } from "@/lib/voucher-pdf";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: member } = await supabase
    .from("restaurant_members")
    .select("restaurant_id")
    .eq("profile_id", user.id)
    .single();
  if (!member) return NextResponse.json({ error: "No restaurant" }, { status: 403 });

  const { id } = await params;

  const { data: voucher, error } = await supabase
    .from("vouchers")
    .select("voucher_code, amount, buyer_name, recipient_name, recipient_email, personal_message, valid_until, purchased_at")
    .eq("id", id)
    .eq("restaurant_id", member.restaurant_id)
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
