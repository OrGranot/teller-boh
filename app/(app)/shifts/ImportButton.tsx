"use client";
import { useRef, useState, useEffect } from "react";
import { useImport } from "@/lib/import-context";

async function collectCSVFiles(items: DataTransferItemList): Promise<File[]> {
  const files: File[] = [];

  async function readEntry(entry: FileSystemEntry): Promise<void> {
    if (entry.isFile) {
      if (entry.name.toLowerCase().endsWith(".csv")) {
        const file = await new Promise<File>((resolve, reject) =>
          (entry as FileSystemFileEntry).file(resolve, reject)
        );
        files.push(file);
      }
    } else if (entry.isDirectory) {
      const reader = (entry as FileSystemDirectoryEntry).createReader();
      const readAll = (): Promise<FileSystemEntry[]> =>
        new Promise((resolve, reject) => {
          const results: FileSystemEntry[] = [];
          const read = () => reader.readEntries(batch => {
            if (batch.length === 0) resolve(results);
            else { results.push(...batch); read(); }
          }, reject);
          read();
        });
      const entries = await readAll();
      await Promise.all(entries.map(readEntry));
    }
  }

  const entryPromises: Promise<void>[] = [];
  for (let i = 0; i < items.length; i++) {
    const entry = items[i].webkitGetAsEntry?.();
    if (entry) entryPromises.push(readEntry(entry));
  }
  await Promise.all(entryPromises);
  return files.sort((a, b) => a.name.localeCompare(b.name));
}

interface Props {
  onImported: () => void;
}

export default function ImportButton({ onImported }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const { startImport, isRunning, job } = useImport();

  // Listen for global "shifts-imported" event to refresh the shifts list
  useEffect(() => {
    window.addEventListener("shifts-imported", onImported);
    return () => window.removeEventListener("shifts-imported", onImported);
  }, [onImported]);

  async function beginImport(files: File[]) {
    if (!files.length || isRunning) return;
    const csvFiles = await Promise.all(
      files.map(async f => ({ name: f.name, content: await f.text() }))
    );
    startImport(csvFiles);
  }

  function handleFileInput(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (fileRef.current) fileRef.current.value = "";
    beginImport(files);
  }

  async function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setIsDragging(false);
    if (isRunning) return;
    const files = await collectCSVFiles(e.dataTransfer.items);
    beginImport(files);
  }

  return (
    <div className="relative">
      <input ref={fileRef} type="file" accept=".csv" multiple className="hidden" onChange={handleFileInput} />

      <div
        onClick={() => { if (!isRunning) fileRef.current?.click(); }}
        onDragOver={e => { e.preventDefault(); if (!isRunning) setIsDragging(true); }}
        onDragEnter={e => { e.preventDefault(); if (!isRunning) setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        className={[
          "flex items-center gap-3 px-4 py-2.5 rounded-xl border-2 border-dashed cursor-pointer transition-all select-none",
          isRunning    ? "border-gray-200 bg-white opacity-60 cursor-not-allowed"
          : isDragging ? "border-indigo-400 bg-indigo-50 scale-105"
          :              "border-gray-200 bg-white hover:border-gray-400 hover:bg-gray-50",
        ].join(" ")}
      >
        {isRunning ? (
          <>
            <span className="inline-block w-3.5 h-3.5 border-2 border-gray-300 border-t-gray-700 rounded-full animate-spin flex-shrink-0" />
            <span className="text-sm font-medium text-gray-600">
              Importing… {job?.progress ?? 0}%
            </span>
          </>
        ) : isDragging ? (
          <>
            <span className="text-lg">📂</span>
            <span className="text-sm font-semibold text-indigo-600">Drop files or folders</span>
          </>
        ) : (
          <>
            <span className="text-base text-gray-400">↑</span>
            <div>
              <p className="text-sm font-medium text-gray-700 leading-tight">Import CSV</p>
              <p className="text-xs text-gray-400 leading-tight">click or drag files / folders</p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
