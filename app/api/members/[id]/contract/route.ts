import { NextRequest, NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = await createAdminClient();

  const { data: caller } = await admin
    .from("restaurant_members")
    .select("restaurant_id, role:roles(is_owner)")
    .eq("profile_id", user.id)
    .single();

  const callerRole = caller?.role as { is_owner: boolean } | null;
  if (!caller || !callerRole?.is_owner) {
    return NextResponse.json({ error: "Only owners can edit contract details" }, { status: 403 });
  }

  const body = await req.json();
  const update: Record<string, number | null> = {};
  if (typeof body.hours_per_week === "number" || body.hours_per_week === null) update.hours_per_week = body.hours_per_week;
  if (typeof body.days_per_week === "number" || body.days_per_week === null) update.days_per_week = body.days_per_week;
  if (typeof body.salary === "number" || body.salary === null) update.salary = body.salary;
  if (typeof body.contract_start === "string" || body.contract_start === null) update.contract_start = body.contract_start;
  if (typeof body.contract_end === "string" || body.contract_end === null) update.contract_end = body.contract_end;
  if (typeof body.vacation_days_per_year === "number" || body.vacation_days_per_year === null) update.vacation_days_per_year = body.vacation_days_per_year;

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  const { error } = await admin
    .from("restaurant_members")
    .update(update)
    .eq("profile_id", id)
    .eq("restaurant_id", caller.restaurant_id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
