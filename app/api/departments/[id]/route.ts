import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const admin = await createAdminClient();
  await admin.from("departments").delete().eq("id", id);
  return NextResponse.json({ ok: true });
}
