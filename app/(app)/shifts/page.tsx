import { createClient } from "@/lib/supabase/server";
import ShiftsClient from "./ShiftsClient";

export default async function ShiftsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: member } = await supabase
    .from("restaurant_members")
    .select("restaurant_id, role:roles(is_owner, permissions)")
    .eq("profile_id", user.id)
    .single();

  if (!member) return null;

  const role = member.role as { is_owner: boolean; permissions: Record<string, boolean> };
  const canViewAll = role.is_owner || role.permissions?.can_view_all_shifts;
  const canApprove = role.is_owner || role.permissions?.can_approve_shifts;
  const canEdit = role.is_owner || role.permissions?.can_edit_shifts;

  const { data: departments } = await supabase
    .from("departments")
    .select("id, name")
    .eq("restaurant_id", member.restaurant_id);

  // Load team members + their profiles server-side (avoids client RLS join issues)
  const { data: rawTeamMembers } = canViewAll
    ? await supabase
        .from("restaurant_members")
        .select("profile_id, contract_end, profile:profiles(name, is_placeholder)")
        .eq("restaurant_id", member.restaurant_id)
    : { data: null };

  const today = new Date().toISOString().slice(0, 10);

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
      departments={departments || []}
      teamMembers={teamMembers}
      profilesMap={profilesMap}
      profileDeptMap={profileDeptMap}
    />
  );
}
