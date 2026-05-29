import { redirect } from "next/navigation";
import { getCachedMember } from "@/lib/auth-cache";
import InvoicesClient from "./InvoicesClient";

export const dynamic = "force-dynamic";

export default async function InvoicesPage() {
  const member = await getCachedMember();
  if (!member) redirect("/setup");

  const role = member.role as unknown as {
    is_owner: boolean;
    permissions: Record<string, boolean>;
  } | null;
  const canManageInvoices =
    !!role?.is_owner || !!role?.permissions?.can_manage_invoices;
  if (!canManageInvoices) redirect("/shifts");

  return <InvoicesClient restaurantId={member.restaurant_id} />;
}
