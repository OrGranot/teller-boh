import { NextRequest, NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { sendInvitationEmail } from "@/app/api/invite/route";

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { profileId } = await req.json();
  if (!profileId) return NextResponse.json({ error: "profileId is required" }, { status: 400 });

  const admin = await createAdminClient();

  // Verify caller is owner
  const { data: caller } = await admin
    .from("restaurant_members")
    .select("restaurant_id, role:roles(is_owner)")
    .eq("profile_id", user.id)
    .single();

  const callerRole = caller?.role as { is_owner: boolean } | null;
  if (!caller || !callerRole?.is_owner) {
    return NextResponse.json({ error: "Only owners can re-invite members" }, { status: 403 });
  }

  // Get target member's email from auth.users
  const { data: authUser } = await admin.auth.admin.getUserById(profileId);
  const email = authUser?.user?.email;
  if (!email) return NextResponse.json({ error: "User email not found" }, { status: 404 });

  // Find their most recent invitation in this restaurant
  const { data: inv } = await admin
    .from("invitations")
    .select("*")
    .eq("restaurant_id", caller.restaurant_id)
    .eq("email", email)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!inv) return NextResponse.json({ error: "No invitation found for this user" }, { status: 404 });

  // Resend the email with the existing token (no data changes)
  await sendInvitationEmail(inv, caller.restaurant_id, admin);
  await admin.from("invitations").update({ status: "sent" }).eq("id", inv.id);

  return NextResponse.json({ ok: true });
}
