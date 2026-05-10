import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { buildBewirtungsbelegPdf, type BewItem } from "@/lib/bewirtungsbeleg-pdf";

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: member } = await supabase
    .from("restaurant_members")
    .select("restaurant_id, role:roles(is_owner, permissions)")
    .eq("profile_id", user.id)
    .single();
  if (!member) return NextResponse.json({ error: "No restaurant" }, { status: 403 });

  const role = member.role as unknown as {
    is_owner: boolean;
    permissions: Record<string, boolean>;
  } | null;
  const canManage =
    role?.is_owner || !!role?.permissions?.can_manage_bewirtungsbeleg;
  if (!canManage) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const restaurantId = member.restaurant_id;

  try {
    const { items, date, customerAddress, tip } = (await req.json()) as {
      items: BewItem[];
      date: string;
      customerAddress?: string;
      tip?: number;
    };

    if (!items?.length) {
      return new Response(JSON.stringify({ error: "No items provided" }), {
        status: 400,
      });
    }

    const { data: company } = await supabase
      .from("company_settings")
      .select("*")
      .eq("restaurant_id", restaurantId)
      .limit(1)
      .single();

    if (!company) {
      return new Response(
        JSON.stringify({ error: "Company settings not found" }),
        { status: 400 }
      );
    }

    const pdfBytes = await buildBewirtungsbelegPdf(
      items,
      date,
      company,
      customerAddress,
      tip
    );
    const filename = `Bewirtungsbeleg_${date}.pdf`;

    return new Response(new Uint8Array(pdfBytes), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (err) {
    console.error("download-bewirtungsbeleg error:", err);
    return new Response(
      JSON.stringify({
        error: "Failed to generate PDF. Please try again.",
      }),
      { status: 500 }
    );
  }
}
