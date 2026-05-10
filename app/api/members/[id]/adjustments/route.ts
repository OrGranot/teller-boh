import { NextRequest, NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";

// POST /api/members/[id]/adjustments — record an overtime payout
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: profileId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = await createAdminClient();
  const { data: caller } = await admin
    .from("restaurant_members")
    .select("restaurant_id, role:roles(is_owner)")
    .eq("profile_id", user.id)
    .single();

  const callerRole = caller?.role as unknown as { is_owner: boolean } | null;
  if (!caller || !callerRole?.is_owner) {
    return NextResponse.json({ error: "Only owners can record adjustments" }, { status: 403 });
  }

  const body = await req.json();
  const hours = Number(body.hours);
  if (!hours || hours <= 0) {
    return NextResponse.json({ error: "hours must be a positive number" }, { status: 400 });
  }
  const note            = typeof body.note === "string" ? body.note.trim() || null : null;
  const adjustment_date = typeof body.adjustment_date === "string"
    ? body.adjustment_date
    : new Date().toISOString().slice(0, 10);

  const { data, error } = await admin
    .from("hours_adjustments")
    .insert({
      profile_id:      profileId,
      restaurant_id:   caller.restaurant_id,
      hours,
      note,
      adjustment_date,
      created_by:      user.id,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}
