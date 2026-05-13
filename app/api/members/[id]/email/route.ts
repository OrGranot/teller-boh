import { NextRequest, NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { Resend } from "resend";
import { maybeAutoDeletePlaceholder } from "@/lib/auto-delete-placeholder";

const resend = new Resend(process.env.RESEND_API_KEY);

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = await createAdminClient();

  // Verify owner
  const { data: caller } = await admin
    .from("restaurant_members")
    .select("restaurant_id, role:roles(is_owner)")
    .eq("profile_id", user.id)
    .single();

  const callerRole = caller?.role as unknown as { is_owner: boolean } | null;
  if (!caller || !callerRole?.is_owner) {
    return NextResponse.json({ error: "Only owners can set member emails" }, { status: 403 });
  }

  const { email } = await req.json();
  if (!email?.trim()) return NextResponse.json({ error: "Email is required" }, { status: 400 });

  const normalizedEmail = email.trim().toLowerCase();

  // Check this email isn't already used by another member in this restaurant
  const { data: existingMembersWithEmail } = await admin
    .from("restaurant_members")
    .select("profile_id, profile:profiles(name)")
    .eq("restaurant_id", caller.restaurant_id)
    .neq("profile_id", id);

  const { data: existingAuthUsers } = await admin.auth.admin.listUsers({ perPage: 1000 });
  const conflictAuthUser = existingAuthUsers?.users?.find(
    u => u.email?.toLowerCase() === normalizedEmail && u.id !== id
  );
  if (conflictAuthUser) {
    // Check if this auth user is a member of this restaurant
    const isConflictMember = (existingMembersWithEmail || []).some(
      (m: { profile_id: string }) => m.profile_id === conflictAuthUser.id
    );
    if (isConflictMember) {
      return NextResponse.json({ error: "This email belongs to an existing team member." }, { status: 409 });
    }
  }

  // Check if the profile is a placeholder (no auth user yet)
  const { data: profile } = await admin
    .from("profiles")
    .select("name, is_placeholder")
    .eq("id", id)
    .single();

  const { data: restaurant } = await admin
    .from("restaurants")
    .select("name")
    .eq("id", caller.restaurant_id)
    .single();

  if (profile?.is_placeholder) {
    // For placeholder employees: create an invitation with placeholder_profile_id
    // so that when they join, their shift data gets migrated to their real account.

    // Check for existing pending invitation to this email
    const { data: existingInvite } = await admin
      .from("invitations")
      .select("id")
      .eq("restaurant_id", caller.restaurant_id)
      .eq("email", normalizedEmail)
      .in("status", ["pending_approval", "approved"])
      .maybeSingle();

    let inviteToken: string;

    if (existingInvite) {
      // Reuse the existing invitation
      const { data: inv } = await admin
        .from("invitations")
        .select("token")
        .eq("id", existingInvite.id)
        .single();
      inviteToken = inv!.token;

      // Update placeholder_profile_id in case it wasn't set
      await admin
        .from("invitations")
        .update({ placeholder_profile_id: id, expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString() })
        .eq("id", existingInvite.id);
    } else {
      // Create a fresh invitation
      inviteToken = crypto.randomUUID();
      const { error: invErr } = await admin.from("invitations").insert({
        restaurant_id: caller.restaurant_id,
        email: normalizedEmail,
        name: profile?.name || null,
        token: inviteToken,
        status: "approved",
        invited_by: user.id,
        placeholder_profile_id: id,
        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      });
      if (invErr) return NextResponse.json({ error: invErr.message }, { status: 500 });
    }

    // Send invitation email
    const origin = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    const joinUrl = `${origin}/join/${inviteToken}`;

    await resend.emails.send({
      from: "EasyBOH <hello@tellerberlin.com>",
      to: normalizedEmail,
      subject: `You've been invited to join ${restaurant?.name || "your restaurant"} on EasyBOH`,
      html: `
        <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px;">
          <h2 style="margin-bottom:8px;">Welcome to EasyBOH</h2>
          <p style="color:#6b7280;">
            Hi ${profile?.name || "there"},<br><br>
            Your manager has added you to <strong>${restaurant?.name || "the restaurant"}</strong> on EasyBOH.
            Click below to set your password and access your account, including your shifts history.
          </p>
          <a href="${joinUrl}"
            style="display:inline-block;margin-top:20px;background:#111827;color:white;
                   padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;">
            Set password &amp; join →
          </a>
          <p style="margin-top:24px;font-size:13px;color:#9ca3af;">
            This link expires in 7 days.
          </p>
        </div>
      `,
    });

    return NextResponse.json({ ok: true, emailSent: true, isPlaceholder: true });
  }

  // ── Non-placeholder: update the auth user email directly ──────
  const { error: updateErr } = await admin.auth.admin.updateUserById(id, {
    email: normalizedEmail,
    email_confirm: true,
  });
  if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 });

  // Generate a magic link so they can log in
  const origin = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email: normalizedEmail,
    options: { redirectTo: `${origin}/shifts` },
  });

  if (!linkErr && linkData) {
    await resend.emails.send({
      from: "EasyBOH <hello@tellerberlin.com>",
      to: normalizedEmail,
      subject: `You've been added to ${restaurant?.name || "your restaurant"} on EasyBOH`,
      html: `
        <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px;">
          <h2>Welcome to EasyBOH</h2>
          <p style="color:#6b7280;">
            Hi ${profile?.name || "there"},<br><br>
            Your manager has added you to <strong>${restaurant?.name || "the restaurant"}</strong> on EasyBOH.
            Click below to access your account and view your shifts.
          </p>
          <a href="${linkData.properties?.action_link}"
            style="display:inline-block;margin-top:20px;background:#111827;color:white;
                   padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;">
            Access my account →
          </a>
          <p style="margin-top:24px;font-size:13px;color:#9ca3af;">
            This link expires in 24 hours.
          </p>
        </div>
      `,
    });
  }

  return NextResponse.json({ ok: true, emailSent: !linkErr });
}

// ── DELETE /api/members/[id]/email ────────────────────────────────────────────
// Unlinks a real employee from their auth account:
//   • Deletes the Supabase auth user (all sessions invalidated immediately)
//   • Marks the profile as is_placeholder = true
//   • Cancels any open (non-accepted) invitations so a fresh invite can be sent
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
    return NextResponse.json({ error: "Only owners can unlink employee accounts" }, { status: 403 });
  }

  // Can't unlink yourself
  if (id === user.id) {
    return NextResponse.json({ error: "You cannot unlink your own account" }, { status: 400 });
  }

  const { data: authUser } = await admin.auth.admin.getUserById(id);

  if (authUser?.user) {
    // ── Case 1: real auth account exists ────────────────────────────────────
    // Supabase soft-deletes auth users, so deleting directly keeps the email
    // locked and re-inviting would fail with "Database error creating new user".
    // Workaround: scramble the email first so the soft-delete tombstone carries
    // the junk address, not the real one.
    const realEmail = authUser.user.email ?? null;
    const junkEmail = `unlinked_${id}@placeholder.internal`;
    // Scramble email first so the soft-deleted tombstone carries the junk address
    await admin.auth.admin.updateUserById(id, { email: junkEmail, email_confirm: true });
    // Also nuke the identity row for the real email — Supabase keeps auth.identities
    // separate from auth.users and it's what actually locks the email on re-invite.
    await admin.rpc("delete_auth_identity_by_email", { p_email: realEmail });
    const { error: deleteErr } = await admin.auth.admin.deleteUser(id);
    if (deleteErr) return NextResponse.json({ error: deleteErr.message }, { status: 500 });

    // Mark profile as placeholder
    await admin.from("profiles").update({ is_placeholder: true }).eq("id", id);

    // Cancel open invitations for this email so a fresh invite can be sent
    if (realEmail) {
      await admin
        .from("invitations")
        .update({ status: "cancelled" })
        .eq("restaurant_id", caller.restaurant_id)
        .eq("email", realEmail)
        .not("status", "eq", "accepted");
    }
  } else {
    // ── Case 2: no auth account — just a pending invitation ─────────────────
    const { error: cancelErr } = await admin
      .from("invitations")
      .update({ status: "cancelled", expires_at: new Date().toISOString() })
      .eq("restaurant_id", caller.restaurant_id)
      .eq("placeholder_profile_id", id)
      .not("status", "eq", "accepted");

    if (cancelErr) return NextResponse.json({ error: cancelErr.message }, { status: 500 });
  }

  // After unlinking the email the profile is now a placeholder.
  // If they also have no shifts, auto-delete them.
  const deleted = await maybeAutoDeletePlaceholder(admin, id, caller.restaurant_id);

  return NextResponse.json({ ok: true, deleted });
}
