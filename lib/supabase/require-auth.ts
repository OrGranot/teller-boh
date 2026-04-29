import { NextResponse } from "next/server";
import { createClient } from "./server";

/**
 * Call at the top of every API route handler.
 * Returns the authenticated user, or a 401 Response to return immediately.
 *
 * Usage:
 *   const auth = await requireAuth();
 *   if (auth instanceof Response) return auth;
 *   const { user, supabase } = auth;
 */
export async function requireAuth() {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();

  if (error || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return { user, supabase };
}
