import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { requireAuth } from "@/lib/supabase/require-auth";

export const dynamic = "force-dynamic";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function POST(req: NextRequest) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;

  try {
    const formData = await req.formData();
    const file = formData.get("receipt") as File | null;
    if (!file) {
      return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
    }

    const bytes = await file.arrayBuffer();
    const base64 = Buffer.from(bytes).toString("base64");
    const isPdf = file.type === "application/pdf" || file.name?.endsWith(".pdf");

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fileContent: any = isPdf
      ? { type: "document", source: { type: "base64", media_type: "application/pdf", data: base64 } }
      : { type: "image", source: { type: "base64", media_type: (file.type || "image/jpeg") as "image/jpeg" | "image/png" | "image/gif" | "image/webp", data: base64 } };

    const message = await client.messages.create({
      model: "claude-opus-4-6",
      max_tokens: 2048,
      messages: [
        {
          role: "user",
          content: [
            fileContent,
            {
              type: "text",
              text: `This is a German restaurant receipt. Extract all line items and return ONLY a JSON array — no explanation, no markdown, just raw JSON.

Each item must have:
- "qty": quantity as a string (e.g. "1", "2")
- "description": item name (in English, as written on receipt)
- "vat_rate": "7" for food (marked A), "19" for drinks (marked B). If no marking, use "7" for food, "19" for drinks.
- "sum": gross total for that line as a number (qty × unit price)

The "price" field (net unit price) will be calculated automatically — do not include it.

Important:
- If a line shows "2  Sparkling Water  2.50  5.00", then qty=2, sum=5.00
- Ignore subtotals, VAT summary lines, tips, totals, service charges, and payment info
- Only include actual ordered items

Return only the JSON array, nothing else. Example:
[{"qty":"2","description":"Sparkling Water","vat_rate":"19","sum":5.00},{"qty":"1","description":"Beef Croquettes","vat_rate":"7","sum":15.00}]`,
            },
          ],
        },
      ],
    });

    const raw = message.content[0].type === "text" ? message.content[0].text.trim() : "";

    // Strip markdown code fences if Claude wrapped it
    const cleaned = raw.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```\s*$/i, "").trim();

    let items: object[];
    try {
      items = JSON.parse(cleaned);
    } catch {
      console.error("Claude returned non-JSON:", raw);
      return NextResponse.json({ error: "Could not parse receipt. Try a clearer photo." }, { status: 422 });
    }

    return NextResponse.json({ items });
  } catch (err) {
    console.error("parse-receipt error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
