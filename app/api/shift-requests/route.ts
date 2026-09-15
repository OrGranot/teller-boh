import { NextRequest, NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = await createAdminClient();

  const { data: member } = await admin
    .from("restaurant_members")
    .select("restaurant_id")
    .eq("profile_id", user.id)
    .single();
  if (!member) return NextResponse.json({ error: "Not a member" }, { status: 403 });

  const body = await req.json();
  const { shift_id, requested_in, requested_out, reason } = body;

  if (!requested_in || !requested_out) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  if (new Date(requested_out) <= new Date(requested_in)) {
    return NextResponse.json({ error: "Clock-out must be after clock-in" }, { status: 400 });
  }

  const { data, error } = await admin
    .from("shift_change_requests")
    .insert({
      profile_id: user.id,
      restaurant_id: member.restaurant_id,
      shift_id: shift_id || null,
      requested_in,
      requested_out,
      reason: reason?.trim() || "",
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = await createAdminClient();

  const { data: member } = await admin
    .from("restaurant_members")
    .select("restaurant_id, role:roles(is_owner, permissions)")
    .eq("profile_id", user.id)
    .single();
  if (!member) return NextResponse.json({ error: "Not a member" }, { status: 403 });

  const role = member.role as unknown as { is_owner: boolean; permissions: Record<string, boolean> } | null;
  const canViewAll = role?.is_owner || role?.permissions?.can_view_all_shifts;

  let query = admin
    .from("shift_change_requests")
    .select("*, profile:profiles!profile_id(name), shift:time_records!shift_id(clocked_in_at, clocked_out_at)")
    .eq("status", "pending")
    .order("created_at", { ascending: false });

  if (canViewAll) {
    query = query.eq("restaurant_id", member.restaurant_id);
  } else {
    query = query.eq("profile_id", user.id);
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
