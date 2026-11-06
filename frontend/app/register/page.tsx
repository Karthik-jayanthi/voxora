"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Mic } from "lucide-react";
import { supabase } from "@/lib/supabase";

export default function RegisterPage() {
  const router = useRouter();
  const [fullName, setFullName] = useState("");
  const [storeName, setStoreName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setInfo(null);

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName } },
    });
    if (error) {
      setLoading(false);
      setError(error.message);
      return;
    }
    if (!data.session) {
      setLoading(false);
      setInfo("Account created. Confirm your email, then log in.");
      return;
    }

    const { error: storeError } = await supabase.rpc("create_store", { p_name: storeName });
    setLoading(false);
    if (storeError) {
      setError(`Account created, but the store could not be set up: ${storeError.message}`);
      return;
    }
    router.push("/dashboard");
  }

  const inputClass =
    "w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-700";

  return (
    <main className="min-h-screen bg-neutral-50 flex items-center justify-center p-6">
      <div className="w-full max-w-sm rounded-xl border border-neutral-200 bg-white p-8 shadow-sm">
        <div className="flex items-center gap-3 mb-6">
          <div className="rounded-lg bg-emerald-800 p-2 text-white">
            <Mic size={20} />
          </div>
          <h1 className="text-xl font-semibold text-neutral-900">Create your store</h1>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="fullName" className="block text-sm font-medium text-neutral-700 mb-1">Your name</label>
            <input id="fullName" required value={fullName} onChange={(e) => setFullName(e.target.value)} className={inputClass} />
          </div>
          <div>
            <label htmlFor="storeName" className="block text-sm font-medium text-neutral-700 mb-1">Store name</label>
            <input id="storeName" required value={storeName} onChange={(e) => setStoreName(e.target.value)} className={inputClass} />
          </div>
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-neutral-700 mb-1">Email</label>
            <input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className={inputClass} />
          </div>
          <div>
            <label htmlFor="password" className="block text-sm font-medium text-neutral-700 mb-1">Password (min 6 characters)</label>
            <input id="password" type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} className={inputClass} />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          {info && <p className="text-sm text-emerald-700">{info}</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-emerald-800 py-2 text-sm font-medium text-white hover:bg-emerald-900 disabled:opacity-60"
          >
            {loading ? "Creating..." : "Create account"}
          </button>
        </form>

        <p className="mt-4 text-center text-sm text-neutral-500">
          Already registered?{" "}
          <Link href="/login" className="font-medium text-emerald-800 hover:underline">Log in</Link>
        </p>
      </div>
    </main>
  );
}