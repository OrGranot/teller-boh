import { NextRequest, NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
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
  const callerRole = caller?.role as unknown as { is_owner: boolean } | null;
  if (!caller || !callerRole?.is_owner) {
    return NextResponse.json({ error: "Only owners can delete employees" }, { status: 403 });
  }

  // Verify target is a placeholder (no real auth account)
  const { data: profile } = await admin
    .from("profiles")
    .select("is_placeholder")
    .eq("id", id)
    .single();
  if (!profile?.is_placeholder) {
    return NextResponse.json({ error: "Only placeholder (no-account) employees can be deleted this way" }, { status: 400 });
  }

  // Check for shifts
  const { count: shiftCount } = await admin
    .from("time_records")
    .select("id", { count: "exact", head: true })
    .eq("profile_id", id);
  if ((shiftCount ?? 0) > 0) {
    return NextResponse.json(
      { error: `This employee still has ${shiftCount} shift record(s). Delete their shifts first.` },
      { status: 400 }
    );
  }

  // Delete all related records
  await admin.from("department_members").delete().eq("profile_id", id);
  await admin.from("member_contracts").delete().eq("profile_id", id);
  await admin.from("hours_adjustments").delete().eq("profile_id", id);
  await admin.from("restaurant_members")
    .delete()
    .eq("profile_id", id)
    .eq("restaurant_id", caller.restaurant_id);
  await admin.from("profiles").delete().eq("id", id);

  return NextResponse.json({ ok: true });
}
