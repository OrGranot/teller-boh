"use client";
import { useRef, useState } from "react";

interface Props {
  src: string;
  alt: string;
  onSave: (url: string) => Promise<void>;
  className?: string;
  aspectRatio?: string;
}

export default function ImageField({ src, alt, onSave, className = "", aspectRatio = "4/3" }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState(src);
  const [status, setStatus] = useState<"idle" | "uploading" | "saved" | "error">("idle");
  const [error, setError] = useState("");

  async function handleFile(file: File) {
    setStatus("uploading");
    setError("");
    const form = new FormData();
    form.append("file", file);
    const res = await fetch("/api/website/upload", { method: "POST", body: form });
    const json = await res.json();
    if (!res.ok) { setError(json.error ?? "Upload failed"); setStatus("error"); return; }
    setPreview(json.url);
    await onSave(json.url);
    setStatus("saved");
    setTimeout(() => setStatus("idle"), 2000);
  }

  return (
    <div className={`relative group/img rounded-xl overflow-hidden ${className}`} style={{ aspectRatio }}>
      {/* Image */}
      <img src={preview} alt={alt} className="w-full h-full object-cover" />

      {/* Overlay */}
      <div className="absolute inset-0 bg-black/0 group-hover/img:bg-black/40 transition-all flex items-center justify-center">
        <button
          onClick={() => inputRef.current?.click()}
          disabled={status === "uploading"}
          className="opacity-0 group-hover/img:opacity-100 transition-opacity bg-white text-gray-900 text-xs font-medium px-4 py-2 rounded-full shadow-lg hover:bg-gray-100 disabled:opacity-50"
        >
          {status === "uploading" ? "Uploading…" : "Replace image"}
        </button>
      </div>

      {/* Status badge */}
      {status === "saved" && (
        <div className="absolute top-2 right-2 bg-green-500 text-white text-xs px-2 py-1 rounded-full">✓ Saved</div>
      )}
      {status === "error" && (
        <div className="absolute bottom-2 left-2 right-2 bg-red-500 text-white text-xs px-2 py-1 rounded-lg text-center">{error}</div>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ""; }}
      />
    </div>
  );
}
