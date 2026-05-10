"use client";
import { createContext, useContext, useState, useEffect, useRef, useCallback } from "react";

export interface JobState {
  status: "processing" | "done" | "error";
  progress: number;
  total: number;
  processed: number;
  shiftsImported: number;
  createdEmployees: string[];
  errors: string[];
}

interface ImportContextValue {
  startImport: (csvFiles: { name: string; content: string }[]) => Promise<void>;
  job: JobState | null;
  fileCount: number;
  isRunning: boolean;
  showResult: boolean;
  startError: string;
  dismiss: () => void;
}

const ImportContext = createContext<ImportContextValue | null>(null);

export function useImport() {
  const ctx = useContext(ImportContext);
  if (!ctx) throw new Error("useImport must be used inside ImportProvider");
  return ctx;
}

export function ImportProvider({ children }: { children: React.ReactNode }) {
  const [jobId, setJobId]         = useState<string | null>(null);
  const [job, setJob]             = useState<JobState | null>(null);
  const [fileCount, setFileCount] = useState(0);
  const [isRunning, setIsRunning] = useState(false);
  const [showResult, setShowResult] = useState(false);
  const [startError, setStartError] = useState("");
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Poll while processing — survives navigation because it lives in the layout
  useEffect(() => {
    if (!jobId || job?.status !== "processing") return;
    intervalRef.current = setInterval(async () => {
      try {
        const res  = await fetch(`/api/import-shifts/${jobId}`);
        const data: JobState = await res.json();
        setJob(data);
        if (data.status !== "processing") {
          clearInterval(intervalRef.current!);
          setIsRunning(false);
          setShowResult(true);
          if (data.shiftsImported > 0) {
            // Notify any listeners (e.g. ShiftsClient) that new shifts are available
            window.dispatchEvent(new CustomEvent("shifts-imported"));
          }
        }
      } catch {
        // network error — keep polling
      }
    }, 1500);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [jobId, job?.status]);

  const startImport = useCallback(async (csvFiles: { name: string; content: string }[]) => {
    setStartError("");
    setJob(null);
    setJobId(null);
    setShowResult(false);
    setIsRunning(true);
    setFileCount(csvFiles.length);

    try {
      const res = await fetch("/api/import-shifts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ csvFiles }),
      });
      const data = await res.json();
      if (!res.ok) {
        setStartError(data.error || "Failed to start import");
        setIsRunning(false);
        return;
      }
      setJobId(data.jobId);
      setJob({ status: "processing", progress: 0, total: data.total, processed: 0, shiftsImported: 0, createdEmployees: [], errors: [] });
    } catch {
      setStartError("Network error — could not start import");
      setIsRunning(false);
    }
  }, []);

  const dismiss = useCallback(() => {
    setJob(null); setJobId(null);
    setShowResult(false); setStartError("");
    setIsRunning(false); setFileCount(0);
  }, []);

  return (
    <ImportContext.Provider value={{ startImport, job, fileCount, isRunning, showResult, startError, dismiss }}>
      {children}
    </ImportContext.Provider>
  );
}
