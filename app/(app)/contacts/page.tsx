import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import ContactsClient from "./ContactsClient";

export const dynamic = "force-dynamic";

export default async function ContactsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: member } = await supabase
    .from("restaurant_members")
    .select("restaurant_id, role:roles(is_owner, permissions)")
    .eq("profile_id", user.id)
    .single();
  if (!member) redirect("/setup");

  const role = member.role as {
    is_owner: boolean;
    permissions: Record<string, boolean>;
  } | null;
  const canManage =
    !!role?.is_owner || !!role?.permissions?.can_manage_invoices;
  if (!canManage) redirect("/shifts");

  return <ContactsClient restaurantId={member.restaurant_id} />;
}
