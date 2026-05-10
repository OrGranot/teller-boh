"use client";
import { useRef, useState } from "react";

interface Props {
  url: string;
  label: string;
  onSave: (url: string) => Promise<void>;
}

export default function PDFField({ url, label, onSave }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [currentUrl, setCurrentUrl] = useState(url);
  const [status, setStatus] = useState<"idle" | "uploading" | "saved" | "error">("idle");
  const [error, setError] = useState("");

  const filename = currentUrl.split("/").pop() ?? currentUrl;

  async function handleFile(file: File) {
    setStatus("uploading");
    setError("");
    const form = new FormData();
    form.append("file", file);
    const res = await fetch("/api/website/upload", { method: "POST", body: form });
    const json = await res.json();
    if (!res.ok) { setError(json.error ?? "Upload failed"); setStatus("error"); return; }
    setCurrentUrl(json.url);
    await onSave(json.url);
    setStatus("saved");
    setTimeout(() => setStatus("idle"), 2000);
  }

  return (
    <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl border border-gray-200">
      {/* PDF icon */}
      <div className="w-9 h-9 bg-red-100 rounded-lg flex items-center justify-center shrink-0">
        <span className="text-red-600 text-xs font-bold">PDF</span>
      </div>

      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium text-gray-700 truncate">{label}</p>
        <a href={currentUrl} target="_blank" rel="noopener" className="text-xs text-blue-500 hover:underline truncate block">
          {filename}
        </a>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        {status === "uploading" && <span className="text-xs text-gray-400">Uploading…</span>}
        {status === "saved"    && <span className="text-xs text-green-500">✓ Saved</span>}
        {status === "error"    && <span className="text-xs text-red-500">{error}</span>}
        <button
          onClick={() => inputRef.current?.click()}
          disabled={status === "uploading"}
          className="px-3 py-1.5 text-xs bg-white border border-gray-200 rounded-lg hover:bg-gray-100 disabled:opacity-50 transition-colors"
        >
          Replace
        </button>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept=".pdf"
        className="hidden"
        onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ""; }}
      />
    </div>
  );
}
