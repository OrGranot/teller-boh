// Shared in-memory state for CSV import jobs.
// Uses the Node.js global object so state is shared across all route modules
// even when Turbopack creates separate module instances per route segment.

export interface ImportJob {
  status: "processing" | "done" | "error";
  progress: number; // 0-100
  total: number;
  processed: number;
  shiftsImported: number;
  createdEmployees: string[];
  errors: string[];
}

declare global {
  // eslint-disable-next-line no-var
  var __importJobs: Map<string, ImportJob> | undefined;
  // eslint-disable-next-line no-var
  var __restaurantNameMaps: Map<string, Record<string, string>> | undefined;
}

// Initialise once — survives HMR and cross-segment imports
global.__importJobs        ??= new Map<string, ImportJob>();
global.__restaurantNameMaps ??= new Map<string, Record<string, string>>();

export const jobs               = global.__importJobs;
export const restaurantNameMaps = global.__restaurantNameMaps;
