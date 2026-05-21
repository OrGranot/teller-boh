import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

export async function POST(req: NextRequest) {
  const { email } = await req.json();
  if (!email?.trim()) {
    return NextResponse.json({ error: "Email is required" }, { status: 400 });
  }

  const origin = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const admin = await createAdminClient();

  // Generate a recovery link via the admin API so we can send it via Resend
  // (keeps email style consistent with the rest of the app)
  const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
    type: "recovery",
    email: email.trim().toLowerCase(),
    options: { redirectTo: `${origin}/reset-password` },
  });

  // Always return 200 — never reveal whether the email exists
  if (linkErr || !linkData?.properties?.action_link) {
    console.error("[forgot-password] generateLink error:", linkErr?.message);
    return NextResponse.json({ ok: true });
  }

  await resend.emails.send({
    from: "Teller Berlin <hello@tellerberlin.com>",
    to: email.trim(),
    subject: "Reset your Teller Berlin password",
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px;">
        <h2 style="margin-bottom:8px;">Reset your password</h2>
        <p style="color:#6b7280;">
          We received a request to reset the password for your Teller Berlin account.<br><br>
          Click the button below to choose a new password. This link expires in 1 hour.
        </p>
        <a href="${linkData.properties.action_link}"
          style="display:inline-block;margin-top:20px;background:#111827;color:white;
                 padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;">
          Reset password →
        </a>
        <p style="margin-top:24px;font-size:13px;color:#9ca3af;">
          If you didn't request a password reset, you can safely ignore this email.
          Your password will not change.
        </p>
      </div>
    `,
  });

  return NextResponse.json({ ok: true });
}
