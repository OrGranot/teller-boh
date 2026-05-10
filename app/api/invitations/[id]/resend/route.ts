import { NextRequest, NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { sendInvitationEmail } from "@/app/api/invite/route";

export async function POST(
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
  const callerRole = caller?.role as { is_owner: boolean } | null;
  if (!caller || !callerRole?.is_owner) {
    return NextResponse.json({ error: "Only owners can re-invite" }, { status: 403 });
  }

  // Load the original expired invitation
  const { data: original } = await admin
    .from("invitations")
    .select("*")
    .eq("id", id)
    .eq("restaurant_id", caller.restaurant_id)
    .single();

  if (!original) return NextResponse.json({ error: "Invitation not found" }, { status: 404 });

  // Must actually be expired
  if (!original.expires_at || new Date(original.expires_at) >= new Date()) {
    return NextResponse.json({ error: "Invitation has not expired yet" }, { status: 400 });
  }

  // Block if the email is already a registered member
  const { data: existingUsers } = await admin.auth.admin.listUsers({ perPage: 1000 });
  const existingUser = existingUsers?.users?.find(
    u => u.email?.toLowerCase() === original.email.toLowerCase()
  );
  if (existingUser) {
    const { data: existingMember } = await admin
      .from("restaurant_members")
      .select("id")
      .eq("profile_id", existingUser.id)
      .eq("restaurant_id", caller.restaurant_id)
      .maybeSingle();
    if (existingMember) {
      return NextResponse.json(
        { error: "This person already has an account and is a team member." },
        { status: 409 }
      );
    }
  }

  // Create a fresh invitation with the same details and a new 7-day window
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  const { data: newInv, error: insertErr } = await admin
    .from("invitations")
    .insert({
      restaurant_id: original.restaurant_id,
      invited_by: user.id,
      email: original.email,
      name: original.name,
      department_id: original.department_id,
      role_id: original.role_id,
      salary: original.salary,
      hours_per_week: original.hours_per_week,
      contract_start: original.contract_start,
      status: "sent",
      expires_at: expiresAt,
    })
    .select()
    .single();

  if (insertErr || !newInv) {
    return NextResponse.json({ error: insertErr?.message || "Failed to create invitation" }, { status: 500 });
  }

  await sendInvitationEmail(newInv, caller.restaurant_id, admin);

  return NextResponse.json({ ok: true });
}
