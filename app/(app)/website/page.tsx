import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import WebsiteEditor from "./WebsiteEditor";

export const dynamic = "force-dynamic";

export default async function WebsitePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: member } = await supabase
    .from("restaurant_members")
    .select("role:roles(is_owner)")
    .eq("profile_id", user.id)
    .single();
  const role = member?.role as unknown as { is_owner: boolean } | null;
  if (!role?.is_owner) redirect("/shifts");

  const [site, about, events, faq, gallery, hours, menus, press, vouchers] = await Promise.all([
    supabase.from("website_site").select("*").single(),
    supabase.from("website_about").select("*").single(),
    supabase.from("website_events").select("*").single(),
    supabase.from("website_faq").select("*").order("sort_order"),
    supabase.from("website_gallery").select("*").single(),
    supabase.from("website_hours").select("*").single(),
    supabase.from("website_menus").select("*").single(),
    supabase.from("website_press").select("*").single(),
    supabase.from("website_vouchers").select("*").single(),
  ]);

  return (
    <WebsiteEditor
      site={site.data!}
      about={about.data!}
      events={events.data!}
      faq={faq.data ?? []}
      gallery={gallery.data!}
      hours={hours.data!}
      menus={menus.data!}
      press={press.data!}
      vouchers={vouchers.data!}
    />
  );
}
