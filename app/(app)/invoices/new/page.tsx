import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import InvoiceForm from "@/components/InvoiceForm";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function NewInvoicePage() {
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

  const role = member.role as unknown as {
    is_owner: boolean;
    permissions: Record<string, boolean>;
  } | null;
  const canManageInvoices =
    !!role?.is_owner || !!role?.permissions?.can_manage_invoices;
  if (!canManageInvoices) redirect("/shifts");

  return (
    <div>
      <div className="max-w-4xl mx-auto px-6 pt-6">
        <Link
          href="/invoices"
          className="text-sm text-gray-400 hover:text-gray-700 font-semibold"
        >
          ← Back to invoices
        </Link>
      </div>
      <InvoiceForm restaurantId={member.restaurant_id} />
    </div>
  );
}
