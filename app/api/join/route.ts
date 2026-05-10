import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  const { token, password } = await req.json();

  if (!token) return NextResponse.json({ error: "Missing token" }, { status: 400 });
  if (!password || password.length < 6) return NextResponse.json({ error: "Password must be at least 6 characters" }, { status: 400 });

  const admin = await createAdminClient();

  // Validate invitation
  const { data: invitation } = await admin
    .from("invitations")
    .select("*")
    .eq("token", token)
    .single();

  if (!invitation) return NextResponse.json({ error: "Invalid invitation link" }, { status: 404 });
  if (invitation.status === "accepted")        return NextResponse.json({ error: "This invitation has already been used" }, { status: 410 });
  if (invitation.status === "cancelled")       return NextResponse.json({ error: "This invitation has been cancelled" }, { status: 410 });
  if (invitation.status === "pending_approval") return NextResponse.json({ error: "This invitation has not been approved yet" }, { status: 403 });
  if (invitation.expires_at && new Date(invitation.expires_at) < new Date()) {
    return NextResponse.json({ error: "This invitation has expired" }, { status: 410 });
  }

  const email = invitation.email as string;
  const placeholderProfileId: string | null = invitation.placeholder_profile_id ?? null;

  // Check if auth user already exists for this email.
  // listUsers only returns active (non-soft-deleted) users, so we also query
  // auth.users directly via RPC to catch soft-deleted rows that still lock the email.
  const { data: existingUsers } = await admin.auth.admin.listUsers({ perPage: 1000 });
  let existingUser = existingUsers?.users?.find(u => u.email?.toLowerCase() === email.toLowerCase());

  // Fallback: if not found in the active list, check auth.users directly (catches soft-deleted rows)
  if (!existingUser) {
    const { data: shadowId } = await admin.rpc("get_auth_user_id_by_email", { p_email: email });
    if (shadowId) {
      // The email is locked by a soft-deleted (or otherwise hidden) auth user.
      // Re-hydrate it: update password + email_confirm so the account becomes usable again.
      const { error: rehydrateErr } = await admin.auth.admin.updateUserById(shadowId as string, {
        password,
        email: email,          // restore canonical email in case it was scrambled
        email_confirm: true,
        user_metadata: { name: invitation.name },
      });
      if (rehydrateErr) return NextResponse.json({ error: rehydrateErr.message }, { status: 500 });
      existingUser = { id: shadowId as string, email } as typeof existingUser;
    }
  }

  let userId: string;

  if (existingUser) {
    // If this invitation is linked to a placeholder but the found existing user is ALREADY
    // a real (non-placeholder) member of the restaurant, abort — something went wrong when
    // the invite was set up (e.g. owner typed an existing member's email for the placeholder).
    if (placeholderProfileId && placeholderProfileId !== existingUser.id) {
      const { data: existingMembership } = await admin
        .from("restaurant_members")
        .select("id, profile:profiles(is_placeholder)")
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .eq("profile_id", existingUser.id)
        .eq("restaurant_id", invitation.restaurant_id)
        .maybeSingle();

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const prof = existingMembership?.profile as any;
      const isRealMember = existingMembership && !prof?.is_placeholder;

      if (isRealMember) {
        return NextResponse.json({
          error: "This email address belongs to an existing team member. Please contact your manager to fix the invitation.",
        }, { status: 409 });
      }
    }

    // Update password on existing account
    const { error: updateErr } = await admin.auth.admin.updateUserById(existingUser.id, {
      password,
      email_confirm: true,
    });
    if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 });
    userId = existingUser.id;
  } else {
    // Create new auth user with confirmed email.
    // For placeholder-linked invitations, pass the placeholder's UUID as the user ID —
    // this means all existing records (shifts, departments, contract) already reference
    // the correct profile_id and no data migration is needed.
    const { data: newUser, error: createErr } = await admin.auth.admin.createUser({
      ...(placeholderProfileId ? { id: placeholderProfileId } : {}),
      email,
      password,
      email_confirm: true,
      user_metadata: { name: invitation.name },
    });
    if (createErr || !newUser.user) {
      console.error("[join] createUser failed:", JSON.stringify(createErr));
      return NextResponse.json({ error: createErr?.message || "Failed to create account", detail: (createErr as Record<string, unknown>) }, { status: 500 });
    }
    userId = newUser.user.id;
  }

  // ── Placeholder profile: activate in-place ────────────────────
  // When the auth user was created with the placeholder's UUID (userId === placeholderProfileId),
  // all existing data already references the correct profile_id — just flip is_placeholder.
  // When userId differs (e.g. rehydrated a soft-deleted account with a different UUID),
  // fall back to the full migration path.
  if (placeholderProfileId) {
    if (placeholderProfileId === userId) {
      // ── Happy path: same UUID — no migration needed ──
      const { data: placeholderProfile } = await admin
        .from("profiles")
        .select("name")
        .eq("id", placeholderProfileId)
        .single();

      await admin.from("profiles").update({
        is_placeholder: false,
        name: placeholderProfile?.name || invitation.name || null,
      }).eq("id", placeholderProfileId);

      // restaurant_members row already exists and is correct — nothing to upsert

    } else {
      // ── Fallback: different UUID — migrate everything ────────────────────
      const { data: placeholderMember } = await admin
        .from("restaurant_members")
        .select("role_id, salary, hours_per_week, days_per_week, vacation_days_per_year, sick_days, contract_start, contract_end")
        .eq("profile_id", placeholderProfileId)
        .maybeSingle();

      // Migrate time_records
      await admin
        .from("time_records")
        .update({ profile_id: userId })
        .eq("profile_id", placeholderProfileId);

      // Migrate department_members
      await admin
        .from("department_members")
        .update({ profile_id: userId })
        .eq("profile_id", placeholderProfileId);

      // Grab placeholder profile name (to preserve it)
      const { data: placeholderProfile } = await admin
        .from("profiles")
        .select("name")
        .eq("id", placeholderProfileId)
        .single();

      // Delete placeholder restaurant_members row (we'll upsert the real one below)
      await admin
        .from("restaurant_members")
        .delete()
        .eq("profile_id", placeholderProfileId);

      // Delete placeholder profile
      await admin.from("profiles").delete().eq("id", placeholderProfileId);

      // Ensure real profile has the name from the placeholder (if not already set)
      const { data: existingProfile } = await admin
        .from("profiles")
        .select("name")
        .eq("id", userId)
        .maybeSingle();

      const nameToUse = placeholderProfile?.name || existingProfile?.name || invitation.name || null;
      await admin.from("profiles").upsert({
        id: userId,
        name: nameToUse,
        is_placeholder: false,
      });

      // Determine role — prefer placeholder's role, fall back to invitation role
      const resolvedRoleId = placeholderMember?.role_id || invitation.role_id || await getDefaultRoleId(admin, invitation.restaurant_id);
      if (!resolvedRoleId) return NextResponse.json({ error: "No role found for this restaurant" }, { status: 500 });

      // Upsert restaurant_members using the PLACEHOLDER's contract details
      await admin.from("restaurant_members").upsert({
        restaurant_id: invitation.restaurant_id,
        profile_id: userId,
        role_id: resolvedRoleId,
        salary: placeholderMember?.salary ?? null,
        hours_per_week: placeholderMember?.hours_per_week ?? null,
        days_per_week: placeholderMember?.days_per_week ?? null,
        vacation_days_per_year: placeholderMember?.vacation_days_per_year ?? null,
        sick_days: placeholderMember?.sick_days ?? null,
        contract_start: placeholderMember?.contract_start ?? null,
        contract_end: placeholderMember?.contract_end ?? null,
      }, { onConflict: "restaurant_id,profile_id" });
    }

  } else {
    // Non-placeholder path: ensure profile exists with name
    await admin.from("profiles").upsert({
      id: userId,
      name: invitation.name || null,
      is_placeholder: false,
    });

    const roleId = invitation.role_id || await getDefaultRoleId(admin, invitation.restaurant_id);
    if (!roleId) return NextResponse.json({ error: "No role found for this restaurant" }, { status: 500 });

    await admin.from("restaurant_members").upsert({
      restaurant_id: invitation.restaurant_id,
      profile_id: userId,
      role_id: roleId,
      salary: invitation.salary,
      hours_per_week: invitation.hours_per_week,
      contract_start: invitation.contract_start,
    }, { onConflict: "restaurant_id,profile_id" });

    // Add to department if specified
    if (invitation.department_id) {
      await admin.from("department_members").upsert({
        department_id: invitation.department_id,
        profile_id: userId,
        is_manager: false,
      }, { onConflict: "department_id,profile_id" });
    }
  }

  // Mark invitation accepted
  await admin.from("invitations").update({ status: "accepted" }).eq("id", invitation.id);

  return NextResponse.json({ ok: true, email });
}

async function getDefaultRoleId(admin: Awaited<ReturnType<typeof createAdminClient>>, restaurantId: string): Promise<string | null> {
  const { data: defaultRole } = await admin
    .from("roles")
    .select("id")
    .eq("restaurant_id", restaurantId)
    .eq("name", "Employee")
    .maybeSingle();
  if (defaultRole?.id) return defaultRole.id;

  const { data: anyRole } = await admin
    .from("roles")
    .select("id")
    .eq("restaurant_id", restaurantId)
    .limit(1)
    .single();
  return anyRole?.id || null;
}
