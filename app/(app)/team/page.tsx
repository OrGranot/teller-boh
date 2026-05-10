import { createClient } from "@/lib/supabase/server";
import { calcMultiContractBalance, type ContractPeriod } from "@/lib/hours-balance";
import TeamTableClient, { type MemberRow } from "./TeamTableClient";

export default async function TeamPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: me } = await supabase
    .from("restaurant_members")
    .select("restaurant_id")
    .eq("profile_id", user.id)
    .single();

  if (!me) return null;

  const { restaurantId } = { restaurantId: me.restaurant_id };

  // ── Parallel fetches ──────────────────────────────────────────────────────
  const [
    { data: rawMembers },
    { data: allDepartments },
    { data: allDeptMembers },
    { data: allContracts },
  ] = await Promise.all([
    supabase
      .from("restaurant_members")
      .select(
        "id, profile_id, contract_end, created_at, profile:profile_id(name, is_placeholder), role:roles(name, is_owner)"
      )
      .eq("restaurant_id", restaurantId)
      .order("created_at", { ascending: true }),

    supabase
      .from("departments")
      .select("id, name")
      .eq("restaurant_id", restaurantId)
      .order("name"),

    supabase
      .from("department_members")
      .select("profile_id, department:departments(id, name)")
      .eq("departments.restaurant_id", restaurantId),

    // All contracts for all employees in this restaurant
    supabase
      .from("member_contracts")
      .select("id, profile_id, valid_from, valid_until, hours_per_week, days_per_week, vacation_days_per_year, salary, sick_days")
      .eq("restaurant_id", restaurantId),
  ]);

  // Group contracts by profile_id
  const contractsByProfile: Record<string, ContractPeriod[]> = {};
  for (const c of allContracts || []) {
    if (!contractsByProfile[c.profile_id]) contractsByProfile[c.profile_id] = [];
    contractsByProfile[c.profile_id].push({
      id:                    c.id,
      valid_from:            c.valid_from,
      valid_until:           c.valid_until ?? null,
      hours_per_week:        c.hours_per_week != null ? Number(c.hours_per_week) : null,
      days_per_week:         c.days_per_week  != null ? Number(c.days_per_week)  : null,
      vacation_days_per_year: c.vacation_days_per_year != null ? Number(c.vacation_days_per_year) : null,
      salary:                c.salary != null ? Number(c.salary) : null,
      sick_days:             Number(c.sick_days ?? 0),
    });
  }

  // Group dept memberships by profile_id
  const deptsByProfile: Record<string, { id: string; name: string }[]> = {};
  for (const dm of allDeptMembers || []) {
    const dept = dm.department as unknown as { id: string; name: string } | null;
    if (!dept) continue;
    if (!deptsByProfile[dm.profile_id]) deptsByProfile[dm.profile_id] = [];
    deptsByProfile[dm.profile_id].push(dept);
  }

  const today   = new Date().toISOString().slice(0, 10);
  const members = rawMembers || [];

  // ── Fetch shifts + adjustments per employee in parallel ────────────────────
  const balanceMembers = members.filter(m => (contractsByProfile[m.profile_id] ?? []).length > 0);
  const shiftsByProfile:      Record<string, { clocked_in_at: string; clocked_out_at: string | null }[]> = {};
  const adjustmentsByProfile: Record<string, { id: string; hours: number; note: string | null; adjustment_date: string }[]> = {};

  await Promise.all(
    balanceMembers.map(async (m) => {
      const [shiftsResult, adjResult] = await Promise.all([
        supabase
          .from("time_records")
          .select("clocked_in_at, clocked_out_at")
          .eq("profile_id", m.profile_id),
        supabase
          .from("hours_adjustments")
          .select("id, hours, note, adjustment_date")
          .eq("profile_id", m.profile_id),
      ]);
      shiftsByProfile[m.profile_id]      = shiftsResult.data || [];
      adjustmentsByProfile[m.profile_id] = adjResult.data   || [];
    })
  );

  // ── Build flat rows ───────────────────────────────────────────────────────
  const rows: MemberRow[] = members.map(m => {
    const profile = m.profile as unknown as { name: string | null; is_placeholder: boolean } | null;
    const role    = m.role    as unknown as { name: string; is_owner: boolean }               | null;

    const isDeactivated = !!m.contract_end && m.contract_end <= today;
    const isPlaceholder = profile?.is_placeholder ?? false;

    const status: MemberRow["status"] =
      isDeactivated ? "deactivated" :
      isPlaceholder ? "imported"    :
      "active";

    const memberContracts = contractsByProfile[m.profile_id] ?? [];

    // Use the latest contract's hours_per_week for display in the table
    const latestContract = memberContracts.length > 0
      ? [...memberContracts].sort((a, b) => b.valid_from.localeCompare(a.valid_from))[0]
      : null;

    const balanceResult = memberContracts.length > 0
      ? calcMultiContractBalance(
          memberContracts,
          m.contract_end ?? today,
          shiftsByProfile[m.profile_id]      || [],
          adjustmentsByProfile[m.profile_id] || [],
        )
      : null;

    return {
      id:             m.id,
      profile_id:     m.profile_id,
      name:           profile?.name               ?? null,
      is_placeholder: isPlaceholder,
      role_name:      role?.name                  ?? null,
      is_owner:       role?.is_owner              ?? false,
      hours_per_week: latestContract?.hours_per_week != null ? Number(latestContract.hours_per_week) : null,
      salary:         latestContract?.salary         != null ? Number(latestContract.salary)         : null,
      contract_start: memberContracts.length > 0
        ? [...memberContracts].sort((a, b) => a.valid_from.localeCompare(b.valid_from))[0].valid_from
        : null,
      contract_end:         m.contract_end              ?? null,
      contract_valid_until: latestContract?.valid_until  ?? null,
      balance:              balanceResult?.total.balance ?? null,
      status,
      departments:          deptsByProfile[m.profile_id] || [],
    };
  });

  return (
    <div className="px-4 sm:px-6 py-6 sm:py-10">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Team</h1>
      </div>

      <TeamTableClient
        members={rows}
        allDepartments={allDepartments || []}
        serverToday={today}
      />
    </div>
  );
}
