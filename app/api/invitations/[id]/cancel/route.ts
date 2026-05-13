import { NextRequest, NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = await createAdminClient();

  // Verify caller is owner of the relevant restaurant
  const { data: caller } = await admin
    .from("restaurant_members")
    .select("restaurant_id, role:roles(is_owner)")
    .eq("profile_id", user.id)
    .single();
  const callerRole = caller?.role as unknown as { is_owner: boolean } | null;
  if (!caller || !callerRole?.is_owner) {
    return NextResponse.json({ error: "Only owners can cancel invitations" }, { status: 403 });
  }

  // Load the invitation
  const { data: inv } = await admin
    .from("invitations")
    .select("id, status, email, placeholder_profile_id, restaurant_id")
    .eq("id", id)
    .eq("restaurant_id", caller.restaurant_id)
    .single();

  if (!inv) return NextResponse.json({ error: "Invitation not found" }, { status: 404 });
  if (inv.status === "accepted") {
    return NextResponse.json({ error: "Cannot cancel an accepted invitation" }, { status: 400 });
  }

  // Mark invitation cancelled
  await admin.from("invitations").update({ status: "cancelled" }).eq("id", id);

  // Handle placeholder cleanup
  if (inv.placeholder_profile_id) {
    const placeholderId = inv.placeholder_profile_id as string;

    // Check if it's still a placeholder
    const { data: profile } = await admin
      .from("profiles")
      .select("is_placeholder")
      .eq("id", placeholderId)
      .single();

    if (profile?.is_placeholder) {
      // Check if they have any shifts
      const { count: shiftCount } = await admin
        .from("time_records")
        .select("id", { count: "exact", head: true })
        .eq("profile_id", placeholderId);

      if ((shiftCount ?? 0) === 0) {
        // No shifts — safe to auto-delete the placeholder
        await admin.from("restaurant_members").delete().eq("profile_id", placeholderId);
        await admin.from("profiles").delete().eq("id", placeholderId);
      }
      // If they have shifts, keep the placeholder — just the invite is cancelled
    }
  }

  return NextResponse.json({ ok: true });
}
