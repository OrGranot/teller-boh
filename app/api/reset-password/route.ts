import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  const { email, code, password } = await req.json();

  if (!email?.trim() || !code?.trim() || !password) {
    return NextResponse.json({ error: "All fields are required" }, { status: 400 });
  }
  if (password.length < 6) {
    return NextResponse.json({ error: "Password must be at least 6 characters" }, { status: 400 });
  }

  const normalizedEmail = email.trim().toLowerCase();
  const admin = await createAdminClient();

  // Find a valid, unused code for this email
  const { data: record } = await admin
    .from("password_reset_codes")
    .select("id")
    .eq("email", normalizedEmail)
    .eq("code", code.trim())
    .eq("used", false)
    .gt("expires_at", new Date().toISOString())
    .limit(1)
    .maybeSingle();

  if (!record) {
    return NextResponse.json({ error: "Invalid or expired code" }, { status: 400 });
  }

  // Mark the code as used
  await admin
    .from("password_reset_codes")
    .update({ used: true })
    .eq("id", record.id);

  // Find the user by email and update their password
  const { data: users } = await admin.auth.admin.listUsers();
  const user = users?.users?.find(
    u => u.email?.toLowerCase() === normalizedEmail
  );

  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const { error } = await admin.auth.admin.updateUserById(user.id, { password });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
