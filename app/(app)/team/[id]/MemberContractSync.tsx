"use client";
/**
 * Holds the live contracts array in shared state so that any edit in
 * ContractHistoryClient instantly re-renders HoursBalanceClient with the
 * updated figures — no router.refresh() required.
 */
import { useState } from "react";
import ContractHistoryClient from "./ContractHistoryClient";
import HoursBalanceClient    from "./HoursBalanceClient";
import type { ContractPeriod, HoursAdjustment } from "@/lib/hours-balance";

interface Props {
  profileId:        string;
  canEdit:          boolean;
  initialContracts: ContractPeriod[];
  firstShiftISO:    string | null;
  // forwarded to HoursBalanceClient
  employmentEnd: string | null;
  serverToday:   string;
  allShifts:     { clocked_in_at: string; clocked_out_at: string | null; status: string }[];
  adjustments:   HoursAdjustment[];
}

export default function MemberContractSync({
  profileId, canEdit, initialContracts, firstShiftISO,
  employmentEnd, serverToday, allShifts, adjustments,
}: Props) {
  const [contracts, setContracts] = useState<ContractPeriod[]>(initialContracts);

  return (
    <>
      <ContractHistoryClient
        profileId={profileId}
        canEdit={canEdit}
        contracts={contracts}
        onContractsChange={setContracts}
        firstShiftISO={firstShiftISO}
      />
      <HoursBalanceClient
        profileId={profileId}
        canEdit={canEdit}
        contracts={contracts}
        employmentEnd={employmentEnd}
        serverToday={serverToday}
        allShifts={allShifts}
        adjustments={adjustments}
      />
    </>
  );
}
