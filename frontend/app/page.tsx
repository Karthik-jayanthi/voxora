"use client";

import { useEffect, useState } from "react";
import { Mic } from "lucide-react";

type Health = {
  status: string;
  gnani_key_configured: boolean;
  supabase_configured: boolean;
};

export default function Home() {
  const [health, setHealth] = useState<Health | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/health`)
      .then((r) => r.json())
      .then(setHealth)
      .catch(() => setError("Cannot reach the backend. Is Flask running on port 5001?"));
  }, []);

  return (
    <main className="min-h-screen bg-neutral-50 flex items-center justify-center p-6">
      <div className="w-full max-w-md rounded-xl border border-neutral-200 bg-white p-8 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="rounded-lg bg-emerald-800 p-2 text-white">
            <Mic size={20} />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-neutral-900">Voxora</h1>
            <p className="text-sm text-neutral-500">Your Voice. Your Store. Smarter Commerce.</p>
          </div>
        </div>

        <div className="mt-6 space-y-2 text-sm">
          {error && <p className="text-red-600">{error}</p>}
          {!health && !error && <p className="text-neutral-500">Checking backend...</p>}
          {health && (
            <>
              <p>Backend: <span className="font-medium text-emerald-700">{health.status}</span></p>
              <p>Gnani key set: <span className="font-medium">{String(health.gnani_key_configured)}</span></p>
              <p>Supabase set: <span className="font-medium">{String(health.supabase_configured)}</span></p>
            </>
          )}
        </div>
      </div>
    </main>
  );
}