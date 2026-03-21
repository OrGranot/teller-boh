import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function POST(req: NextRequest) {
  const auth = req.headers.get("authorization") || "";
  const secret = process.env.INVOICE_WEBHOOK_SECRET;
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const {
      voucher_code,
      amount,
      buyer_name,
      buyer_email,
      recipient_name,
      recipient_email,
      personal_message,
      stripe_session_id,
      valid_until,
    } = body;

    if (!voucher_code || !amount) {
      return NextResponse.json({ error: "Missing voucher_code or amount" }, { status: 400 });
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const { error } = await supabase.from("vouchers").upsert({
      voucher_code,
      amount,
      buyer_name,
      buyer_email,
      recipient_name,
      recipient_email,
      personal_message,
      stripe_session_id,
      valid_until: valid_until || null,
      status: "active",
    }, { onConflict: "voucher_code" });

    if (error) {
      console.error("Voucher save error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, voucher_code });
  } catch (err) {
    console.error("Voucher webhook error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
