"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";

export default function DashboardPage() {
  const [status, setStatus] = useState("Checking backend...");

  useEffect(() => {
    apiFetch("/api/me")
      .then(async (r) => {
        const body = await r.json();
        setStatus(
          r.ok ? `Backend verified your login for store: ${body.store_name}` : `Backend error: ${body.error?.message}`
        );
      })
      .catch(() => setStatus("Cannot reach the backend. Is Flask running on port 5001?"));
  }, []);

  return (
    <div>
      <h1 className="text-2xl font-semibold text-neutral-900">Overview</h1>
      <p className="mt-2 text-sm text-neutral-600">{status}</p>
    </div>
  );
}