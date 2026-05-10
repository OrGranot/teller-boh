import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getNextInvoiceNumber } from "@/lib/invoice-counter";

export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: member } = await supabase
    .from("restaurant_members")
    .select("restaurant_id")
    .eq("profile_id", user.id)
    .single();
  if (!member) return NextResponse.json({ error: "No restaurant" }, { status: 403 });

  const number = await getNextInvoiceNumber(supabase, member.restaurant_id);
  return NextResponse.json({ number });
}
