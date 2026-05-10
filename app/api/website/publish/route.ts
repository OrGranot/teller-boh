import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  void req;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: member } = await supabase
    .from("restaurant_members")
    .select("role:roles(is_owner)")
    .eq("profile_id", user.id)
    .single();
  const role = member?.role as unknown as { is_owner: boolean } | null;
  if (!role?.is_owner) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const hookUrl = process.env.NETLIFY_BUILD_HOOK_URL;
  if (!hookUrl) {
    return NextResponse.json({ error: "NETLIFY_BUILD_HOOK_URL not configured" }, { status: 503 });
  }

  const res = await fetch(hookUrl, { method: "POST" });
  if (!res.ok) return NextResponse.json({ error: "Build hook failed" }, { status: 500 });

  return NextResponse.json({ ok: true });
}
