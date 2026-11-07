"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AlertTriangle, IndianRupee, Loader2, Mic, Package, ShoppingBag } from "lucide-react";
import { supabase } from "@/lib/supabase";

type OrderRow = {
  id: string;
  order_number: string;
  customer_name: string | null;
  total_amount: number;
  status: string;
  created_at: string;
};

type ProductRow = {
  id: string;
  name: string;
  unit: string;
  stock_quantity: number;
  minimum_stock: number;
};

const cents = (n: number | string) => Math.round(Number(n) * 100);
const rupees = (c: number) => (c / 100).toFixed(2);
const dayKey = (d: Date) => d.toLocaleDateString("en-CA"); // YYYY-MM-DD in local time
const when = (iso: string) => new Date(iso).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });

function StatCard({ label, value, icon }: { label: string; value: string; icon: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-5">
      <div className="flex items-center justify-between text-neutral-500">
        <span className="text-sm">{label}</span>
        {icon}
      </div>
      <p className="mt-2 text-2xl font-semibold text-neutral-900">{value}</p>
    </div>
  );
}

export default function DashboardPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [week, setWeek] = useState<OrderRow[]>([]);
  const [recent, setRecent] = useState<OrderRow[]>([]);
  const [products, setProducts] = useState<ProductRow[]>([]);

  async function load() {
    setLoading(true);
    setError(null);

    const start = new Date();
    start.setHours(0, 0, 0, 0);
    start.setDate(start.getDate() - 6);

    const cols = "id,order_number,customer_name,total_amount,status,created_at";
    const [w, r, p] = await Promise.all([
      supabase.from("orders").select(cols).gte("created_at", start.toISOString()).order("created_at", { ascending: false }).limit(1000),
      supabase.from("orders").select(cols).order("created_at", { ascending: false }).limit(5),
      supabase.from("products").select("id,name,unit,stock_quantity,minimum_stock").order("name"),
    ]);

    if (w.error || r.error || p.error) {
      setError("Could not load the dashboard. Check your connection and try again.");
    } else {
      setWeek((w.data as OrderRow[]) ?? []);
      setRecent((r.data as OrderRow[]) ?? []);
      setProducts((p.data as ProductRow[]) ?? []);
    }
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-neutral-500">
        <Loader2 size={16} className="animate-spin" /> Loading dashboard...
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-sm text-red-700">
        <p>{error}</p>
        <button onClick={load} className="mt-2 font-medium underline">Try again</button>
      </div>
    );
  }

  const confirmed = week.filter((o) => o.status === "confirmed");

  const today = dayKey(new Date());
  const todayOrders = confirmed.filter((o) => dayKey(new Date(o.created_at)) === today);
  const todayCents = todayOrders.reduce((sum, o) => sum + cents(o.total_amount), 0);

  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - (6 - i));
    const key = dayKey(d);
    const total = confirmed
      .filter((o) => dayKey(new Date(o.created_at)) === key)
      .reduce((sum, o) => sum + cents(o.total_amount), 0);
    return { key, label: d.toLocaleDateString("en-IN", { weekday: "short" }), total };
  });
  const maxDay = Math.max(1, ...days.map((d) => d.total));

  const low = products.filter((p) => Number(p.stock_quantity) <= Number(p.minimum_stock));

  return (
    <div className="mx-auto max-w-5xl">
      <h1 className="text-2xl font-semibold text-neutral-900">Overview</h1>

      <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Sales today" value={`₹${rupees(todayCents)}`} icon={<IndianRupee size={18} />} />
        <StatCard label="Orders today" value={String(todayOrders.length)} icon={<ShoppingBag size={18} />} />
        <StatCard label="Total products" value={String(products.length)} icon={<Package size={18} />} />
        <StatCard label="Low-stock products" value={String(low.length)} icon={<AlertTriangle size={18} />} />
      </div>

      <div className="mt-4 flex flex-wrap gap-3">
        <Link href="/voice-orders" className="inline-flex items-center gap-2 rounded-lg bg-emerald-800 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-900">
          <Mic size={16} /> New voice order
        </Link>
        <Link href="/inventory" className="rounded-lg border border-neutral-300 bg-white px-4 py-2 text-sm font-medium text-neutral-800 hover:bg-neutral-50">
          Manage inventory
        </Link>
        <Link href="/orders" className="rounded-lg border border-neutral-300 bg-white px-4 py-2 text-sm font-medium text-neutral-800 hover:bg-neutral-50">
          View order history
        </Link>
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <div className="rounded-xl border border-neutral-200 bg-white p-5 lg:col-span-2">
          <h2 className="text-sm font-semibold text-neutral-900">Sales, last 7 days</h2>
          <div className="mt-4 flex h-40 items-end gap-3">
            {days.map((d) => (
              <div key={d.key} className="flex flex-1 flex-col items-center justify-end gap-1">
                <span className="text-[11px] text-neutral-500">{d.total > 0 ? `₹${Math.round(d.total / 100)}` : ""}</span>
                <div
                  className="w-full rounded-t bg-emerald-700"
                  style={{ height: `${Math.max(d.total > 0 ? 6 : 2, (d.total / maxDay) * 110)}px`, opacity: d.total > 0 ? 1 : 0.25 }}
                  title={`${d.key}: ₹${rupees(d.total)}`}
                />
                <span className="text-xs text-neutral-600">{d.label}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-xl border border-neutral-200 bg-white p-5">
          <h2 className="text-sm font-semibold text-neutral-900">Low stock</h2>
          {low.length === 0 ? (
            <p className="mt-3 text-sm text-neutral-500">Everything is above its alert level.</p>
          ) : (
            <ul className="mt-3 space-y-2">
              {low.slice(0, 6).map((p) => (
                <li key={p.id} className="flex items-center justify-between rounded-lg bg-amber-50 px-3 py-2 text-sm">
                  <span className="font-medium text-neutral-900">{p.name}</span>
                  <span className="text-amber-900">{Number(p.stock_quantity)} {p.unit} left</span>
                </li>
              ))}
            </ul>
          )}
          {low.length > 0 && (
            <Link href="/inventory" className="mt-3 inline-block text-sm font-medium text-emerald-800 hover:underline">
              Update stock
            </Link>
          )}
        </div>
      </div>

      <div className="mt-6 rounded-xl border border-neutral-200 bg-white p-5">
        <h2 className="text-sm font-semibold text-neutral-900">Recent orders</h2>
        {recent.length === 0 ? (
          <p className="mt-3 text-sm text-neutral-500">No orders yet. Take your first voice order.</p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[480px] text-left text-sm">
              <thead className="text-xs uppercase text-neutral-500">
                <tr>
                  <th className="py-2 font-medium">Order</th>
                  <th className="py-2 font-medium">Date and time</th>
                  <th className="py-2 font-medium">Customer</th>
                  <th className="py-2 text-right font-medium">Total</th>
                </tr>
              </thead>
              <tbody>
                {recent.map((o) => (
                  <tr key={o.id} className="border-t border-neutral-100">
                    <td className="py-2 font-medium text-neutral-900">{o.order_number}</td>
                    <td className="py-2 text-neutral-600">{when(o.created_at)}</td>
                    <td className="py-2 text-neutral-600">{o.customer_name || "-"}</td>
                    <td className="py-2 text-right font-medium text-neutral-900">₹{rupees(cents(o.total_amount))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}