"use client";
import { useState, useRef, useEffect } from "react";

interface Props {
  profileId: string;
  initialName: string | null;
  canEdit: boolean;
}

export default function MemberNameHeader({ profileId, initialName, canEdit }: Props) {
  const [name, setName]   = useState(initialName);
  const [editing, setEditing] = useState(false);
  const savingRef = useRef(false);
  const editRef   = useRef<HTMLHeadingElement>(null);

  // When editing starts, focus and place cursor at end
  useEffect(() => {
    if (!editing || !editRef.current) return;
    editRef.current.focus();
    const range = document.createRange();
    const sel   = window.getSelection();
    range.selectNodeContents(editRef.current);
    range.collapse(false);
    sel?.removeAllRanges();
    sel?.addRange(range);
  }, [editing]);

  function startEdit() {
    if (!canEdit) return;
    savingRef.current = false;
    setEditing(true);
  }

  async function save() {
    if (savingRef.current) return;
    savingRef.current = true;
    const trimmed = editRef.current?.textContent?.trim() || null;
    await fetch(`/api/profiles/${profileId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: trimmed }),
    });
    setName(trimmed);
    setEditing(false);
    savingRef.current = false;
  }

  function cancel() {
    // Restore original text without saving
    if (editRef.current) editRef.current.textContent = name || "";
    savingRef.current = true;
    setEditing(false);
  }

  if (editing) {
    return (
      <h1
        ref={editRef}
        contentEditable
        suppressContentEditableWarning
        onKeyDown={e => {
          if (e.key === "Enter") { e.preventDefault(); void save(); }
          if (e.key === "Escape") { e.preventDefault(); cancel(); }
        }}
        onBlur={() => void save()}
        className="text-xl font-semibold leading-tight outline-none border-b-2 border-indigo-400 cursor-text"
      >
        {name}
      </h1>
    );
  }

  return (
    <h1
      onClick={startEdit}
      className={`text-xl font-semibold leading-tight ${
        canEdit ? "cursor-pointer hover:text-indigo-600 transition-colors" : ""
      }`}
    >
      {name || <span className="text-gray-300 italic font-normal">No name</span>}
    </h1>
  );
}
