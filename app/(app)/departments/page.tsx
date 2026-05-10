import { createClient } from "@/lib/supabase/server";
import DepartmentsClient from "./DepartmentsClient";

export default async function DepartmentsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: me } = await supabase
    .from("restaurant_members")
    .select("restaurant_id")
    .eq("profile_id", user.id)
    .single();

  if (!me) return null;

  const { data: departments } = await supabase
    .from("departments")
    .select("*")
    .eq("restaurant_id", me.restaurant_id)
    .order("name");

  return (
    <DepartmentsClient
      departments={departments || []}
      restaurantId={me.restaurant_id}
    />
  );
}
