import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/supabase/require-auth";
import { buildBewirtungsbelegPdf, type BewItem } from "@/lib/bewirtungsbeleg-pdf";

export async function POST(req: NextRequest) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;

  try {
    const { items, date, customerAddress, tip } = await req.json() as {
      items: BewItem[];
      date: string;
      customerAddress?: string;
      tip?: number;
    };

    if (!items?.length) {
      return new Response(JSON.stringify({ error: "No items provided" }), { status: 400 });
    }

    const supabase = auth.supabase;
    const { data: company } = await supabase.from("company_settings").select("*").limit(1).single();
    if (!company) {
      return new Response(JSON.stringify({ error: "Company settings not found" }), { status: 400 });
    }

    const pdfBytes = await buildBewirtungsbelegPdf(items, date, company, customerAddress, tip);
    const filename  = `Bewirtungsbeleg_${date}.pdf`;

    return new Response(new Uint8Array(pdfBytes), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (err) {
    console.error("download-bewirtungsbeleg error:", err);
    return new Response(JSON.stringify({ error: "Failed to generate PDF. Please try again." }), { status: 500 });
  }
}
