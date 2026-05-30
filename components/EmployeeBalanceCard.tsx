"use client";
/**
 * Compact read-only hours-balance summary shown at the top of the Shifts page
 * for employees who can't view all shifts (i.e. basic employees).
 *
 * Fetches its own data so it doesn't complicate the server-side page props.
 */
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { calcMultiContractBalance, type ContractPeriod, type HoursAdjustment } from "@/lib/hours-balance";

interface Props {
  userId: string;
  restaurantId: string;
}

function fmt(n: number, dec = 1) { return n.toFixed(dec); }
function sign(n: number) { return n >= 0 ? "+" : ""; }

export default function EmployeeBalanceCard({ userId, restaurantId }: Props) {
  const [status, setStatus] = useState<"loading" | "no-contract" | "ready">("loading");
  const [contracts,    setContracts]    = useState<ContractPeriod[]>([]);
  const [allShifts,    setAllShifts]    = useState<{ clocked_in_at: string; clocked_out_at: string | null }[]>([]);
  const [adjustments,  setAdjustments]  = useState<HoursAdjustment[]>([]);
  const [contractEnd,  setContractEnd]  = useState<string | null>(null);
  const [today] = useState(() => new Date().toISOString().slice(0, 10));

  useEffect(() => {
    const supabase = createClient();
    async function load() {
      const [contractsRes, shiftsRes, adjRes, memberRes] = await Promise.all([
        supabase
          .from("member_contracts")
          .select("id, valid_from, valid_until, hours_per_week, days_per_week, vacation_days_per_year, salary, sick_days")
          .eq("profile_id", userId)
          .eq("restaurant_id", restaurantId)
          .order("valid_from", { ascending: true }),
        supabase
          .from("time_records")
          .select("clocked_in_at, clocked_out_at")
          .eq("profile_id", userId),
        supabase
          .from("hours_adjustments")
          .select("id, hours, note, adjustment_date")
          .eq("profile_id", userId),
        supabase
          .from("restaurant_members")
          .select("contract_end")
          .eq("profile_id", userId)
          .single(),
      ]);

      const raw = contractsRes.data ?? [];
      if (raw.length === 0) { setStatus("no-contract"); return; }

      setContracts(raw.map(c => ({
        id:                    c.id,
        valid_from:            c.valid_from,
        valid_until:           c.valid_until ?? null,
        hours_per_week:        c.hours_per_week != null ? Number(c.hours_per_week) : null,
        days_per_week:         c.days_per_week  != null ? Number(c.days_per_week)  : null,
        vacation_days_per_year: c.vacation_days_per_year != null ? Number(c.vacation_days_per_year) : null,
        salary:                c.salary != null ? Number(c.salary) : null,
        sick_days:             Number(c.sick_days ?? 0),
      })));
      setAllShifts(shiftsRes.data ?? []);
      setAdjustments((adjRes.data ?? []) as HoursAdjustment[]);
      setContractEnd(memberRes.data?.contract_end ?? null);
      setStatus("ready");
    }
    void load();
  }, [userId, restaurantId]);

  if (status === "loading") {
    return (
      <div className="bg-white rounded-2xl border border-gray-100 px-5 py-4 mb-5 animate-pulse" style={{ boxShadow: "0 2px 12px rgba(0,0,0,0.04)" }}>
        <div className="h-4 w-32 bg-gray-100 rounded mb-3" />
        <div className="h-8 w-24 bg-gray-100 rounded mb-3" />
        <div className="flex gap-4">
          {[1,2,3,4].map(i => <div key={i} className="h-3 w-20 bg-gray-100 rounded" />)}
        </div>
      </div>
    );
  }

  if (status === "no-contract") return null;

  const untilDate = contractEnd ?? today;
  const { total } = calcMultiContractBalance(contracts, untilDate, allShifts, adjustments);
  const balColor  = total.balance >= 0 ? "text-green-600" : "text-red-500";

  return (
    <div
      className="bg-white rounded-2xl border border-gray-100 px-5 py-4 mb-5"
      style={{ boxShadow: "0 2px 12px rgba(0,0,0,0.04)" }}
    >
      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">My balance</p>

      <div className="flex items-baseline gap-2 mb-3">
        <span className={`text-3xl font-bold tabular-nums ${balColor}`}>
          {sign(total.balance)}{fmt(total.balance)}h
        </span>
        <span className="text-xs text-gray-400">total</span>
      </div>

      <div className="flex flex-wrap gap-x-5 gap-y-1.5 text-xs text-gray-500 tabular-nums">
        <span><span className="font-medium text-gray-700">{fmt(total.workedHours)}h</span> worked</span>
        <span><span className="font-medium text-gray-700">{fmt(total.expectedHours)}h</span> expected</span>
        {total.vacationAccrued != null && (
          <span><span className="font-medium text-gray-700">{fmt(total.vacationAccrued)}d</span> vacation</span>
        )}
        {total.holidayCount > 0 && (
          <span><span className="font-medium text-gray-700">{total.holidayCount}d</span> public holidays</span>
        )}
        {total.paidOutHours > 0 && (
          <span><span className="font-medium text-red-500">−{fmt(total.paidOutHours)}h</span> paid out</span>
        )}
      </div>
    </div>
  );
}
