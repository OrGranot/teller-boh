"use client";
import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { AppContext } from "@/lib/types";
import { useImport } from "@/lib/import-context";

// ─── Nav structure ───────────────────────────────────────────────────────────

interface NavItem {
  href: string;
  label: string;
  ownerOnly?: boolean;
  permission?: string;
  anyPermission?: string[];
}

interface NavGroup {
  id: string;
  label: string;
  icon: string;
  // group is visible if: owner, OR has any of anyPermission, OR none specified (always show)
  anyPermission?: string[];
  ownerOnly?: boolean;
  items: NavItem[];
}

const NAV_GROUPS: NavGroup[] = [
  {
    id: "people",
    label: "People",
    icon: "⏱",
    items: [
      { href: "/shifts",      label: "Shifts" },
      { href: "/team",        label: "Team",        anyPermission: ["can_view_all_shifts"] },
      { href: "/departments", label: "Departments", anyPermission: ["can_manage_departments"] },
      { href: "/roles",       label: "Roles",       ownerOnly: true },
    ],
  },
  {
    id: "finance",
    label: "Finance",
    icon: "🧾",
    anyPermission: ["can_manage_invoices", "can_manage_bewirtungsbeleg", "can_manage_vouchers"],
    items: [
      { href: "/invoices",              label: "Invoices",          anyPermission: ["can_manage_invoices"] },
      { href: "/invoices/new",          label: "New Invoice",       anyPermission: ["can_manage_invoices"] },
      { href: "/bewirtungsbeleg/new",   label: "Bewirtungsbeleg",   anyPermission: ["can_manage_bewirtungsbeleg"] },
      { href: "/vouchers",              label: "Vouchers",          anyPermission: ["can_manage_vouchers"] },
    ],
  },
  {
    id: "catalog",
    label: "Catalog",
    icon: "◈",
    anyPermission: ["can_manage_invoices"],
    items: [
      { href: "/contacts", label: "Contacts", anyPermission: ["can_manage_invoices"] },
      { href: "/items",    label: "Items",    anyPermission: ["can_manage_invoices"] },
    ],
  },
  {
    id: "settings",
    label: "Settings",
    icon: "⚙",
    ownerOnly: true,
    items: [
      { href: "/company-settings", label: "Company", ownerOnly: true },
    ],
  },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function canSee(
  item: { ownerOnly?: boolean; permission?: string; anyPermission?: string[] },
  isOwner: boolean,
  perms: Record<string, boolean>,
): boolean {
  if (isOwner) return true;
  if (item.ownerOnly) return false;
  if (item.permission) return !!perms[item.permission];
  if (item.anyPermission) return item.anyPermission.some(p => !!perms[p]);
  return true;
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function Sidebar({ ctx }: { ctx: AppContext }) {
  const pathname  = usePathname();
  const router    = useRouter();
  const { job, fileCount, isRunning, showResult, startError, dismiss } = useImport();

  const [openGroups, setOpenGroups]   = useState<Record<string, boolean>>(() => {
    // Auto-open the group that contains the current path
    const init: Record<string, boolean> = {};
    for (const g of NAV_GROUPS) {
      if (g.items.some(item => pathname.startsWith(item.href))) init[g.id] = true;
    }
    return init;
  });
  const [editingName,  setEditingName]  = useState(false);
  const [nameInput,    setNameInput]    = useState(ctx.profileName || "");
  const [savingName,   setSavingName]   = useState(false);
  const [pwResetState, setPwResetState] = useState<"idle" | "sending" | "sent">("idle");

  const perms   = ctx.role.permissions as Record<string, boolean>;
  const isOwner = ctx.role.is_owner;

  // Basic employees see a flat two-item nav (no groups, no dropdowns)
  const isEmployee = !isOwner && !perms.can_view_all_shifts && !perms.can_manage_departments &&
    !perms.can_manage_invoices && !perms.can_manage_bewirtungsbeleg && !perms.can_manage_vouchers;

  function toggleGroup(id: string) {
    setOpenGroups(prev => ({ ...prev, [id]: !prev[id] }));
  }

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

  async function saveName() {
    if (!nameInput.trim()) return;
    setSavingName(true);
    await fetch("/api/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: nameInput.trim() }),
    });
    setSavingName(false);
    setEditingName(false);
    router.refresh();
  }

  return (
    <aside className="hidden md:flex w-56 flex-col fixed inset-y-0 left-0 z-20" style={{ background: "#1a1a1a" }}>
      {/* Logo */}
      <div className="px-5 py-5 border-b border-white/10">
        <span className="text-white font-bold text-lg tracking-tight">Teller Berlin</span>
        <span className="text-gray-400 text-xs block mt-0.5 truncate">{ctx.restaurantName}</span>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-3 overflow-y-auto">

        {/* ── Employee flat nav ── */}
        {isEmployee ? (
          <div className="space-y-0.5">
            {/* Dashboard — placeholder until built */}
            <span className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-gray-600 cursor-not-allowed select-none">
              <span className="text-sm w-5 text-center flex-shrink-0">◎</span>
              <span className="font-medium">Dashboard</span>
              <span className="ml-auto text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-white/10 text-gray-500">soon</span>
            </span>
            <Link
              href="/shifts"
              className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors ${
                pathname.startsWith("/shifts")
                  ? "bg-white/15 text-white font-semibold"
                  : "text-gray-400 hover:text-white hover:bg-white/8"
              }`}
            >
              <span className="text-sm w-5 text-center flex-shrink-0">⏱</span>
              <span className="font-medium">Shifts</span>
            </Link>
          </div>
        ) : (

        /* ── Owner / manager grouped nav ── */
        NAV_GROUPS.map(group => {
          const groupVisible = canSee(group, isOwner, perms);
          if (!groupVisible) return null;

          const visibleItems = group.items.filter(item => canSee(item, isOwner, perms));
          if (visibleItems.length === 0) return null;

          const isOpen      = openGroups[group.id] ?? false;
          const groupActive = visibleItems.some(item =>
            item.href === "/invoices/new"
              ? pathname === item.href
              : pathname.startsWith(item.href) && item.href !== "/invoices/new"
          );

          return (
            <div key={group.id} className="mb-1">
              <button
                onClick={() => toggleGroup(group.id)}
                className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors ${
                  groupActive && !isOpen
                    ? "bg-white/10 text-white font-semibold"
                    : "text-gray-400 hover:text-white hover:bg-white/8"
                }`}
              >
                <span className="text-sm w-5 text-center flex-shrink-0">{group.icon}</span>
                <span className="flex-1 text-left font-medium">{group.label}</span>
                <span className={`text-xs transition-transform duration-200 ${isOpen ? "rotate-90" : ""}`}>›</span>
              </button>

              {isOpen && (
                <div className="ml-3 mt-0.5 border-l border-white/10 pl-2 space-y-0.5">
                  {visibleItems.map(item => {
                    const active = item.href === "/invoices/new"
                      ? pathname === item.href
                      : pathname.startsWith(item.href) && !(item.href === "/invoices" && pathname.startsWith("/invoices/new"));
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors ${
                          active
                            ? "bg-white/15 text-white font-semibold"
                            : "text-gray-400 hover:text-white hover:bg-white/8"
                        }`}
                      >
                        {item.label}
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })
        )}
      </nav>

      {/* Import status */}
      {(isRunning || showResult || startError) && (
        <div className="mx-3 mb-3 rounded-xl overflow-hidden text-xs">
          {isRunning && job && (
            <div className="bg-white/8 px-3 py-2.5">
              <div className="flex items-center gap-2 mb-1.5">
                <span className="inline-block w-2.5 h-2.5 border-2 border-gray-500 border-t-white rounded-full animate-spin flex-shrink-0" />
                <span className="text-gray-300 font-medium">Importing {fileCount} file{fileCount !== 1 ? "s" : ""}…</span>
              </div>
              <div className="w-full bg-white/10 rounded-full h-1">
                <div className="bg-white h-1 rounded-full transition-all duration-500" style={{ width: `${job.progress}%` }} />
              </div>
              <p className="text-gray-500 mt-1">{job.processed}/{job.total} rows</p>
            </div>
          )}
          {showResult && job && (
            <div className="bg-white/8 px-3 py-2.5">
              <div className="flex items-start justify-between gap-1">
                <div className="min-w-0">
                  <p className="text-green-400 font-semibold">✓ {job.shiftsImported} shifts imported</p>
                  {(job.createdEmployees ?? []).length > 0 && (
                    <p className="text-gray-400 mt-0.5">{job.createdEmployees.length} new employee{job.createdEmployees.length !== 1 ? "s" : ""} created</p>
                  )}
                  {(job.errors ?? []).length > 0 && (
                    <p className="text-red-400 mt-0.5">{job.errors.length} error{job.errors.length !== 1 ? "s" : ""}</p>
                  )}
                </div>
                <button onClick={dismiss} className="text-gray-500 hover:text-white text-base leading-none flex-shrink-0 mt-0.5">×</button>
              </div>
            </div>
          )}
          {startError && (
            <div className="bg-red-900/40 px-3 py-2.5">
              <div className="flex items-start justify-between gap-1">
                <p className="text-red-400">{startError}</p>
                <button onClick={dismiss} className="text-red-400 hover:text-white text-base leading-none flex-shrink-0">×</button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* User */}
      <div className="px-3 py-4 border-t border-white/10 space-y-0.5">
        {editingName ? (
          <div className="px-3 mb-1 space-y-1.5">
            <input
              autoFocus
              type="text"
              value={nameInput}
              onChange={e => setNameInput(e.target.value)}
              onKeyDown={e => {
                if (e.key === "Enter") saveName();
                if (e.key === "Escape") setEditingName(false);
              }}
              className="w-full bg-white/10 text-white text-sm rounded-lg px-2 py-1.5 border border-white/20 focus:outline-none focus:border-white/50"
            />
            <div className="flex gap-1">
              <button onClick={saveName} disabled={savingName}
                className="flex-1 text-xs bg-white/15 hover:bg-white/25 text-white rounded-lg py-1 disabled:opacity-50 transition-colors">
                {savingName ? "…" : "Save"}
              </button>
              <button onClick={() => setEditingName(false)}
                className="flex-1 text-xs text-gray-400 hover:text-white rounded-lg py-1 transition-colors">
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => { setNameInput(ctx.profileName || ""); setEditingName(true); }}
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-gray-400 hover:text-white hover:bg-white/8 w-full transition-colors group text-left"
          >
            <span className="text-base w-5 text-center">👤</span>
            <div className="min-w-0">
              <div className="text-white text-xs font-semibold truncate">
                {ctx.profileName || <span className="text-gray-500 italic font-normal">Add name</span>}
              </div>
              <div className="text-gray-500 text-xs truncate">{ctx.role.name}</div>
            </div>
          </button>
        )}
        <button
          onClick={sendPasswordReset}
          disabled={pwResetState !== "idle"}
          className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-gray-400 hover:text-white hover:bg-white/8 w-full transition-colors disabled:opacity-60"
        >
          <span className="text-base w-5 text-center">🔑</span>
          {pwResetState === "sent" ? "Email sent ✓" : pwResetState === "sending" ? "Sending…" : "Change password"}
        </button>
        <button
          onClick={signOut}
          className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-gray-400 hover:text-white hover:bg-white/8 w-full transition-colors"
        >
          <span className="text-base w-5 text-center">↩</span>
          Sign out
        </button>
      </div>
    </aside>
  );
}
