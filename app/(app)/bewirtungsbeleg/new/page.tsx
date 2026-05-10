import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import BewirtungsbelegClient from "./BewirtungsbelegClient";

export const dynamic = "force-dynamic";

export default async function NewBewirtungsbelegPage() {
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
    !!role?.is_owner || !!role?.permissions?.can_manage_bewirtungsbeleg;
  if (!canManage) redirect("/shifts");

  return <BewirtungsbelegClient restaurantId={member.restaurant_id} />;
}
