import { NextRequest, NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";

async function requireOwner(admin: Awaited<ReturnType<typeof createAdminClient>>, userId: string) {
  const { data: me } = await admin
    .from("restaurant_members")
    .select("restaurant_id, role:roles(is_owner)")
    .eq("profile_id", userId)
    .single();
  const meRole = me?.role as unknown as { is_owner: boolean } | null;
  if (!me || !meRole?.is_owner) return null;
  return me as { restaurant_id: string };
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = await createAdminClient();
  const caller = await requireOwner(admin, user.id);
  if (!caller) return NextResponse.json({ error: "Only owners can manage roles" }, { status: 403 });

  const { permissions, name } = await req.json();

  const update: Record<string, unknown> = {};
  if (permissions !== undefined) update.permissions = permissions;
  if (name !== undefined) update.name = name;

  const { data: role, error } = await admin
    .from("roles")
    .update(update)
    .eq("id", id)
    .eq("restaurant_id", caller.restaurant_id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ role });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = await createAdminClient();
  const caller = await requireOwner(admin, user.id);
  if (!caller) return NextResponse.json({ error: "Only owners can manage roles" }, { status: 403 });

  await admin
    .from("roles")
    .delete()
    .eq("id", id)
    .eq("restaurant_id", caller.restaurant_id)
    .eq("is_owner", false); // never delete the owner role

  return NextResponse.json({ ok: true });
}
