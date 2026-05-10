import { NextRequest, NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";

// Owner updates another member's profile info
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = await createAdminClient();

  // Verify caller is owner of same restaurant as target
  const { data: caller } = await admin
    .from("restaurant_members")
    .select("restaurant_id, role:roles(is_owner)")
    .eq("profile_id", user.id)
    .single();
  const callerRole = caller?.role as { is_owner: boolean } | null;
  if (!caller || !callerRole?.is_owner) {
    return NextResponse.json({ error: "Only owners can edit member profiles" }, { status: 403 });
  }

  const body = await req.json();
  const allowed = ["name", "phone", "address", "birthdate"];
  const update: Record<string, string | null> = {};
  for (const key of allowed) {
    if (key in body) update[key] = body[key] || null;
  }

  const { error } = await admin.from("profiles").update(update).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
