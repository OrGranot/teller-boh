import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

function generateCode(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

export async function POST(req: NextRequest) {
  const { email } = await req.json();
  if (!email?.trim()) {
    return NextResponse.json({ error: "Email is required" }, { status: 400 });
  }

  const normalizedEmail = email.trim().toLowerCase();
  const admin = await createAdminClient();

  // Check if user exists (don't reveal this to the client)
  const { data: users } = await admin.auth.admin.listUsers();
  const userExists = users?.users?.some(
    u => u.email?.toLowerCase() === normalizedEmail
  );

  // Always return 200 — never reveal whether the email exists
  if (!userExists) {
    return NextResponse.json({ ok: true });
  }

  const code = generateCode();
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString(); // 15 min

  // Invalidate any previous unused codes for this email
  await admin
    .from("password_reset_codes")
    .update({ used: true })
    .eq("email", normalizedEmail)
    .eq("used", false);

  // Store the new code
  await admin.from("password_reset_codes").insert({
    email: normalizedEmail,
    code,
    expires_at: expiresAt,
  });

  await resend.emails.send({
    from: "Teller Berlin <hello@tellerberlin.com>",
    to: normalizedEmail,
    subject: "Your Teller Berlin password reset code",
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px;">
        <h2 style="margin-bottom:8px;">Reset your password</h2>
        <p style="color:#6b7280;">
          We received a request to reset the password for your Teller Berlin account.
          Enter this code to set a new password:
        </p>
        <div style="margin:24px 0;text-align:center;">
          <span style="display:inline-block;font-size:32px;font-weight:700;letter-spacing:8px;
                       background:#f3f4f6;padding:16px 32px;border-radius:12px;font-family:monospace;">
            ${code}
          </span>
        </div>
        <p style="color:#6b7280;font-size:14px;">
          This code expires in 15 minutes.
        </p>
        <p style="margin-top:24px;font-size:13px;color:#9ca3af;">
          If you didn't request a password reset, you can safely ignore this email.
        </p>
      </div>
    `,
  });

  return NextResponse.json({ ok: true });
}
