import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const admin = await createAdminClient();

  const { data: invitation } = await admin
    .from("invitations")
    .select("email, name, status, expires_at, restaurant:restaurants(name)")
    .eq("token", token)
    .single();

  if (!invitation) return NextResponse.json({ error: "Invitation not found or expired" }, { status: 404 });
  if (invitation.status === "accepted") return NextResponse.json({ error: "Invitation already used" }, { status: 410 });
  if (invitation.status === "pending_approval") return NextResponse.json({ error: "Invitation not yet approved" }, { status: 403 });
  if (new Date(invitation.expires_at) < new Date()) return NextResponse.json({ error: "Invitation has expired" }, { status: 410 });

  const restaurant = invitation.restaurant as { name: string } | null;

  return NextResponse.json({
    email: invitation.email,
    name: invitation.name,
    restaurant: restaurant?.name || "your restaurant",
  });
}
