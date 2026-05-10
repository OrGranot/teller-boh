import { NextRequest, NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { name } = await req.json();
  const admin = await createAdminClient();

  const { data: me } = await admin
    .from("restaurant_members")
    .select("restaurant_id")
    .eq("profile_id", user.id)
    .single();

  if (!me) return NextResponse.json({ error: "Not a member" }, { status: 403 });

  const { data: department, error } = await admin
    .from("departments")
    .insert({ restaurant_id: me.restaurant_id, name })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ department });
}
