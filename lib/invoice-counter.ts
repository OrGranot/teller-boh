import type { SupabaseClient } from "@supabase/supabase-js";

export async function getNextInvoiceNumber(
  supabase: SupabaseClient,
  restaurantId: string
): Promise<string> {
  const now = new Date();
  const yy = String(now.getFullYear()).slice(2);
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const ym = yy + mm; // e.g. "2603"

  const { data: counter } = await supabase
    .from("invoice_counter")
    .select("year_month, last_number")
    .eq("restaurant_id", restaurantId)
    .single();

  let nextNum: number;
  if (!counter?.year_month || counter.year_month !== ym) {
    // New month — reset counter
    nextNum = 1;
    await supabase
      .from("invoice_counter")
      .update({ year_month: ym, last_number: 1 })
      .eq("restaurant_id", restaurantId);
  } else {
    nextNum = (counter.last_number || 0) + 1;
    await supabase
      .from("invoice_counter")
      .update({ last_number: nextNum })
      .eq("restaurant_id", restaurantId);
  }

  return `${ym}-${String(nextNum).padStart(3, "0")}`;
}
