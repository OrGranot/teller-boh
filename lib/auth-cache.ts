/**
 * React.cache() wrappers for auth data.
 *
 * React.cache() deduplicates calls within the same React render tree (i.e. per
 * request). The layout and every page component call these same functions, but
 * the actual Supabase requests only execute once — subsequent calls return the
 * cached result immediately.
 */
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

/** Returns the authenticated Supabase user, or null if not logged in. */
export const getCachedUser = cache(async () => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
});

/**
 * Returns the current user's restaurant membership (with role + restaurant
 * name), or null if they have no membership.
 *
 * Uses the comprehensive select needed by the layout; pages can read any subset
 * of the returned fields without triggering an extra DB round-trip.
 */
export const getCachedMember = cache(async () => {
  const user = await getCachedUser();
  if (!user) return null;
  const supabase = await createClient();
  const { data: member } = await supabase
    .from("restaurant_members")
    .select("*, role:roles(*), restaurant:restaurants(name)")
    .eq("profile_id", user.id)
    .limit(1)
    .single();
  return member ?? null;
});
