"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Mic } from "lucide-react";
import { supabase } from "@/lib/supabase";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) {
      setError(error.message);
      return;
    }
    router.push("/dashboard");
  }

  return (
    <main className="min-h-screen bg-neutral-50 flex items-center justify-center p-6">
      <div className="w-full max-w-sm rounded-xl border border-neutral-200 bg-white p-8 shadow-sm">
        <div className="flex items-center gap-3 mb-6">
          <div className="rounded-lg bg-emerald-800 p-2 text-white">
            <Mic size={20} />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-neutral-900">Voxora</h1>
            <p className="text-xs text-neutral-500">Your Voice. Your Store. Smarter Commerce.</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-neutral-700 mb-1">Email</label>
            <input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-700"
            />
          </div>
          <div>
            <label htmlFor="password" className="block text-sm font-medium text-neutral-700 mb-1">Password</label>
            <input
              id="password"
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-700"
            />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-emerald-800 py-2 text-sm font-medium text-white hover:bg-emerald-900 disabled:opacity-60"
          >
            {loading ? "Logging in..." : "Log in"}
          </button>
        </form>

        <p className="mt-4 text-center text-sm text-neutral-500">
          New store?{" "}
          <Link href="/register" className="font-medium text-emerald-800 hover:underline">Create an account</Link>
        </p>
      </div>
    </main>
  );
}