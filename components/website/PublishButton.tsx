"use client";
import { useState } from "react";

export default function PublishButton() {
  const [status, setStatus] = useState<"idle" | "publishing" | "done" | "error" | "no-hook">("idle");

  async function publish() {
    setStatus("publishing");
    const res = await fetch("/api/website/publish", { method: "POST" });
    const json = await res.json();
    if (!res.ok) {
      setStatus(json.error?.includes("not configured") ? "no-hook" : "error");
      setTimeout(() => setStatus("idle"), 4000);
      return;
    }
    setStatus("done");
    setTimeout(() => setStatus("idle"), 4000);
  }

  const labels: Record<typeof status, string> = {
    idle:       "Publish Website",
    publishing: "Publishing…",
    done:       "✓ Published — rebuilding in ~30s",
    error:      "Build failed — try again",
    "no-hook":  "Add NETLIFY_BUILD_HOOK_URL to .env.local",
  };

  const colors: Record<typeof status, string> = {
    idle:       "bg-[#5B2A3C] hover:bg-[#7A3D54] text-white",
    publishing: "bg-gray-400 text-white cursor-wait",
    done:       "bg-green-600 text-white",
    error:      "bg-red-600 text-white",
    "no-hook":  "bg-amber-500 text-white",
  };

  return (
    <button
      onClick={publish}
      disabled={status === "publishing"}
      className={`px-5 py-2 rounded-xl text-sm font-medium transition-colors ${colors[status]}`}
    >
      {labels[status]}
    </button>
  );
}
