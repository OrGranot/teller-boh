import { createClient } from "@/lib/supabase/server";
import { getCachedMember } from "@/lib/auth-cache";
import DepartmentsClient from "./DepartmentsClient";

export default async function DepartmentsPage() {
  const me = await getCachedMember();
  if (!me) return null;

  const supabase = await createClient();
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
