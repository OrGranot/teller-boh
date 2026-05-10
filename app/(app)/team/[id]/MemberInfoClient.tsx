"use client";
import { useState, useRef } from "react";

interface Props {
  profileId: string;
  canEdit: boolean;
  isPlaceholder: boolean;
  /** True when the profile is a placeholder with a pending (unsent/sent) invitation */
  hasPendingInvite?: boolean;
  initial: {
    email: string | null;
    phone: string | null;
    address: string | null;
    birthdate: string | null;
  };
}

type Field = "phone" | "address" | "birthdate";

const FIELD_LABELS: Record<Field, string> = {
  phone: "Phone",
  address: "Address",
  birthdate: "Date of birth",
};

export default function MemberInfoClient({ profileId, canEdit, isPlaceholder, hasPendingInvite = false, initial }: Props) {

  const [values, setValues] = useState({ ...initial });
  const [editing, setEditing] = useState<Field | null>(null);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);

  // Track whether this is a placeholder locally (changes after unlink)
  const [localIsPlaceholder, setLocalIsPlaceholder] = useState(isPlaceholder);
  // True when there's a pending invite but no auth user yet
  const [localHasPendingInvite, setLocalHasPendingInvite] = useState(hasPendingInvite);

  // Set-email flow (for imported employees)
  const [emailDraft, setEmailDraft] = useState("");
  const [editingEmail, setEditingEmail] = useState(false);
  const [savingEmail, setSavingEmail] = useState(false);
  const [emailError, setEmailError] = useState("");
  const [emailSent, setEmailSent]   = useState(false);
  // Start as true when a pending invitation already exists (so the green banner
  // shows immediately on page load, not only after clicking "Save & send invite")
  const [inviteSent, setInviteSent] = useState(hasPendingInvite);

  // Unlink flow
  const [confirmUnlink, setConfirmUnlink] = useState(false);
  const [unlinking, setUnlinking]         = useState(false);
  const [unlinkError, setUnlinkError]     = useState("");

  async function handleUnlink() {
    setUnlinking(true);
    setUnlinkError("");
    const res = await fetch(`/api/members/${profileId}/email`, { method: "DELETE" });
    const data = await res.json();
    if (!res.ok) {
      setUnlinkError(data.error || "Failed to unlink account");
      setUnlinking(false);
      return;
    }
    // Revert UI to placeholder state (no email, no invite)
    setValues(prev => ({ ...prev, email: null }));
    setLocalIsPlaceholder(true);
    setLocalHasPendingInvite(false);
    setConfirmUnlink(false);
    setEmailSent(false);
    setInviteSent(false);
    setUnlinking(false);
  }

  function startEdit(field: Field) {
    if (!canEdit) return;
    savingRef.current = false;
    setEditing(field);
    setDraft(values[field] || "");
  }

  async function save() {
    if (!editing || savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    const savedField = editing;
    const savedDraft = draft;
    await fetch(`/api/profiles/${profileId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [savedField]: savedDraft.trim() || null }),
    });
    setValues(prev => ({ ...prev, [savedField]: savedDraft.trim() || null }));
    setEditing(null);
    setSaving(false);
    savingRef.current = false;
  }

  async function saveEmail() {
    if (!emailDraft.trim()) { setEmailError("Email is required"); return; }
    setSavingEmail(true);
    setEmailError("");
    const res = await fetch(`/api/members/${profileId}/email`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: emailDraft.trim() }),
    });
    const data = await res.json();
    if (!res.ok) {
      setEmailError(data.error || "Failed to set email");
      setSavingEmail(false);
      return;
    }
    setValues(prev => ({ ...prev, email: emailDraft.trim() }));
    setEditingEmail(false);
    if (data.isPlaceholder) {
      setInviteSent(true);
    } else {
      setEmailSent(!!data.emailSent);
    }
    setSavingEmail(false);
  }

  const fields: Field[] = ["phone", "address", "birthdate"];

  function onKeyDown(e: React.KeyboardEvent, field: Field) {
    if (e.key === "Enter") { e.preventDefault(); void save(); }
    if (e.key === "Escape") { savingRef.current = true; setEditing(null); }
    if (e.key === "Tab") {
      e.preventDefault();
      const idx = fields.indexOf(field);
      const next = fields[idx + 1] ?? null;
      save().then(() => { if (next) startEdit(next); });
    }
  }
  // Show the "set email" input when there's simply no email to display.
  // (Placeholder status no longer hides a known email — e.g. pending invite.)
  const showNoEmail = !values.email;

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
      <h2 className="text-sm font-semibold text-gray-700 mb-4">Personal info</h2>
      <div className="grid grid-cols-2 gap-x-8 gap-y-4">

        {/* Email */}
        <div>
          <p className="text-xs text-gray-400 mb-1">Email</p>
          {inviteSent ? (
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-sm text-green-600 font-medium">✓ Invitation sent to {values.email}</p>
              {canEdit && (
                confirmUnlink ? (
                  <span className="flex items-center gap-1.5">
                    <span className="text-xs text-gray-500">Cancel invite?</span>
                    <button
                      onClick={handleUnlink}
                      disabled={unlinking}
                      className="text-xs font-semibold text-red-500 hover:text-red-700 disabled:opacity-50 transition-colors"
                    >
                      {unlinking ? "Cancelling…" : "Yes, cancel"}
                    </button>
                    <button
                      onClick={() => { setConfirmUnlink(false); setUnlinkError(""); }}
                      className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
                    >
                      Keep
                    </button>
                  </span>
                ) : (
                  <button
                    onClick={() => setConfirmUnlink(true)}
                    className="text-xs text-gray-400 hover:text-red-500 transition-colors font-medium"
                  >
                    Cancel invite
                  </button>
                )
              )}
              {unlinkError && <p className="text-xs text-red-500 w-full">{unlinkError}</p>}
            </div>
          ) : emailSent ? (
            <p className="text-sm text-green-600 font-medium">✓ Access email sent to {values.email}</p>
          ) : showNoEmail && canEdit ? (
            editingEmail ? (
              <div className="space-y-1.5">
                <input
                  autoFocus
                  type="email"
                  value={emailDraft}
                  onChange={e => { setEmailDraft(e.target.value); setEmailError(""); }}
                  onKeyDown={e => {
                    if (e.key === "Enter") saveEmail();
                    if (e.key === "Escape") setEditingEmail(false);
                  }}
                  placeholder="employee@email.com"
                  className="w-full border border-gray-300 rounded-lg px-2 py-1 text-sm outline-none focus:border-gray-800"
                />
                {emailError && <p className="text-xs text-red-500">{emailError}</p>}
                <div className="flex gap-2">
                  <button
                    onClick={saveEmail}
                    disabled={savingEmail}
                    className="text-xs bg-gray-900 text-white px-3 py-1 rounded-lg font-semibold disabled:opacity-50"
                  >
                    {savingEmail ? "Saving…" : "Save & send invite"}
                  </button>
                  <button
                    onClick={() => setEditingEmail(false)}
                    className="text-xs text-gray-400 hover:text-gray-700"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setEditingEmail(true)}
                className="text-sm text-indigo-600 hover:text-indigo-800 font-medium"
              >
                + Set email & send invite
              </button>
            )
          ) : (
            /* Has an email (real auth account OR pending invite) */
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-sm text-gray-700">{values.email}</p>
              {canEdit && (
                confirmUnlink ? (
                  <span className="flex items-center gap-1.5">
                    <span className="text-xs text-gray-500">
                      {localHasPendingInvite ? "Cancel invite?" : "Remove access?"}
                    </span>
                    <button
                      onClick={handleUnlink}
                      disabled={unlinking}
                      className="text-xs font-semibold text-red-500 hover:text-red-700 disabled:opacity-50 transition-colors"
                    >
                      {unlinking ? "Removing…" : "Yes, remove"}
                    </button>
                    <button
                      onClick={() => { setConfirmUnlink(false); setUnlinkError(""); }}
                      className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
                    >
                      Cancel
                    </button>
                  </span>
                ) : (
                  <button
                    onClick={() => setConfirmUnlink(true)}
                    className="text-xs text-gray-400 hover:text-red-500 transition-colors font-medium"
                    title={localHasPendingInvite ? "Cancel the pending invitation" : "Remove app access for this employee"}
                  >
                    {localHasPendingInvite ? "Cancel invite" : "Unlink"}
                  </button>
                )
              )}
              {unlinkError && <p className="text-xs text-red-500 w-full">{unlinkError}</p>}
            </div>
          )}
        </div>

        {fields.map(field => (
          <div key={field}>
            <p className="text-xs text-gray-400 mb-1">{FIELD_LABELS[field]}</p>
            {editing === field ? (
              <div className="flex items-center gap-2">
                <input
                  autoFocus
                  type={field === "birthdate" ? "date" : "text"}
                  value={draft}
                  onChange={e => setDraft(e.target.value)}
                  onKeyDown={e => onKeyDown(e, field)}
                  onBlur={() => void save()}
                  className="flex-1 border border-gray-300 rounded-lg px-2 py-1 text-sm outline-none focus:border-gray-800 min-w-0"
                />
                {saving && <span className="text-xs text-gray-400">Saving…</span>}
              </div>
            ) : (
              <p
                onClick={() => startEdit(field)}
                className={`text-sm ${
                  canEdit ? "cursor-pointer hover:text-indigo-600" : ""
                } ${values[field] ? "text-gray-700" : "text-gray-300 italic"}`}
              >
                {field === "birthdate" && values.birthdate
                  ? new Date(values.birthdate).toLocaleDateString("en-GB")
                  : values[field] || (canEdit ? "Click to add" : "—")}
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
