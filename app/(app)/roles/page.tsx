import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import RolesClient from "./RolesClient";

export default async function RolesPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: me } = await supabase
    .from("restaurant_members")
    .select("restaurant_id, role:roles(is_owner)")
    .eq("profile_id", user.id)
    .single();

  if (!me) return null;

  const meRole = me.role as unknown as { is_owner: boolean } | null;
  if (!meRole?.is_owner) redirect("/team");

  const { data: roles } = await supabase
    .from("roles")
    .select("*")
    .eq("restaurant_id", me.restaurant_id)
    .order("is_owner", { ascending: false });

  return <RolesClient roles={roles || []} />;
}
