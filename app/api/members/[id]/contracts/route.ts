import { NextRequest, NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { isoMinusOneDay } from "@/lib/hours-balance";

async function getOwnerContext(userId: string, admin: Awaited<ReturnType<typeof createAdminClient>>) {
  const { data: caller } = await admin
    .from("restaurant_members")
    .select("restaurant_id, role:roles(is_owner)")
    .eq("profile_id", userId)
    .single();
  const callerRole = caller?.role as { is_owner: boolean } | null;
  if (!caller || !callerRole?.is_owner) return null;
  return caller as { restaurant_id: string };
}

// GET /api/members/[id]/contracts
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await supabase
    .from("member_contracts")
    .select("id, valid_from, valid_until, hours_per_week, days_per_week, vacation_days_per_year, salary, sick_days, created_at")
    .eq("profile_id", id)
    .order("valid_from", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

// POST /api/members/[id]/contracts
// Inserts a new contract at ANY point in the timeline — past, present, or future.
// - Finds the neighbouring contracts (prev = last one before valid_from, next = first one after)
// - Sets new contract's valid_until = next.valid_from - 1 (or null if it becomes the latest)
// - Updates prev contract's valid_until = valid_from - 1
// - Syncs restaurant_members only when the new contract becomes the latest one
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = await createAdminClient();
  const caller = await getOwnerContext(user.id, admin);
  if (!caller) return NextResponse.json({ error: "Only owners can manage contracts" }, { status: 403 });

  const body = await req.json();
  const { valid_from, hours_per_week, days_per_week, vacation_days_per_year, salary, sick_days } = body;

  if (!valid_from) return NextResponse.json({ error: "valid_from is required" }, { status: 400 });

  // Load all existing contracts sorted oldest-first
  const { data: allContracts } = await admin
    .from("member_contracts")
    .select("id, valid_from, valid_until, hours_per_week, days_per_week, vacation_days_per_year, salary, sick_days")
    .eq("profile_id", id)
    .eq("restaurant_id", caller.restaurant_id)
    .order("valid_from", { ascending: true });

  const sorted = allContracts ?? [];

  // Can't start on the same date as an existing contract
  if (sorted.some(c => c.valid_from === valid_from)) {
    return NextResponse.json(
      { error: "A contract already starts on this date" },
      { status: 400 }
    );
  }

  // Find neighbours
  const prevContract = [...sorted].filter(c => c.valid_from < valid_from).pop() ?? null;
  const nextContract = sorted.find(c => c.valid_from > valid_from) ?? null;

  // New contract ends the day before the next one starts (or null = becomes the latest)
  const newValidUntil = nextContract ? isoMinusOneDay(nextContract.valid_from) : null;

  // Update previous contract's end date
  if (prevContract) {
    const { error: prevErr } = await admin
      .from("member_contracts")
      .update({ valid_until: isoMinusOneDay(valid_from) })
      .eq("id", prevContract.id);
    if (prevErr) return NextResponse.json({ error: prevErr.message }, { status: 500 });
  }

  // Insert the new contract
  const { data: newContract, error: insertErr } = await admin
    .from("member_contracts")
    .insert({
      profile_id:             id,
      restaurant_id:          caller.restaurant_id,
      valid_from,
      valid_until:            newValidUntil,
      hours_per_week:         hours_per_week          ?? null,
      days_per_week:          days_per_week           ?? null,
      vacation_days_per_year: vacation_days_per_year  ?? null,
      salary:                 salary                  ?? null,
      sick_days:              sick_days               ?? 0,
    })
    .select()
    .single();

  if (insertErr) return NextResponse.json({ error: insertErr.message }, { status: 500 });

  // Sync restaurant_members only when this becomes the new latest contract
  if (newValidUntil === null) {
    const rmUpdate: Record<string, unknown> = {};
    if (hours_per_week          != null) rmUpdate.hours_per_week          = hours_per_week;
    if (days_per_week           != null) rmUpdate.days_per_week           = days_per_week;
    if (vacation_days_per_year  != null) rmUpdate.vacation_days_per_year  = vacation_days_per_year;
    if (salary                  != null) rmUpdate.salary                  = salary;
    if (sick_days               != null) rmUpdate.sick_days               = sick_days;
    if (Object.keys(rmUpdate).length > 0) {
      await admin
        .from("restaurant_members")
        .update(rmUpdate)
        .eq("profile_id", id)
        .eq("restaurant_id", caller.restaurant_id);
    }
  }

  return NextResponse.json(newContract, { status: 201 });
}
