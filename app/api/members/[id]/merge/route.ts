import { NextRequest, NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: placeholderId } = await params;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = await createAdminClient();

  // Verify caller is owner
  const { data: caller } = await admin
    .from("restaurant_members")
    .select("restaurant_id, role:roles(is_owner)")
    .eq("profile_id", user.id)
    .single();

  const callerRole = caller?.role as { is_owner: boolean } | null;
  if (!caller || !callerRole?.is_owner) {
    return NextResponse.json({ error: "Only owners can merge records" }, { status: 403 });
  }

  const { targetProfileId } = await req.json();
  if (!targetProfileId) return NextResponse.json({ error: "targetProfileId is required" }, { status: 400 });
  if (targetProfileId === placeholderId) return NextResponse.json({ error: "Cannot merge a record into itself" }, { status: 400 });

  // Confirm the source is a placeholder in this restaurant
  const { data: placeholder } = await admin
    .from("profiles")
    .select("id, name, is_placeholder")
    .eq("id", placeholderId)
    .single();

  if (!placeholder?.is_placeholder) {
    return NextResponse.json({ error: "Source profile is not an imported placeholder" }, { status: 400 });
  }

  // Confirm the target is a real member of the same restaurant
  const { data: targetMember } = await admin
    .from("restaurant_members")
    .select("profile_id")
    .eq("profile_id", targetProfileId)
    .eq("restaurant_id", caller.restaurant_id)
    .single();

  if (!targetMember) {
    return NextResponse.json({ error: "Target employee not found in this restaurant" }, { status: 404 });
  }

  // Migrate time_records — skip any that would duplicate an existing shift on the target
  // Fetch target's existing clock-in times
  const { data: targetShifts } = await admin
    .from("time_records")
    .select("clocked_in_at")
    .eq("profile_id", targetProfileId);

  const targetClockIns = new Set((targetShifts || []).map(s => s.clocked_in_at));

  const { data: placeholderShifts } = await admin
    .from("time_records")
    .select("id, clocked_in_at")
    .eq("profile_id", placeholderId);

  const toMigrate = (placeholderShifts || []).filter(s => !targetClockIns.has(s.clocked_in_at));
  const toDrop    = (placeholderShifts || []).filter(s =>  targetClockIns.has(s.clocked_in_at));

  if (toMigrate.length > 0) {
    const { error: trErr } = await admin
      .from("time_records")
      .update({ profile_id: targetProfileId })
      .in("id", toMigrate.map(s => s.id));
    if (trErr) return NextResponse.json({ error: trErr.message }, { status: 500 });
  }

  // Drop duplicate placeholder shifts (target already has these)
  if (toDrop.length > 0) {
    await admin.from("time_records").delete().in("id", toDrop.map(s => s.id));
  }

  // Migrate department_members (skip conflicts — target may already be in that dept)
  const { data: placeholderDepts } = await admin
    .from("department_members")
    .select("department_id, is_manager")
    .eq("profile_id", placeholderId);

  for (const dm of placeholderDepts || []) {
    await admin.from("department_members").upsert(
      { department_id: dm.department_id, profile_id: targetProfileId, is_manager: dm.is_manager },
      { onConflict: "department_id,profile_id" }
    );
  }

  // Delete placeholder's restaurant_members row
  await admin
    .from("restaurant_members")
    .delete()
    .eq("profile_id", placeholderId);

  // Delete placeholder profile
  await admin.from("profiles").delete().eq("id", placeholderId);

  // Also cancel any pending invitations linked to this placeholder
  await admin
    .from("invitations")
    .update({ status: "cancelled" })
    .eq("placeholder_profile_id", placeholderId)
    .in("status", ["approved", "pending_approval"]);

  return NextResponse.json({ ok: true, targetProfileId });
}
