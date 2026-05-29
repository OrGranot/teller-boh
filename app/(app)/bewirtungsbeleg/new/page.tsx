import { redirect } from "next/navigation";
import { getCachedMember } from "@/lib/auth-cache";
import BewirtungsbelegClient from "./BewirtungsbelegClient";

export const dynamic = "force-dynamic";

export default async function NewBewirtungsbelegPage() {
  const member = await getCachedMember();
  if (!member) redirect("/setup");

  const role = member.role as unknown as {
    is_owner: boolean;
    permissions: Record<string, boolean>;
  } | null;
  const canManage =
    !!role?.is_owner || !!role?.permissions?.can_manage_bewirtungsbeleg;
  if (!canManage) redirect("/shifts");

  return <BewirtungsbelegClient restaurantId={member.restaurant_id} />;
}
