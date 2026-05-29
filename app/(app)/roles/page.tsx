import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { getCachedMember } from "@/lib/auth-cache";
import RolesClient from "./RolesClient";

export default async function RolesPage() {
  const me = await getCachedMember();
  if (!me) return null;

  const meRole = me.role as unknown as { is_owner: boolean } | null;
  if (!meRole?.is_owner) redirect("/team");

  const supabase = await createClient();
  const { data: roles } = await supabase
    .from("roles")
    .select("*")
    .eq("restaurant_id", me.restaurant_id)
    .order("is_owner", { ascending: false });

  return <RolesClient roles={roles || []} />;
}
