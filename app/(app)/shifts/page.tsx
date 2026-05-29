import { createClient } from "@/lib/supabase/server";
import { getCachedUser, getCachedMember } from "@/lib/auth-cache";
import ShiftsClient from "./ShiftsClient";

export default async function ShiftsPage() {
  const [user, member] = await Promise.all([getCachedUser(), getCachedMember()]);
  if (!user || !member) return null;

  const supabase = await createClient();

  const today = new Date().toISOString().slice(0, 10);
  const isCurrentUserDeactivated = !!(member.contract_end && (member.contract_end as string) <= today);

  const role = member.role as unknown as { is_owner: boolean; permissions: Record<string, boolean> };
  const canViewAll = !isCurrentUserDeactivated && (role.is_owner || role.permissions?.can_view_all_shifts);
  const canApprove = !isCurrentUserDeactivated && (role.is_owner || role.permissions?.can_approve_shifts);
  const canEdit = !isCurrentUserDeactivated && (role.is_owner || role.permissions?.can_edit_shifts);

  const { data: departments } = await supabase
    .from("departments")
    .select("id, name, restaurant_id, created_at")
    .eq("restaurant_id", member.restaurant_id);

  // Load team members + their profiles server-side (avoids client RLS join issues)
  const { data: rawTeamMembers } = canViewAll
    ? await supabase
        .from("restaurant_members")
        .select("profile_id, contract_end, profile:profiles(name, is_placeholder)")
        .eq("restaurant_id", member.restaurant_id)
    : { data: null };

  // Build enriched team member list with employee status
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const teamMembers = (rawTeamMembers || []).map((m: any) => {
    const prof = Array.isArray(m.profile) ? m.profile[0] : m.profile;
    const isDeactivated = !!m.contract_end && m.contract_end <= today;
    const isPlaceholder = prof?.is_placeholder ?? false;
    return {
      profile_id:     m.profile_id as string,
      name:           (prof?.name as string | null) ?? null,
      employeeStatus: (isDeactivated ? "deactivated" : isPlaceholder ? "imported" : "active") as
                        "active" | "imported" | "deactivated",
    };
  });

  // Build a map profileId → name to pass to client
  const profilesMap: Record<string, string> = {};
  teamMembers.forEach(m => { profilesMap[m.profile_id] = m.name || m.profile_id; });

  // Build a map profileId → [{id, name}] using the dept IDs we already loaded
  const deptIds = (departments || []).map(d => d.id);
  const profileDeptMap: Record<string, { id: string; name: string }[]> = {};
  if (deptIds.length > 0) {
    const { data: deptMembers } = await supabase
      .from("department_members")
      .select("profile_id, department_id")
      .in("department_id", deptIds);

    const deptById = Object.fromEntries((departments || []).map(d => [d.id, d]));
    for (const dm of deptMembers || []) {
      const dept = deptById[dm.department_id];
      if (!dept) continue;
      if (!profileDeptMap[dm.profile_id]) profileDeptMap[dm.profile_id] = [];
      profileDeptMap[dm.profile_id].push({ id: dept.id, name: dept.name });
    }
  }

  return (
    <ShiftsClient
      currentUserId={user.id}
      restaurantId={member.restaurant_id}
      canViewAll={!!canViewAll}
      canApprove={!!canApprove}
      canEdit={!!canEdit}
      isCurrentUserDeactivated={isCurrentUserDeactivated}
      departments={departments || []}
      teamMembers={teamMembers}
      profilesMap={profilesMap}
      profileDeptMap={profileDeptMap}
    />
  );
}
