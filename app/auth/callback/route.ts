import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const type = searchParams.get("type"); // 'recovery' = password reset

  if (code) {
    const supabase = await createClient();
    await supabase.auth.exchangeCodeForSession(code);
  }

  // After a password recovery link, send to the update-password page
  if (type === "recovery") {
    return NextResponse.redirect(`${origin}/auth/update-password`);
  }

  return NextResponse.redirect(`${origin}/`);
}
