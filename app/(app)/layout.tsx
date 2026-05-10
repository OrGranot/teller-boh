import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import Sidebar from "@/components/Sidebar";
import MobileNavBar from "@/components/MobileNavBar";
import NamePrompt from "@/components/NamePrompt";
import type { AppContext } from "@/lib/types";
import { ImportProvider } from "@/lib/import-context";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: member } = await supabase
    .from("restaurant_members")
    .select("*, role:roles(*), restaurant:restaurants(name)")
    .eq("profile_id", user.id)
    .limit(1)
    .single();

  if (!member) redirect("/setup");

  const { data: profile } = await supabase
    .from("profiles")
    .select("name")
    .eq("id", user.id)
    .single();

  const ctx: AppContext = {
    restaurantId: member.restaurant_id,
    restaurantName: (member.restaurant as { name: string }).name,
    memberId: member.id,
    role: member.role,
    profileId: user.id,
    profileName: profile?.name ?? null,
  };

  return (
    <ImportProvider>
      <div className="flex min-h-screen">
        {!ctx.profileName && <NamePrompt />}
        {/* Desktop sidebar — hidden on mobile */}
        <Sidebar ctx={ctx} />
        {/* Mobile top bar + slide-over — hidden on desktop */}
        <MobileNavBar ctx={ctx} />
        {/* Main content — offset for sidebar on desktop, top bar on mobile */}
        <main
          className="md:ml-56 flex-1 min-h-screen pt-12 md:pt-0 min-w-0 overflow-x-hidden"
          style={{ background: "#f4f4f2" }}
        >
          <div className="max-w-5xl mx-auto w-full">
            {children}
          </div>
        </main>
      </div>
    </ImportProvider>
  );
}
