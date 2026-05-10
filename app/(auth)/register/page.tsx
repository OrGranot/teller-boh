"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

export default function RegisterPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    const supabase = createClient();
    const { error } = await supabase.auth.signUp({ email, password, options: { data: { name } } });
    if (error) { setError(error.message); setLoading(false); return; }
    router.push("/setup");
  }

  return (
    <div className="bg-white rounded-2xl w-full max-w-sm p-10" style={{ boxShadow: "0 2px 20px rgba(0,0,0,0.08)" }}>
      <h1 className="text-2xl font-bold mb-1">EasyBOH</h1>
      <p className="text-sm text-gray-400 mb-8">Create your account</p>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm mb-5">{error}</div>
      )}

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div>
          <label className="block text-xs font-semibold text-gray-500 mb-1.5">Full name</label>
          <input type="text" required autoFocus value={name} onChange={e => setName(e.target.value)}
            className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-gray-800 transition-colors"
            placeholder="Or Granot" />
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-500 mb-1.5">Email</label>
          <input type="email" required value={email} onChange={e => setEmail(e.target.value)}
            className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-gray-800 transition-colors"
            placeholder="you@restaurant.com" />
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-500 mb-1.5">Password</label>
          <input type="password" required minLength={6} value={password} onChange={e => setPassword(e.target.value)}
            className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-gray-800 transition-colors"
            placeholder="Min. 6 characters" />
        </div>
        <button type="submit" disabled={loading}
          className="w-full bg-gray-900 text-white rounded-xl py-3 text-sm font-semibold mt-2 hover:bg-gray-700 transition-colors disabled:opacity-50">
          {loading ? "Creating account…" : "Create account"}
        </button>
      </form>
      <p className="text-xs text-center text-gray-400 mt-6">
        Already have an account?{" "}
        <Link href="/login" className="text-gray-900 font-semibold hover:underline">Sign in</Link>
      </p>
    </div>
  );
}
