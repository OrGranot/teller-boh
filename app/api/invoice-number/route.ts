import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/supabase/require-auth";
import { getNextInvoiceNumber } from "@/lib/invoice-counter";

export async function POST() {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;

  const number = await getNextInvoiceNumber(auth.supabase);
  return NextResponse.json({ number });
}
