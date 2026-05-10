import { NextRequest, NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { jobs, restaurantNameMaps } from "@/lib/import-jobs";

// ── CSV parsing ───────────────────────────────────────────────
function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;
  for (const char of line) {
    if (char === '"') { inQuotes = !inQuotes; }
    else if (char === "," && !inQuotes) { result.push(current); current = ""; }
    else { current += char; }
  }
  result.push(current);
  return result;
}

function parseCSV(content: string): Record<string, string>[] {
  const lines = content.trim().split(/\r?\n/).filter(Boolean);
  const headers = parseCSVLine(lines[0]).map(h => h.trim());
  return lines.slice(1).map(line => {
    const values = parseCSVLine(line);
    const row: Record<string, string> = {};
    headers.forEach((h, i) => { row[h] = (values[i] ?? "").trim(); });
    return row;
  });
}

// ── Time parsing ─────────────────────────────────────────────
function parse12HourTime(raw: string): { h: number; m: number } {
  const s = raw.trim().toUpperCase();
  const isPM = s.includes("PM");
  const clean = s.replace(/[AP]M/g, "").trim();
  const [hStr, mStr] = clean.split(":");
  let h = parseInt(hStr, 10);
  const m = parseInt(mStr, 10);
  if (isPM && h !== 12) h += 12;
  if (!isPM && h === 12) h = 0;
  return { h, m };
}

function buildISO(dateStr: string, timeRaw: string, nextDay = false): string {
  const { h, m } = parse12HourTime(timeRaw);
  const d = new Date(`${dateStr}T00:00:00`);
  if (nextDay) d.setDate(d.getDate() + 1);
  d.setHours(h, m, 0, 0);
  return d.toISOString();
}

function normalizeName(name: string): string {
  return name.toLowerCase().replace(/\s+/g, " ").trim();
}

// ── DB name map: members of this restaurant → { normalizedName: profileId } ──
async function buildNameMap(
  admin: Awaited<ReturnType<typeof createAdminClient>>,
  restaurantId: string
): Promise<Record<string, string>> {
  const { data: members } = await admin
    .from("restaurant_members")
    .select("profile_id")
    .eq("restaurant_id", restaurantId);

  const profileIds = (members ?? []).map((m: { profile_id: string }) => m.profile_id);
  if (!profileIds.length) return {};

  const { data: profiles } = await admin
    .from("profiles")
    .select("id, name")
    .in("id", profileIds);

  const map: Record<string, string> = {};
  (profiles ?? []).forEach((p: { id: string; name: string | null }) => {
    const key = p.name ? normalizeName(p.name) : null;
    if (key) map[key] = p.id;
  });
  return map;
}

// ── Pre-flight: resolve ALL unique employee names before processing shifts ────
// Creates placeholder profiles for any unknown employees, returns complete nameMap.
// Running this synchronously in the POST handler (before the background job) means
// the shift loop never needs to touch the profiles/members tables at all.
async function resolveEmployees(
  admin: Awaited<ReturnType<typeof createAdminClient>>,
  restaurantId: string,
  defaultRoleId: string,
  rows: Record<string, string>[]
): Promise<{ nameMap: Record<string, string>; createdEmployees: string[]; errors: string[] }> {
  // Collect unique names from this CSV
  const uniqueNames = new Map<string, string>(); // normalizedName → displayName
  for (const row of rows) {
    const first = row["First"]?.trim();
    const last  = row["Last"]?.trim();
    if (!first) continue;
    const full = last ? `${first} ${last}` : first;
    uniqueNames.set(normalizeName(full), full);
  }

  // Always start nameMap from a fresh DB read — ignores stale cache UUIDs that
  // may refer to profiles deleted between import sessions.
  const fresh   = await buildNameMap(admin, restaurantId);
  const nameMap = { ...fresh };
  // Merge fresh DB data INTO the existing cache (don't overwrite it).
  // Entries created by earlier files in this batch survive in the cache even when
  // PgBouncer hasn't replicated them yet — fresh takes precedence for the same key.
  const existingCache = restaurantNameMaps.get(restaurantId) ?? {};
  restaurantNameMaps.set(restaurantId, { ...existingCache, ...fresh });

  const createdEmployees: string[] = [];
  const errors: string[] = [];

  // Create missing employees one at a time (sequential avoids parallel duplicate inserts)
  for (const [nameKey, fullName] of uniqueNames) {
    if (nameMap[nameKey]) continue; // already known

    const newId = crypto.randomUUID();
    const { error: profileErr } = await admin.from("profiles").insert({
      id: newId,
      name: fullName,
      is_placeholder: true,
      restaurant_id: restaurantId, // used by unique index: (restaurant_id, lower(trim(name)))
    });

    if (profileErr) {
      // 23505 = unique constraint violation — profile already exists for this restaurant+name.
      if (profileErr.code === "23505" || profileErr.message?.includes("unique") || profileErr.message?.includes("duplicate")) {
        // 1. Check in-memory cache first — fast, handles PgBouncer read lag for profiles
        //    created by an earlier file in this same import batch.
        const cached = restaurantNameMaps.get(restaurantId) ?? {};
        if (cached[nameKey]) {
          nameMap[nameKey] = cached[nameKey];
          continue;
        }
        // 2. Fall back to a fresh DB read
        const retry = await buildNameMap(admin, restaurantId);
        Object.assign(nameMap, retry);
        if (nameMap[nameKey]) {
          const shared = restaurantNameMaps.get(restaurantId) ?? {};
          shared[nameKey] = nameMap[nameKey];
          restaurantNameMaps.set(restaurantId, shared);
          continue;
        }
      }
      errors.push(`Could not create employee "${fullName}": ${profileErr.message}`);
      continue;
    }

    // Create restaurant membership
    const { error: memberErr } = await admin.from("restaurant_members").insert({
      restaurant_id: restaurantId,
      profile_id: newId,
      role_id: defaultRoleId,
    });

    if (memberErr && memberErr.code !== "23505" && !memberErr.message?.includes("unique") && !memberErr.message?.includes("duplicate")) {
      errors.push(`Could not add "${fullName}" to restaurant: ${memberErr.message}`);
      continue;
    }

    nameMap[nameKey] = newId;
    createdEmployees.push(fullName);

    // Update shared cache immediately — next file's pre-flight will see this employee
    const shared = restaurantNameMaps.get(restaurantId) ?? {};
    shared[nameKey] = newId;
    restaurantNameMaps.set(restaurantId, shared);
  }

  return { nameMap, createdEmployees, errors };
}

// ── Background shift processor ────────────────────────────────
// Pre-flight already created all employees. We do a fresh DB read here so we're
// not relying on object references passed across the async boundary.
async function processImport(
  jobId: string,
  rows: Record<string, string>[],
  restaurantId: string,
) {
  const admin = await createAdminClient();
  const job = jobs.get(jobId)!;

  // Build nameMap fresh — pre-flight created all employees so they should be here.
  // Merge with in-memory cache to cover any PgBouncer read lag.
  const dbMap     = await buildNameMap(admin, restaurantId);
  const cached    = restaurantNameMaps.get(restaurantId) ?? {};
  const nameMap   = { ...cached, ...dbMap };

  const seenShifts = new Set<string>(); // "profileId|clocked_in_at" — skip in-run duplicates

  for (let i = 0; i < rows.length; i++) {
    const row        = rows[i];
    const first      = row["First"]?.trim();
    const last       = row["Last"]?.trim();
    const dateStr    = row["Date"]?.trim();
    const inTimeRaw  = row["In Time"]?.trim();
    const outTimeRaw = row["Out Time"]?.trim();

    if (!first || !dateStr || !inTimeRaw) {
      job.processed++; job.progress = Math.round((job.processed / job.total) * 100);
      continue;
    }

    const fullName = last ? `${first} ${last}` : first;
    const profileId = nameMap[normalizeName(fullName)];

    if (!profileId) {
      job.errors.push(`No profile found for "${fullName}" (key: "${normalizeName(fullName)}")`);
      job.processed++; job.progress = Math.round((job.processed / job.total) * 100);
      continue;
    }

    // Parse times
    let inISO: string;
    let outISO: string | null = null;
    try {
      inISO = buildISO(dateStr, inTimeRaw);
      if (outTimeRaw) {
        const inP  = parse12HourTime(inTimeRaw);
        const outP = parse12HourTime(outTimeRaw);
        outISO = buildISO(dateStr, outTimeRaw, outP.h * 60 + outP.m < inP.h * 60 + inP.m);
      }
    } catch (e) {
      job.errors.push(`Time parse error for ${fullName} on ${dateStr}: ${String(e)}`);
      job.processed++; job.progress = Math.round((job.processed / job.total) * 100);
      continue;
    }

    // Skip in-session duplicates
    const shiftKey = `${profileId}|${inISO}`;
    if (seenShifts.has(shiftKey)) {
      job.processed++; job.progress = Math.round((job.processed / job.total) * 100);
      continue;
    }

    const { error: insertError } = await admin.from("time_records").insert({
      profile_id:     profileId,
      restaurant_id:  restaurantId,
      clocked_in_at:  inISO,
      clocked_out_at: outISO,
      status:         "approved",
    });

    if (!insertError) {
      job.shiftsImported++;
      seenShifts.add(shiftKey);
    } else if (insertError.code !== "23505" && !insertError.message?.includes("unique") && !insertError.message?.includes("duplicate")) {
      job.errors.push(`Shift error for ${fullName} on ${dateStr}: ${insertError.message}`);
    }

    job.processed++; job.progress = Math.round((job.processed / job.total) * 100);
  }

  job.status = "done";
  job.progress = 100;
}

// ── POST /api/import-shifts ───────────────────────────────────
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = await createAdminClient();

  const { data: caller } = await admin
    .from("restaurant_members")
    .select("restaurant_id, role:roles(is_owner, permissions)")
    .eq("profile_id", user.id)
    .single();

  const callerRole = caller?.role as { is_owner: boolean; permissions: Record<string, boolean> } | null;
  if (!caller || (!callerRole?.is_owner && !callerRole?.permissions?.can_edit_shifts)) {
    return NextResponse.json({ error: "No permission to import shifts" }, { status: 403 });
  }

  const body = await req.json() as { csvFiles?: { name: string; content: string }[]; csv?: string };

  // Support both single-csv (legacy) and multi-file batch
  const csvList: string[] = body.csvFiles
    ? body.csvFiles.map(f => f.content)
    : body.csv ? [body.csv] : [];
  if (!csvList.length) return NextResponse.json({ error: "No CSV content" }, { status: 400 });

  const rows = csvList.flatMap(csv => parseCSV(csv).filter(r => r["First"] && r["Date"] && r["In Time"]));
  if (!rows.length) return NextResponse.json({ error: "No valid rows found" }, { status: 400 });

  // Get default role
  const { data: employeeRole } = await admin
    .from("roles").select("id").eq("restaurant_id", caller.restaurant_id).eq("name", "Employee").maybeSingle();
  const { data: anyRole } = !employeeRole
    ? await admin.from("roles").select("id").eq("restaurant_id", caller.restaurant_id).limit(1).single()
    : { data: null };
  const defaultRoleId = employeeRole?.id ?? anyRole?.id;
  if (!defaultRoleId) return NextResponse.json({ error: "No roles found" }, { status: 500 });

  // ── Pre-flight: resolve all employees synchronously ──────────────────────────
  // This happens BEFORE the background job starts. After this, nameMap is complete
  // and the shift loop needs zero DB calls for employee resolution.
  const { nameMap, createdEmployees, errors: preflightErrors } = await resolveEmployees(
    admin, caller.restaurant_id, defaultRoleId, rows
  );

  // Create job — pre-populate createdEmployees from the pre-flight phase
  const jobId = crypto.randomUUID();
  jobs.set(jobId, {
    status: "processing",
    progress: 0,
    total: rows.length,
    processed: 0,
    shiftsImported: 0,
    createdEmployees,
    errors: preflightErrors,
  });

  // Fire and forget — pure shift insertion, no employee logic
  processImport(jobId, rows, caller.restaurant_id).catch(e => {
    const job = jobs.get(jobId);
    if (job) { job.status = "error"; job.errors.push(String(e)); }
  });

  return NextResponse.json({ jobId, total: rows.length });
}
