import { NextRequest, NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";

// POST /api/shifts — create a shift for any employee (owner / edit-permission only)
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = await createAdminClient();

  // Verify caller has permission
  const { data: caller } = await admin
    .from("restaurant_members")
    .select("restaurant_id, role:roles(is_owner, permissions)")
    .eq("profile_id", user.id)
    .single();

  const role = caller?.role as unknown as { is_owner: boolean; permissions: Record<string, boolean> } | null;
  if (!caller || (!role?.is_owner && !role?.permissions?.can_edit_shifts)) {
    return NextResponse.json({ error: "No permission" }, { status: 403 });
  }

  const body = await req.json();
  const { profile_id, clocked_in_at, clocked_out_at } = body;

  if (!profile_id || !clocked_in_at || !clocked_out_at) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const { data, error } = await admin
    .from("time_records")
    .insert({
      profile_id,
      restaurant_id:  caller.restaurant_id,
      clocked_in_at,
      clocked_out_at,
      status:         "approved",
      edited_by:      user.id,
    })
    .select()
    .single();

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json({ error: "A shift at this time already exists." }, { status: 409 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data, { status: 201 });
}
