import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { buildBewirtungsbelegPdf, type BewItem } from "@/lib/bewirtungsbeleg-pdf";

export async function POST(req: NextRequest) {
  try {
    const { items, date, customerAddress } = await req.json() as {
      items: BewItem[];
      date: string;
      customerAddress?: string;
    };

    if (!items?.length) {
      return new Response(JSON.stringify({ error: "No items provided" }), { status: 400 });
    }

    const supabase = await createClient();
    const { data: company } = await supabase.from("company_settings").select("*").limit(1).single();
    if (!company) {
      return new Response(JSON.stringify({ error: "Company settings not found" }), { status: 400 });
    }

    const pdfBytes = await buildBewirtungsbelegPdf(items, date, company, customerAddress);
    const filename  = `Bewirtungsbeleg_${date}.pdf`;
    const pdfBuffer = pdfBytes.buffer.slice(pdfBytes.byteOffset, pdfBytes.byteOffset + pdfBytes.byteLength);

    return new Response(pdfBuffer, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (err) {
    console.error("download-bewirtungsbeleg error:", err);
    return new Response(JSON.stringify({ error: String(err) }), { status: 500 });
  }
}
