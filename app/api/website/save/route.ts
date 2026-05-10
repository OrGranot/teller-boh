import { NextRequest, NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";

const SINGLE_ROW_TABLES = [
  "website_site", "website_about", "website_events", "website_gallery",
  "website_hours", "website_menus", "website_press", "website_vouchers",
];

export async function POST(req: NextRequest) {
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

  const body = await req.json();
  const { table, data } = body as { table: string; data: unknown };

  const admin = await createAdminClient();

  // Multi-row table: replace all FAQ items
  if (table === "website_faq") {
    const items = data as Array<{
      id?: string; sort_order: number;
      question_en: string; question_de: string;
      answer_en: string; answer_de: string;
    }>;

    await admin.from("website_faq").delete().not("id", "is", null);
    const { error } = await admin.from("website_faq").insert(
      items.map(({ id: _id, ...rest }) => rest)
    );
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  // Single-row tables: upsert with id=1
  if (!SINGLE_ROW_TABLES.includes(table)) {
    return NextResponse.json({ error: "Unknown table" }, { status: 400 });
  }

  const { error } = await admin
    .from(table)
    .upsert({ id: 1, ...(data as object), updated_at: new Date().toISOString() });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
