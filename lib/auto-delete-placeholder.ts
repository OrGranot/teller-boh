import { createAdminClient } from "@/lib/supabase/server";

type Admin = Awaited<ReturnType<typeof createAdminClient>>;

/**
 * Deletes a placeholder employee if they have no auth account and no shifts.
 * Safe to call after any action that might leave a placeholder in this state
 * (shift deletion, email unlink, invitation cancel).
 * Returns true if the employee was deleted.
 */
export async function maybeAutoDeletePlaceholder(
  admin: Admin,
  profileId: string,
  restaurantId: string,
): Promise<boolean> {
  // Must still be a placeholder
  const { data: profile } = await admin
    .from("profiles")
    .select("is_placeholder")
    .eq("id", profileId)
    .single();
  if (!profile?.is_placeholder) return false;

  // Must have no auth account
  const { data: authUser } = await admin.auth.admin.getUserById(profileId);
  if (authUser?.user) return false;

  // Must have no shifts
  const { count } = await admin
    .from("time_records")
    .select("id", { count: "exact", head: true })
    .eq("profile_id", profileId);
  if ((count ?? 0) > 0) return false;

  // All conditions met — delete everything
  await admin.from("department_members").delete().eq("profile_id", profileId);
  await admin.from("member_contracts").delete().eq("profile_id", profileId);
  await admin.from("hours_adjustments").delete().eq("profile_id", profileId);
  await admin.from("restaurant_members")
    .delete()
    .eq("profile_id", profileId)
    .eq("restaurant_id", restaurantId);
  await admin.from("profiles").delete().eq("id", profileId);

  return true;
}
