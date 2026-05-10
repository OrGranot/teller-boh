"use client";
import { useState, useRef, useEffect } from "react";

interface Props {
  value: string; // "HH:MM"
  onCommit: (finalValue: string) => void;
  onCancel: () => void;
}

export default function TimeInput({ value, onCommit, onCancel }: Props) {
  // Local controlled state — onChange fires on every digit so onBlur always
  // has the latest value regardless of how the native time picker works.
  const [draft, setDraft] = useState(value);
  const ref = useRef<HTMLInputElement>(null);
  const committed = useRef(false);

  useEffect(() => {
    ref.current?.focus();
  }, []);

  function commit() {
    if (committed.current) return;
    committed.current = true;
    const v = ref.current?.value || draft;
    if (v) onCommit(v);
    else onCancel();
  }

  function cancel() {
    if (committed.current) return;
    committed.current = true;
    onCancel();
  }

  return (
    <input
      ref={ref}
      type="time"
      value={draft}
      onChange={e => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={e => {
        if (e.key === "Enter")  { e.preventDefault(); commit(); }
        if (e.key === "Escape") { e.preventDefault(); cancel(); }
      }}
      className="font-mono text-xs border border-gray-400 rounded-md px-1.5 py-0.5 outline-none focus:border-gray-800 bg-white w-[5.5rem]"
    />
  );
}
