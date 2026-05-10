"use client";
import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function JoinPage() {
  const { token } = useParams<{ token: string }>();
  const router = useRouter();

  const [invitation, setInvitation] = useState<{
    email: string; name: string | null; restaurant: string;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [joining, setJoining] = useState(false);

  useEffect(() => {
    fetch(`/api/invitation/${token}`)
      .then(r => r.json())
      .then(data => {
        if (data.error) setError(data.error);
        else setInvitation(data);
        setLoading(false);
      });
  }, [token]);

  async function handleJoin(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirm) { setError("Passwords don't match"); return; }
    if (password.length < 6) { setError("Password must be at least 6 characters"); return; }
    setError("");
    setJoining(true);

    // Server sets the password and creates/updates the account
    const res = await fetch("/api/join", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, password }),
    });

    const data = await res.json();
    if (!res.ok) {
      setError(data.error || "Something went wrong");
      setJoining(false);
      return;
    }

    // Sign in with the new credentials
    const supabase = createClient();
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: data.email,
      password,
    });

    if (signInError) {
      setError(signInError.message);
      setJoining(false);
      return;
    }

    router.push("/shifts");
  }

  if (loading) {
    return (
      <div className="min-h-full flex items-center justify-center">
        <p className="text-gray-400 text-sm">Loading invitation…</p>
      </div>
    );
  }

  if (error && !invitation) {
    return (
      <div className="min-h-full flex items-center justify-center px-4">
        <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-center max-w-sm">
          <p className="text-red-700 font-medium">Invitation not found</p>
          <p className="text-sm text-red-500 mt-1">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-full flex items-center justify-center py-12 px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-gray-900">EasyBOH</h1>
          <p className="text-sm text-gray-500 mt-1">
            You've been invited to join <strong>{invitation?.restaurant}</strong>
          </p>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8">
          <div className="mb-5 p-3 bg-gray-50 rounded-lg">
            <p className="text-xs text-gray-400">Joining as</p>
            <p className="text-sm font-medium">{invitation?.name || invitation?.email}</p>
            <p className="text-xs text-gray-500">{invitation?.email}</p>
          </div>

          <h2 className="text-base font-semibold mb-4">Set your password</h2>
          <form onSubmit={handleJoin} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
              <input
                type="password" required minLength={6}
                value={password} onChange={e => setPassword(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                placeholder="Min. 6 characters"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Confirm password</label>
              <input
                type="password" required
                value={confirm} onChange={e => setConfirm(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <button
              type="submit" disabled={joining}
              className="w-full bg-gray-900 text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-gray-700 disabled:opacity-50 transition-colors"
            >
              {joining ? "Setting up your account…" : "Join restaurant →"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
