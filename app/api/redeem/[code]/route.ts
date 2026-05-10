import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";

const serviceSupabase = createServiceClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function getAuthenticatedActiveUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: member } = await supabase
    .from("restaurant_members")
    .select("contract_end, restaurant_id")
    .eq("profile_id", user.id)
    .limit(1)
    .single();

  if (!member) return null;

  const today = new Date().toISOString().slice(0, 10);
  if (member.contract_end && member.contract_end <= today) return null;

  return { user, member };
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  const auth = await getAuthenticatedActiveUser();
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { code } = await params;
  const { data, error } = await serviceSupabase
    .from("vouchers")
    .select(
      "id, voucher_code, amount, buyer_name, recipient_name, notes, status, valid_until, purchased_at, redeemed_at"
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
  const auth = await getAuthenticatedActiveUser();
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { code } = await params;
  const { data: voucher } = await serviceSupabase
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

  await serviceSupabase
    .from("vouchers")
    .update({
      status: "redeemed",
      redeemed_at: new Date().toISOString(),
    })
    .eq("id", voucher.id);

  return NextResponse.json({ success: true });
}
