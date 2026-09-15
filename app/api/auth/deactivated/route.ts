import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Signs out an employee whose employment has ended and sends them to the login
// page with an explanation. Route handler (not the layout) so the auth cookies
// can actually be cleared.
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  await supabase.auth.signOut();
  return NextResponse.redirect(new URL("/login?deactivated=1", request.url));
}
