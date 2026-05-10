"use client";
import { useState, useEffect, useRef, useCallback, type Dispatch, type SetStateAction } from "react";
import DatePicker from "@/components/DatePicker";
import type { ContractPeriod } from "@/lib/hours-balance";

// Pure boundary helper — avoids bundling the full server lib
function isoMinusOneDay(iso: string): string {
  const d = new Date(iso + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

interface Props {
  profileId:         string;
  canEdit:           boolean;
  /** Live contracts from MemberContractSync — read-only here */
  contracts:         ContractPeriod[];
  /** Dispatch so we can use functional updaters (safe for parallel saves) */
  onContractsChange: Dispatch<SetStateAction<ContractPeriod[]>>;
  firstShiftISO?:    string | null;
}

type NumericField  = "hours_per_week" | "days_per_week" | "vacation_days_per_year" | "salary" | "sick_days";

const FIELD_LABELS: Record<NumericField | "valid_from", string> = {
  valid_from:             "Contract start",
  hours_per_week:         "Hours / week",
  days_per_week:          "Days / week",
  vacation_days_per_year: "Vacation days / year",
  salary:                 "Salary (€)",
  sick_days:              "Sick days",
};

const NUMERIC_FIELDS: NumericField[] = [
  "hours_per_week", "days_per_week", "vacation_days_per_year", "salary", "sick_days",
];

// ─────────────────────────────────────────────────────────────────────────────
// NumericFieldInput — always a real <input>, saves on blur / Enter.
// Tab directly enters edit mode because the element is always focusable.
// ─────────────────────────────────────────────────────────────────────────────
interface NumericFieldInputProps {
  contractId: string;
  field:      NumericField;
  value:      number | null;
  canEdit:    boolean;
  hint?:      string | null;
  onSave:     (contractId: string, field: NumericField, value: number | null) => Promise<void>;
}

function NumericFieldInput({ contractId, field, value, canEdit, hint, onSave }: NumericFieldInputProps) {
  const [local,  setLocal]  = useState(value != null ? String(value) : "");
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState<string | null>(null);
  const inFlight = useRef(false);

  // Sync display when the parent updates the contract (e.g. after another save)
  useEffect(() => {
    setLocal(value != null ? String(value) : "");
  }, [value]);

  async function commit(raw: string) {
    if (inFlight.current) return;
    const trimmed = raw.trim();
    const next    = trimmed === "" ? null : parseFloat(trimmed);

    // Skip noop
    if (next === value) return;

    if (next !== null && (isNaN(next) || next < 0)) {
      setError("Must be ≥ 0");
      setLocal(value != null ? String(value) : ""); // revert
      return;
    }

    inFlight.current = true;
    setSaving(true);
    setError(null);
    try {
      await onSave(contractId, field, next);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Save failed");
      setLocal(value != null ? String(value) : ""); // revert on error
    } finally {
      setSaving(false);
      inFlight.current = false;
    }
  }

  return (
    <div className="flex flex-col gap-0.5">
      <div className="flex items-center gap-1.5">
        <input
          type="number"
          min={0}
          step="any"
          value={local}
          placeholder="—"
          disabled={!canEdit}
          tabIndex={canEdit ? 0 : -1}
          onChange={e => { setLocal(e.target.value); setError(null); }}
          onBlur={e  => void commit(e.target.value)}
          onKeyDown={e => {
            if (e.key === "Enter")  { e.preventDefault(); e.currentTarget.blur(); }
            if (e.key === "Escape") {
              e.preventDefault();
              setLocal(value != null ? String(value) : "");
              setError(null);
              e.currentTarget.blur();
            }
          }}
          className={`
            w-20 text-sm font-medium text-gray-700 tabular-nums bg-transparent
            border-0 border-b-2 p-0 pb-0.5 transition-colors
            placeholder:text-gray-300 disabled:cursor-default
            focus:outline-none
            [appearance:textfield]
            [&::-webkit-inner-spin-button]:appearance-none
            [&::-webkit-outer-spin-button]:appearance-none
            ${error ? "border-red-400" : "border-transparent focus:border-indigo-400"}
          `}
        />
        {saving && <span className="text-[10px] text-gray-400 animate-pulse">↑</span>}
      </div>
      {error && <span className="text-[11px] text-red-500">{error}</span>}
      {hint && !error && <span className="text-[11px] text-gray-400">{hint}</span>}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// DateFieldInput — button that becomes a DatePicker on focus/click.
// Escape closes the calendar without saving.
// ─────────────────────────────────────────────────────────────────────────────
interface DateFieldInputProps {
  contractId:   string;
  value:        string; // YYYY-MM-DD
  canEdit:      boolean;
  firstShiftISO?: string | null;
  onSave:       (contractId: string, value: string) => Promise<void>;
}

function DateFieldInput({ contractId, value, canEdit, firstShiftISO, onSave }: DateFieldInputProps) {
  const [open,   setOpen]   = useState(false);
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState<string | null>(null);

  async function handleChange(date: string) {
    setOpen(false);
    if (date === value) return;
    setSaving(true);
    setError(null);
    try {
      await onSave(contractId, date);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  const display = value
    ? new Date(value + "T12:00:00Z").toLocaleDateString("en-GB")
    : "—";

  return (
    <div className="flex flex-col gap-0.5">
      {open && canEdit ? (
        // Wrap in a keyDown handler so Escape closes without saving
        <div onKeyDown={e => { if (e.key === "Escape") { e.stopPropagation(); setOpen(false); } }}>
          <DatePicker
            value={value}
            autoOpen
            initialViewDate={firstShiftISO ?? undefined}
            onChange={handleChange}
          />
        </div>
      ) : (
        <button
          type="button"
          disabled={!canEdit}
          tabIndex={canEdit ? 0 : -1}
          onClick={() => canEdit && setOpen(true)}
          onFocus={() => canEdit && setOpen(true)}
          className={`
            text-sm font-medium text-left bg-transparent border-0 border-b-2 border-transparent
            p-0 pb-0.5 transition-colors
            disabled:cursor-default
            focus:outline-none focus:border-indigo-400
            ${canEdit ? "cursor-pointer text-gray-700 hover:text-indigo-600" : "text-gray-700"}
          `}
        >
          {saving
            ? <span className="text-gray-400 animate-pulse text-[10px]">saving…</span>
            : display}
        </button>
      )}
      {error && <span className="text-[11px] text-red-500">{error}</span>}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────────────────────
const EMPTY_NEW_FORM = {
  valid_from: "", hours_per_week: "", days_per_week: "",
  vacation_days_per_year: "", salary: "", sick_days: "0",
};

export default function ContractHistoryClient({
  profileId, canEdit, contracts, onContractsChange, firstShiftISO,
}: Props) {
  // Display order: newest first
  const displayContracts = [...contracts].sort((a, b) => b.valid_from.localeCompare(a.valid_from));
  const sortedAsc        = [...contracts].sort((a, b) => a.valid_from.localeCompare(b.valid_from));
  const firstId = sortedAsc[0]?.id ?? null;

  // Accordion — newest open by default, persists locally
  const [openIds, setOpenIds] = useState<Set<string>>(
    () => new Set(contracts.length > 0 ? [contracts.reduce((a, b) => a.valid_from > b.valid_from ? a : b).id] : [])
  );

  function toggleOpen(id: string) {
    setOpenIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  // ── Save handlers (called by sub-components) ────────────────────────────

  const saveNumericField = useCallback(async (
    contractId: string, field: NumericField, value: number | null
  ) => {
    const res = await fetch(`/api/members/${profileId}/contracts/${contractId}`, {
      method:  "PATCH",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ [field]: value }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || "Save failed");
    }
    // Functional updater — safe even with parallel field saves
    onContractsChange(prev =>
      prev.map(c => c.id === contractId ? { ...c, [field]: value } : c)
    );
  }, [profileId, onContractsChange]);

  const saveDateField = useCallback(async (contractId: string, newFrom: string) => {
    const res = await fetch(`/api/members/${profileId}/contracts/${contractId}`, {
      method:  "PATCH",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ valid_from: newFrom }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || "Save failed");
    }
    // Update the contract's valid_from AND fix its previous neighbour's valid_until
    onContractsChange(prev => {
      const sorted = [...prev].sort((a, b) => a.valid_from.localeCompare(b.valid_from));
      const idx    = sorted.findIndex(c => c.id === contractId);
      const prevC  = idx > 0 ? sorted[idx - 1] : null;
      return prev.map(c => {
        if (c.id === contractId) return { ...c, valid_from: newFrom };
        if (prevC && c.id === prevC.id) return { ...c, valid_until: isoMinusOneDay(newFrom) };
        return c;
      });
    });
  }, [profileId, onContractsChange]);

  // ── Add new contract ────────────────────────────────────────────────────

  const [addingNew, setAddingNew] = useState(false);
  const [newForm,   setNewForm]   = useState({ ...EMPTY_NEW_FORM });
  const [newError,  setNewError]  = useState<string | null>(null);
  const [savingNew, setSavingNew] = useState(false);

  async function submitNewContract(e: React.FormEvent) {
    e.preventDefault();
    if (!newForm.valid_from) { setNewError("Start date is required"); return; }
    setSavingNew(true);
    setNewError(null);

    const body = {
      valid_from:             newForm.valid_from,
      hours_per_week:         newForm.hours_per_week         ? parseFloat(newForm.hours_per_week)      : null,
      days_per_week:          newForm.days_per_week          ? parseInt(newForm.days_per_week)          : null,
      vacation_days_per_year: newForm.vacation_days_per_year ? parseInt(newForm.vacation_days_per_year) : null,
      salary:                 newForm.salary                 ? parseFloat(newForm.salary)               : null,
      sick_days:              parseInt(newForm.sick_days) || 0,
    };

    const res = await fetch(`/api/members/${profileId}/contracts`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setNewError(data.error || "Failed to save contract");
      setSavingNew(false);
      return;
    }

    // Refetch to get correct boundaries for all neighbours
    const listRes = await fetch(`/api/members/${profileId}/contracts`);
    if (listRes.ok) {
      const fresh: ContractPeriod[] = await listRes.json();
      onContractsChange(fresh);
      // Open the new contract
      const newC = fresh.find(c => c.valid_from === body.valid_from);
      if (newC) setOpenIds(prev => new Set([...prev, newC.id]));
    }

    setSavingNew(false);
    setAddingNew(false);
    setNewForm({ ...EMPTY_NEW_FORM });
  }

  // ── Delete ──────────────────────────────────────────────────────────────

  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deleting,        setDeleting]        = useState(false);
  const [deleteError,     setDeleteError]     = useState<string | null>(null);

  async function deleteContract(contractId: string) {
    setDeleting(true);
    setDeleteError(null);

    const res = await fetch(`/api/members/${profileId}/contracts/${contractId}`, { method: "DELETE" });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setDeleteError(data.error || "Delete failed");
      setDeleting(false);
      return;
    }

    // Remove deleted contract and fix the previous contract's valid_until to bridge the gap
    onContractsChange(prev => {
      const sorted = [...prev].sort((a, b) => a.valid_from.localeCompare(b.valid_from));
      const idx    = sorted.findIndex(c => c.id === contractId);
      const prevC  = idx > 0 ? sorted[idx - 1] : null;
      const nextC  = idx < sorted.length - 1 ? sorted[idx + 1] : null;
      const remaining = sorted.filter(c => c.id !== contractId);
      if (!prevC) return remaining;
      const newUntil = nextC ? isoMinusOneDay(nextC.valid_from) : null;
      return remaining.map(c => c.id === prevC.id ? { ...c, valid_until: newUntil } : c);
    });

    setConfirmDeleteId(null);
    setDeleting(false);
  }

  // ── Render ──────────────────────────────────────────────────────────────

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold text-gray-700">Contract history</h2>
        {canEdit && !addingNew && (
          <button
            type="button"
            onClick={() => {
              const latest = displayContracts[0];
              setNewForm({
                valid_from:             "",
                hours_per_week:         latest?.hours_per_week         != null ? String(latest.hours_per_week)         : "",
                days_per_week:          latest?.days_per_week          != null ? String(latest.days_per_week)          : "",
                vacation_days_per_year: latest?.vacation_days_per_year != null ? String(latest.vacation_days_per_year) : "",
                salary:                 latest?.salary                 != null ? String(latest.salary)                 : "",
                sick_days:              "0",
              });
              setAddingNew(true);
            }}
            className="text-xs text-indigo-600 font-semibold hover:underline underline-offset-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300 rounded"
          >
            + New contract
          </button>
        )}
      </div>

      {contracts.length === 0 && !addingNew && (
        <p className="text-xs text-gray-400">
          No contracts yet.{canEdit ? " Add one to start tracking the hours balance." : ""}
        </p>
      )}

      {/* ── Add new contract ───────────────────────────────────────────────── */}
      {addingNew && (
        <form
          onSubmit={submitNewContract}
          className="rounded-xl border border-indigo-200 bg-indigo-50/40 p-4 mb-3"
        >
          <p className="text-xs font-semibold text-indigo-700 mb-3">New contract</p>
          <div className="grid grid-cols-2 gap-x-8 gap-y-3">
            <div>
              <p className="text-xs text-gray-400 mb-1">
                Starts on <span className="text-red-500">*</span>
              </p>
              <DatePicker
                value={newForm.valid_from}
                onChange={d => setNewForm(prev => ({ ...prev, valid_from: d }))}
              />
            </div>
            {NUMERIC_FIELDS.map(f => (
              <div key={f}>
                <p className="text-xs text-gray-400 mb-1">{FIELD_LABELS[f]}</p>
                <input
                  type="number" min={0}
                  value={newForm[f]}
                  onChange={e => setNewForm(prev => ({ ...prev, [f]: e.target.value }))}
                  placeholder="—"
                  className="w-28 text-sm border border-gray-200 rounded-lg px-2 py-0.5 focus:outline-none focus:ring-2 focus:ring-indigo-300"
                />
              </div>
            ))}
          </div>
          {newError && <p className="text-xs text-red-500 mt-2">{newError}</p>}
          <div className="flex gap-2 mt-3">
            <button
              type="submit" disabled={savingNew}
              className="text-xs bg-gray-900 text-white font-semibold px-4 py-1.5 rounded-lg hover:bg-gray-700 disabled:opacity-50 transition-colors"
            >
              {savingNew ? "Saving…" : "Save contract"}
            </button>
            <button
              type="button"
              onClick={() => { setAddingNew(false); setNewError(null); }}
              className="text-xs text-gray-400 hover:text-gray-600 font-semibold px-3 py-1.5"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* ── Contract accordion ─────────────────────────────────────────────── */}
      <div className="flex flex-col gap-2">
        {displayContracts.map((contract, displayIndex) => {
          const isCurrent = contract.valid_until === null;
          const isFirst = contract.id === firstId;
          const isOpen    = openIds.has(contract.id);
          const contractN = displayContracts.length - displayIndex; // oldest = 1

          const legalMin  = contract.days_per_week != null
            ? Number(contract.days_per_week) * 4
            : null;

          return (
            <div
              key={contract.id}
              className={`rounded-xl border transition-colors ${
                isCurrent ? "border-indigo-200 bg-indigo-50/20" : "border-gray-100 bg-gray-50/40"
              }`}
            >
              {/* Header */}
              <button
                type="button"
                onClick={() => toggleOpen(contract.id)}
                aria-expanded={isOpen}
                className="w-full flex items-center justify-between px-4 py-3 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300 focus-visible:rounded-xl"
              >
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-semibold text-gray-700">Contract {contractN}</span>
                  {isCurrent && (
                    <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-indigo-100 text-indigo-600">
                      current
                    </span>
                  )}
                  <span className="text-xs text-gray-400">
                    {(() => {
                      const f = new Date(contract.valid_from  + "T12:00:00Z").toLocaleDateString("en-GB");
                      const u = contract.valid_until
                        ? new Date(contract.valid_until + "T12:00:00Z").toLocaleDateString("en-GB")
                        : null;
                      return u ? `${f} – ${u}` : `from ${f}`;
                    })()}
                  </span>
                </div>
                <span className="text-gray-400 text-xs ml-2" aria-hidden>{isOpen ? "▲" : "▼"}</span>
              </button>

              {/* Body */}
              {isOpen && (
                <div className="px-4 pb-4">
                  <div className="grid grid-cols-2 gap-x-8 gap-y-5">

                    {/* Contract start */}
                    <div>
                      <p className="text-xs text-gray-400 mb-1">{FIELD_LABELS.valid_from}</p>
                      <DateFieldInput
                        contractId={contract.id}
                        value={contract.valid_from}
                        canEdit={canEdit}
                        firstShiftISO={firstShiftISO}
                        onSave={saveDateField}
                      />
                    </div>

                    {/* Contract end — read-only, computed from next contract */}
                    <div>
                      <p className="text-xs text-gray-400 mb-1">Contract end</p>
                      <p className="text-sm font-medium text-gray-700 pb-0.5 border-b-2 border-transparent">
                        {contract.valid_until
                          ? new Date(contract.valid_until + "T12:00:00Z").toLocaleDateString("en-GB")
                          : <span className="text-gray-400 italic text-sm">ongoing</span>
                        }
                      </p>
                    </div>

                    {/* Numeric fields */}
                    {NUMERIC_FIELDS.map(field => {
                      const val = contract[field] as number | null;
                      const hint =
                        field === "vacation_days_per_year" && legalMin !== null && val === legalMin
                          ? `Legal min. (${legalMin}d)`
                          : field === "vacation_days_per_year" && legalMin !== null
                          ? `Legal min: ${legalMin} days`
                          : null;
                      return (
                        <div key={field}>
                          <p className="text-xs text-gray-400 mb-1">{FIELD_LABELS[field]}</p>
                          <NumericFieldInput
                            contractId={contract.id}
                            field={field}
                            value={val}
                            canEdit={canEdit}
                            hint={hint}
                            onSave={saveNumericField}
                          />
                        </div>
                      );
                    })}
                  </div>

                  {isFirst && (
                    <p className="text-[11px] text-gray-400 mt-3">
                      ↑ Contract start is your employment start date.
                    </p>
                  )}

                  {/* Delete — any contract, as long as more than one exists */}
                  {canEdit && displayContracts.length > 1 && (
                    <div className="mt-4 pt-3 border-t border-gray-100">
                      {deleteError && <p className="text-xs text-red-500 mb-2">{deleteError}</p>}
                      {confirmDeleteId === contract.id ? (
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-gray-500">Delete this contract?</span>
                          <button
                            type="button"
                            onClick={() => deleteContract(contract.id)}
                            disabled={deleting}
                            className="text-xs font-semibold text-red-500 hover:text-red-700 disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-300 rounded"
                          >
                            {deleting ? "Deleting…" : "Yes, delete"}
                          </button>
                          <button
                            type="button"
                            onClick={() => { setConfirmDeleteId(null); setDeleteError(null); }}
                            className="text-xs text-gray-400 hover:text-gray-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-300 rounded"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteId(contract.id)}
                          className="text-xs text-gray-400 hover:text-red-500 font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-red-200 rounded"
                        >
                          Delete contract
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
