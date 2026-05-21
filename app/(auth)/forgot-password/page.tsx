"use client";
import { useState } from "react";
import Link from "next/link";

export default function ForgotPasswordPage() {
  const [email, setEmail]     = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent]       = useState(false);
  const [error, setError]     = useState("");

  async function handleSubmit(e: React.FormEvent) {
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

    setSent(true);
  }

  return (
    <div className="bg-white rounded-2xl w-full max-w-sm p-10" style={{ boxShadow: "0 2px 20px rgba(0,0,0,0.08)" }}>
      <h1 className="text-2xl font-bold mb-1">Forgot password</h1>
      <p className="text-sm text-gray-400 mb-8">Enter your email and we&apos;ll send a reset link</p>

      {sent ? (
        <div className="text-center py-4">
          <div className="text-4xl mb-4">✉️</div>
          <p className="font-semibold text-gray-800 mb-2">Check your inbox</p>
          <p className="text-sm text-gray-500">
            If an account exists for <strong>{email}</strong>, you&apos;ll receive a
            password reset link shortly.
          </p>
          <Link
            href="/login"
            className="mt-6 block text-sm text-gray-900 font-semibold hover:underline"
          >
            ← Back to sign in
          </Link>
        </div>
      ) : (
        <>
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm mb-5">
              {error}
            </div>
          )}
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
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
              className="w-full bg-gray-900 text-white rounded-xl py-3 text-sm font-semibold mt-2 hover:bg-gray-700 transition-colors disabled:opacity-50"
            >
              {loading ? "Sending…" : "Send reset link"}
            </button>
          </form>
          <p className="text-xs text-center text-gray-400 mt-6">
            <Link href="/login" className="text-gray-900 font-semibold hover:underline">
              ← Back to sign in
            </Link>
          </p>
        </>
      )}
    </div>
  );
}
