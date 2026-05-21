"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Status = "loading" | "ready" | "done" | "expired";

export default function ResetPasswordPage() {
  const router   = useRouter();
  const [status,   setStatus]   = useState<Status>("loading");
  const [password, setPassword] = useState("");
  const [confirm,  setConfirm]  = useState("");
  const [error,    setError]    = useState("");
  const [saving,   setSaving]   = useState(false);

  useEffect(() => {
    const supabase = createClient();

    // The Supabase browser client parses the URL hash automatically.
    // When type=recovery is present it fires PASSWORD_RECOVERY before anything else.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") setStatus("ready");
    });

    // Fallback: if the user is already signed in (e.g. from a previous session
    // that's still valid) also show the form.
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) setStatus(prev => prev === "loading" ? "ready" : prev);
    });

    // If nothing fired after 4 s, the link is invalid / expired.
    const timeout = setTimeout(() => {
      setStatus(prev => prev === "loading" ? "expired" : prev);
    }, 4000);

    return () => {
      subscription.unsubscribe();
      clearTimeout(timeout);
    };
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirm) { setError("Passwords don't match"); return; }
    if (password.length < 6)  { setError("Password must be at least 6 characters"); return; }
    setError("");
    setSaving(true);

    const supabase = createClient();
    const { error: err } = await supabase.auth.updateUser({ password });
    if (err) { setError(err.message); setSaving(false); return; }

    setStatus("done");
    setTimeout(() => router.push("/shifts"), 2000);
  }

  // ── Wrappers ────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen flex items-center justify-center px-4" style={{ background: "#f4f4f2" }}>
      <div className="bg-white rounded-2xl w-full max-w-sm p-10" style={{ boxShadow: "0 2px 20px rgba(0,0,0,0.08)" }}>

        {status === "loading" && (
          <p className="text-sm text-gray-400 text-center py-6">Verifying link…</p>
        )}

        {status === "expired" && (
          <>
            <h1 className="text-2xl font-bold mb-1">Link expired</h1>
            <p className="text-sm text-gray-400 mb-6">
              This password reset link is invalid or has already been used.
            </p>
            <Link
              href="/forgot-password"
              className="block w-full text-center bg-gray-900 text-white rounded-xl py-3 text-sm font-semibold hover:bg-gray-700 transition-colors"
            >
              Request a new link
            </Link>
            <p className="text-xs text-center text-gray-400 mt-4">
              <Link href="/login" className="text-gray-900 font-semibold hover:underline">
                ← Back to sign in
              </Link>
            </p>
          </>
        )}

        {status === "done" && (
          <>
            <h1 className="text-2xl font-bold mb-1">Password updated</h1>
            <p className="text-sm text-gray-400">Redirecting you to the app…</p>
          </>
        )}

        {status === "ready" && (
          <>
            <h1 className="text-2xl font-bold mb-1">New password</h1>
            <p className="text-sm text-gray-400 mb-8">Choose a new password for your account</p>

            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm mb-5">
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1.5">New password</label>
                <input
                  type="password" required minLength={6} autoFocus
                  value={password} onChange={e => setPassword(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-gray-800 transition-colors"
                  placeholder="Min. 6 characters"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1.5">Confirm password</label>
                <input
                  type="password" required
                  value={confirm} onChange={e => setConfirm(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-gray-800 transition-colors"
                  placeholder="Repeat new password"
                />
              </div>
              <button
                type="submit" disabled={saving}
                className="w-full bg-gray-900 text-white rounded-xl py-3 text-sm font-semibold mt-2 hover:bg-gray-700 transition-colors disabled:opacity-50"
              >
                {saving ? "Saving…" : "Update password"}
              </button>
            </form>
          </>
        )}

      </div>
    </div>
  );
}
