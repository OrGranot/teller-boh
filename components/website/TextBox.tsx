"use client";
import { useState } from "react";

interface Props {
  value: string;
  onSave: (value: string) => Promise<void>;
  placeholder?: string;
  rows?: number;
  allowHtml?: boolean;
}

export default function TextBox({ value, onSave, placeholder = "Click to edit…", rows = 4, allowHtml }: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [status, setStatus] = useState<"idle" | "saving" | "saved">("idle");

  async function save() {
    setStatus("saving");
    await onSave(draft.trim());
    setEditing(false);
    setStatus("saved");
    setTimeout(() => setStatus("idle"), 1500);
  }

  function cancel() {
    setDraft(value);
    setEditing(false);
  }

  if (editing) {
    return (
      <div className="space-y-2">
        <textarea
          autoFocus
          value={draft}
          onChange={e => setDraft(e.target.value)}
          rows={rows}
          className="w-full border border-blue-400 bg-blue-50 rounded-lg px-3 py-2 text-sm outline-none resize-y"
        />
        <div className="flex gap-2">
          <button
            onClick={save}
            disabled={status === "saving"}
            className="px-3 py-1.5 bg-gray-900 text-white text-xs rounded-lg hover:bg-gray-700 disabled:opacity-50 transition-colors"
          >
            {status === "saving" ? "Saving…" : "Save"}
          </button>
          <button onClick={cancel} className="px-3 py-1.5 text-gray-500 text-xs hover:text-gray-800 transition-colors">
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="group/textbox space-y-1">
      <div
        onClick={() => { setDraft(value); setEditing(true); }}
        title="Click to edit"
        className="cursor-text rounded-lg px-3 py-2 border border-transparent group-hover/textbox:border-dashed group-hover/textbox:border-gray-300 group-hover/textbox:bg-gray-50 transition-all text-sm text-gray-700 leading-relaxed min-h-[60px]"
      >
        {allowHtml
          ? <span dangerouslySetInnerHTML={{ __html: value || `<span class="text-gray-400 italic">${placeholder}</span>` }} />
          : value || <span className="text-gray-400 italic">{placeholder}</span>
        }
      </div>
      {status === "saved" && <span className="text-green-500 text-xs">✓ Saved</span>}
    </div>
  );
}
