import { NextRequest, NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { isoMinusOneDay } from "@/lib/hours-balance";

async function getOwnerContext(userId: string, admin: Awaited<ReturnType<typeof createAdminClient>>) {
  const { data: caller } = await admin
    .from("restaurant_members")
    .select("restaurant_id, role:roles(is_owner)")
    .eq("profile_id", userId)
    .single();
  const callerRole = caller?.role as { is_owner: boolean } | null;
  if (!caller || !callerRole?.is_owner) return null;
  return caller as { restaurant_id: string };
}

// PATCH /api/members/[id]/contracts/[contractId]
// Edits one or more fields on a contract.
// If editing valid_from: also updates the previous contract's valid_until.
// If this is the latest (open) contract: also syncs restaurant_members.
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; contractId: string }> }
) {
  const { id, contractId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = await createAdminClient();
  const caller = await getOwnerContext(user.id, admin);
  if (!caller) return NextResponse.json({ error: "Only owners can manage contracts" }, { status: 403 });

  const body = await req.json();

  // Load the contract being edited + all contracts for this employee (to find neighbours)
  const { data: allContracts, error: loadErr } = await admin
    .from("member_contracts")
    .select("id, valid_from, valid_until, hours_per_week, days_per_week, vacation_days_per_year, salary, sick_days")
    .eq("profile_id", id)
    .eq("restaurant_id", caller.restaurant_id)
    .order("valid_from", { ascending: true });

  if (loadErr || !allContracts) return NextResponse.json({ error: "Failed to load contracts" }, { status: 500 });

  const contractIndex = allContracts.findIndex(c => c.id === contractId);
  if (contractIndex === -1) return NextResponse.json({ error: "Contract not found" }, { status: 404 });

  const contract = allContracts[contractIndex];
  const prevContract = contractIndex > 0 ? allContracts[contractIndex - 1] : null;
  const isLatest = contractIndex === allContracts.length - 1;
  const isFirst = contractIndex === 0;

  // Build the update object for member_contracts
  const update: Record<string, unknown> = {};
  if (typeof body.valid_from           === "string") update.valid_from            = body.valid_from;
  if (typeof body.hours_per_week       === "number" || body.hours_per_week       === null) update.hours_per_week        = body.hours_per_week;
  if (typeof body.days_per_week        === "number" || body.days_per_week        === null) update.days_per_week         = body.days_per_week;
  if (typeof body.vacation_days_per_year === "number" || body.vacation_days_per_year === null) update.vacation_days_per_year = body.vacation_days_per_year;
  if (typeof body.salary               === "number" || body.salary               === null) update.salary                = body.salary;
  if (typeof body.sick_days            === "number" || body.sick_days            === null) update.sick_days             = body.sick_days;
  // valid_until on the latest contract is a "contract expiry" warning date — not deactivation
  if ("valid_until" in body) {
    if (!isLatest) return NextResponse.json(
      { error: "End date can only be set on the current contract" }, { status: 400 }
    );
    update.valid_until = body.valid_until === null ? null : String(body.valid_until);
  }

  if (Object.keys(update).length === 0) return NextResponse.json({ error: "Nothing to update" }, { status: 400 });

  // If valid_from is being changed, validate against neighbours
  if (typeof update.valid_from === "string") {
    const newFrom = update.valid_from as string;

    if (prevContract && newFrom <= prevContract.valid_from) {
      return NextResponse.json(
        { error: "Contract start must be after the previous contract's start date" },
        { status: 400 }
      );
    }

    const nextContract = allContracts[contractIndex + 1] ?? null;
    if (nextContract && newFrom >= nextContract.valid_from) {
      return NextResponse.json(
        { error: "Contract start must be before the next contract's start date" },
        { status: 400 }
      );
    }

    // Update previous contract's valid_until to new_from - 1
    if (prevContract) {
      await admin
        .from("member_contracts")
        .update({ valid_until: isoMinusOneDay(newFrom) })
        .eq("id", prevContract.id);
    }

    // If this is the first contract, sync restaurant_members.contract_start
    if (isFirst) {
      await admin
        .from("restaurant_members")
        .update({ contract_start: newFrom })
        .eq("profile_id", id)
        .eq("restaurant_id", caller.restaurant_id);
    }
  }

  // Update the contract
  const { error: updateErr } = await admin
    .from("member_contracts")
    .update(update)
    .eq("id", contractId);

  if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 });

  // If this is the latest (open) contract, keep restaurant_members in sync
  if (isLatest) {
    const rmUpdate: Record<string, unknown> = {};
    if ("hours_per_week"        in update) rmUpdate.hours_per_week         = update.hours_per_week;
    if ("days_per_week"         in update) rmUpdate.days_per_week          = update.days_per_week;
    if ("vacation_days_per_year" in update) rmUpdate.vacation_days_per_year = update.vacation_days_per_year;
    if ("salary"                in update) rmUpdate.salary                 = update.salary;
    if ("sick_days"             in update) rmUpdate.sick_days              = update.sick_days;

    if (Object.keys(rmUpdate).length > 0) {
      await admin
        .from("restaurant_members")
        .update(rmUpdate)
        .eq("profile_id", id)
        .eq("restaurant_id", caller.restaurant_id);
    }
  }

  return NextResponse.json({ ok: true });
}

// DELETE /api/members/[id]/contracts/[contractId]
// Removes any contract from the timeline.
// - Updates the previous contract's valid_until to bridge the gap
// - Syncs restaurant_members only when the latest (current) contract is removed
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; contractId: string }> }
) {
  const { id, contractId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = await createAdminClient();
  const caller = await getOwnerContext(user.id, admin);
  if (!caller) return NextResponse.json({ error: "Only owners can manage contracts" }, { status: 403 });

  const { data: allContracts } = await admin
    .from("member_contracts")
    .select("id, valid_from, valid_until, hours_per_week, days_per_week, vacation_days_per_year, salary, sick_days")
    .eq("profile_id", id)
    .eq("restaurant_id", caller.restaurant_id)
    .order("valid_from", { ascending: true });

  if (!allContracts?.length) return NextResponse.json({ error: "No contracts found" }, { status: 404 });

  if (allContracts.length === 1) {
    return NextResponse.json(
      { error: "Cannot delete the only contract. Clear the fields instead." },
      { status: 400 }
    );
  }

  const contractIndex = allContracts.findIndex(c => c.id === contractId);
  if (contractIndex === -1) return NextResponse.json({ error: "Contract not found" }, { status: 404 });

  const prevContract = contractIndex > 0 ? allContracts[contractIndex - 1] : null;
  const nextContract = contractIndex < allContracts.length - 1 ? allContracts[contractIndex + 1] : null;
  const isLatest     = contractIndex === allContracts.length - 1;

  // Delete the contract
  const { error: deleteErr } = await admin
    .from("member_contracts")
    .delete()
    .eq("id", contractId);
  if (deleteErr) return NextResponse.json({ error: deleteErr.message }, { status: 500 });

  // Fix the previous contract's valid_until to bridge the gap
  if (prevContract) {
    const newValidUntil = nextContract ? isoMinusOneDay(nextContract.valid_from) : null;
    await admin
      .from("member_contracts")
      .update({ valid_until: newValidUntil })
      .eq("id", prevContract.id);
  }

  // Sync restaurant_members when the current (latest) contract was deleted
  if (isLatest && prevContract) {
    await admin
      .from("restaurant_members")
      .update({
        hours_per_week:          prevContract.hours_per_week         ?? null,
        days_per_week:           prevContract.days_per_week          ?? null,
        vacation_days_per_year:  prevContract.vacation_days_per_year ?? null,
        salary:                  prevContract.salary                 ?? null,
        sick_days:               prevContract.sick_days              ?? 0,
      })
      .eq("profile_id", id)
      .eq("restaurant_id", caller.restaurant_id);
  }

  return NextResponse.json({ ok: true });
}
