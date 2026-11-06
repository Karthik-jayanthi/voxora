"use client";

import { useEffect, useRef, useState } from "react";
import { CheckCircle2, Loader2 } from "lucide-react";
import { apiFetch } from "@/lib/api";

export type ConfirmedOrder = {
  order_number: string;
  total_amount: number | string;
  duplicate: boolean;
};

type Props = {
  items: { product_id: string | null; quantity: string | null; unit: string | null }[];
  total: string;
  language: string | null;
  onConfirmed: (order: ConfirmedOrder) => void;
};

export default function ConfirmOrder({ items, total, language, onConfirmed }: Props) {
  const keyRef = useRef<string | null>(null);
  const [customer, setCustomer] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // a changed order gets a new key; the same order retried keeps its key
  const signature = JSON.stringify(items);
  useEffect(() => {
    keyRef.current = null;
  }, [signature]);

  async function confirm() {
    if (busy) return;
    setBusy(true);
    setError(null);
    if (!keyRef.current) keyRef.current = crypto.randomUUID();

    try {
      const res = await apiFetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          idempotency_key: keyRef.current,
          customer_name: customer,
          language,
          items,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body.success) {
        throw new Error(body?.error?.message || "The order could not be saved.");
      }
      keyRef.current = null;
      onConfirmed({
        order_number: body.order_number,
        total_amount: body.total_amount,
        duplicate: Boolean(body.duplicate),
      });
    } catch (e) {
      setError(
        e instanceof TypeError
          ? "Cannot reach the backend. Check the order history before trying again."
          : e instanceof Error
            ? e.message
            : "The order could not be saved."
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-3 space-y-3">
      <div>
        <label htmlFor="customer" className="block text-sm font-medium text-neutral-700 mb-1">
          Customer name (optional)
        </label>
        <input
          id="customer"
          value={customer}
          onChange={(e) => setCustomer(e.target.value)}
          maxLength={100}
          className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900"
        />
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>
      )}

      <button
        onClick={confirm}
        disabled={busy}
        className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-800 py-3 text-sm font-medium text-white hover:bg-emerald-900 disabled:opacity-60"
      >
        {busy ? <Loader2 size={18} className="animate-spin" /> : <CheckCircle2 size={18} />}
        {busy ? "Saving..." : `Confirm order · ₹${total}`}
      </button>
    </div>
  );
}