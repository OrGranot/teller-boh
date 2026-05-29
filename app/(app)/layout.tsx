import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCachedUser, getCachedMember } from "@/lib/auth-cache";
import Sidebar from "@/components/Sidebar";
import MobileNavBar from "@/components/MobileNavBar";
import NamePrompt from "@/components/NamePrompt";
import InstallPWABanner from "@/components/InstallPWABanner";
import type { AppContext } from "@/lib/types";
import { ImportProvider } from "@/lib/import-context";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getCachedUser();
  if (!user) redirect("/login");

  // member + profile run in parallel; getCachedMember is warm for pages below
  const supabase = await createClient();
  const [member, profileResult] = await Promise.all([
    getCachedMember(),
    supabase.from("profiles").select("name").eq("id", user.id).single(),
  ]);

  if (!member) redirect("/setup");

  const today = new Date().toISOString().slice(0, 10);
  const isDeactivated = !!(member.contract_end && member.contract_end <= today);

  const profile = profileResult.data;

  const ctx: AppContext = {
    restaurantId: member.restaurant_id,
    restaurantName: (member.restaurant as { name: string }).name,
    memberId: member.id,
    role: member.role,
    profileId: user.id,
    profileName: profile?.name ?? null,
    isDeactivated,
  };

  return (
    <ImportProvider>
      <InstallPWABanner />
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
