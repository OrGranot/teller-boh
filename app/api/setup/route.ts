import { NextRequest, NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  const { restaurantName, name } = await req.json();
  if (!restaurantName?.trim()) {
    return NextResponse.json({ error: "Restaurant name is required" }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = await createAdminClient();

  // Check user doesn't already have a restaurant
  const { data: existing } = await admin
    .from("restaurant_members")
    .select("id")
    .eq("profile_id", user.id)
    .limit(1)
    .single();

  if (existing) {
    return NextResponse.json({ error: "Already linked to a restaurant" }, { status: 400 });
  }

  // Create restaurant
  const { data: restaurant, error: rErr } = await admin
    .from("restaurants")
    .insert({ name: restaurantName.trim() })
    .select()
    .single();

  if (rErr || !restaurant) {
    return NextResponse.json({ error: rErr?.message }, { status: 500 });
  }

  // Create owner role with all permissions
  const ownerPermissions = {
    can_invite: true,
    can_approve_invitations: true,
    can_approve_shifts: true,
    can_edit_shifts: true,
    can_view_all_shifts: true,
    can_manage_departments: true,
    can_manage_roles: true,
  };

  const { data: ownerRole, error: roleErr } = await admin
    .from("roles")
    .insert({
      restaurant_id: restaurant.id,
      name: "Owner",
      is_owner: true,
      permissions: ownerPermissions,
    })
    .select()
    .single();

  if (roleErr || !ownerRole) {
    return NextResponse.json({ error: roleErr?.message }, { status: 500 });
  }

  // Create a default Employee role
  await admin.from("roles").insert({
    restaurant_id: restaurant.id,
    name: "Employee",
    is_owner: false,
    permissions: {},
  });

  // Ensure profile exists with provided name
  await admin.from("profiles").upsert({
    id: user.id,
    name: name?.trim() || user.user_metadata?.name || null,
  });

  // Link owner to restaurant
  const { error: memberErr } = await admin.from("restaurant_members").insert({
    restaurant_id: restaurant.id,
    profile_id: user.id,
    role_id: ownerRole.id,
  });

  if (memberErr) {
    return NextResponse.json({ error: memberErr.message }, { status: 500 });
  }

  return NextResponse.json({ restaurantId: restaurant.id });
}
