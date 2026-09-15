import { createClient, createAdminClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { getCachedUser, getCachedMember } from "@/lib/auth-cache";
import Link from "next/link";
import MemberActions from "./MemberActions";
import MemberInfoClient from "./MemberInfoClient";
import MemberShiftsClient from "./MemberShiftsClient";
import MemberMergeButton from "./MemberMergeButton";
import MemberDeleteButton from "./MemberDeleteButton";
import MemberNameHeader from "./MemberNameHeader";
import ContractBalanceClient from "./ContractBalanceClient";
import DepartmentTags from "@/components/DepartmentTags";
import RoleTag from "./RoleTag";
import type { ContractPeriod } from "@/lib/hours-balance";
import ActiveShiftBanner from "./ActiveShiftBanner";

export default async function MemberPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  // Use cached auth — layout already fetched these this request
  const [user, currentMember] = await Promise.all([getCachedUser(), getCachedMember()]);
  if (!user || !currentMember) redirect("/login");

  const supabase = await createClient();
  const admin = await createAdminClient();

  const currentRole = currentMember.role as unknown as { is_owner: boolean } | null;
  const isOwner = !!currentRole?.is_owner;

  // Non-owners can only view their own profile
  if (!isOwner && id !== user.id) redirect("/shifts");

  const { data: member } = await supabase
    .from("restaurant_members")
    .select("id, profile_id, restaurant_id, role_id, contract_start, contract_end, created_at, profile:profiles(name, phone, address, birthdate, is_placeholder), role:roles(id, name, is_owner, permissions)")
    .eq("profile_id", id)
    .single();

  if (!member) return <div className="px-8 py-6 text-gray-500">Member not found.</div>;

  const profile = member.profile as unknown as { name: string | null; phone: string | null; address: string | null; birthdate: string | null; is_placeholder: boolean } | null;
  const role = member.role as unknown as { id: string; name: string; is_owner: boolean } | null;

  // Get email from auth.users (only available server-side with admin)
  const { data: authUser } = await admin.auth.admin.getUserById(id);
  const authEmail = authUser?.user?.email ?? null;

  // For placeholder profiles that have no auth account yet, look up any pending
  // invitation so we can still show the email and let owners cancel it.
  let inviteEmail: string | null = null;
  if (!authEmail && profile?.is_placeholder) {
    const { data: pendingInvite } = await admin
      .from("invitations")
      .select("email")
      .eq("restaurant_id", currentMember!.restaurant_id)
      .eq("placeholder_profile_id", id)
      .in("status", ["sent", "approved", "pending_approval"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    inviteEmail = pendingInvite?.email ?? null;
  }

  const email            = authEmail ?? inviteEmail ?? null;
  const hasPendingInvite = !authUser?.user && !!inviteEmail;

  // Load all roles (owner only — needed for the role tag popover)
  const { data: allRoles } = isOwner
    ? await supabase.from("roles").select("id, name, is_owner").eq("restaurant_id", currentMember!.restaurant_id)
    : { data: null };

  // Load real (non-placeholder) employees for the merge dropdown
  const { data: realMembers } = profile?.is_placeholder && isOwner
    ? await admin
        .from("restaurant_members")
        .select("profile_id, profile:profiles(name, is_placeholder)")
        .eq("restaurant_id", currentMember!.restaurant_id)
        .neq("profile_id", id)
    : { data: null };

  const mergeableEmployees = (realMembers || [])
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .map((m: any) => {
      const prof = Array.isArray(m.profile) ? m.profile[0] : m.profile;
      return {
        profile_id: m.profile_id as string,
        name: prof?.name ?? null,
        is_placeholder: prof?.is_placeholder ?? false,
      };
    })
    .sort((a: { name: string | null }, b: { name: string | null }) =>
      (a.name || "").localeCompare(b.name || "")
    );

  // Load contracts for this employee
  const { data: rawContracts } = await supabase
    .from("member_contracts")
    .select("id, valid_from, valid_until, hours_per_week, days_per_week, vacation_days_per_year, salary, sick_days")
    .eq("profile_id", id)
    .eq("restaurant_id", currentMember!.restaurant_id)
    .order("valid_from", { ascending: true });

  const contracts: ContractPeriod[] = (rawContracts || []).map(c => ({
    id:                    c.id,
    valid_from:            c.valid_from,
    valid_until:           c.valid_until ?? null,
    hours_per_week:        c.hours_per_week != null ? Number(c.hours_per_week) : null,
    days_per_week:         c.days_per_week  != null ? Number(c.days_per_week)  : null,
    vacation_days_per_year: c.vacation_days_per_year != null ? Number(c.vacation_days_per_year) : null,
    salary:                c.salary != null ? Number(c.salary) : null,
    sick_days:             Number(c.sick_days ?? 0),
  }));

  // Check if the employee is currently clocked in
  const { data: activeShift } = await supabase
    .from("time_records")
    .select("id, clocked_in_at")
    .eq("profile_id", id)
    .eq("status", "active")
    .limit(1)
    .maybeSingle();

  // Find first and last shifts for navigation anchors
  const [{ data: latestShift }, { data: firstShift }] = await Promise.all([
    supabase
      .from("time_records")
      .select("clocked_in_at")
      .eq("profile_id", id)
      .order("clocked_in_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("time_records")
      .select("clocked_in_at")
      .eq("profile_id", id)
      .order("clocked_in_at", { ascending: true })
      .limit(1)
      .maybeSingle(),
  ]);

  const latestDate   = latestShift?.clocked_in_at ? new Date(latestShift.clocked_in_at) : new Date();
  const initialYear  = latestDate.getFullYear();
  const initialMonth = latestDate.getMonth();

  const firstShiftISO = firstShift?.clocked_in_at  ? firstShift.clocked_in_at.slice(0, 10)  : null;
  const lastShiftISO  = latestShift?.clocked_in_at ? latestShift.clocked_in_at.slice(0, 10) : null;

  // Load shifts for the initial month (shifts panel)
  const monthStart = new Date(initialYear, initialMonth, 1).toISOString();
  const monthEnd   = new Date(initialYear, initialMonth + 1, 0, 23, 59, 59).toISOString();
  const { data: initialShifts } = await supabase
    .from("time_records")
    .select("id, profile_id, clocked_in_at, clocked_out_at, status, notes")
    .eq("profile_id", id)
    .gte("clocked_in_at", monthStart)
    .lte("clocked_in_at", monthEnd)
    .order("clocked_in_at", { ascending: false });

  const [{ data: deptMemberships }, { data: allDepartments }] = await Promise.all([
    supabase
      .from("department_members")
      .select("department:departments(id, name)")
      .eq("profile_id", id),
    supabase
      .from("departments")
      .select("id, name")
      .eq("restaurant_id", currentMember!.restaurant_id)
      .order("name"),
  ]);

  // Load hours adjustments (overtime payouts)
  const { data: adjustments } = await supabase
    .from("hours_adjustments")
    .select("id, hours, note, adjustment_date")
    .eq("profile_id", id)
    .order("adjustment_date", { ascending: false });

  // ALL shifts for the employee (balance calculation)
  const { data: allShifts } = await supabase
    .from("time_records")
    .select("clocked_in_at, clocked_out_at, status")
    .eq("profile_id", id)
    .order("clocked_in_at", { ascending: false });

  // Auto-delete: placeholder with no email and no shifts → clean up and redirect
  if (isOwner && profile?.is_placeholder && !authEmail && (allShifts ?? []).length === 0) {
    const { maybeAutoDeletePlaceholder } = await import("@/lib/auto-delete-placeholder");
    await maybeAutoDeletePlaceholder(admin, id, currentMember!.restaurant_id);
    redirect("/team");
  }

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-4 sm:py-6">
      <Link href="/team" className="text-sm text-gray-400 hover:text-gray-600 mb-4 inline-block">
        ← Back to team
      </Link>

      {/* Placeholder / imported employee banner */}
      {profile?.is_placeholder && isOwner && (
        <div className="mb-6 bg-amber-50 border border-amber-200 rounded-xl px-5 py-4">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <p className="text-sm font-semibold text-amber-800">Imported record — no account yet</p>
              <p className="text-xs text-amber-600 mt-0.5">
                This employee was created from a CSV import. You can invite them by adding an email below, or merge their shifts into an existing employee.
              </p>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
            <MemberMergeButton
              placeholderId={id}
              placeholderName={profile?.name ?? null}
              employees={mergeableEmployees}
            />
            <MemberDeleteButton profileId={id} restaurantId={currentMember!.restaurant_id} />
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-6">
        <div className="min-w-0">
          <MemberNameHeader
            profileId={id}
            initialName={profile?.name ?? null}
            canEdit={isOwner}
          />
          <div className="mt-1.5 flex items-center gap-2 flex-wrap">
            <RoleTag
              profileId={id}
              initialRole={role ? { id: role.id, name: role.name, is_owner: role.is_owner } : null}
              allRoles={(allRoles || []) as { id: string; name: string; is_owner: boolean }[]}
              canEdit={isOwner && id !== user!.id}
            />
            <DepartmentTags
              profileId={id}
              initialDepartments={(deptMemberships || [])
                .map(dm => dm.department as unknown as { id: string; name: string } | null)
                .filter(Boolean) as { id: string; name: string }[]}
              allDepartments={(allDepartments || []) as unknown as { id: string; name: string }[]}
              canEdit={isOwner}
              canCreate={isOwner}
            />
          </div>
        </div>
        {isOwner && id !== user!.id && (
          <div className="shrink-0">
            <MemberActions
              profileId={id}
              contractEnd={member.contract_end ?? null}
              isPlaceholder={profile?.is_placeholder ?? false}
            />
          </div>
        )}
      </div>

      {/* Active shift banner (owner view) */}
      {activeShift && isOwner && (
        <ActiveShiftBanner shiftId={activeShift.id} clockedInAt={activeShift.clocked_in_at} />
      )}

      {/* Personal info */}
      <MemberInfoClient
        profileId={id}
        canEdit={isOwner}
        isPlaceholder={profile?.is_placeholder ?? false}
        hasPendingInvite={hasPendingInvite}
        initial={{
          email,
          phone:    profile?.phone     ?? null,
          address:  profile?.address   ?? null,
          birthdate: profile?.birthdate ?? null,
        }}
      />

      {/* Unified contracts + hours balance card — owners only, hidden from the employee's own view */}
      {isOwner && (
        <ContractBalanceClient
          profileId={id}
          canEdit={isOwner}
          initialContracts={contracts}
          firstShiftISO={firstShiftISO}
          employmentEnd={member.contract_end ?? null}
          serverToday={new Date().toISOString().slice(0, 10)}
          allShifts={(allShifts || []) as { clocked_in_at: string; clocked_out_at: string | null; status: string }[]}
          adjustments={(adjustments || []) as { id: string; hours: number; note: string | null; adjustment_date: string }[]}
        />
      )}

      <MemberShiftsClient
        profileId={id}
        restaurantId={member.restaurant_id}
        memberName={profile?.name ?? null}
        currentUserId={user!.id}
        canEdit={isOwner}
        canApprove={isOwner}
        initialYear={initialYear}
        initialMonth={initialMonth}
        initialShifts={initialShifts || []}
        firstShiftISO={firstShiftISO}
        lastShiftISO={lastShiftISO}
      />
    </div>
  );
}
