"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

type Step = "email" | "code" | "done";

export default function ForgotPasswordPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSendCode(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const res = await fetch("/api/forgot-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });

    if (!res.ok) {
      const data = await res.json();
      setError(data.error || "Something went wrong");
      setLoading(false);
      return;
    }

    setLoading(false);
    setStep("code");
  }

  async function handleResetPassword(e: React.FormEvent) {
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
      const data = await res.json();
      setError(data.error || "Something went wrong");
      setLoading(false);
      return;
    }

    setStep("done");
    setTimeout(() => router.push("/login"), 2500);
  }

  return (
    <div className="bg-white rounded-2xl w-full max-w-sm p-10" style={{ boxShadow: "0 2px 20px rgba(0,0,0,0.08)" }}>

      {step === "email" && (
        <>
          <h1 className="text-2xl font-bold mb-1">Forgot password</h1>
          <p className="text-sm text-gray-400 mb-8">Enter your email and we&apos;ll send a reset code</p>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm mb-5">
              {error}
            </div>
          )}

          <form onSubmit={handleSendCode} className="flex flex-col gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1.5">Email</label>
              <input
                type="email" required autoFocus
                value={email} onChange={e => setEmail(e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-gray-800 transition-colors"
                placeholder="you@restaurant.com"
              />
            </div>
            <button
              type="submit" disabled={loading}
              className="w-full bg-gray-900 text-white rounded-xl py-3 text-sm font-semibold mt-2 hover:bg-gray-700 transition-colors disabled:opacity-50 cursor-pointer"
            >
              {loading ? "Sending…" : "Send reset code"}
            </button>
          </form>
          <p className="text-xs text-center text-gray-400 mt-6">
            <Link href="/login" className="text-gray-900 font-semibold hover:underline">
              ← Back to sign in
            </Link>
          </p>
        </>
      )}

      {step === "code" && (
        <>
          <h1 className="text-2xl font-bold mb-1">Enter code</h1>
          <p className="text-sm text-gray-400 mb-6">
            We sent a 6-digit code to <strong>{email}</strong>
          </p>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm mb-5">
              {error}
            </div>
          )}

          <form onSubmit={handleResetPassword} className="flex flex-col gap-4">
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
            <button
              type="submit" disabled={loading}
              className="w-full bg-gray-900 text-white rounded-xl py-3 text-sm font-semibold mt-2 hover:bg-gray-700 transition-colors disabled:opacity-50 cursor-pointer"
            >
              {loading ? "Resetting…" : "Reset password"}
            </button>
          </form>

          <p className="text-xs text-center text-gray-400 mt-6">
            Didn&apos;t get the code?{" "}
            <button
              onClick={() => { setStep("email"); setError(""); setCode(""); }}
              className="text-gray-900 font-semibold hover:underline cursor-pointer"
            >
              Try again
            </button>
          </p>
        </>
      )}

      {step === "done" && (
        <div className="text-center py-4">
          <div className="text-4xl mb-4">✅</div>
          <p className="font-semibold text-gray-800 mb-2">Password updated!</p>
          <p className="text-sm text-gray-500">Redirecting you to sign in…</p>
        </div>
      )}
    </div>
  );
}
