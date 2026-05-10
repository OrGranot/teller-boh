import { NextRequest, NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";

// POST /api/members/[id]/departments — add a department membership
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: profileId } = await params;
  const { departmentId } = await req.json();
  if (!departmentId) return NextResponse.json({ error: "departmentId required" }, { status: 400 });

  const admin = await createAdminClient();
  const { error } = await admin
    .from("department_members")
    .insert({ department_id: departmentId, profile_id: profileId });

  if (error) {
    // 23505 = unique_violation — already assigned, treat as success
    if (error.code === "23505") return NextResponse.json({ ok: true });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

// DELETE /api/members/[id]/departments — remove a department membership
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: profileId } = await params;
  const { departmentId } = await req.json();
  if (!departmentId) return NextResponse.json({ error: "departmentId required" }, { status: 400 });

  const admin = await createAdminClient();
  const { error } = await admin
    .from("department_members")
    .delete()
    .eq("profile_id", profileId)
    .eq("department_id", departmentId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Auto-delete the department if it has no remaining members
  const { count } = await admin
    .from("department_members")
    .select("*", { count: "exact", head: true })
    .eq("department_id", departmentId);

  let departmentDeleted = false;
  if (count === 0) {
    // Null out any invitations referencing this dept before deleting (FK constraint)
    await admin
      .from("invitations")
      .update({ department_id: null })
      .eq("department_id", departmentId);

    await admin.from("departments").delete().eq("id", departmentId);
    departmentDeleted = true;
  }

  return NextResponse.json({ ok: true, departmentDeleted, departmentId });
}
