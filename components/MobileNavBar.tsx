"use client";
import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { AppContext } from "@/lib/types";

interface MobileNavItem {
  href: string; label: string; icon: string;
  ownerOnly?: boolean; anyPermission?: string[];
}

const navItems: MobileNavItem[] = [
  // Labor
  { href: "/shifts",            label: "Shifts",          icon: "⏱" },
  { href: "/team",              label: "Team",            icon: "◎", anyPermission: ["can_view_all_shifts"] },
  { href: "/departments",       label: "Departments",     icon: "▦", anyPermission: ["can_manage_departments"] },
  { href: "/roles",             label: "Roles",           icon: "⚿", ownerOnly: true },
  // Finance
  { href: "/invoices",          label: "Invoices",        icon: "🧾", anyPermission: ["can_manage_invoices"] },
  { href: "/bewirtungsbeleg/new", label: "Bewirtungsbeleg", icon: "📋", anyPermission: ["can_manage_bewirtungsbeleg"] },
  { href: "/vouchers",          label: "Vouchers",        icon: "🎟", anyPermission: ["can_manage_vouchers"] },
  // Catalog
  { href: "/contacts",          label: "Contacts",        icon: "◎", anyPermission: ["can_manage_invoices"] },
  { href: "/items",             label: "Catalog Items",   icon: "◈", anyPermission: ["can_manage_invoices"] },
  // Settings
  { href: "/company-settings",  label: "Company Settings",icon: "⚙", ownerOnly: true },
];

export default function MobileNavBar({ ctx }: { ctx: AppContext }) {
  const [open,         setOpen]         = useState(false);
  const [pwResetState, setPwResetState] = useState<"idle" | "sending" | "sent">("idle");
  const pathname = usePathname();
  const router   = useRouter();
  const perms    = ctx.role.permissions as Record<string, boolean>;
  const isOwner  = ctx.role.is_owner;

  const visibleNav = navItems.filter(item => {
    if (isOwner) return true;
    if (item.ownerOnly) return false;
    if (item.anyPermission) return item.anyPermission.some(p => !!perms[p]);
    return true;
  });

  const isEmployee = !isOwner && !perms.can_view_all_shifts && !perms.can_manage_departments &&
    !perms.can_manage_invoices && !perms.can_manage_bewirtungsbeleg && !perms.can_manage_vouchers;

  async function signOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
  }

  async function sendPasswordReset() {
    setPwResetState("sending");
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user?.email) { setPwResetState("idle"); return; }
    await fetch("/api/forgot-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: user.email }),
    });
    setPwResetState("sent");
    setTimeout(() => setPwResetState("idle"), 4000);
  }

  return (
    <>
      {/* ── Sticky top bar (mobile only) ─────────────────────────────────── */}
      <div
        className="md:hidden fixed top-0 left-0 right-0 z-30 flex items-center justify-between px-4 h-12 border-b border-white/10"
        style={{ background: "#1a1a1a" }}
      >
        <span className="text-white font-bold tracking-tight">Teller Berlin</span>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="text-gray-300 hover:text-white p-1.5 rounded-lg hover:bg-white/10 transition-colors"
          aria-label="Open navigation"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
      </div>

      {/* ── Slide-over backdrop ───────────────────────────────────────────── */}
      {open && (
        <div
          className="md:hidden fixed inset-0 z-40 bg-black/50 backdrop-blur-sm"
          onClick={() => setOpen(false)}
        />
      )}

      {/* ── Slide-over panel ─────────────────────────────────────────────── */}
      <div
        className={`
          md:hidden fixed inset-y-0 left-0 z-50 w-72 flex flex-col
          transition-transform duration-200 ease-out
          ${open ? "translate-x-0" : "-translate-x-full"}
        `}
        style={{ background: "#1a1a1a" }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
          <div>
            <span className="text-white font-bold text-base block">Teller Berlin</span>
            <span className="text-gray-400 text-xs truncate block mt-0.5">{ctx.restaurantName}</span>
          </div>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="text-gray-400 hover:text-white p-1.5 rounded-lg hover:bg-white/10 transition-colors"
            aria-label="Close navigation"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Nav links */}
        <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
          {isEmployee ? (
            <>
              <span className="flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium text-gray-600 cursor-not-allowed select-none">
                <span className="text-base w-5 text-center">◎</span>
                Dashboard
                <span className="ml-auto text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-white/10 text-gray-500">soon</span>
              </span>
              <Link
                href="/shifts"
                onClick={() => setOpen(false)}
                className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-colors ${
                  pathname.startsWith("/shifts")
                    ? "bg-white/15 text-white"
                    : "text-gray-400 hover:text-white hover:bg-white/8"
                }`}
              >
                <span className="text-base w-5 text-center">⏱</span>
                Shifts
              </Link>
              <Link
                href={`/team/${ctx.profileId}`}
                onClick={() => setOpen(false)}
                className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-colors ${
                  pathname.startsWith("/team")
                    ? "bg-white/15 text-white"
                    : "text-gray-400 hover:text-white hover:bg-white/8"
                }`}
              >
                <span className="text-base w-5 text-center">📊</span>
                My Balance
              </Link>
            </>
          ) : visibleNav.map(item => {
            const active = pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-colors ${
                  active
                    ? "bg-white/15 text-white"
                    : "text-gray-400 hover:text-white hover:bg-white/8"
                }`}
              >
                <span className="text-base w-5 text-center">{item.icon}</span>
                {item.label}
              </Link>
            );
          })}
        </nav>

        {/* User footer */}
        <div className="px-3 py-4 border-t border-white/10 space-y-0.5">
          <div className="px-4 py-2">
            <div className="text-white text-sm font-semibold truncate">
              {ctx.profileName || <span className="text-gray-500 italic font-normal text-xs">No name set</span>}
            </div>
            <div className="text-gray-500 text-xs mt-0.5">{ctx.role.name}</div>
          </div>
          <button
            type="button"
            onClick={sendPasswordReset}
            disabled={pwResetState !== "idle"}
            className="flex items-center gap-3 px-4 py-3 rounded-xl text-sm text-gray-400 hover:text-white hover:bg-white/8 w-full transition-colors disabled:opacity-60"
          >
            <span className="w-5 text-center">🔑</span>
            {pwResetState === "sent" ? "Email sent ✓" : pwResetState === "sending" ? "Sending…" : "Change password"}
          </button>
          <button
            type="button"
            onClick={signOut}
            className="flex items-center gap-3 px-4 py-3 rounded-xl text-sm text-gray-400 hover:text-white hover:bg-white/8 w-full transition-colors"
          >
            <span className="w-5 text-center">↩</span>
            Sign out
          </button>
        </div>
      </div>
    </>
  );
}
