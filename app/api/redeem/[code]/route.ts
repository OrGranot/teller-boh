import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// Public route — uses service role to look up vouchers by code.
// No user auth required (this is called from the public redeem page).
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  const { code } = await params;
  const { data, error } = await supabase
    .from("vouchers")
    .select(
      "id, voucher_code, amount, buyer_name, recipient_name, status, valid_until, purchased_at, redeemed_at"
    )
    .ilike("voucher_code", code)
    .single();

  if (error || !data) {
    return NextResponse.json({ error: "Voucher not found" }, { status: 404 });
  }

  return NextResponse.json(data);
}

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  const { code } = await params;
  const { data: voucher } = await supabase
    .from("vouchers")
    .select("id, status")
    .ilike("voucher_code", code)
    .single();

  if (!voucher) {
    return NextResponse.json({ error: "Voucher not found" }, { status: 404 });
  }

  if (voucher.status !== "active") {
    return NextResponse.json(
      { error: `Voucher is ${voucher.status}` },
      { status: 400 }
    );
  }

  await supabase
    .from("vouchers")
    .update({
      status: "redeemed",
      redeemed_at: new Date().toISOString(),
    })
    .eq("id", voucher.id);

  return NextResponse.json({ success: true });
}
