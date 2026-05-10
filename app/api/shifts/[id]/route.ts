import { NextRequest, NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";

async function getAuthorizedUser() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { user: null, admin: null };
  const admin = await createAdminClient();
  return { user, admin };
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { user, admin } = await getAuthorizedUser();
  if (!user || !admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Verify caller has edit permission
  const { data: caller } = await admin
    .from("restaurant_members")
    .select("role:roles(is_owner, permissions)")
    .eq("profile_id", user.id)
    .single();
  const role = caller?.role as { is_owner: boolean; permissions: Record<string, boolean> } | null;
  if (!role?.is_owner && !role?.permissions?.can_edit_shifts) {
    return NextResponse.json({ error: "No permission" }, { status: 403 });
  }

  const body = await req.json();
  const allowed = ["clocked_in_at", "clocked_out_at", "status", "notes"];
  const payload: Record<string, unknown> = { edited_by: user.id };
  for (const key of allowed) {
    if (key in body) payload[key] = body[key];
  }

  const { data, error } = await admin
    .from("time_records")
    .update(payload)
    .eq("id", id)
    .select("*, department:department_id(name)")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { user, admin } = await getAuthorizedUser();
  if (!user || !admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { error } = await admin.from("time_records").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
