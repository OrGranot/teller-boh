import { NextRequest, NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { sendInvitationEmail } from "@/app/api/invite/route";

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { invitationId } = await req.json();
  const admin = await createAdminClient();

  const { data: invitation } = await admin
    .from("invitations")
    .select("*")
    .eq("id", invitationId)
    .single();

  if (!invitation) return NextResponse.json({ error: "Invitation not found" }, { status: 404 });

  const { data: me } = await admin
    .from("restaurant_members")
    .select("role:roles(is_owner, permissions)")
    .eq("profile_id", user.id)
    .eq("restaurant_id", invitation.restaurant_id)
    .single();

  if (!me) return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  const role = me.role as { is_owner: boolean; permissions: Record<string, boolean> };
  if (!role.is_owner && !role.permissions?.can_approve_invitations) {
    return NextResponse.json({ error: "No permission" }, { status: 403 });
  }

  await sendInvitationEmail(invitation, invitation.restaurant_id, admin);
  await admin.from("invitations").update({ status: "sent" }).eq("id", invitationId);

  return NextResponse.json({ ok: true });
}
