import { NextRequest, NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { email, name, departmentId, roleId, salary, hoursPerWeek, contractStart } = body;

  if (!email) return NextResponse.json({ error: "Email is required" }, { status: 400 });

  const admin = await createAdminClient();

  const { data: me } = await admin
    .from("restaurant_members")
    .select("restaurant_id, role:roles(is_owner, permissions)")
    .eq("profile_id", user.id)
    .single();

  if (!me) return NextResponse.json({ error: "Not a restaurant member" }, { status: 403 });

  const role = me.role as unknown as { is_owner: boolean; permissions: Record<string, boolean> };
  const canInvite = role.is_owner || role.permissions?.can_invite;
  if (!canInvite) return NextResponse.json({ error: "No permission to invite" }, { status: 403 });

  // Block if there is already an active (non-expired) invitation for this email
  const now = new Date().toISOString();
  const { data: activeInv } = await admin
    .from("invitations")
    .select("id, status")
    .eq("restaurant_id", me.restaurant_id)
    .eq("email", email.toLowerCase())
    .in("status", ["sent", "approved", "pending_approval"])
    .gt("expires_at", now)
    .maybeSingle();

  if (activeInv) {
    return NextResponse.json(
      { error: "An active invitation for this email already exists. Wait for it to expire before sending a new one." },
      { status: 409 }
    );
  }

  // Block if this email already belongs to an existing team member
  const { data: existingUsers } = await admin.auth.admin.listUsers({ perPage: 1000 });
  const existingUser = existingUsers?.users?.find(u => u.email?.toLowerCase() === email.toLowerCase());
  if (existingUser) {
    const { data: existingMember } = await admin
      .from("restaurant_members")
      .select("id")
      .eq("profile_id", existingUser.id)
      .eq("restaurant_id", me.restaurant_id)
      .maybeSingle();
    if (existingMember) {
      return NextResponse.json(
        { error: "This person is already a member of your restaurant." },
        { status: 409 }
      );
    }
  }

  const autoApprove = role.is_owner || role.permissions?.can_approve_invitations;
  const status = autoApprove ? "approved" : "pending_approval";

  // Create invitation record
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

  const { data: invitation, error: invErr } = await admin
    .from("invitations")
    .insert({
      restaurant_id: me.restaurant_id,
      invited_by: user.id,
      email: email.toLowerCase(),
      name: name || null,
      department_id: departmentId || null,
      role_id: roleId || null,
      salary: salary || null,
      hours_per_week: hoursPerWeek || null,
      contract_start: contractStart || null,
      status,
      expires_at: expiresAt,
    })
    .select()
    .single();

  if (invErr || !invitation) {
    return NextResponse.json({ error: invErr?.message }, { status: 500 });
  }

  // If auto-approved, send email immediately
  if (autoApprove) {
    const origin = new URL(req.url).origin;
    await sendInvitationEmail(invitation, me.restaurant_id, admin, origin);
    await admin.from("invitations").update({ status: "sent" }).eq("id", invitation.id);
  }

  return NextResponse.json({ invitationId: invitation.id, status });
}

export async function sendInvitationEmail(
  invitation: { token: string; email: string; name: string | null },
  restaurantId: string,
  admin: Awaited<ReturnType<typeof createAdminClient>>,
  origin: string,
) {
  const { data: restaurant } = await admin
    .from("restaurants")
    .select("name")
    .eq("id", restaurantId)
    .single();

  const joinUrl = `${origin}/join/${invitation.token}`;
  const restaurantName = restaurant?.name || "your restaurant";

  await resend.emails.send({
    from: "EasyBOH <hello@tellerberlin.com>",
    to: invitation.email,
    subject: `You've been invited to join ${restaurantName} on EasyBOH`,
    html: `
      <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; padding: 32px;">
        <h2 style="margin-bottom: 8px;">You're invited! 🎉</h2>
        <p style="color: #6b7280;">
          ${invitation.name ? `Hi ${invitation.name},` : "Hi,"}<br><br>
          You've been invited to join <strong>${restaurantName}</strong> on EasyBOH —
          a restaurant management app where you can track your shifts and working hours.
        </p>
        <a href="${joinUrl}"
          style="display: inline-block; margin-top: 20px; background: #4f46e5; color: white;
                 padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600;">
          Accept invitation →
        </a>
        <p style="margin-top: 24px; font-size: 13px; color: #9ca3af;">
          This link expires in 7 days. If you didn't expect this invitation, you can ignore this email.
        </p>
      </div>
    `,
  });
}
