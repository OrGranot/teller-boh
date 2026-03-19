import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getNextInvoiceNumber } from "@/lib/invoice-counter";

export async function POST() {
  const supabase = await createClient();
  const number = await getNextInvoiceNumber(supabase);
  return NextResponse.json({ number });
}
