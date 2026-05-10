"use client";
import { useState } from "react";

interface Props {
  value: string;
  onSave: (value: string) => Promise<void>;
  className?: string;
  placeholder?: string;
}

export default function InlineText({ value, onSave, className = "", placeholder = "Click to edit…" }: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [status, setStatus] = useState<"idle" | "saving" | "saved">("idle");

  async function save() {
    const trimmed = draft.trim();
    if (trimmed === value) { setEditing(false); return; }
    setStatus("saving");
    await onSave(trimmed);
    setEditing(false);
    setStatus("saved");
    setTimeout(() => setStatus("idle"), 1500);
  }

  if (editing) {
    return (
      <input
        autoFocus
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onBlur={save}
        onKeyDown={e => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          if (e.key === "Escape") { setDraft(value); setEditing(false); }
        }}
        disabled={status === "saving"}
        className={`${className} w-full bg-blue-50 border-b-2 border-blue-400 outline-none rounded-sm px-0`}
      />
    );
  }

  return (
    <div className="flex items-center gap-2 group/inline">
      <div
        onClick={() => { setDraft(value); setEditing(true); }}
        title="Click to edit"
        className={`${className} cursor-text rounded px-1 -mx-1 border border-transparent group-hover/inline:border-dashed group-hover/inline:border-gray-300 group-hover/inline:bg-gray-50 transition-all min-w-[60px]`}
      >
        {value || <span className="text-gray-400 italic text-sm">{placeholder}</span>}
      </div>
      {status === "saving" && <span className="text-gray-400 text-xs">Saving…</span>}
      {status === "saved"  && <span className="text-green-500 text-xs">✓ Saved</span>}
    </div>
  );
}
