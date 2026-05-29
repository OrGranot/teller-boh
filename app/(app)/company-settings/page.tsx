import { redirect } from "next/navigation";
import { getCachedMember } from "@/lib/auth-cache";
import CompanySettingsClient from "./CompanySettingsClient";

export const dynamic = "force-dynamic";

export default async function CompanySettingsPage() {
  const member = await getCachedMember();
  if (!member) redirect("/setup");

  const role = member.role as unknown as {
    is_owner: boolean;
    permissions: Record<string, boolean>;
  } | null;

  // Owner-only page
  if (!role?.is_owner) redirect("/shifts");

  return <CompanySettingsClient restaurantId={member.restaurant_id} />;
}
