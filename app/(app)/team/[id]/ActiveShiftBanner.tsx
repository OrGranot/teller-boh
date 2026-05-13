"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import LiveDuration from "@/components/LiveDuration";

interface Props {
  shiftId: string;
  clockedInAt: string;
}

export default function ActiveShiftBanner({ shiftId, clockedInAt }: Props) {
  const router = useRouter();
  const [clocking, setClocking] = useState(false);

  async function handleClockOut() {
    setClocking(true);
    await fetch(`/api/shifts/${shiftId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clocked_out_at: new Date().toISOString(), status: "pending" }),
    });
    setClocking(false);
    router.refresh();
  }

  const since = new Date(clockedInAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });

  return (
    <div className="mb-5 bg-green-50 border border-green-200 rounded-xl px-4 py-3 flex items-center gap-3">
      <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse flex-shrink-0" />
      <span className="text-sm text-green-700 flex-1">
        Currently clocked in since {since}
      </span>
      <LiveDuration
        since={clockedInAt}
        className="text-sm font-bold tabular-nums text-green-800 tracking-tight"
      />
      <button
        onClick={handleClockOut}
        disabled={clocking}
        className="ml-2 text-xs font-semibold px-3 py-1.5 rounded-lg bg-red-500 hover:bg-red-600 text-white transition-colors disabled:opacity-50 whitespace-nowrap"
      >
        {clocking ? "…" : "⏹ Clock out"}
      </button>
    </div>
  );
}
