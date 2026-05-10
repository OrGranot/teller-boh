import { NextRequest, NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";

// DELETE /api/members/[id]/adjustments/[adjId]
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; adjId: string }> }
) {
  const { adjId } = await params;
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
    return NextResponse.json({ error: "Only owners can delete adjustments" }, { status: 403 });
  }

  const { error } = await admin
    .from("hours_adjustments")
    .delete()
    .eq("id", adjId)
    .eq("restaurant_id", caller.restaurant_id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
