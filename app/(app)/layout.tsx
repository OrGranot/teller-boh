"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const NAV = [
  { href: "/invoices/new", label: "New Invoice", icon: "+" },
  { href: "/invoices", label: "Invoices", icon: "≡" },
  { href: "/bewirtungsbeleg/new", label: "Bewirtungsbeleg", icon: "🧾" },
  { href: "/vouchers", label: "Vouchers", icon: "🎟" },
  { href: "/contacts", label: "Contacts", icon: "◎" },
  { href: "/items", label: "Catalog", icon: "◈" },
  { href: "/settings", label: "Settings", icon: "⚙" },
];

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <div className="flex min-h-screen">
      {/* Sidebar */}
      <aside
        className="w-52 flex flex-col fixed inset-y-0 left-0 z-20"
        style={{ background: "#1a1a1a" }}
      >
        {/* Logo/Brand */}
        <div className="px-5 py-6 border-b border-white/10">
          <span className="text-white font-bold text-lg tracking-tight">Teller BOH</span>
          <span className="text-gray-400 text-xs block mt-0.5">Back of House</span>
        </div>

        {/* Nav links */}
        <nav className="flex-1 px-3 py-4 space-y-0.5">
          {NAV.map(({ href, label, icon }) => {
            const active =
              pathname === href || (href !== "/invoices" && pathname.startsWith(href));
            return (
              <Link
                key={href}
                href={href}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
                  active
                    ? "bg-white/15 text-white font-semibold"
                    : "text-gray-400 hover:text-white hover:bg-white/8"
                }`}
              >
                <span className="text-base w-5 text-center">{icon}</span>
                {label}
              </Link>
            );
          })}
        </nav>

        {/* Logout */}
        <div className="px-3 py-4 border-t border-white/10">
          <button
            onClick={handleLogout}
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-gray-400 hover:text-white hover:bg-white/8 w-full transition-colors"
          >
            <span className="text-base w-5 text-center">↩</span>
            Sign out
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="ml-52 flex-1 min-h-screen" style={{ background: "#f4f4f2" }}>
        {children}
      </main>
    </div>
  );
}
