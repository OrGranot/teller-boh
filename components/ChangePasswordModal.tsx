"use client";
import { useState } from "react";

type Step = "confirm" | "code" | "done";

export default function ChangePasswordModal({ email, onClose }: { email: string; onClose: () => void }) {
  const [step, setStep] = useState<Step>("confirm");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSendCode() {
    setLoading(true);
    setError("");
    await fetch("/api/forgot-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    setLoading(false);
    setStep("code");
  }

  async function handleReset(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirm) { setError("Passwords don't match"); return; }
    if (password.length < 6) { setError("Password must be at least 6 characters"); return; }
    setLoading(true);
    setError("");

    const res = await fetch("/api/reset-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, code, password }),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Something went wrong");
      setLoading(false);
      return;
    }

    setStep("done");
    setTimeout(onClose, 2000);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-[2px]"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-4 p-8">

        {step === "confirm" && (
          <>
            <h2 className="text-lg font-bold text-gray-900 mb-2">Change password</h2>
            <p className="text-sm text-gray-500 mb-6">
              We&apos;ll send a 6-digit code to <strong>{email}</strong>
            </p>
            <div className="flex gap-2">
              <button onClick={onClose}
                className="flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold text-gray-600 bg-gray-100 hover:bg-gray-200 transition-colors cursor-pointer">
                Cancel
              </button>
              <button onClick={handleSendCode} disabled={loading}
                className="flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold text-white bg-gray-900 hover:bg-gray-700 disabled:opacity-50 transition-colors cursor-pointer">
                {loading ? "Sending…" : "Send code"}
              </button>
            </div>
          </>
        )}

        {step === "code" && (
          <>
            <h2 className="text-lg font-bold text-gray-900 mb-2">Enter code</h2>
            <p className="text-sm text-gray-500 mb-5">
              Check your email for the 6-digit code
            </p>

            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm mb-4">
                {error}
              </div>
            )}

            <form onSubmit={handleReset} className="flex flex-col gap-3">
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1.5">Reset code</label>
                <input
                  type="text" required autoFocus
                  inputMode="numeric" maxLength={6} pattern="\d{6}"
                  value={code} onChange={e => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm font-mono text-center text-lg tracking-[0.3em] outline-none focus:border-gray-800 transition-colors"
                  placeholder="000000"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1.5">New password</label>
                <input
                  type="password" required minLength={6}
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
              <div className="flex gap-2 pt-1">
                <button type="button" onClick={onClose}
                  className="flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold text-gray-600 bg-gray-100 hover:bg-gray-200 transition-colors cursor-pointer">
                  Cancel
                </button>
                <button type="submit" disabled={loading}
                  className="flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold text-white bg-gray-900 hover:bg-gray-700 disabled:opacity-50 transition-colors cursor-pointer">
                  {loading ? "Resetting…" : "Reset password"}
                </button>
              </div>
            </form>
          </>
        )}

        {step === "done" && (
          <div className="text-center py-4">
            <p className="text-lg font-bold text-gray-900 mb-2">Password updated!</p>
            <p className="text-sm text-gray-500">You can continue using the app.</p>
          </div>
        )}
      </div>
    </div>
  );
}
