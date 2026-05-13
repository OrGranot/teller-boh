/**
 * Netlify scheduled function — runs daily at midnight UTC.
 * Finds invitations that have passed their expires_at date, marks them cancelled,
 * and auto-deletes placeholder profiles that have no shifts.
 */

const SUPABASE_URL  = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE  = process.env.SUPABASE_SERVICE_ROLE_KEY;

const headers = {
  apikey:        SERVICE_ROLE,
  Authorization: `Bearer ${SERVICE_ROLE}`,
  "Content-Type": "application/json",
  Prefer: "return=minimal",
};

async function sb(path, method = "GET", body) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1${path}`, {
    method,
    headers,
    ...(body != null ? { body: JSON.stringify(body) } : {}),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Supabase ${method} ${path} → ${res.status}: ${text}`);
  }
  return method === "GET" ? res.json() : null;
}

export const handler = async () => {
  const now = new Date().toISOString();

  // 1. Find all invitations that are past their expiry and not yet resolved
  const expired = await sb(
    `/invitations?status=in.(sent,approved,pending_approval)&expires_at=lt.${now}&select=id,placeholder_profile_id`
  );

  if (!expired.length) {
    console.log("cleanup-expired-invitations: nothing to do");
    return { statusCode: 200 };
  }

  console.log(`cleanup-expired-invitations: processing ${expired.length} expired invitation(s)`);

  for (const inv of expired) {
    // 2. Mark the invitation as cancelled
    await sb(`/invitations?id=eq.${inv.id}`, "PATCH", { status: "cancelled" });

    if (!inv.placeholder_profile_id) continue;
    const pid = inv.placeholder_profile_id;

    // 3. Only touch placeholder profiles (not real accounts)
    const [profile] = await sb(
      `/profiles?id=eq.${pid}&is_placeholder=eq.true&select=id`
    );
    if (!profile) continue;

    // 4. Check for any shifts
    const shifts = await sb(
      `/time_records?profile_id=eq.${pid}&select=id&limit=1`
    );
    if (shifts.length > 0) {
      console.log(`  placeholder ${pid} has shifts — keeping profile`);
      continue;
    }

    // 5. No shifts — safe to delete
    await sb(`/restaurant_members?profile_id=eq.${pid}`, "DELETE");
    await sb(`/profiles?id=eq.${pid}`, "DELETE");
    console.log(`  deleted placeholder profile ${pid}`);
  }

  return { statusCode: 200 };
};
