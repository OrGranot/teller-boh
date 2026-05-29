import { redirect } from "next/navigation";
import { getCachedMember } from "@/lib/auth-cache";
import ItemsClient from "./ItemsClient";

export const dynamic = "force-dynamic";

export default async function ItemsPage() {
  const member = await getCachedMember();
  if (!member) redirect("/setup");

  const role = member.role as unknown as {
    is_owner: boolean;
    permissions: Record<string, boolean>;
  } | null;
  const canManage =
    !!role?.is_owner || !!role?.permissions?.can_manage_invoices;
  if (!canManage) redirect("/shifts");

  return <ItemsClient restaurantId={member.restaurant_id} />;
}
