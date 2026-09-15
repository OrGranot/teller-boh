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
    .select("restaurant_id, role:roles(is_owner, permissions)")
    .eq("profile_id", user.id)
    .single();
  const role = caller?.role as unknown as { is_owner: boolean; permissions: Record<string, boolean> } | null;
  if (!caller || (!role?.is_owner && !role?.permissions?.can_edit_shifts)) {
    return NextResponse.json({ error: "No permission" }, { status: 403 });
  }

  const body = await req.json();
  const { action } = body as { action: "approve" | "reject" };
  if (!action || !["approve", "reject"].includes(action)) {
    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  }

  const { data: request, error: fetchErr } = await admin
    .from("shift_change_requests")
    .select("*")
    .eq("id", id)
    .eq("restaurant_id", caller.restaurant_id)
    .single();
  if (fetchErr || !request) {
    return NextResponse.json({ error: "Request not found" }, { status: 404 });
  }
  if (request.status !== "pending") {
    return NextResponse.json({ error: "Already reviewed" }, { status: 409 });
  }

  if (action === "reject") {
    await admin
      .from("shift_change_requests")
      .update({ status: "rejected", reviewed_by: user.id, reviewed_at: new Date().toISOString() })
      .eq("id", id);
    return NextResponse.json({ ok: true });
  }

  // Approve: update or create the shift
  if (request.shift_id) {
    const { error } = await admin
      .from("time_records")
      .update({
        clocked_in_at: request.requested_in,
        clocked_out_at: request.requested_out,
        status: "approved",
        approved_by: user.id,
        approved_at: new Date().toISOString(),
        edited_by: user.id,
      })
      .eq("id", request.shift_id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  } else {
    const { error } = await admin
      .from("time_records")
      .insert({
        profile_id: request.profile_id,
        restaurant_id: request.restaurant_id,
        clocked_in_at: request.requested_in,
        clocked_out_at: request.requested_out,
        status: "approved",
        approved_by: user.id,
        approved_at: new Date().toISOString(),
        edited_by: user.id,
      });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await admin
    .from("shift_change_requests")
    .update({ status: "approved", reviewed_by: user.id, reviewed_at: new Date().toISOString() })
    .eq("id", id);

  return NextResponse.json({ ok: true });
}
